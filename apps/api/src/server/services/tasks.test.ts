import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { seedInitialPeriods } from './periods';
import { seedUnits } from './units';
import { submitTaskUpdate, getTaskUpdates } from './tasks';
import {
  cycle,
  period,
  actionPlan,
  actionTask,
  actionUpdate,
  appUser,
  unit,
  auditLog,
} from '../db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Actor } from '../types';
import { AppError } from '../errors';

describe('tasks.test.ts - Kế hoạch 3B.2: Nộp tiến độ đầu việc và lịch sử bản cập nhật', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let testCycleId: string;

  let adminActor: Actor;
  let ban4Actor: Actor;
  let unit1Actor: Actor;
  let unit2Actor: Actor;
  let viewerActor: Actor;

  let tt1Unit: typeof unit.$inferSelect;
  let tt2Unit: typeof unit.$inferSelect;

  let assignedTask: typeof actionTask.$inferSelect;
  let unassignedTask: typeof actionTask.$inferSelect;

  beforeAll(async () => {
    const testMigrateUrl = process.env.DATABASE_TEST_MIGRATE_URL;
    const testAppUrl = process.env.DATABASE_TEST_URL;
    if (!testMigrateUrl || !testAppUrl) {
      throw new Error('Thiếu DATABASE_TEST_MIGRATE_URL hoặc DATABASE_TEST_URL');
    }

    await runMigrations(testMigrateUrl);
    const ownerSql = (await import('postgres')).default(testMigrateUrl, { max: 1 });
    await ownerSql`TRUNCATE TABLE audit_log, indicator_reading, action_update, action_task, action_control, action_plan, period, cycle CASCADE`;
    await ownerSql.end();

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

    const allUnits = await appClient.db.select().from(unit);
    tt1Unit = allUnits.find((u) => u.code === 'TT1')!;
    tt2Unit = allUnits.find((u) => u.code === 'TT2')!;

    // Tạo các actor
    const [adm] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm_tasks_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Duyệt Nhiệm Vụ',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    adminActor = { userId: adm.id, role: 'admin', unitId: null };

    const [b4] = await appClient.db
      .insert(appUser)
      .values({
        email: `b4_tasks_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Ban 4 Giám Sát NV',
        role: 'ban4',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    ban4Actor = { userId: b4.id, role: 'ban4', unitId: null };

    const [u1] = await appClient.db
      .insert(appUser)
      .values({
        email: `u1_tasks_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Nguoi TT1 NV',
        role: 'unit',
        unitId: tt1Unit.id,
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    unit1Actor = { userId: u1.id, role: 'unit', unitId: tt1Unit.id };

    const [u2] = await appClient.db
      .insert(appUser)
      .values({
        email: `u2_tasks_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Nguoi TT2 NV',
        role: 'unit',
        unitId: tt2Unit.id,
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    unit2Actor = { userId: u2.id, role: 'unit', unitId: tt2Unit.id };

    const [vw] = await appClient.db
      .insert(appUser)
      .values({
        email: `vw_tasks_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Người Xem NV',
        role: 'viewer',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    viewerActor = { userId: vw.id, role: 'viewer', unitId: null };

    // Lấy 2 đầu việc: 1 gán cho TT1, 1 để null
    const allTasks = await appClient.db.select().from(actionTask);
    assignedTask = allTasks[0];
    unassignedTask = allTasks[1];

    await appClient.db
      .update(actionTask)
      .set({ unitId: tt1Unit.id })
      .where(eq(actionTask.id, assignedTask.id));

    await appClient.db
      .update(actionTask)
      .set({ unitId: null })
      .where(eq(actionTask.id, unassignedTask.id));
  });

  describe('1. submitTaskUpdate: Kiểm tra theo backend-design 5.2 và 4.11 mục 6', () => {
    it('kỳ không tồn tại trong chu kỳ -> 404 PERIOD_NOT_FOUND', async () => {
      await expect(
        submitTaskUpdate(
          assignedTask.id,
          { periodKey: '2026-Q9', progress: 50 },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'PERIOD_NOT_FOUND' });
    });

    it('kỳ đã bị khóa -> 409 PERIOD_CLOSED', async () => {
      await appClient.db
        .update(period)
        .set({ closedAt: new Date() })
        .where(and(eq(period.cycleId, testCycleId), eq(period.key, '2026-Q4')));

      await expect(
        submitTaskUpdate(
          assignedTask.id,
          { periodKey: '2026-Q4', progress: 50 },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });

      await appClient.db
        .update(period)
        .set({ closedAt: null })
        .where(and(eq(period.cycleId, testCycleId), eq(period.key, '2026-Q4')));
    });

    it('chỉ kỳ quý: nộp cho kỳ tháng (2026-10) -> 422 VALIDATION', async () => {
      await expect(
        submitTaskUpdate(
          assignedTask.id,
          { periodKey: '2026-10', progress: 50 },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('progress ngoài 0 đến 100 -> 422 VALIDATION', async () => {
      await expect(
        submitTaskUpdate(
          assignedTask.id,
          { periodKey: '2026-Q4', progress: -1 },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      await expect(
        submitTaskUpdate(
          assignedTask.id,
          { periodKey: '2026-Q4', progress: 101 },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('phân quyền theo vai trò và gán đơn vị', async () => {
      // Viewer nộp -> 403
      await expect(
        submitTaskUpdate(
          assignedTask.id,
          { periodKey: '2026-Q4', progress: 20 },
          viewerActor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      // Unit khác nộp đầu việc của TT1 -> 403
      await expect(
        submitTaskUpdate(
          assignedTask.id,
          { periodKey: '2026-Q4', progress: 20 },
          unit2Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      // Đầu việc chưa gán đơn vị: unit nộp bị 403
      await expect(
        submitTaskUpdate(
          unassignedTask.id,
          { periodKey: '2026-Q4', progress: 20 },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      // Đầu việc chưa gán đơn vị: admin và ban4 nộp được
      const resAdm = await submitTaskUpdate(
        unassignedTask.id,
        { periodKey: '2026-Q4', progress: 20 },
        adminActor,
        { today: '2026-10-15' },
        appClient.db
      );
      expect(resAdm.status).toBe('pending');
      expect(resAdm.progress).toBe(20);

      const resB4 = await submitTaskUpdate(
        unassignedTask.id,
        { periodKey: '2026-Q4', progress: 25 },
        ban4Actor,
        { today: '2026-10-15' },
        appClient.db
      );
      expect(resB4.status).toBe('pending');
      expect(resB4.progress).toBe(25);
    });

    it('thấp hơn bản duyệt mới nhất mà thiếu note -> 422 VALIDATION; có note -> thành công', async () => {
      // 1. Tạo 1 bản approved progress = 50 cho assignedTask
      const appUpdateId = crypto.randomUUID();
      await appClient.db.insert(actionUpdate).values({
        id: appUpdateId,
        taskId: assignedTask.id,
        periodKey: '2026-Q4',
        progress: 50,
        status: 'approved',
        submittedBy: unit1Actor.userId,
        submittedAt: new Date('2026-10-01T08:00:00Z'),
        reviewedBy: adminActor.userId,
        reviewedAt: new Date('2026-10-05T08:00:00Z'),
      });

      // 2. Nộp progress = 60 (tăng lên): không cần note vẫn thành công
      const resHigher = await submitTaskUpdate(
        assignedTask.id,
        { periodKey: '2026-Q4', progress: 60, note: null },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );
      expect(resHigher.status).toBe('pending');
      expect(resHigher.progress).toBe(60);

      // 3. Nộp progress = 40 (giảm xuống dưới 50): thiếu note -> 422
      await expect(
        submitTaskUpdate(
          assignedTask.id,
          { periodKey: '2026-Q4', progress: 40, note: null },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      await expect(
        submitTaskUpdate(
          assignedTask.id,
          { periodKey: '2026-Q4', progress: 40, note: '   ' },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      // 4. Nộp progress = 40 có note -> thành công
      const resLower = await submitTaskUpdate(
        assignedTask.id,
        { periodKey: '2026-Q4', progress: 40, note: 'Tạm hoãn do chờ thiết bị từ đối tác' },
        unit1Actor,
        { today: '2026-10-15', ip: '127.0.0.1' },
        appClient.db
      );
      expect(resLower.status).toBe('pending');
      expect(resLower.progress).toBe(40);
      expect(resLower.note).toBe('Tạm hoãn do chờ thiết bị từ đối tác');

      // Đảm bảo có audit_log submit_task_update
      const [log] = await appClient.db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'submit_task_update'),
            eq(auditLog.entityId, resLower.id)
          )
        );
      expect(log).toBeDefined();
      expect(log.userId).toBe(unit1Actor.userId);
    });
  });

  describe('2. getTaskUpdates: Lịch sử bản cập nhật đầu việc', () => {
    it('viewer xem -> 403 FORBIDDEN', async () => {
      await expect(
        getTaskUpdates(assignedTask.id, viewerActor, appClient.db)
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('unit xem đầu việc đơn vị khác -> 403 FORBIDDEN', async () => {
      await expect(
        getTaskUpdates(assignedTask.id, unit2Actor, appClient.db)
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('unit xem đầu việc đơn vị mình -> 200 OK, xếp mới trước', async () => {
      const list = await getTaskUpdates(assignedTask.id, unit1Actor, appClient.db);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].taskName).toBe(assignedTask.name);
      expect(list[0].actionCode).toBeDefined();
    });

    it('admin xem được mọi đầu việc', async () => {
      const list = await getTaskUpdates(unassignedTask.id, adminActor, appClient.db);
      expect(list.length).toBeGreaterThan(0);
    });
  });
});
