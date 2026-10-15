import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { seedInitialPeriods } from './periods';
import { seedUnits } from './units';
import { deleteCause, deleteControl, deleteActionPlan, deleteIndicator } from './sub-items';
import { deleteTask, splitTask } from './tasks';
import { deleteProfile } from './profiles';
import {
  cycle,
  period,
  indicatorReading,
  actionPlan,
  actionTask,
  actionUpdate,
  indicator,
  residualAssessment,
  appUser,
} from '../db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import type { Actor } from '../types';

describe('referenced-details-s3.test.ts - Kiểm thử S3: details của REFERENCED là danh sách { kind, code } hoặc { kind, periodKey }', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let excelBuffer: Buffer;
  let adminActor: Actor;

  beforeAll(async () => {
    const testMigrateUrl = process.env.DATABASE_TEST_MIGRATE_URL;
    const testAppUrl = process.env.DATABASE_TEST_URL;
    if (!testMigrateUrl || !testAppUrl) {
      throw new Error('Thiếu DATABASE_TEST_MIGRATE_URL hoặc DATABASE_TEST_URL');
    }

    await runMigrations(testMigrateUrl);
    appClient = createCustomClient(testAppUrl);

    const [u] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm_s3_${Date.now()}@mobifone.vn`,
        fullName: 'Admin S3 Test',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();

    adminActor = { userId: u.id, role: 'admin', unitId: null };

    const excelPath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
      : fs.existsSync(path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx')
      : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
    excelBuffer = fs.readFileSync(excelPath);

    // Setup chu kỳ 2026
    await appClient.db.delete(residualAssessment);
    await appClient.db.delete(indicatorReading);
    await appClient.db.delete(actionUpdate);
    await appClient.db.delete(period);
    await appClient.db.delete(cycle);

    const report = await importCycle({ year: 2026, file: excelBuffer, actor: null }, appClient.db);
    await seedInitialPeriods(report.cycleId, appClient.db);
    await seedUnits(appClient.db);
  });

  it('1. Xóa nguyên nhân còn liên kết kiểm soát: details là mảng { kind: "control", code }', async () => {
    try {
      await deleteCause('HD11.R27', 'HD11.R27.NN01', 2026, adminActor, undefined, appClient.db);
      expect.fail('Phải ném REFERENCED');
    } catch (err: any) {
      expect(err.code).toBe('REFERENCED');
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details.length).toBeGreaterThanOrEqual(1);
      expect(err.details[0]).toMatchObject({ kind: 'control', code: expect.any(String) });
    }
  });

  it('2. Xóa kiểm soát còn liên kết: details là mảng { kind: "cause" | "action", code }', async () => {
    try {
      await deleteControl('HD11.R27', 'HD11.R27.KS01', 2026, adminActor, undefined, appClient.db);
      expect.fail('Phải ném REFERENCED');
    } catch (err: any) {
      expect(err.code).toBe('REFERENCED');
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details.some((d: any) => d.kind === 'cause' && d.code.startsWith('HD11.R27.NN'))).toBe(true);
    }
  });

  it('3. Xóa chỉ số đã có bản nộp: details là mảng { kind: "reading", periodKey }', async () => {
    const [ind] = await appClient.db
      .select()
      .from(indicator)
      .where(eq(indicator.code, 'HD11.R27.KRI01'));

    await appClient.db.insert(indicatorReading).values({
      indicatorId: ind.id,
      periodKey: '2026-10',
      valueNum: '10',
      zone: 'green',
      zoneSource: 'auto',
      status: 'pending',
      submittedBy: adminActor.userId,
    });

    try {
      await deleteIndicator('HD11.R27', 'HD11.R27.KRI01', 2026, adminActor, undefined, appClient.db);
      expect.fail('Phải ném REFERENCED');
    } catch (err: any) {
      expect(err.code).toBe('REFERENCED');
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details).toContainEqual(expect.objectContaining({ kind: 'reading', periodKey: '2026-10' }));
    }
  });

  it('4. Xóa đầu việc / KH đã có bản cập nhật: details là mảng { kind: "task_update", periodKey }', async () => {
    const [task] = await appClient.db
      .select({ id: actionTask.id, actionId: actionTask.actionId })
      .from(actionTask)
      .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
      .where(eq(actionPlan.code, 'HD11.R27.KH01'));

    // Thêm đầu việc thứ 2 để không bị lỗi xóa đầu việc cuối cùng (INVALID_STATE)
    await appClient.db.insert(actionTask).values({
      actionId: task.actionId,
      name: 'Đầu việc phụ để test',
      orderNum: 2,
    });

    await appClient.db.insert(actionUpdate).values({
      taskId: task.id,
      periodKey: '2026-Q4',
      progress: 50,
      status: 'pending',
      submittedBy: adminActor.userId,
    });

    // 4a. Xóa đầu việc
    try {
      await deleteTask(task.id, adminActor, undefined, appClient.db);
      expect.fail('Phải ném REFERENCED');
    } catch (err: any) {
      expect(err.code).toBe('REFERENCED');
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details).toContainEqual(expect.objectContaining({ kind: 'task_update', periodKey: '2026-Q4' }));
    }

    // 4b. Tách đầu việc
    try {
      await splitTask(task.id, { parts: [{ name: 'P1' }, { name: 'P2' }] }, adminActor, undefined, appClient.db);
      expect.fail('Phải ném REFERENCED');
    } catch (err: any) {
      expect(err.code).toBe('REFERENCED');
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details).toContainEqual(expect.objectContaining({ kind: 'task_update', periodKey: '2026-Q4' }));
    }

    // 4c. Xóa KH
    try {
      await deleteActionPlan('HD11.R27', 'HD11.R27.KH01', 2026, adminActor, undefined, appClient.db);
      expect.fail('Phải ném REFERENCED');
    } catch (err: any) {
      expect(err.code).toBe('REFERENCED');
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details).toContainEqual(expect.objectContaining({ kind: 'task_update', periodKey: '2026-Q4' }));
    }
  });

  it('5. Xóa hồ sơ đã có số liệu hoặc mức còn lại: details là mảng liệt kê các mục tham chiếu', async () => {
    try {
      await deleteProfile('HD11.R27', 2026, adminActor, undefined, appClient.db);
      expect.fail('Phải ném REFERENCED');
    } catch (err: any) {
      expect(err.code).toBe('REFERENCED');
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details.length).toBeGreaterThan(0);
      expect(err.details.some((d: any) => d.kind === 'reading' || d.kind === 'task_update')).toBe(true);
    }
  });
});
