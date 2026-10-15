import ExcelJS from 'exceljs';
import { normalizeCode, splitCodes } from '../domain/codes';
import { parseDue } from '../domain/due-date';
import { AppError } from '../../server/errors';

export interface ParsedProfile {
  riskCode: string;
  hsrrCode: string;
  name: string;
  riskType: string;
  riskZone: string;
  riskGroup: string;
  owner: string;
  relatedActivity: string;
  preparedByUnit: string;
  description: string;
  inherent: {
    impact: string;
    likelihood: string;
    level: string;
  };
  causes: {
    code: string;
    group: string;
    description: string;
    controlCodes: string[];
  }[];
  impacts: {
    code: string;
    group: string;
    description: string;
    level: string;
  }[];
  controls: {
    code: string;
    description: string;
    ownerText: string;
    frequency: string;
    objective: string;
    method: string;
    designEff: string;
    operatingEff: string;
    overallEff: string;
    needsSupplement: boolean;
    actionCodes: string[];
    causeCodes: string[];
  }[];
  actions: {
    code: string;
    description: string;
    responsibilityText: string;
    deliverable: string;
    dueText: string;
    dueDate: Date | null;
    controlCodes: string[];
  }[];
  indicators: {
    code: string;
    kind: 'kri' | 'kci';
    name: string;
    formula: string;
    frequency: string;
    thresholds: [string, string, string];
    note: string | null;
  }[];
}

function normLabel(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Trích xuất giá trị ô Excel, xử lý ô phụ của vùng gộp thành null,
 * bóc tách richText hoặc formula result.
 */
function getCellRawValue(cell: ExcelJS.Cell): unknown {
  if (cell.isMerged && cell.address !== cell.master.address) {
    return null;
  }
  const val = cell.value;
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === 'object') {
    if (val instanceof Date) {
      return val;
    }
    if ('richText' in val && Array.isArray((val as { richText: unknown[] }).richText)) {
      return (val as { richText: Array<{ text?: string }> }).richText
        .map((item) => item.text || '')
        .join('');
    }
    if ('result' in val) {
      return (val as { result: unknown }).result;
    }
    if ('text' in val) {
      return (val as { text: unknown }).text;
    }
  }
  return val;
}

function getCellString(cell: ExcelJS.Cell): string {
  const raw = getCellRawValue(cell);
  if (raw === null || raw === undefined) {
    return '';
  }
  if (raw instanceof Date) {
    const d = raw.getUTCDate();
    const m = raw.getUTCMonth() + 1;
    const y = raw.getUTCFullYear();
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  return String(raw).trim();
}

function getCellStringKeepLines(cell: ExcelJS.Cell): string {
  const raw = getCellRawValue(cell);
  if (raw === null || raw === undefined) {
    return '';
  }
  if (raw instanceof Date) {
    const d = raw.getUTCDate();
    const m = raw.getUTCMonth() + 1;
    const y = raw.getUTCFullYear();
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  return String(raw).replace(/^\s+|\s+$/g, '');
}

function findColumnByHeader(
  headerMap: Map<string, number>,
  predicate: (normHeader: string) => boolean
): number | undefined {
  let found: number | undefined;
  headerMap.forEach((col, hdr) => {
    if (found === undefined && predicate(hdr)) {
      found = col;
    }
  });
  return found;
}

function requireColumn(
  headerMap: Map<string, number>,
  predicate: (normHeader: string) => boolean,
  expectedName: string,
  sheetName: string
): number {
  const col = findColumnByHeader(headerMap, predicate);
  if (col === undefined) {
    throw new Error(`IMPORT_INVALID: Sheet "${sheetName}" thiếu tiêu đề bắt buộc "${expectedName}"`);
  }
  return col;
}

function buildHeaderMap(row: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>();
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = normLabel(getCellString(cell));
    if (text) {
      map.set(text, colNumber);
    }
  });
  return map;
}

/**
 * Đọc workbook Excel biểu mẫu BM06, trả về mảng ParsedProfile của các hồ sơ.
 * Bỏ qua sheet 'list'.
 */
export async function readWorkbook(buffer: Buffer): Promise<ParsedProfile[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('VALIDATION', 'Tệp không đúng định dạng Excel .xlsx', {
      fieldErrors: { file: 'Tệp không đúng định dạng Excel .xlsx' },
    });
  }

  const profiles: ParsedProfile[] = [];

  for (const worksheet of workbook.worksheets) {
    if (normLabel(worksheet.name) === 'list') {
      continue;
    }

    const sheetName = worksheet.name;

    // 1. Trích xuất phần nhận diện hồ sơ (metadata)
    const meta: Record<string, string> = {};
    const targetLabels = [
      { key: 'hsrrCode', label: 'mã hsrr' },
      { key: 'riskCodeRaw', label: 'mã rủi ro' },
      { key: 'riskType', label: 'loại rủi ro' },
      { key: 'riskZone', label: 'vùng rủi ro' },
      { key: 'riskGroup', label: 'nhóm rủi ro' },
      { key: 'owner', label: 'chủ rủi ro' },
      { key: 'relatedActivity', label: 'hoạt động liên quan' },
      { key: 'preparedByUnit', label: 'đơn vị lập hsrr' },
      { key: 'name', label: 'tên rủi ro' },
      { key: 'description', label: 'mô tả rủi ro' },
    ];

    let inherent = { impact: '', likelihood: '', level: '' };

    worksheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const raw = getCellRawValue(cell);
        if (!raw) return;
        const norm = normLabel(String(raw));

        // So khớp các nhãn thông tin hồ sơ
        for (const target of targetLabels) {
          if (norm === target.label && !meta[target.key]) {
            // Tìm ô không rỗng đầu tiên bên phải nhãn trên cùng hàng
            for (let c2 = colNumber + 1; c2 <= row.cellCount + 10; c2++) {
              const rightCell = row.getCell(c2);
              const rightVal = getCellRawValue(rightCell);
              if (rightVal !== null && rightVal !== undefined && String(rightVal).trim() !== '') {
                meta[target.key] =
                  target.key === 'description'
                    ? getCellStringKeepLines(rightCell)
                    : getCellString(rightCell);
                break;
              }
            }
          }
        }

        // So khớp nhãn "Mức độ ảnh hưởng" của bảng rủi ro tiềm ẩn
        if (norm === 'mức độ ảnh hưởng' && !inherent.impact) {
          // Kiểm tra xem trên hàng này có ô "khả năng xảy ra"
          let colLikelihood: number | undefined;
          let colLevel: number | undefined;

          row.eachCell((c, cNum) => {
            const hNorm = normLabel(getCellString(c));
            if (hNorm.includes('khả năng xảy ra')) colLikelihood = cNum;
            if (hNorm.includes('mức độ rủi ro') || hNorm === 'mức rủi ro') colLevel = cNum;
          });

          if (colLikelihood && colLevel) {
            const nextRow = worksheet.getRow(rowNumber + 1);
            inherent = {
              impact: getCellString(nextRow.getCell(colNumber)),
              likelihood: getCellString(nextRow.getCell(colLikelihood)),
              level: getCellString(nextRow.getCell(colLevel)),
            };
          }
        }
      });
    });

    const riskCode = normalizeCode(meta.riskCodeRaw || '');
    const hsrrCode = meta.hsrrCode ? meta.hsrrCode.trim() : '';

    // 2. Định vị cột neo chứa mã (cột C ở file chuẩn, hoặc cột chứa chữ "Mã nguyên nhân")
    let codeCol = 3;
    worksheet.eachRow((row) => {
      row.eachCell((cell, col) => {
        if (normLabel(getCellString(cell)) === 'mã nguyên nhân') {
          codeCol = col;
        }
      });
    });

    // 3. Tìm các hàng tiêu đề của 6 bảng dựa trên ô neo ở cột codeCol
    const headers = {
      nn: null as Map<string, number> | null,
      ah: null as Map<string, number> | null,
      ks: null as Map<string, number> | null,
      kh: null as Map<string, number> | null,
      kri: null as Map<string, number> | null,
      kci: null as Map<string, number> | null,
    };

    worksheet.eachRow((row) => {
      const anchorText = normLabel(getCellString(row.getCell(codeCol)));
      if (!anchorText) return;

      if (anchorText === 'mã nguyên nhân') {
        headers.nn = buildHeaderMap(row);
      } else if (anchorText === 'mã ảnh hưởng') {
        headers.ah = buildHeaderMap(row);
      } else if (anchorText === 'mã kiểm soát') {
        headers.ks = buildHeaderMap(row);
      } else if (anchorText === 'mã kế hoạch hành động') {
        headers.kh = buildHeaderMap(row);
      } else if (anchorText === 'mã kri') {
        headers.kri = buildHeaderMap(row);
      } else if (anchorText === 'mã kci') {
        headers.kci = buildHeaderMap(row);
      }
    });

    // Kiểm tra hàng tiêu đề bắt buộc
    if (!headers.nn) throw new Error(`IMPORT_INVALID: Sheet "${sheetName}" thiếu tiêu đề bắt buộc "Mã nguyên nhân"`);
    if (!headers.ah) throw new Error(`IMPORT_INVALID: Sheet "${sheetName}" thiếu tiêu đề bắt buộc "Mã ảnh hưởng"`);
    if (!headers.ks) throw new Error(`IMPORT_INVALID: Sheet "${sheetName}" thiếu tiêu đề bắt buộc "Mã kiểm soát"`);
    if (!headers.kh) throw new Error(`IMPORT_INVALID: Sheet "${sheetName}" thiếu tiêu đề bắt buộc "Mã Kế hoạch hành động"`);
    if (!headers.kri) throw new Error(`IMPORT_INVALID: Sheet "${sheetName}" thiếu tiêu đề bắt buộc "Mã KRI"`);
    if (!headers.kci) throw new Error(`IMPORT_INVALID: Sheet "${sheetName}" thiếu tiêu đề bắt buộc "Mã KCI"`);

    // Bản đồ cột cụ thể theo tiêu đề chuẩn hóa
    const cols = {
      nn: {
        code: codeCol,
        group: requireColumn(headers.nn, (h) => h.includes('nhóm nguyên nhân'), 'Nhóm nguyên nhân', sheetName),
        desc: requireColumn(headers.nn, (h) => h.includes('mô tả nguyên nhân'), 'Mô tả nguyên nhân', sheetName),
        ctrl: requireColumn(headers.nn, (h) => h.includes('mã kiểm soát'), 'Mã kiểm soát', sheetName),
      },
      ah: {
        code: codeCol,
        group: requireColumn(headers.ah, (h) => h.includes('nhóm ảnh hưởng'), 'Nhóm ảnh hưởng', sheetName),
        desc: requireColumn(headers.ah, (h) => h.includes('mô tả ảnh hưởng'), 'Mô tả ảnh hưởng', sheetName),
        level: requireColumn(headers.ah, (h) => h.includes('mức độ ảnh hưởng'), 'Mức độ ảnh hưởng', sheetName),
      },
      ks: {
        code: codeCol,
        desc: requireColumn(headers.ks, (h) => h.includes('mô tả kiểm soát'), 'Mô tả kiểm soát', sheetName),
        owner: requireColumn(headers.ks, (h) => h.includes('chủ kiểm soát'), 'Chủ kiểm soát', sheetName),
        freq: requireColumn(headers.ks, (h) => h.includes('tần suất kiểm soát'), 'Tần suất kiểm soát', sheetName),
        obj: requireColumn(headers.ks, (h) => h.includes('mục tiêu kiểm soát'), 'Mục tiêu kiểm soát', sheetName),
        method: requireColumn(headers.ks, (h) => h.includes('cách thức kiểm soát'), 'Cách thức kiểm soát', sheetName),
        designEff: requireColumn(headers.ks, (h) => h.includes('hiệu quả thiết kế'), 'Hiệu quả thiết kế kiểm soát', sheetName),
        opEff: requireColumn(headers.ks, (h) => h.includes('hiệu quả vận hành'), 'Hiệu quả vận hành kiểm soát', sheetName),
        overallEff: requireColumn(headers.ks, (h) => h.includes('hiệu quả tổng thể'), 'Hiệu quả tổng thể kiểm soát', sheetName),
        supp: requireColumn(headers.ks, (h) => h.includes('bổ sung kiểm soát'), 'Bổ sung kiểm soát', sheetName),
        action: requireColumn(headers.ks, (h) => h.includes('mã kế hoạch hành động'), 'Mã kế hoạch hành động', sheetName),
        cause: requireColumn(headers.ks, (h) => h.includes('tham chiếu đến nguyên nhân'), 'Tham chiếu đến Nguyên nhân', sheetName),
      },
      kh: {
        code: codeCol,
        desc: requireColumn(
          headers.kh,
          (h) => h.includes('phương án xử lý/kế hoạch hành động') || (h.includes('phương án xử lý') && h.includes('kế hoạch hành động')),
          'Phương án xử lý/Kế hoạch hành động',
          sheetName
        ),
        resp: requireColumn(headers.kh, (h) => h.includes('trách nhiệm'), 'Trách nhiệm', sheetName),
        deliv: requireColumn(headers.kh, (h) => h.includes('đầu ra yêu cầu'), 'Đầu ra yêu cầu', sheetName),
        due: requireColumn(headers.kh, (h) => h.includes('ngày hoàn thành') || h.includes('ngày hoàn thành'), 'Ngày hoàn thành dự kiến', sheetName),
        ctrl: requireColumn(headers.kh, (h) => h.includes('tham chiếu đến kiểm soát'), 'Tham chiếu đến Kiểm soát hiện tại', sheetName),
      },
      kri: {
        code: codeCol,
        name: requireColumn(headers.kri, (h) => h.includes('tên chỉ số kri'), 'Tên chỉ số KRI', sheetName),
        formula: requireColumn(headers.kri, (h) => h.includes('cách tính kri'), 'Cách tính KRI', sheetName),
        freq: requireColumn(headers.kri, (h) => h.includes('tần suất đo lường'), 'Tần suất đo lường', sheetName),
        threshold: requireColumn(headers.kri, (h) => h.includes('ngưỡng'), 'Ngưỡng KRI', sheetName),
      },
      kci: {
        code: codeCol,
        name: requireColumn(headers.kci, (h) => h.includes('tên chỉ số kci'), 'Tên chỉ số KCI', sheetName),
        formula: requireColumn(headers.kci, (h) => h.includes('cách tính kci'), 'Cách tính KCI', sheetName),
        freq: requireColumn(headers.kci, (h) => h.includes('tần suất đo lường'), 'Tần suất đo lường', sheetName),
        threshold: requireColumn(headers.kci, (h) => h.includes('ngưỡng'), 'Ngưỡng KCI', sheetName),
      },
    };

    const causes: ParsedProfile['causes'] = [];
    const impacts: ParsedProfile['impacts'] = [];
    const controls: ParsedProfile['controls'] = [];
    const actions: ParsedProfile['actions'] = [];
    const indicators: ParsedProfile['indicators'] = [];

    // 4. Quét các dòng theo mã ở cột codeCol
    worksheet.eachRow((row) => {
      const cellCode = row.getCell(codeCol);
      const codeStr = getCellString(cellCode);
      if (!codeStr) return;

      if (codeStr.includes('.NN')) {
        causes.push({
          code: normalizeCode(codeStr),
          group: getCellString(row.getCell(cols.nn.group)),
          description: getCellStringKeepLines(row.getCell(cols.nn.desc)),
          controlCodes: splitCodes(getCellString(row.getCell(cols.nn.ctrl))),
        });
      } else if (codeStr.includes('.AH')) {
        impacts.push({
          code: normalizeCode(codeStr),
          group: getCellString(row.getCell(cols.ah.group)),
          description: getCellStringKeepLines(row.getCell(cols.ah.desc)),
          level: getCellString(row.getCell(cols.ah.level)),
        });
      } else if (codeStr.includes('.KS')) {
        const suppRaw = getCellString(row.getCell(cols.ks.supp));
        controls.push({
          code: normalizeCode(codeStr),
          description: getCellStringKeepLines(row.getCell(cols.ks.desc)),
          ownerText: getCellStringKeepLines(row.getCell(cols.ks.owner)),
          frequency: getCellString(row.getCell(cols.ks.freq)),
          objective: getCellString(row.getCell(cols.ks.obj)),
          method: getCellString(row.getCell(cols.ks.method)),
          designEff: getCellString(row.getCell(cols.ks.designEff)),
          operatingEff: getCellString(row.getCell(cols.ks.opEff)),
          overallEff: getCellString(row.getCell(cols.ks.overallEff)),
          needsSupplement: /^có$/i.test(suppRaw),
          actionCodes: splitCodes(getCellString(row.getCell(cols.ks.action))),
          causeCodes: splitCodes(getCellString(row.getCell(cols.ks.cause))),
        });
      } else if (codeStr.includes('.KH')) {
        const rawDue = getCellRawValue(row.getCell(cols.kh.due));
        const due = parseDue(rawDue instanceof Date ? rawDue : getCellStringKeepLines(row.getCell(cols.kh.due)));
        actions.push({
          code: normalizeCode(codeStr),
          description: getCellStringKeepLines(row.getCell(cols.kh.desc)),
          responsibilityText: getCellStringKeepLines(row.getCell(cols.kh.resp)),
          deliverable: getCellStringKeepLines(row.getCell(cols.kh.deliv)),
          dueText: due.dueText,
          dueDate: due.dueDate,
          controlCodes: splitCodes(getCellString(row.getCell(cols.kh.ctrl))),
        });
      } else if (codeStr.includes('.KRI')) {
        const tCol = cols.kri.threshold;
        const rawNote = getCellString(row.getCell(tCol + 3));
        const note = !rawNote || /^ok$/i.test(rawNote) ? null : rawNote;

        indicators.push({
          code: normalizeCode(codeStr),
          kind: 'kri',
          name: getCellStringKeepLines(row.getCell(cols.kri.name)),
          formula: getCellStringKeepLines(row.getCell(cols.kri.formula)),
          frequency: getCellString(row.getCell(cols.kri.freq)),
          thresholds: [
            getCellString(row.getCell(tCol)),
            getCellString(row.getCell(tCol + 1)),
            getCellString(row.getCell(tCol + 2)),
          ],
          note,
        });
      } else if (codeStr.includes('.KCI')) {
        const tCol = cols.kci.threshold;
        const rawNote = getCellString(row.getCell(tCol + 3));
        const note = !rawNote || /^ok$/i.test(rawNote) ? null : rawNote;

        indicators.push({
          code: normalizeCode(codeStr),
          kind: 'kci',
          name: getCellStringKeepLines(row.getCell(cols.kci.name)),
          formula: getCellStringKeepLines(row.getCell(cols.kci.formula)),
          frequency: getCellString(row.getCell(cols.kci.freq)),
          thresholds: [
            getCellString(row.getCell(tCol)),
            getCellString(row.getCell(tCol + 1)),
            getCellString(row.getCell(tCol + 2)),
          ],
          note,
        });
      }
    });

    profiles.push({
      riskCode,
      hsrrCode,
      name: meta.name || '',
      riskType: meta.riskType || '',
      riskZone: meta.riskZone || '',
      riskGroup: meta.riskGroup || '',
      owner: meta.owner || '',
      relatedActivity: meta.relatedActivity || '',
      preparedByUnit: meta.preparedByUnit || '',
      description: meta.description || '',
      inherent,
      causes,
      impacts,
      controls,
      actions,
      indicators,
    });
  }

  return profiles;
}
