import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { seedInitialPeriods } from './periods';
import { cycle, period, indicatorReading, actionUpdate } from '../db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

describe('seed-periods-s2.test.ts - Kiểm thử S2: cài từ DB trống chỉ có 4 kỳ, import lại không đổi số kỳ', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let excelBuffer: Buffer;

  beforeAll(async () => {
    const testMigrateUrl = process.env.DATABASE_TEST_MIGRATE_URL;
    const testAppUrl = process.env.DATABASE_TEST_URL;
    if (!testMigrateUrl || !testAppUrl) {
      throw new Error('Thiếu DATABASE_TEST_MIGRATE_URL hoặc DATABASE_TEST_URL');
    }

    await runMigrations(testMigrateUrl);
    appClient = createCustomClient(testAppUrl);

    const excelPath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
      : fs.existsSync(path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx')
      : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
    excelBuffer = fs.readFileSync(excelPath);
  });

  it('S2.1: importCycle ban đầu không tự tạo kỳ nào (periodsCreated = 0)', async () => {
    // Dọn dẹp dữ liệu
    await appClient.db.delete(indicatorReading);
    await appClient.db.delete(actionUpdate);
    await appClient.db.delete(period);
    await appClient.db.delete(cycle);

    const report = await importCycle(
      {
        year: 2026,
        file: excelBuffer,
        actor: null,
      },
      appClient.db
    );

    expect(report.counts.periodsCreated).toBe(0);

    const periodsAfterImport = await appClient.db
      .select()
      .from(period)
      .where(eq(period.cycleId, report.cycleId));
    expect(periodsAfterImport).toHaveLength(0);

    // Sau khi gọi seedInitialPeriods (như trong db:seed): đúng 4 kỳ ban đầu (2026-10, 2026-11, 2026-12, 2026-Q4)
    const seeded = await seedInitialPeriods(report.cycleId, appClient.db);
    expect(seeded).toHaveLength(4);

    const keys = seeded.map((p) => p.key).sort();
    expect(keys).toEqual(['2026-10', '2026-11', '2026-12', '2026-Q4'].sort());

    // Import lại cùng chu kỳ 2026: số kỳ vẫn giữ nguyên là 4
    const reportReimport = await importCycle(
      {
        year: 2026,
        file: excelBuffer,
        actor: null,
      },
      appClient.db
    );
    expect(reportReimport.counts.periodsCreated).toBe(0);

    const periodsAfterReimport = await appClient.db
      .select()
      .from(period)
      .where(eq(period.cycleId, report.cycleId));
    expect(periodsAfterReimport).toHaveLength(4);
    expect(periodsAfterReimport.map((p) => p.key).sort()).toEqual(
      ['2026-10', '2026-11', '2026-12', '2026-Q4'].sort()
    );
  });
});
