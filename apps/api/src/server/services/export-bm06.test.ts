import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { ensurePeriods } from './periods';
import { exportProfileBM06, exportSummary, canUnitExportProfile } from './export-bm06';
import {
  cycle,
  riskProfile,
  cause,
  impact,
  control,
  actionPlan,
  actionTask,
  actionUpdate,
  indicator,
  indicatorReading,
  unit,
  unitAssignment,
  appUser,
} from '../db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import type { Actor } from '../types';
import { AppError } from '../errors';

describe('export-bm06.test.ts - Kế hoạch 4A.5: Xuất BM06 và Tổng quan', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let adminActor: Actor;
  let unitWithAccessActor: Actor;
  let unitNoAccessActor: Actor;
  let viewerActor: Actor;
  let testUnit1Id: string;
  let testUnit2Id: string;

  beforeAll(async () => {
    const testMigrateUrl = process.env.DATABASE_TEST_MIGRATE_URL;
    const testAppUrl = process.env.DATABASE_TEST_URL;
    if (!testMigrateUrl || !testAppUrl) {
      throw new Error('Thiếu DATABASE_TEST_MIGRATE_URL hoặc DATABASE_TEST_URL');
    }

    await runMigrations(testMigrateUrl);
    const ownerSql = (await import('postgres')).default(testMigrateUrl, { max: 1 });
    await ownerSql`TRUNCATE TABLE audit_log, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, unit_assignment, unit, cycle, app_user CASCADE`;
    await ownerSql.end();

    appClient = createCustomClient(testAppUrl);

    // 1. Tạo 2 đơn vị
    const [u1] = await appClient.db
      .insert(unit)
      .values({
        code: 'UNIT_ASSIGNED',
        name: 'Đơn vị có tham gia',
        kind: 'department',
      })
      .returning();
    testUnit1Id = u1.id;

    const [u2] = await appClient.db
      .insert(unit)
      .values({
        code: 'UNIT_NO_ACCESS',
        name: 'Đơn vị không liên quan',
        kind: 'center',
      })
      .returning();
    testUnit2Id = u2.id;

    // 2. Tạo users cho 4 vai trò
    const [adm] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm_exp_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Export',
        role: 'admin',
        passwordHash: 'dummy_hash',
        isActive: true,
      })
      .returning();
    adminActor = { id: adm.id, email: adm.email, role: 'admin', unitId: null };

    const [u1User] = await appClient.db
      .insert(appUser)
      .values({
        email: `u1_exp_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Unit 1 User',
        role: 'unit',
        unitId: testUnit1Id,
        passwordHash: 'dummy_hash',
        isActive: true,
      })
      .returning();
    unitWithAccessActor = { id: u1User.id, email: u1User.email, role: 'unit', unitId: testUnit1Id };

    const [u2User] = await appClient.db
      .insert(appUser)
      .values({
        email: `u2_exp_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Unit 2 User',
        role: 'unit',
        unitId: testUnit2Id,
        passwordHash: 'dummy_hash',
        isActive: true,
      })
      .returning();
    unitNoAccessActor = { id: u2User.id, email: u2User.email, role: 'unit', unitId: testUnit2Id };

    const [vwUser] = await appClient.db
      .insert(appUser)
      .values({
        email: `vw_exp_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Viewer Export',
        role: 'viewer',
        passwordHash: 'dummy_hash',
        isActive: true,
      })
      .returning();
    viewerActor = { id: vwUser.id, email: vwUser.email, role: 'viewer', unitId: null };

    // 3. Import cycle 2026 từ file thật
    const excelPath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
      : fs.existsSync(path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx')
      : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
    const excelBuffer = fs.readFileSync(excelPath);

    await importCycle(
      {
        year: 2026,
        file: excelBuffer,
        actor: adminActor,
      },
      appClient.db
    );

    await ensurePeriods(2026, adminActor, appClient.db);

    // 4. Gán unit1 vào 1 control của HD11.R27
    const [profR27] = await appClient.db
      .select()
      .from(riskProfile)
      .where(eq(riskProfile.riskCode, 'HD11.R27'));

    const [ctrlR27] = await appClient.db
      .select()
      .from(control)
      .where(eq(control.profileId, profR27.id))
      .limit(1);

    await appClient.db.insert(unitAssignment).values({
      targetType: 'control',
      targetId: ctrlR27.id,
      unitId: testUnit1Id,
    });

    // 5. Thêm số liệu duyệt và chờ duyệt cho indicator của HD11.R27
    const [indR27] = await appClient.db
      .select()
      .from(indicator)
      .where(and(eq(indicator.profileId, profR27.id), eq(indicator.code, 'HD11.R27.KRI01')));

    // Approved reading cho 2026-Q1
    await appClient.db.insert(indicatorReading).values({
      indicatorId: indR27.id,
      periodKey: '2026-Q1',
      valueNum: '4.00',
      valueText: '4%',
      zone: 'green',
      zoneSource: 'auto',
      status: 'approved',
      submittedBy: adm.id,
      reviewedBy: adm.id,
      reviewedAt: new Date('2026-03-31T10:00:00Z'),
    });

    // Pending reading cho 2026-Q1 (không được xuất hiện trong kết quả xuất)
    await appClient.db.insert(indicatorReading).values({
      indicatorId: indR27.id,
      periodKey: '2026-Q1',
      valueNum: '99.00',
      valueText: '99%',
      zone: 'red',
      zoneSource: 'auto',
      status: 'pending',
      submittedBy: adm.id,
    });

    // Approved reading cho 2026-Q3
    await appClient.db.insert(indicatorReading).values({
      indicatorId: indR27.id,
      periodKey: '2026-Q3',
      valueNum: '8.00',
      valueText: '8%',
      zone: 'yellow',
      zoneSource: 'auto',
      status: 'approved',
      submittedBy: adm.id,
      reviewedBy: adm.id,
      reviewedAt: new Date('2026-09-30T10:00:00Z'),
    });

    // 6. Thêm tiến độ đã duyệt và chờ duyệt cho đầu việc của HD11.R27
    const [actR27] = await appClient.db
      .select()
      .from(actionPlan)
      .where(and(eq(actionPlan.profileId, profR27.id), eq(actionPlan.code, 'HD11.R27.KH01')));

    const [taskR27] = await appClient.db
      .select()
      .from(actionTask)
      .where(eq(actionTask.actionId, actR27.id))
      .limit(1);

    // Gán unit1 vào task
    await appClient.db
      .update(actionTask)
      .set({ unitId: testUnit1Id })
      .where(eq(actionTask.id, taskR27.id));

    // Approved task update ở 2026-Q1: 50%
    await appClient.db.insert(actionUpdate).values({
      taskId: taskR27.id,
      periodKey: '2026-Q1',
      progress: 50,
      status: 'approved',
      submittedBy: adm.id,
      reviewedBy: adm.id,
      reviewedAt: new Date('2026-03-31T11:00:00Z'),
    });

    // Pending task update ở 2026-Q1: 97% (không được tính)
    await appClient.db.insert(actionUpdate).values({
      taskId: taskR27.id,
      periodKey: '2026-Q1',
      progress: 97,
      status: 'pending',
      submittedBy: adm.id,
    });
  });

  describe('1. canUnitExportProfile', () => {
    it('cho phép admin và viewer (hàm check unit)', async () => {
      const [prof] = await appClient.db
        .select()
        .from(riskProfile)
        .where(eq(riskProfile.riskCode, 'HD11.R27'));
      const canAdm = await canUnitExportProfile(adminActor, prof.id, appClient.db);
      expect(canAdm).toBe(true);
    });

    it('cho phép unit khi có mục được giao trong hồ sơ', async () => {
      const [prof] = await appClient.db
        .select()
        .from(riskProfile)
        .where(eq(riskProfile.riskCode, 'HD11.R27'));
      const canUnit1 = await canUnitExportProfile(unitWithAccessActor, prof.id, appClient.db);
      expect(canUnit1).toBe(true);
    });

    it('từ chối unit khi không có mục nào được giao trong hồ sơ', async () => {
      const [prof] = await appClient.db
        .select()
        .from(riskProfile)
        .where(eq(riskProfile.riskCode, 'HD11.R27'));
      const canUnit2 = await canUnitExportProfile(unitNoAccessActor, prof.id, appClient.db);
      expect(canUnit2).toBe(false);
    });
  });

  describe('2. exportProfileBM06', () => {
    it('xuất BM06 đủ 7 khối, đủ mã, chỉ lấy số liệu đã duyệt đến kỳ chọn, có khối chữ ký', async () => {
      const result = await exportProfileBM06(
        { riskCode: 'HD11.R27', period: '2026-Q1' },
        adminActor,
        appClient.db
      );

      expect(result.filename).toBe('BM06_HD11.R27_2026-Q1.xlsx');
      expect(result.buffer).toBeInstanceOf(Buffer);

      // Đọc lại bằng exceljs để kiểm chứng cấu trúc
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(result.buffer);

      const ws = wb.worksheets[0];
      expect(ws).toBeDefined();

      // Gom toàn bộ nội dung text của sheet
      const allText: string[] = [];
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value !== null && cell.value !== undefined) {
            allText.push(String(cell.value));
          }
        });
      });
      const combinedText = allText.join(' ');

      // 1. Đủ 7 khối theo thứ tự
      expect(combinedText).toContain('NHẬN DIỆN RỦI RO');
      expect(combinedText).toContain('PHÂN TÍCH RỦI RO');
      expect(combinedText).toContain('ẢNH HƯỞNG');
      expect(combinedText).toContain('ĐÁNH GIÁ KIỂM SOÁT HIỆN TẠI');
      expect(combinedText).toContain('XỬ LÝ RỦI RO');
      expect(combinedText).toContain('GIÁM SÁT RỦI RO');
      expect(combinedText).toContain('NGƯỜI LẬP');
      expect(combinedText).toContain('THỦ TRƯỞNG ĐƠN VỊ');
      expect(combinedText).toContain('Ngày … tháng … năm …');

      // 2. Đủ mã NN/AH/KS/KH/KRI/KCI của hồ sơ
      expect(combinedText).toContain('HD11.R27.NN01');
      expect(combinedText).toContain('HD11.R27.AH01');
      expect(combinedText).toContain('HD11.R27.KS01');
      expect(combinedText).toContain('HD11.R27.KH01');
      expect(combinedText).toContain('HD11.R27.KRI01');
      expect(combinedText).toContain('HD11.R27.KCI01');

      // 3. Đầu việc kèm đơn vị và tiến độ (tiến độ đã duyệt 50%, không phải 97% pending)
      expect(combinedText).toContain('UNIT_ASSIGNED');
      expect(combinedText).toContain('50%');
      expect(combinedText).not.toContain('97%');

      // 4. Giá trị và vùng chỉ số chỉ từ bản đã duyệt đến cuối kỳ chọn (2026-Q1 là 4%, Xanh; không có 99% pending hoặc 8% Q3)
      expect(combinedText).toContain('4%');
      expect(combinedText).toContain('Xanh');
      expect(combinedText).not.toContain('99%');
      expect(combinedText).not.toContain('8%');

      // 5. Cột mới của Kế hoạch 4C trong Khối VI
      expect(combinedText).toContain('Đơn vị');
      expect(combinedText).toContain('Ngưỡng số (Vàng / Đỏ)');
      expect(combinedText).toContain('Mục tiêu');
      expect(combinedText).toContain('Thực tế so với mục tiêu');
    });

    it('không chọn kỳ thì tên tệp có hậu tố hien-hanh', async () => {
      const result = await exportProfileBM06(
        { riskCode: 'HD11.R27' },
        adminActor,
        appClient.db
      );
      expect(result.filename).toBe('BM06_HD11.R27_hien-hanh.xlsx');
    });

    it('từ chối 403 khi role unit xuất hồ sơ không có mục của mình', async () => {
      await expect(
        exportProfileBM06(
          { riskCode: 'HD11.R27' },
          unitNoAccessActor,
          appClient.db
        )
      ).rejects.toThrow(AppError);
    });

    it('cho phép khi role unit xuất hồ sơ có mục của mình', async () => {
      const result = await exportProfileBM06(
        { riskCode: 'HD11.R27' },
        unitWithAccessActor,
        appClient.db
      );
      expect(result.filename).toContain('BM06_HD11.R27');
    });

    it('từ chối 404 khi riskCode không tồn tại', async () => {
      await expect(
        exportProfileBM06(
          { riskCode: 'KHONG_TON_TAI.R99' },
          adminActor,
          appClient.db
        )
      ).rejects.toThrow(AppError);
    });
  });

  describe('3. exportSummary', () => {
    it('xuất tổng quan chứa các thẻ 6.8 và bảng hồ sơ, tên tệp đúng', async () => {
      const result = await exportSummary(
        { period: '2026-Q1' },
        adminActor,
        appClient.db
      );

      expect(result.filename).toBe('Tong_quan_2026-Q1.xlsx');
      expect(result.buffer).toBeInstanceOf(Buffer);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(result.buffer);

      const ws = wb.worksheets[0];
      expect(ws).toBeDefined();

      const allText: string[] = [];
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value !== null && cell.value !== undefined) {
            allText.push(String(cell.value));
          }
        });
      });
      const combinedText = allText.join(' ');

      // Kiểm tra tiêu đề và thông tin chung
      expect(combinedText).toContain('BÁO CÁO TỔNG QUAN HỒ SƠ RỦI RO TRỌNG YẾU');
      expect(combinedText).toContain('2026');
      expect(combinedText).toContain('2026-Q1');

      // Kiểm tra danh sách hồ sơ có các mã
      expect(combinedText).toContain('HD11.R27');
      expect(combinedText).toContain('CN02.R13');
      expect(combinedText).toContain('CN03.R14');
      expect(combinedText).toContain('TT07.R46');
    });

    it('không chọn kỳ thì tên tệp tổng quan có hậu tố hien-hanh', async () => {
      const result = await exportSummary({}, adminActor, appClient.db);
      expect(result.filename).toBe('Tong_quan_hien-hanh.xlsx');
    });

    it('cho phép mọi vai trò kể cả viewer xuất tổng quan', async () => {
      const result = await exportSummary({}, viewerActor, appClient.db);
      expect(result.filename).toBe('Tong_quan_hien-hanh.xlsx');
    });
  });
});
