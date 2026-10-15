import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { AppError } from '../../server/errors';

export interface RawUserRow {
  row: number;
  email: string;
  fullName: string;
  role: 'admin' | 'ban4' | 'unit' | 'viewer';
  unitCode: string | null;
}

export interface ImportRowError {
  row: number;
  field: string | null;
  message: string;
}

export interface ReadUsersOptions {
  existingEmails?: Set<string>;
  existingUnitCodes?: Set<string>;
}

export type ReadUsersResult =
  | { ok: true; rows: RawUserRow[] }
  | { ok: false; errors: ImportRowError[] };

const VALID_ROLES = new Set(['admin', 'ban4', 'unit', 'viewer']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNIT_CODE_REGEX = /^[A-Z0-9_]+$/;

interface ParsedRawRow {
  row: number;
  email: string;
  fullName: string;
  role: string;
  unitCode: string;
}

/**
 * Đọc file CSV hoặc XLSX chứa danh sách người dùng.
 * Hàm thuần (pure function), không import từ server/ hay http/.
 */
export async function readUsersFile(
  fileBuffer: Buffer,
  filename: string,
  options?: ReadUsersOptions
): Promise<ReadUsersResult> {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext !== 'csv' && ext !== 'xlsx') {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          field: null,
          message: 'Định dạng file không hỗ trợ. Vui lòng tải lên file CSV hoặc XLSX.',
        },
      ],
    };
  }

  let rawRows: ParsedRawRow[] = [];

  if (ext === 'csv') {
    try {
      const records = parse(fileBuffer, {
        bom: true,
        trim: true,
        skip_empty_lines: true,
        relax_column_count: true,
      }) as string[][];

      if (!records || records.length === 0) {
        return {
          ok: false,
          errors: [
            {
              row: 0,
              field: null,
              message: 'File rỗng hoặc không có dòng dữ liệu nào',
            },
          ],
        };
      }

      const header = records[0].map((c) => (c ?? '').trim().toLowerCase());
      const headerMap = findHeaderIndexes(header);
      if (!headerMap) {
        return {
          ok: false,
          errors: [
            {
              row: 0,
              field: null,
              message:
                'File thiếu các cột bắt buộc: email, full_name, role, unit_code',
            },
          ],
        };
      }

      for (let i = 1; i < records.length; i++) {
        const record = records[i];
        rawRows.push({
          row: i + 1,
          email: (record[headerMap.email] ?? '').trim(),
          fullName: (record[headerMap.fullName] ?? '').trim(),
          role: (record[headerMap.role] ?? '').trim(),
          unitCode: (record[headerMap.unitCode] ?? '').trim(),
        });
      }
    } catch {
      return {
        ok: false,
        errors: [
          {
            row: 0,
            field: null,
            message: 'Không thể đọc nội dung file CSV. File có thể bị hỏng.',
          },
        ],
      };
    }
  } else {
    // xlsx
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(fileBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    } catch {
      throw new AppError('VALIDATION', 'Tệp không đúng định dạng Excel .xlsx', {
        fieldErrors: { file: 'Tệp không đúng định dạng Excel .xlsx' },
      });
    }
    const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return {
          ok: false,
          errors: [
            {
              row: 0,
              field: null,
              message: 'File rỗng hoặc không có dòng dữ liệu nào',
            },
          ],
        };
      }

      const headerRow = worksheet.getRow(1);
      const headerValues: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headerValues[colNumber - 1] = cell.text ? cell.text.trim().toLowerCase() : '';
      });

      const headerMap = findHeaderIndexes(headerValues);
      if (!headerMap) {
        return {
          ok: false,
          errors: [
            {
              row: 0,
              field: null,
              message:
                'File thiếu các cột bắt buộc: email, full_name, role, unit_code',
            },
          ],
        };
      }

      for (let r = 2; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        // Kiểm tra xem dòng có rỗng không
        let hasValue = false;
        row.eachCell({ includeEmpty: false }, () => {
          hasValue = true;
        });
        if (!hasValue) continue;

        const email = row.getCell(headerMap.email + 1).text?.trim() ?? '';
        const fullName = row.getCell(headerMap.fullName + 1).text?.trim() ?? '';
        const role = row.getCell(headerMap.role + 1).text?.trim() ?? '';
        const unitCode = row.getCell(headerMap.unitCode + 1).text?.trim() ?? '';

        rawRows.push({
          row: r,
          email,
          fullName,
          role,
          unitCode,
        });
      }
  }

  if (rawRows.length === 0) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          field: null,
          message: 'File rỗng hoặc không có dòng dữ liệu nào',
        },
      ],
    };
  }

  if (rawRows.length > 200) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          field: null,
          message: 'File vượt quá giới hạn 200 dòng dữ liệu',
        },
      ],
    };
  }

  // Validate từng dòng
  const errors: ImportRowError[] = [];
  const seenEmails = new Set<string>();
  const validatedRows: RawUserRow[] = [];

  for (const item of rawRows) {
    const rowNum = item.row;
    let hasRowError = false;

    // Email
    const normalizedEmail = item.email.toLowerCase();
    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      errors.push({
        row: rowNum,
        field: 'email',
        message: 'Email không đúng định dạng',
      });
      hasRowError = true;
    } else if (seenEmails.has(normalizedEmail)) {
      errors.push({
        row: rowNum,
        field: 'email',
        message: `Email trùng lặp trong file: ${item.email}`,
      });
      hasRowError = true;
    } else if (options?.existingEmails?.has(normalizedEmail)) {
      errors.push({
        row: rowNum,
        field: 'email',
        message: `Email đã tồn tại trong hệ thống: ${item.email}`,
      });
      hasRowError = true;
    } else {
      seenEmails.add(normalizedEmail);
    }

    // Full name
    if (!item.fullName || item.fullName.length > 255) {
      errors.push({
        row: rowNum,
        field: 'full_name',
        message: 'Họ tên không được để trống và tối đa 255 ký tự',
      });
      hasRowError = true;
    }

    // Role
    const normalizedRole = item.role.toLowerCase();
    if (!VALID_ROLES.has(normalizedRole)) {
      errors.push({
        row: rowNum,
        field: 'role',
        message: `Vai trò không hợp lệ: ${item.role}. Phải là một trong: admin, ban4, unit, viewer`,
      });
      hasRowError = true;
    }

    // Unit code
    const normalizedUnitCode = item.unitCode ? item.unitCode.trim().toUpperCase() : null;
    if (normalizedRole === 'unit' && !normalizedUnitCode) {
      errors.push({
        row: rowNum,
        field: 'unit_code',
        message: 'Vai trò unit bắt buộc có mã đơn vị',
      });
      hasRowError = true;
    } else if (normalizedUnitCode && !UNIT_CODE_REGEX.test(normalizedUnitCode)) {
      errors.push({
        row: rowNum,
        field: 'unit_code',
        message: 'Mã đơn vị không đúng định dạng (chỉ gồm chữ hoa, số và dấu gạch dưới)',
      });
      hasRowError = true;
    } else if (
      normalizedUnitCode &&
      options?.existingUnitCodes &&
      !options.existingUnitCodes.has(normalizedUnitCode)
    ) {
      errors.push({
        row: rowNum,
        field: 'unit_code',
        message: `Đơn vị không tồn tại: ${item.unitCode}`,
      });
      hasRowError = true;
    }

    if (!hasRowError) {
      validatedRows.push({
        row: rowNum,
        email: normalizedEmail,
        fullName: item.fullName,
        role: normalizedRole as RawUserRow['role'],
        unitCode: normalizedUnitCode,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, rows: validatedRows };
}

function findHeaderIndexes(
  headers: string[]
): { email: number; fullName: number; role: number; unitCode: number } | null {
  const emailIdx = headers.indexOf('email');
  const fullNameIdx = headers.indexOf('full_name');
  const roleIdx = headers.indexOf('role');
  const unitCodeIdx = headers.indexOf('unit_code');

  if (
    emailIdx === -1 ||
    fullNameIdx === -1 ||
    roleIdx === -1 ||
    unitCodeIdx === -1
  ) {
    return null;
  }

  return {
    email: emailIdx,
    fullName: fullNameIdx,
    role: roleIdx,
    unitCode: unitCodeIdx,
  };
}
