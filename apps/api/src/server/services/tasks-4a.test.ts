import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { seedInitialPeriods } from './periods';
import { seedUnits } from './units';
import { createTask, updateTask, deleteTask, splitTask } from './tasks';
import { getProfileDetail } from './queries';
import {
  cycle,
  actionPlan,
  actionTask,
  actionUpdate,
  appUser,
  unit,
} from '../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Actor } from '../types';

describe('tasks-4a.test.ts - Kế hoạch 4A.3: Đầu việc và tách đầu việc', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let testCycleId: string;

  let adminActor: Actor;
  let ban4Actor: Actor;
  let unitActor: Actor;

  let tt1Unit: typeof unit.$inferSelect;
  let tt2Unit: typeof unit.$inferSelect;

  beforeAll(async () => {
    const testMigrateUrl = process.env.DATABASE_TEST_MIGRATE_URL;
    const testAppUrl = process.env.DATABASE_TEST_URL;
    if (!testMigrateUrl || !testAppUrl) {
      throw new Error('Thiếu DATABASE_TEST_MIGRATE_URL hoặc DATABASE_TEST_URL');
    }

    await runMigrations(testMigrateUrl);
    const ownerSql = (await import('postgres')).default(testMigrateUrl, { max: 1 });
    await ownerSql`TRUNCATE TABLE audit_log, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, unit_assignment, unit, cycle CASCADE`;
    await ownerSql.end();

    appClient = createCustomClient(testAppUrl);

    // Import file thật vào năm 2026 trên hsrr_test
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

    const [adm] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm_task4a_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Task 4A',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    adminActor = { userId: adm.id, role: 'admin', unitId: null };

    const [b4] = await appClient.db
      .insert(appUser)
      .values({
        email: `b4_task4a_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Ban 4 Task 4A',
        role: 'ban4',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    ban4Actor = { userId: b4.id, role: 'ban4', unitId: null };

    const [u1] = await appClient.db
      .insert(appUser)
      .values({
        email: `u1_task4a_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Unit 1 Task 4A',
        role: 'unit',
        unitId: tt1Unit.id,
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    unitActor = { userId: u1.id, role: 'unit', unitId: tt1Unit.id };
  });

  it('Thêm đầu việc làm đổi tiến độ và trạng thái KH đúng actionProgress', async () => {
    // Lấy KH01 của HD11.R27, ban đầu có 1 đầu việc mặc định
    const detailBefore = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh01Before = detailBefore.actions.find((a) => a.code === 'HD11.R27.KH01')!;
    expect(kh01Before.tasks).toHaveLength(1);
    const firstTask = kh01Before.tasks[0];

    // Thêm bản cập nhật 100% cho task đầu tiên (được duyệt)
    const ownerSql = (await import('postgres')).default(process.env.DATABASE_TEST_MIGRATE_URL!, { max: 1 });
    await ownerSql`INSERT INTO action_update (task_id, period_key, progress, status, reviewed_at) VALUES (${firstTask.id}, '2026-Q4', 100, 'approved', NOW())`;
    await ownerSql.end();

    const detailWith100 = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh01With100 = detailWith100.actions.find((a) => a.code === 'HD11.R27.KH01')!;
    expect(kh01With100.progress).toBe(100);

    // Bây giờ thêm 1 đầu việc mới (chưa có cập nhật -> progress 0%)
    const newTask = await createTask(
      'HD11.R27',
      'HD11.R27.KH01',
      {
        name: 'Đầu việc thứ 2 của KH01',
        unitCode: 'TT1',
        dueDate: '2026-12-31',
      },
      2026,
      adminActor,
      undefined,
      appClient.db
    );

    expect(newTask.name).toBe('Đầu việc thứ 2 của KH01');
    expect(newTask.unit?.code).toBe('TT1');
    expect(newTask.dueDate).toBe('2026-12-31');
    expect(newTask.weight).toBe(1);

    // Kiểm tra tiến độ KH01 lúc này phải là trung bình của 100% và 0% = 50%
    const detailAfter = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh01After = detailAfter.actions.find((a) => a.code === 'HD11.R27.KH01')!;
    expect(kh01After.tasks).toHaveLength(2);
    expect(kh01After.progress).toBe(50);
  });

  it('Sửa đầu việc thành công (PUT /api/tasks/{id})', async () => {
    const detail = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh01 = detail.actions.find((a) => a.code === 'HD11.R27.KH01')!;
    const secondTask = kh01.tasks[1];

    const updated = await updateTask(
      secondTask.id,
      {
        name: 'Đầu việc thứ 2 đã được cập nhật',
        unitCode: 'TT2',
        dueDate: '2027-03-31',
      },
      ban4Actor,
      undefined,
      appClient.db
    );

    expect(updated.name).toBe('Đầu việc thứ 2 đã được cập nhật');
    expect(updated.unit?.code).toBe('TT2');
    expect(updated.dueDate).toBe('2027-03-31');
  });

  it('Xóa đầu việc có bản cập nhật báo 409 REFERENCED', async () => {
    const detail = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh01 = detail.actions.find((a) => a.code === 'HD11.R27.KH01')!;
    const firstTask = kh01.tasks[0]; // đã có 1 bản cập nhật 100% ở test trước

    await expect(
      deleteTask(firstTask.id, adminActor, undefined, appClient.db)
    ).rejects.toMatchObject({ code: 'REFERENCED' });
  });

  it('Xóa đầu việc thứ 2 (chưa có bản cập nhật) thành công', async () => {
    const detail = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh01 = detail.actions.find((a) => a.code === 'HD11.R27.KH01')!;
    const secondTask = kh01.tasks[1];

    await deleteTask(secondTask.id, adminActor, undefined, appClient.db);

    const detailAfter = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh01After = detailAfter.actions.find((a) => a.code === 'HD11.R27.KH01')!;
    expect(kh01After.tasks).toHaveLength(1);
  });

  it('Xóa đầu việc cuối cùng còn lại báo 409 INVALID_STATE', async () => {
    // KH02 chỉ có 1 đầu việc mặc định và chưa có bản cập nhật
    const detail = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh02 = detail.actions.find((a) => a.code === 'HD11.R27.KH02')!;
    expect(kh02.tasks).toHaveLength(1);
    const onlyTask = kh02.tasks[0];

    await expect(
      deleteTask(onlyTask.id, adminActor, undefined, appClient.db)
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('Tách 3 phần: đầu việc cũ biến mất, ba đầu việc mới có source_text cũ và đúng thứ tự', async () => {
    const detail = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh02 = detail.actions.find((a) => a.code === 'HD11.R27.KH02')!;
    const oldTask = kh02.tasks[0];
    const originalName = oldTask.name;

    const splitResult = await splitTask(
      oldTask.id,
      {
        parts: [
          { name: 'Phần 1: Khảo sát', unitCode: 'TT1', dueDate: '2026-10-31' },
          { name: 'Phần 2: Triển khai', unitCode: 'TT2', dueDate: '2026-11-30' },
          { name: 'Phần 3: Đánh giá', unitCode: null, dueDate: '2026-12-31' },
        ],
      },
      adminActor,
      undefined,
      appClient.db
    );

    expect(splitResult).toHaveLength(3);
    expect(splitResult[0].name).toBe('Phần 1: Khảo sát');
    expect(splitResult[0].sourceText).toBe(oldTask.sourceText);
    expect(splitResult[1].name).toBe('Phần 2: Triển khai');
    expect(splitResult[1].sourceText).toBe(oldTask.sourceText);
    expect(splitResult[2].name).toBe('Phần 3: Đánh giá');
    expect(splitResult[2].sourceText).toBe(oldTask.sourceText);

    // Kiểm tra trong DB: đầu việc cũ đã bị soft delete
    const [dbOld] = await appClient.db.select().from(actionTask).where(eq(actionTask.id, oldTask.id));
    expect(dbOld.deletedAt).not.toBeNull();

    // getProfileDetail cho KH02 giờ có đúng 3 tasks
    const detailAfter = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh02After = detailAfter.actions.find((a) => a.code === 'HD11.R27.KH02')!;
    expect(kh02After.tasks).toHaveLength(3);
    expect(kh02After.tasks[0].name).toBe('Phần 1: Khảo sát');
    expect(kh02After.tasks[1].name).toBe('Phần 2: Triển khai');
    expect(kh02After.tasks[2].name).toBe('Phần 3: Đánh giá');
  });

  it('Tách đầu việc có bản cập nhật pending báo 409 REFERENCED', async () => {
    const detail = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh02 = detail.actions.find((a) => a.code === 'HD11.R27.KH02')!;
    const taskPart1 = kh02.tasks[0];

    // Tạo 1 bản nộp pending
    const ownerSql = (await import('postgres')).default(process.env.DATABASE_TEST_MIGRATE_URL!, { max: 1 });
    await ownerSql`INSERT INTO action_update (task_id, period_key, progress, status) VALUES (${taskPart1.id}, '2026-Q4', 30, 'pending')`;
    await ownerSql.end();

    await expect(
      splitTask(
        taskPart1.id,
        {
          parts: [
            { name: 'Nhánh 1A', unitCode: null, dueDate: null },
            { name: 'Nhánh 1B', unitCode: null, dueDate: null },
          ],
        },
        adminActor,
        undefined,
        appClient.db
      )
    ).rejects.toMatchObject({ code: 'REFERENCED' });
  });

  it('Tách 1 phần báo 422 VALIDATION', async () => {
    const detail = await getProfileDetail('HD11.R27', { cycle: 2026 }, appClient.db, adminActor);
    const kh02 = detail.actions.find((a) => a.code === 'HD11.R27.KH02')!;
    const taskPart2 = kh02.tasks[1];

    await expect(
      splitTask(
        taskPart2.id,
        {
          parts: [{ name: 'Chỉ 1 phần', unitCode: null, dueDate: null }],
        },
        adminActor,
        undefined,
        appClient.db
      )
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('Chu kỳ archived chặn mọi thao tác ghi (409 CYCLE_ARCHIVED)', async () => {
    // Đánh dấu chu kỳ archived
    const ownerSql = (await import('postgres')).default(process.env.DATABASE_TEST_MIGRATE_URL!, { max: 1 });
    await ownerSql`UPDATE cycle SET status = 'archived' WHERE id = ${testCycleId}`;
    await ownerSql.end();

    await expect(
      createTask(
        'HD11.R27',
        'HD11.R27.KH01',
        { name: 'Thử tạo', unitCode: null, dueDate: null },
        2026,
        adminActor,
        undefined,
        appClient.db
      )
    ).rejects.toMatchObject({ code: 'CYCLE_ARCHIVED' });

    // Khôi phục chu kỳ open
    const ownerSql2 = (await import('postgres')).default(process.env.DATABASE_TEST_MIGRATE_URL!, { max: 1 });
    await ownerSql2`UPDATE cycle SET status = 'open' WHERE id = ${testCycleId}`;
    await ownerSql2.end();
  });
});
