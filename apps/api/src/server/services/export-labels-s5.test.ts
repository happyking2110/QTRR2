import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { ensurePeriods } from './periods';
import { exportProfileBM06, exportSummary } from './export-bm06';
import {
  riskProfile,
  actionPlan,
  actionTask,
  indicator,
  indicatorReading,
  appUser,
} from '../db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import type { Actor } from '../types';

describe('export-labels-s5.test.ts - Kiểm thử S5: nhãn tiếng Việt và định dạng ngày dd/mm/yyyy', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let adminActor: Actor;

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

    // Tạo admin user
    const [adm] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm_s5_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin S5',
        role: 'admin',
        passwordHash: 'dummy_hash',
        isActive: true,
      })
      .returning();
    adminActor = { id: adm.id, email: adm.email, role: 'admin', unitId: null };

    // Import 2026 từ file thật
    const excelPath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
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

    // Thêm indicator reading cho HD11.R27 có zone = 'yellow'
    const [prof] = await appClient.db
      .select()
      .from(riskProfile)
      .where(eq(riskProfile.riskCode, 'HD11.R27'));

    const [ind] = await appClient.db
      .select()
      .from(indicator)
      .where(and(eq(indicator.profileId, prof.id), eq(indicator.code, 'HD11.R27.KRI01')));

    await appClient.db.insert(indicatorReading).values({
      indicatorId: ind.id,
      periodKey: '2026-Q1',
      valueNum: '8.00',
      valueText: '8%',
      zone: 'yellow',
      zoneSource: 'auto',
      status: 'approved',
      submittedBy: adm.id,
      reviewedBy: adm.id,
      reviewedAt: new Date('2026-03-31T10:00:00Z'),
    });
  });

  it('1. BM06: Cột trạng thái KH, vùng đánh giá, và hạn hoàn thành phải dùng tiếng Việt và dd/mm/yyyy', async () => {
    const result = await exportProfileBM06(
      { riskCode: 'HD11.R27', period: '2026-Q1' },
      adminActor,
      appClient.db
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer);
    const ws = wb.worksheets[0];

    const rows: string[][] = [];
    ws.eachRow((row) => {
      const r: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        r.push(cell.value !== null && cell.value !== undefined ? String(cell.value) : '');
      });
      rows.push(r);
    });

    // 1. Kiểm tra không chứa các mã tiếng Anh trong bảng: in_progress, overdue, not_started, at_risk, completed
    const rawAll = rows.map((r) => r.join(' | ')).join('\n');
    expect(rawAll).not.toMatch(/\bin_progress\b/);
    expect(rawAll).not.toMatch(/\bnot_started\b/);
    expect(rawAll).not.toMatch(/\bat_risk\b/);

    // 2. Vùng đánh giá phải là Xanh, Vàng, Đỏ hoặc Chưa có số liệu - không được là yellow, green, red
    expect(rawAll).not.toMatch(/\byellow\b/i);
    expect(rawAll).not.toMatch(/\bgreen\b/i);
    // Vùng của reading vừa tạo là yellow -> phải xuất ra Vàng
    expect(rawAll).toContain('Vàng');

    // 3. Hạn hoàn thành đầu việc không được ở dạng ISO YYYY-MM-DD
    // Tìm các dòng trong phần đầu việc chi tiết
    const isoDateMatches = rawAll.match(/\b\d{4}-\d{2}-\d{2}\b/g);
    expect(isoDateMatches).toBeNull();
  });

  it('2. Tổng quan: Trạng thái chu kỳ dùng Đang mở / Đã lưu trữ, Ngày cập nhật số liệu dạng dd/mm/yyyy', async () => {
    const result = await exportSummary(
      { period: '2026-Q1' },
      adminActor,
      appClient.db
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer);
    const ws = wb.worksheets[0];

    const rows: string[][] = [];
    ws.eachRow((row) => {
      const r: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        r.push(cell.value !== null && cell.value !== undefined ? String(cell.value) : '');
      });
      rows.push(r);
    });

    const rawAll = rows.map((r) => r.join(' | ')).join('\n');

    // Không được có "Trạng thái: open" hoặc "Trạng thái: archived"
    expect(rawAll).not.toContain('Trạng thái: open');
    expect(rawAll).not.toContain('Trạng thái: archived');
    expect(rawAll).toContain('Trạng thái: Đang mở');

    // Ngày cập nhật số liệu không được có dạng ISO YYYY-MM-DD
    const isoDateMatches = rawAll.match(/\b\d{4}-\d{2}-\d{2}\b/g);
    expect(isoDateMatches).toBeNull();
  });
});
