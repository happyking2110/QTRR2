import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { runMigrations } from '../db/migrate';
import { createCustomClient } from '../db/client';
import { cycle, period, appSetting, auditLog } from '../db/schema';
import { seedInitialPeriods } from './periods';
import { eq, and } from 'drizzle-orm';

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

describe('seedInitialPeriods (Kế hoạch 2.2)', () => {
  let ownerSql: postgres.Sql;
  let appClient: ReturnType<typeof createCustomClient>;
  let testCycleId: string;

  beforeAll(async () => {
    await runMigrations(testMigrateUrl);
    ownerSql = postgres(testMigrateUrl, { max: 1 });
    appClient = createCustomClient(testAppUrl);

    // Dọn dẹp dữ liệu kiểm thử
    await ownerSql`TRUNCATE TABLE audit_log, period, cycle, app_setting CASCADE`;

    // Tạo cycle kiểm thử
    const [insertedCycle] = await appClient.db
      .insert(cycle)
      .values({
        year: 2026,
        status: 'open',
      })
      .returning();
    testCycleId = insertedCycle.id;
  });

  afterAll(async () => {
    if (appClient) await appClient.client.end();
    if (ownerSql) await ownerSql.end();
  });

  it('lần 1: tạo đúng 4 kỳ báo cáo với hạn mặc định mùng 10 (16:59:59 UTC)', async () => {
    const periods = await seedInitialPeriods(testCycleId, appClient.db);
    expect(periods).toHaveLength(4);

    const dbPeriods = await appClient.db
      .select()
      .from(period)
      .where(eq(period.cycleId, testCycleId));
    expect(dbPeriods).toHaveLength(4);

    const byKey = new Map(dbPeriods.map((p) => [p.key, p]));

    // 2026-10
    const p10 = byKey.get('2026-10');
    expect(p10).toBeDefined();
    expect(p10?.kind).toBe('month');
    expect(p10?.label).toBe('Tháng 10/2026');
    expect(p10?.startsOn).toBe('2026-10-01');
    expect(p10?.endsOn).toBe('2026-10-31');
    expect(p10?.dueAt.toISOString()).toBe('2026-11-10T16:59:59.000Z');

    // 2026-11
    const p11 = byKey.get('2026-11');
    expect(p11).toBeDefined();
    expect(p11?.kind).toBe('month');
    expect(p11?.label).toBe('Tháng 11/2026');
    expect(p11?.startsOn).toBe('2026-11-01');
    expect(p11?.endsOn).toBe('2026-11-30');
    expect(p11?.dueAt.toISOString()).toBe('2026-12-10T16:59:59.000Z');

    // 2026-12
    const p12 = byKey.get('2026-12');
    expect(p12).toBeDefined();
    expect(p12?.kind).toBe('month');
    expect(p12?.label).toBe('Tháng 12/2026');
    expect(p12?.startsOn).toBe('2026-12-01');
    expect(p12?.endsOn).toBe('2026-12-31');
    expect(p12?.dueAt.toISOString()).toBe('2027-01-10T16:59:59.000Z');

    // 2026-Q4
    const pq4 = byKey.get('2026-Q4');
    expect(pq4).toBeDefined();
    expect(pq4?.kind).toBe('quarter');
    expect(pq4?.label).toBe('Quý 4/2026');
    expect(pq4?.startsOn).toBe('2026-10-01');
    expect(pq4?.endsOn).toBe('2026-12-31');
    expect(pq4?.dueAt.toISOString()).toBe('2027-01-10T16:59:59.000Z');

    // Kiểm tra có đúng 1 dòng audit_log seed_periods
    const audits = await appClient.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'seed_periods'), eq(auditLog.entityId, testCycleId)));
    expect(audits).toHaveLength(1);
    expect(audits[0].userId).toBeNull();
  });

  it('lần 2: chạy lại không nhân đôi, không ghi thêm audit_log khi không có thay đổi', async () => {
    const auditsBefore = await appClient.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'seed_periods'), eq(auditLog.entityId, testCycleId)));
    const auditCountBefore = auditsBefore.length;

    const periods = await seedInitialPeriods(testCycleId, appClient.db);
    expect(periods).toHaveLength(4);

    const dbPeriods = await appClient.db
      .select()
      .from(period)
      .where(eq(period.cycleId, testCycleId));
    expect(dbPeriods).toHaveLength(4);

    const auditsAfter = await appClient.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'seed_periods'), eq(auditLog.entityId, testCycleId)));
    expect(auditsAfter.length).toBe(auditCountBefore);
  });

  it('đọc period.due_day từ app_setting khi có thiết lập tùy chỉnh', async () => {
    // Thiết lập period.due_day = 15
    await appClient.db
      .insert(appSetting)
      .values({
        key: 'period.due_day',
        value: 15,
      })
      .onConflictDoUpdate({
        target: appSetting.key,
        set: { value: 15 },
      });

    // Tạo chu kỳ năm 2027
    const [cycle2027] = await appClient.db
      .insert(cycle)
      .values({
        year: 2027,
        status: 'open',
      })
      .returning();

    const periods2027 = await seedInitialPeriods(cycle2027.id, appClient.db);
    expect(periods2027).toHaveLength(4);

    const p10_2027 = periods2027.find((p) => p.key === '2027-10');
    expect(p10_2027?.dueAt.toISOString()).toBe('2027-11-15T16:59:59.000Z');
  });
});
