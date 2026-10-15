import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { runMigrations } from '../db/migrate';
import { createCustomClient } from '../db/client';
import { importCycle } from './cycles';
import { seedInitialPeriods } from './periods';
import { seedDemoData, clearDemoData } from './demo';
import {
  cycle,
  period,
  indicator,
  indicatorReading,
  actionUpdate,
  residualAssessment,
  auditLog,
} from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { AppError } from '../errors';

function getRequiredTestUrl(varName: string): string {
  const url = process.env[varName];
  if (!url) {
    throw new Error(`Thiếu biến môi trường ${varName}`);
  }
  const parsed = new URL(url);
  const dbName = parsed.pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Rào chắn an toàn: Cơ sở dữ liệu trong ${varName} (${dbName}) phải kết thúc bằng '_test' để tránh ghi đè dữ liệu thật`
    );
  }
  return url;
}

const testMigrateUrl = getRequiredTestUrl('DATABASE_TEST_MIGRATE_URL');
const testAppUrl = getRequiredTestUrl('DATABASE_TEST_URL');

describe('Dữ liệu demo (seedDemoData, clearDemoData) - Kế hoạch 2.3', () => {
  let ownerSql: postgres.Sql;
  let appClient: ReturnType<typeof createCustomClient>;
  let testCycleId: string;

  const excelPath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
    ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
    : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
  const buffer = fs.readFileSync(excelPath);

  beforeAll(async () => {
    await runMigrations(testMigrateUrl);
    ownerSql = postgres(testMigrateUrl, { max: 1 });
    appClient = createCustomClient(testAppUrl);
  });

  afterAll(async () => {
    if (appClient) await appClient.client.end();
    if (ownerSql) await ownerSql.end();
  });

  beforeEach(async () => {
    // Dọn dẹp sạch sẽ hsrr_test
    await ownerSql`TRUNCATE TABLE audit_log, unit_assignment, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, session, password_history, app_user, unit, cycle CASCADE`;

    // Nhập chu kỳ 2026 thật
    const report = await importCycle({ year: 2026, file: buffer, actor: null }, appClient.db);
    testCycleId = report.cycleId;
    await seedInitialPeriods(testCycleId, appClient.db);
  });

  it('1. Rào chắn: Thiếu ALLOW_DEMO_DATA=1 -> từ chối và không ghi gì vào DB', async () => {
    const originalEnv = process.env.ALLOW_DEMO_DATA;
    delete process.env.ALLOW_DEMO_DATA;

    try {
      await expect(seedDemoData(testCycleId, appClient.db)).rejects.toThrow(
        /ALLOW_DEMO_DATA/
      );

      // Kiểm tra DB không có dữ liệu demo nào
      const readings = await appClient.db.select().from(indicatorReading);
      expect(readings).toHaveLength(0);
      const updates = await appClient.db.select().from(actionUpdate);
      expect(updates).toHaveLength(0);
      const residuals = await appClient.db.select().from(residualAssessment);
      expect(residuals).toHaveLength(0);
    } finally {
      process.env.ALLOW_DEMO_DATA = originalEnv;
    }
  });

  it('2. Rào chắn: Có số liệu không phải demo -> từ chối và không ghi gì', async () => {
    process.env.ALLOW_DEMO_DATA = '1';

    // Tạo 1 bản ghi số liệu thật (không có trong demo audit_log)
    const [ind] = await appClient.db.select().from(indicator).limit(1);
    await appClient.db.insert(indicatorReading).values({
      indicatorId: ind.id,
      periodKey: '2026-Q4',
      valueNum: '10',
      status: 'pending',
      note: 'Dữ liệu nộp thật từ người dùng',
    });

    await expect(seedDemoData(testCycleId, appClient.db)).rejects.toThrow(
      /không thuộc tập demo|Dữ liệu thật/i
    );
  });

  it('3. Chạy seedDemoData: tạo đúng phân bố vùng và cấu trúc yêu cầu', async () => {
    process.env.ALLOW_DEMO_DATA = '1';

    const result = await seedDemoData(testCycleId, appClient.db);
    expect(result.inserted).toBeDefined();

    // Kiểm tra kỳ demo được thêm (2026-Q3 và 2026-09)
    const periods = await appClient.db.select().from(period).where(eq(period.cycleId, testCycleId));
    expect(periods.map((p) => p.key)).toEqual(
      expect.arrayContaining(['2026-Q3', '2026-09', '2026-Q4', '2026-10'])
    );

    // Kiểm tra phân bố Q4: đúng 2 đỏ, 3 vàng, 5 xanh (tổng 10)
    const q4Readings = await appClient.db
      .select()
      .from(indicatorReading)
      .where(and(eq(indicatorReading.periodKey, '2026-Q4'), eq(indicatorReading.status, 'approved')));
    expect(q4Readings).toHaveLength(10);

    const redCount = q4Readings.filter((r) => r.zone === 'red').length;
    const yellowCount = q4Readings.filter((r) => r.zone === 'yellow').length;
    const greenCount = q4Readings.filter((r) => r.zone === 'green').length;

    expect(redCount).toBe(2);
    expect(yellowCount).toBe(3);
    expect(greenCount).toBe(5);

    // Ít nhất 2 chỉ số thủ công (zoneSource = 'manual' và có valueText)
    const manualReadings = q4Readings.filter((r) => r.zoneSource === 'manual');
    expect(manualReadings.length).toBeGreaterThanOrEqual(2);
    for (const mr of manualReadings) {
      expect(mr.valueText).toBeTruthy();
    }

    // Kiểm tra Q3: ít nhất 6 chỉ số quý
    const q3Readings = await appClient.db
      .select()
      .from(indicatorReading)
      .where(and(eq(indicatorReading.periodKey, '2026-Q3'), eq(indicatorReading.status, 'approved')));
    expect(q3Readings.length).toBeGreaterThanOrEqual(6);

    // Kiểm tra số liệu cho 2 KRI tháng của HD11.R27 ở 2026-10 và 2026-09
    const hd11KriReadings = await appClient.db
      .select()
      .from(indicatorReading)
      .where(inArray(indicatorReading.periodKey, ['2026-10', '2026-09']));
    expect(hd11KriReadings.length).toBeGreaterThanOrEqual(4); // 2 KRI * 2 kỳ

    // Kiểm tra actionUpdate trong Q4: ít nhất 6 đầu việc, có 1 đầu việc 100
    const q4Updates = await appClient.db
      .select()
      .from(actionUpdate)
      .where(and(eq(actionUpdate.periodKey, '2026-Q4'), eq(actionUpdate.status, 'approved')));
    expect(q4Updates.length).toBeGreaterThanOrEqual(6);
    expect(q4Updates.some((u) => u.progress === 100)).toBe(true);

    // Kiểm tra residualAssessment cho 2026-Q3 và 2026-Q4 của ít nhất 2 hồ sơ
    const residuals = await appClient.db.select().from(residualAssessment);
    expect(residuals.length).toBeGreaterThanOrEqual(4); // 2 hồ sơ * 2 kỳ
    for (const res of residuals) {
      expect(res.level).toBe('Trung bình');
    }
  });

  it('4. demo-clear: đưa số dòng về đúng như trước và không xóa bản ghi ngoài tập demo; chạy 2 lần không lỗi', async () => {
    process.env.ALLOW_DEMO_DATA = '1';

    // Đếm trước khi seed demo
    const periodCountBefore = (await appClient.db.select().from(period)).length;
    const readingCountBefore = (await appClient.db.select().from(indicatorReading)).length;
    const updateCountBefore = (await appClient.db.select().from(actionUpdate)).length;
    const residualCountBefore = (await appClient.db.select().from(residualAssessment)).length;

    // Chạy seed demo
    await seedDemoData(testCycleId, appClient.db);

    // Chạy demo-clear lần 1
    const clearResult1 = await clearDemoData(appClient.db);
    expect(clearResult1.deleted).toBeDefined();

    // Số dòng trở về đúng như trước
    const periodCountAfter = (await appClient.db.select().from(period)).length;
    const readingCountAfter = (await appClient.db.select().from(indicatorReading)).length;
    const updateCountAfter = (await appClient.db.select().from(actionUpdate)).length;
    const residualCountAfter = (await appClient.db.select().from(residualAssessment)).length;

    expect(periodCountAfter).toBe(periodCountBefore);
    expect(readingCountAfter).toBe(readingCountBefore);
    expect(updateCountAfter).toBe(updateCountBefore);
    expect(residualCountAfter).toBe(residualCountBefore);

    // Chạy demo-clear lần 2 an toàn, không lỗi
    const clearResult2 = await clearDemoData(appClient.db);
    expect(clearResult2.deleted.periods).toBe(0);
    expect(clearResult2.deleted.indicatorReadings).toBe(0);
  });
});
