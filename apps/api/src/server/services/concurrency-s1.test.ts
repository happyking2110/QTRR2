import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { seedInitialPeriods, closePeriod } from './periods';
import { seedUnits } from './units';
import { submitReading } from './readings';
import { approveReading, withdrawReading, rejectReading } from './approvals';
import {
  indicator,
  indicatorReading,
  period,
  appUser,
  auditLog,
} from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Actor } from '../types';
import { AppError } from '../errors';
import postgres from 'postgres';

describe('S1 Concurrency & Transaction Safety Tests (hsrr_test)', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let ownerSql: postgres.Sql;
  let testCycleId: string;

  let admin1Actor: Actor;
  let admin2Actor: Actor;
  let unitActor: Actor;

  let testIndicator: typeof indicator.$inferSelect;

  beforeAll(async () => {
    const testMigrateUrl = process.env.DATABASE_TEST_MIGRATE_URL;
    const testAppUrl = process.env.DATABASE_TEST_URL;
    if (!testMigrateUrl || !testAppUrl) {
      throw new Error('Thiếu DATABASE_TEST_MIGRATE_URL hoặc DATABASE_TEST_URL');
    }

    await runMigrations(testMigrateUrl);
    ownerSql = postgres(testMigrateUrl, { max: 1 });
    await ownerSql`TRUNCATE TABLE audit_log, indicator_reading, action_update, action_task, action_control, action_plan, period, cycle, app_user CASCADE`;

    appClient = createCustomClient(testAppUrl);

    // Import dữ liệu 2026
    const excelPath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
      : fs.existsSync(path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx')
      : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
    const buffer = fs.readFileSync(excelPath);
    const report = await importCycle({ year: 2026, file: buffer, actor: null }, appClient.db);
    testCycleId = report.cycleId;

    await seedInitialPeriods(testCycleId, appClient.db);
    await seedUnits(appClient.db);

    const [adm1] = await appClient.db
      .insert(appUser)
      .values({
        email: `s1_adm1_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Một S1',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();

    const [adm2] = await appClient.db
      .insert(appUser)
      .values({
        email: `s1_adm2_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Hai S1',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();

    const [unitUser] = await appClient.db
      .insert(appUser)
      .values({
        email: `s1_unit_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Unit S1',
        role: 'unit',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();

    admin1Actor = {
      userId: adm1.id,
      email: adm1.email,
      role: 'admin',
      unitId: null,
      mustChangePassword: false,
    };

    admin2Actor = {
      userId: adm2.id,
      email: adm2.email,
      role: 'admin',
      unitId: null,
      mustChangePassword: false,
    };

    unitActor = {
      userId: unitUser.id,
      email: unitUser.email,
      role: 'unit',
      unitId: null,
      mustChangePassword: false,
    };

    const inds = await appClient.db
      .select()
      .from(indicator)
      .where(eq(indicator.code, 'HD11.R27.KRI01'));
    testIndicator = inds[0];

    // Gán ownerUnitId cho indicator để unitActor hoặc admin nộp được
    await appClient.db
      .update(indicator)
      .set({ ownerUnitId: null })
      .where(eq(indicator.id, testIndicator.id));
  });

  afterAll(async () => {
    if (ownerSql) await ownerSql.end();
  });

  it('1. Tranh chấp duyệt và rút lại: lặp 25 lần Promise.allSettled([approve, withdraw]) chỉ đúng 1 bên thành công, bên kia 409 INVALID_STATE', async () => {
    // Đảm bảo kỳ 2026-10 đang mở
    await appClient.db
      .update(period)
      .set({ closedAt: null, closedBy: null })
      .where(and(eq(period.cycleId, testCycleId), eq(period.key, '2026-10')));

    for (let i = 0; i < 25; i++) {
      // Nộp 1 bản
      const sub = await submitReading(
        testIndicator.id,
        {
          periodKey: '2026-10',
          valueNum: 5,
          note: `Concurrent test ${i}`,
        },
        admin1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      // Gọi đồng thời approve (admin2) và withdraw (admin1 - người nộp)
      const results = await Promise.allSettled([
        approveReading(sub.id, admin2Actor, undefined, appClient.db),
        withdrawReading(sub.id, admin1Actor, undefined, appClient.db),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const err = (rejected[0] as PromiseRejectedResult).reason;
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('INVALID_STATE');

      // Kiểm tra trạng thái cuối cùng trong DB
      const [finalRow] = await appClient.db
        .select()
        .from(indicatorReading)
        .where(eq(indicatorReading.id, sub.id));

      const winnerResult = (fulfilled[0] as PromiseFulfilledResult<any>).value;
      expect(finalRow.status).toBe(winnerResult.status);

      // Kiểm tra audit log: đúng 1 dòng chuyển trạng thái (approve_submission hoặc withdraw_submission)
      const logs = await appClient.db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entityId, sub.id),
            sql`${auditLog.action} IN ('approve_submission', 'withdraw_submission')`
          )
        );
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe(
        winnerResult.status === 'approved' ? 'approve_submission' : 'withdraw_submission'
      );
    }
  });

  it('2. Tranh chấp duyệt và từ chối: Promise.allSettled([approve, reject]) chỉ đúng 1 bên thành công, bên kia 409 INVALID_STATE', async () => {
    for (let i = 0; i < 10; i++) {
      const sub = await submitReading(
        testIndicator.id,
        {
          periodKey: '2026-10',
          valueNum: 4,
          note: `Approve vs reject test ${i}`,
        },
        admin1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      const results = await Promise.allSettled([
        approveReading(sub.id, admin2Actor, undefined, appClient.db),
        rejectReading(sub.id, 'Lý do từ chối thử nghiệm', admin2Actor, undefined, appClient.db),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const err = (rejected[0] as PromiseRejectedResult).reason;
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('INVALID_STATE');

      const [finalRow] = await appClient.db
        .select()
        .from(indicatorReading)
        .where(eq(indicatorReading.id, sub.id));

      const winnerResult = (fulfilled[0] as PromiseFulfilledResult<any>).value;
      expect(finalRow.status).toBe(winnerResult.status);
    }
  });

  it('3. Hai admin cùng approve một bản: chỉ đúng 1 lần thành công, lần kia 409 INVALID_STATE', async () => {
    for (let i = 0; i < 10; i++) {
      const sub = await submitReading(
        testIndicator.id,
        {
          periodKey: '2026-10',
          valueNum: 4,
          note: `Two admins test ${i}`,
        },
        admin1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      const results = await Promise.allSettled([
        approveReading(sub.id, admin2Actor, undefined, appClient.db),
        approveReading(sub.id, admin2Actor, undefined, appClient.db),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const err = (rejected[0] as PromiseRejectedResult).reason;
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('INVALID_STATE');
    }
  });

  it('4. Tranh chấp nộp và khóa kỳ: lặp 25 lần Promise.allSettled([submitReading, closePeriod]) không bao giờ có kỳ đã khóa còn bản pending', async () => {
    for (let i = 0; i < 25; i++) {
      await appClient.db
        .update(period)
        .set({ closedAt: null, closedBy: null })
        .where(and(eq(period.cycleId, testCycleId), eq(period.key, '2026-11')));

      await appClient.db
        .delete(indicatorReading)
        .where(eq(indicatorReading.periodKey, '2026-11'));

      const results = await Promise.allSettled([
        submitReading(
          testIndicator.id,
          {
            periodKey: '2026-11',
            valueNum: 8,
            note: `Submit vs close ${i}`,
          },
          admin1Actor,
          { today: '2026-11-15' },
          appClient.db
        ),
        closePeriod(2026, '2026-11', admin1Actor, undefined, appClient.db),
      ]);

      const [submitRes, closeRes] = results;

      const [pRow] = await appClient.db
        .select()
        .from(period)
        .where(and(eq(period.cycleId, testCycleId), eq(period.key, '2026-11')));

      const pendingRows = await appClient.db
        .select()
        .from(indicatorReading)
        .where(
          and(
            eq(indicatorReading.periodKey, '2026-11'),
            eq(indicatorReading.status, 'pending')
          )
        );

      if (pRow.closedAt !== null) {
        expect(pendingRows.length).toBe(0);
        expect(closeRes.status).toBe('fulfilled');
        expect(submitRes.status).toBe('rejected');
        expect(((submitRes as PromiseRejectedResult).reason as AppError).code).toBe('PERIOD_CLOSED');
      } else {
        expect(closeRes.status).toBe('rejected');
        expect(((closeRes as PromiseRejectedResult).reason as AppError).code).toBe('INVALID_STATE');
        expect(submitRes.status).toBe('fulfilled');
        expect(pendingRows.length).toBe(1);
      }
    }
  });

  it('5. Ghi nhật ký thất bại thì toàn bộ thao tác bị rollback, bản nộp giữ nguyên trạng thái', async () => {
    const sub = await submitReading(
      testIndicator.id,
      {
        periodKey: '2026-10',
        valueNum: 5,
        note: 'Audit failure rollback test',
      },
      admin1Actor,
      { today: '2026-10-15' },
      appClient.db
    );

    // Tạm thời thu hồi quyền INSERT trên audit_log của hsrr_app
    await ownerSql`REVOKE INSERT ON audit_log FROM hsrr_app`;

    let errorThrown = false;
    try {
      await approveReading(sub.id, admin2Actor, undefined, appClient.db);
    } catch (e) {
      errorThrown = true;
    } finally {
      await ownerSql`GRANT INSERT ON audit_log TO hsrr_app`;
    }

    expect(errorThrown).toBe(true);

    const [rowAfter] = await appClient.db
      .select()
      .from(indicatorReading)
      .where(eq(indicatorReading.id, sub.id));
    // Vì lỗi ghi nhật ký, transaction phải rollback và trạng thái vẫn là 'pending'
    expect(rowAfter.status).toBe('pending');
  });
});
