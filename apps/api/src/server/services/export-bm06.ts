import ExcelJS from 'exceljs';
import { eq, and, isNull } from 'drizzle-orm';
import { db as defaultDb, DbType } from '../db/client';
import * as schema from '../db/schema';
import {
  getProfileDetail,
  getOverview,
  getProfiles,
  resolveCycleAndPeriod,
} from './queries';
import { AppError } from '../errors';
import type { Actor } from '../types';

export const ACTION_STATUS_LABELS: Record<string, string> = {
  completed: 'Hoàn thành',
  overdue: 'Quá hạn',
  at_risk: 'Có nguy cơ chậm',
  in_progress: 'Đang thực hiện',
  not_started: 'Chưa bắt đầu',
};

export const ZONE_LABELS: Record<string, string> = {
  green: 'Xanh',
  yellow: 'Vàng',
  red: 'Đỏ',
  no_data: 'Chưa có số liệu',
  'Chưa có số liệu': 'Chưa có số liệu',
};

export const CYCLE_STATUS_LABELS: Record<string, string> = {
  open: 'Đang mở',
  archived: 'Đã lưu trữ',
};

export function formatDateVN(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

/**
 * Kiểm tra xem vai trò unit có quyền xuất hồ sơ này không (§4.12 mục 12):
 * Unit chỉ xuất được hồ sơ có ít nhất một mục giao cho đơn vị mình
 * (kiểm soát, chỉ số hoặc đầu việc).
 */
export async function canUnitExportProfile(
  actor: Actor,
  profileId: string,
  db: DbType = defaultDb
): Promise<boolean> {
  if (actor.role !== 'unit') return true;
  if (!actor.unitId) return false;

  // 1. Kiểm tra unit có kiểm soát nào được gán không
  const [ctrlAssignment] = await db
    .select({ id: schema.unitAssignment.id })
    .from(schema.unitAssignment)
    .innerJoin(schema.control, eq(schema.unitAssignment.targetId, schema.control.id))
    .where(
      and(
        eq(schema.unitAssignment.targetType, 'control'),
        eq(schema.unitAssignment.unitId, actor.unitId),
        eq(schema.control.profileId, profileId),
        isNull(schema.control.deletedAt)
      )
    )
    .limit(1);

  if (ctrlAssignment) return true;

  // 2. Kiểm tra unit có chỉ số nào được giao không
  const [indOwner] = await db
    .select({ id: schema.indicator.id })
    .from(schema.indicator)
    .where(
      and(
        eq(schema.indicator.profileId, profileId),
        eq(schema.indicator.ownerUnitId, actor.unitId),
        isNull(schema.indicator.deletedAt)
      )
    )
    .limit(1);

  if (indOwner) return true;

  // 3. Kiểm tra unit có đầu việc nào được giao không
  const [actTask] = await db
    .select({ id: schema.actionTask.id })
    .from(schema.actionTask)
    .innerJoin(schema.actionPlan, eq(schema.actionTask.actionId, schema.actionPlan.id))
    .where(
      and(
        eq(schema.actionPlan.profileId, profileId),
        eq(schema.actionTask.unitId, actor.unitId),
        isNull(schema.actionPlan.deletedAt),
        isNull(schema.actionTask.deletedAt)
      )
    )
    .limit(1);

  if (actTask) return true;

  return false;
}

/**
 * Xuất biểu mẫu BM06 của một hồ sơ theo định dạng Excel (§7.4, §4.12 mục 12).
 * Thứ tự các khối:
 * I. Nhận diện rủi ro
 * II. Phân tích rủi ro (nguyên nhân)
 * III. Ảnh hưởng
 * IV. Đánh giá kiểm soát hiện tại
 * V. Xử lý rủi ro (kế hoạch và đầu việc)
 * VI. Giám sát rủi ro (KRI/KCI)
 * VII. Khối chữ ký ("NGƯỜI LẬP", "THỦ TRƯỞNG ĐƠN VỊ", "Ngày … tháng … năm …")
 */
export async function exportProfileBM06(
  params: { riskCode: string; cycle?: number; period?: string },
  actor: Actor,
  db: DbType = defaultDb
): Promise<{ buffer: Buffer; filename: string }> {
  // 1. Lấy chi tiết hồ sơ (đã tính toán as-of số liệu đã duyệt đến cuối kỳ chọn)
  const detail = await getProfileDetail(
    params.riskCode,
    { cycle: params.cycle, period: params.period },
    db,
    actor
  );

  // 2. Lấy profileId từ DB để kiểm tra quyền của unit
  const resolved = await resolveCycleAndPeriod(
    { cycle: params.cycle, period: params.period },
    db
  );
  const [profRow] = await db
    .select({ id: schema.riskProfile.id })
    .from(schema.riskProfile)
    .where(
      and(
        eq(schema.riskProfile.cycleId, resolved.cycle.id),
        eq(schema.riskProfile.riskCode, params.riskCode),
        isNull(schema.riskProfile.deletedAt)
      )
    );

  if (!profRow) {
    throw new AppError('NOT_FOUND', `Không tìm thấy hồ sơ rủi ro ${params.riskCode}`);
  }

  // 3. Kiểm tra quyền của unit
  if (actor.role === 'unit') {
    const hasAccess = await canUnitExportProfile(actor, profRow.id, db);
    if (!hasAccess) {
      throw new AppError('FORBIDDEN', 'Đơn vị không có mục nào trong hồ sơ này');
    }
  }

  // 4. Đặt tên tệp theo quy chuẩn §4.12 mục 12
  const periodKey = params.period ?? 'hien-hanh';
  const filename = `BM06_${detail.profile.riskCode}_${periodKey}.xlsx`;

  // 5. Dựng Excel workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`BM06_${detail.profile.riskCode}`);

  // Tiêu đề đầu trang
  worksheet.addRow(['BIỂU MẪU BM06: HỒ SƠ RỦI RO TRỌNG YẾU']);
  worksheet.addRow([]);

  // I. NHẬN DIỆN RỦI RO
  worksheet.addRow(['I. NHẬN DIỆN RỦI RO']);
  worksheet.addRow(['Mã HSRR:', detail.profile.hsrrCode]);
  worksheet.addRow(['Mã rủi ro:', detail.profile.riskCode]);
  worksheet.addRow(['Tên rủi ro:', detail.profile.name]);
  worksheet.addRow(['Loại rủi ro:', detail.profile.riskType]);
  worksheet.addRow(['Vùng rủi ro:', detail.profile.riskZone]);
  worksheet.addRow(['Nhóm rủi ro:', detail.profile.riskGroup]);
  worksheet.addRow(['Chủ rủi ro:', detail.profile.owner]);
  worksheet.addRow(['Hoạt động liên quan:', detail.relatedActivity]);
  worksheet.addRow(['Đơn vị lập HSRR:', detail.preparedByUnit]);
  worksheet.addRow(['Mô tả rủi ro:', detail.description]);
  worksheet.addRow([]);

  // Đánh giá rủi ro tiềm ẩn
  worksheet.addRow(['Đánh giá rủi ro tiềm ẩn:']);
  worksheet.addRow(['Mức độ ảnh hưởng:', detail.profile.inherent.impactLabel]);
  worksheet.addRow(['Khả năng xảy ra:', detail.profile.inherent.likelihoodLabel]);
  worksheet.addRow(['Mức độ rủi ro:', detail.profile.inherent.levelLabel]);
  if (detail.profile.residual) {
    worksheet.addRow([]);
    worksheet.addRow(['Đánh giá rủi ro còn lại:']);
    worksheet.addRow(['Mức độ ảnh hưởng:', detail.profile.residual.impactLabel]);
    worksheet.addRow(['Khả năng xảy ra:', detail.profile.residual.likelihoodLabel]);
    worksheet.addRow(['Mức độ rủi ro:', detail.profile.residual.levelLabel]);
  }
  worksheet.addRow([]);

  // II. PHÂN TÍCH RỦI RO (NGUYÊN NHÂN)
  worksheet.addRow(['II. PHÂN TÍCH RỦI RO (NGUYÊN NHÂN)']);
  worksheet.addRow(['Mã nguyên nhân', 'Nhóm nguyên nhân', 'Mô tả nguyên nhân', 'Mã kiểm soát hiện tại']);
  for (const c of detail.causes) {
    worksheet.addRow([c.code, c.group, c.description, c.controlCodes.join(', ')]);
  }
  worksheet.addRow([]);

  // III. ẢNH HƯỞNG
  worksheet.addRow(['III. ẢNH HƯỞNG']);
  worksheet.addRow(['Mã ảnh hưởng', 'Nhóm ảnh hưởng', 'Mô tả ảnh hưởng', 'Mức độ ảnh hưởng']);
  for (const imp of detail.impacts) {
    worksheet.addRow([imp.code, imp.group, imp.description, imp.level]);
  }
  worksheet.addRow([]);

  // IV. ĐÁNH GIÁ KIỂM SOÁT HIỆN TẠI
  worksheet.addRow(['IV. ĐÁNH GIÁ KIỂM SOÁT HIỆN TẠI']);
  worksheet.addRow([
    'Mã kiểm soát',
    'Mô tả kiểm soát',
    'Đơn vị/Người thực hiện',
    'Đơn vị phân công',
    'Tần suất thực hiện',
    'Mục tiêu kiểm soát',
    'Phương pháp thực hiện',
    'Hiệu quả thiết kế',
    'Hiệu quả vận hành',
    'Hiệu quả chung',
    'Bổ sung kiểm soát',
    'Tham chiếu đến Nguyên nhân',
    'Mã kế hoạch hành động',
  ]);
  for (const ctrl of detail.controls) {
    worksheet.addRow([
      ctrl.code,
      ctrl.description,
      ctrl.ownerText,
      ctrl.units.map((u) => u.code).join(', '),
      ctrl.frequency,
      ctrl.objective,
      ctrl.method,
      ctrl.designEff,
      ctrl.operatingEff,
      ctrl.overallEff,
      ctrl.needsSupplement ? 'Có' : 'Không',
      ctrl.causeCodes.join(', '),
      ctrl.actionCodes.join(', '),
    ]);
  }
  worksheet.addRow([]);

  // V. XỬ LÝ RỦI RO
  worksheet.addRow(['V. XỬ LÝ RỦI RO']);
  worksheet.addRow(['1. Kế hoạch hành động']);
  worksheet.addRow([
    'Mã kế hoạch hành động',
    'Mô tả kế hoạch hành động',
    'Trách nhiệm thực hiện',
    'Đầu ra dự kiến',
    'Thời hạn hoàn thành',
    'Trạng thái',
    'Tiến độ (%)',
    'Tham chiếu đến Kiểm soát hiện tại',
  ]);
  for (const act of detail.actions) {
    const formattedDue = act.dueText ? formatDateVN(act.dueText) : formatDateVN(act.dueDate);
    const statusLabel = ACTION_STATUS_LABELS[act.status] || act.status;
    worksheet.addRow([
      act.code,
      act.description,
      act.responsibilityText,
      act.deliverable,
      formattedDue,
      statusLabel,
      `${act.progress}%`,
      act.controlCodes.join(', '),
    ]);
  }
  worksheet.addRow([]);
  worksheet.addRow(['2. Đầu việc chi tiết']);
  worksheet.addRow([
    'Mã KH',
    'Tên đầu việc',
    'Đơn vị thực hiện',
    'Hạn hoàn thành',
    'Trọng số',
    'Tiến độ (%)',
  ]);
  for (const act of detail.actions) {
    for (const t of act.tasks) {
      worksheet.addRow([
        act.code,
        t.name,
        t.unit?.code || '',
        formatDateVN(t.dueDate),
        t.weight,
        `${t.progress}%`,
      ]);
    }
  }
  worksheet.addRow([]);

  // VI. GIÁM SÁT RỦI RO (KRI/KCI) (4C.5)
  worksheet.addRow(['VI. GIÁM SÁT RỦI RO (KRI/KCI)']);
  worksheet.addRow([
    'Loại chỉ số',
    'Mã chỉ số',
    'Tên chỉ số',
    'Công thức tính',
    'Tần suất theo dõi',
    'Ngưỡng (Xanh / Vàng / Đỏ)',
    'Đơn vị',
    'Ngưỡng số (Vàng / Đỏ)',
    'Mục tiêu',
    'Giá trị hiện hành',
    'Thực tế so với mục tiêu',
    'Vùng đánh giá',
    'Ghi chú',
  ]);
  for (const ind of detail.indicators) {
    const unitSuffix = ind.unitLabel === '%' ? '%' : ` ${ind.unitLabel}`;
    const currentVal = ind.current
      ? ind.current.valueNum !== null
        ? `${ind.current.valueNum}${unitSuffix}`
        : ind.current.valueText || ''
      : 'Chưa có số liệu';
    const currentZone =
      ind.current && ind.current.zone
        ? (ZONE_LABELS[ind.current.zone] || ind.current.zone)
        : 'Chưa có số liệu';
    const numericThreshold =
      ind.yellowAt !== null && ind.redAt !== null
        ? `Vàng: ${ind.yellowAt} | Đỏ: ${ind.redAt}`
        : '-';
    const targetStr =
      ind.targetValue !== null
        ? `${ind.targetValue}${unitSuffix}`
        : '-';
    const progressStr =
      ind.targetProgress !== null
        ? `${ind.targetProgress}%`
        : '-';

    worksheet.addRow([
      ind.kind.toUpperCase(),
      ind.code,
      ind.name,
      ind.formula,
      ind.frequency,
      `Xanh: ${ind.thresholds.green} | Vàng: ${ind.thresholds.yellow} | Đỏ: ${ind.thresholds.red}`,
      ind.unitLabel,
      numericThreshold,
      targetStr,
      currentVal,
      progressStr,
      currentZone,
      ind.note || '',
    ]);
  }
  worksheet.addRow([]);

  // VII. KHỐI CHỮ KÝ
  worksheet.addRow([]);
  worksheet.addRow(['', '', '', '', 'Ngày … tháng … năm …']);
  worksheet.addRow(['NGƯỜI LẬP', '', '', '', 'THỦ TRƯỞNG ĐƠN VỊ']);
  worksheet.addRow(['(Ký và ghi rõ họ tên)', '', '', '', '(Ký, ghi rõ họ tên và đóng dấu)']);
  worksheet.addRow([]);
  worksheet.addRow([]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename };
}

/**
 * Xuất báo cáo tổng quan (§7.4, §4.12 mục 12):
 * Một sheet gồm các thẻ của 6.8 và bảng hồ sơ. Mọi vai trò đều được phép xuất.
 */
export async function exportSummary(
  params: { cycle?: number; period?: string },
  _actor: Actor,
  db: DbType = defaultDb
): Promise<{ buffer: Buffer; filename: string }> {
  const overview = await getOverview(params, db);
  const profiles = await getProfiles(params, db);

  const periodKey = params.period ?? 'hien-hanh';
  const filename = `Tong_quan_${periodKey}.xlsx`;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Tổng quan');

  worksheet.addRow(['BÁO CÁO TỔNG QUAN HỒ SƠ RỦI RO TRỌNG YẾU']);
  worksheet.addRow([]);
  const cycleStatusLabel = CYCLE_STATUS_LABELS[overview.cycle.status] || overview.cycle.status;
  const formattedAsOfDate = overview.asOfDate ? formatDateVN(overview.asOfDate) : 'Chưa có';

  worksheet.addRow(['Chu kỳ:', `Năm ${overview.cycle.year} (Trạng thái: ${cycleStatusLabel})`]);
  worksheet.addRow(['Kỳ báo cáo:', overview.period ? overview.period.key : 'Hiện hành']);
  worksheet.addRow(['Ngày cập nhật số liệu:', formattedAsOfDate]);
  worksheet.addRow([]);

  // Thống kê tổng quan (các thẻ)
  worksheet.addRow(['I. THỐNG KÊ TỔNG QUAN (CÁC CHỈ SỐ)']);
  worksheet.addRow(['Số hồ sơ rủi ro:', overview.profileCount]);
  worksheet.addRow([
    'Tiến độ KH trung bình:',
    overview.actionProgressAverage !== null ? `${overview.actionProgressAverage}%` : 'Chưa có',
  ]);
  worksheet.addRow([
    'KRI:',
    `Tổng: ${overview.kri.total} | Vượt ngưỡng (Đỏ): ${overview.kri.red} | Vàng: ${overview.kri.yellow} | Xanh: ${overview.kri.green} | Chưa có số liệu: ${overview.kri.noData}`,
  ]);
  worksheet.addRow([
    'KCI:',
    `Tổng: ${overview.kci.total} | Hiệu quả (Xanh): ${overview.kci.green} | Vàng: ${overview.kci.yellow} | Đỏ: ${overview.kci.red} | Chưa có số liệu: ${overview.kci.noData}`,
  ]);
  worksheet.addRow([
    'Kế hoạch hành động:',
    `Tổng: ${overview.actions.total} | Hoàn thành: ${overview.actions.completed} | Quá hạn: ${overview.actions.overdue} | Có nguy cơ chậm: ${overview.actions.atRisk} | Đang thực hiện: ${overview.actions.inProgress} | Chưa bắt đầu: ${overview.actions.notStarted}`,
  ]);
  worksheet.addRow([]);

  // Danh sách hồ sơ
  worksheet.addRow(['II. DANH SÁCH HỒ SƠ RỦI RO']);
  worksheet.addRow([
    'Mã rủi ro',
    'Mã HSRR',
    'Tên rủi ro',
    'Loại rủi ro',
    'Vùng rủi ro',
    'Nhóm rủi ro',
    'Chủ rủi ro',
    'Rủi ro tiềm ẩn (Mức)',
    'Rủi ro còn lại (Mức)',
    'KRI (Đỏ/Vàng/Xanh/Chưa có)',
    'KCI (Xanh/Vàng/Đỏ/Chưa có)',
    'Trạng thái KH (Hoàn thành/Quá hạn/Nguy cơ/Đang làm/Chưa làm)',
    'Tiến độ KH (%)',
  ]);

  for (const p of profiles) {
    worksheet.addRow([
      p.riskCode,
      p.hsrrCode,
      p.name,
      p.riskType,
      p.riskZone,
      p.riskGroup,
      p.owner,
      p.inherent.levelLabel,
      p.residual ? p.residual.levelLabel : '',
      `${p.kri.red}/${p.kri.yellow}/${p.kri.green}/${p.kri.noData}`,
      `${p.kci.green}/${p.kci.yellow}/${p.kci.red}/${p.kci.noData}`,
      `${p.actions.completed}/${p.actions.overdue}/${p.actions.atRisk}/${p.actions.inProgress}/${p.actions.notStarted}`,
      p.actionProgress !== null ? `${p.actionProgress}%` : '',
    ]);
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename };
}
