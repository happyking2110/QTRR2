import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { seedInitialPeriods } from './periods';
import { seedUnits } from './units';
import { submitReading } from './readings';
import { submitTaskUpdate } from './tasks';
import {
  withdrawReading,
  approveReading,
  rejectReading,
  withdrawTaskUpdate,
  approveTaskUpdate,
  rejectTaskUpdate,
  bulkApprove,
  getApprovals,
} from './approvals';
import { getOverview } from './queries';
import {
  cycle,
  period,
  indicator,
  indicatorReading,
  riskProfile,
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

describe('approvals.test.ts - Kế hoạch 3B.3: Rút lại, duyệt, từ chối, duyệt hàng loạt, hàng chờ', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let testCycleId: string;

  let admin1Actor: Actor;
  let admin2Actor: Actor;
  let ban4Actor: Actor;
  let unit1Actor: Actor;
  let unit2Actor: Actor;
  let viewerActor: Actor;

  let admin1User: typeof appUser.$inferSelect;
  let admin2User: typeof appUser.$inferSelect;

  let tt1Unit: typeof unit.$inferSelect;
  let tt2Unit: typeof unit.$inferSelect;

  let testIndicator: typeof indicator.$inferSelect; // HD11.R27.KRI01
  let testTask: typeof actionTask.$inferSelect;

  beforeAll(async () => {
    const testMigrateUrl = process.env.DATABASE_TEST_MIGRATE_URL;
    const testAppUrl = process.env.DATABASE_TEST_URL;
    if (!testMigrateUrl || !testAppUrl) {
      throw new Error('Thiếu DATABASE_TEST_MIGRATE_URL hoặc DATABASE_TEST_URL');
    }

    await runMigrations(testMigrateUrl);
    const ownerSql = (await import('postgres')).default(testMigrateUrl, { max: 1 });
    await ownerSql`TRUNCATE TABLE audit_log, indicator_reading, action_update, action_task, action_control, action_plan, period, cycle, app_user CASCADE`;
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

    // Tạo 2 admin để kiểm tra tự duyệt
    const [adm1] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm1_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Một',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    admin1User = adm1;
    admin1Actor = { userId: adm1.id, role: 'admin', unitId: null };

    const [adm2] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm2_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Hai',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    admin2User = adm2;
    admin2Actor = { userId: adm2.id, role: 'admin', unitId: null };

    const [b4] = await appClient.db
      .insert(appUser)
      .values({
        email: `b4_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Ban 4 Giám Sát',
        role: 'ban4',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    ban4Actor = { userId: b4.id, role: 'ban4', unitId: null };

    const [u1] = await appClient.db
      .insert(appUser)
      .values({
        email: `u1_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Người TT1',
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
        email: `u2_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Người TT2',
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
        email: `vw_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Người Xem',
        role: 'viewer',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    viewerActor = { userId: vw.id, role: 'viewer', unitId: null };

    // Lấy chỉ số và đầu việc
    const allIndicators = await appClient.db.select().from(indicator);
    testIndicator = allIndicators.find((i) => i.code === 'HD11.R27.KRI01')!;
    await appClient.db
      .update(indicator)
      .set({ ownerUnitId: tt1Unit.id })
      .where(eq(indicator.id, testIndicator.id));

    const allTasks = await appClient.db.select().from(actionTask);
    testTask = allTasks[0];
    await appClient.db
      .update(actionTask)
      .set({ unitId: tt1Unit.id })
      .where(eq(actionTask.id, testTask.id));
  });

  describe('1. Máy trạng thái và quyền duyệt / từ chối / rút lại', () => {
    it('rút lại bởi người khác -> 403 FORBIDDEN; chính người nộp rút -> 200 withdrawn', async () => {
      const sub = await submitReading(
        testIndicator.id,
        { periodKey: '2026-10', valueNum: 5 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      // Unit khác rút -> 403
      await expect(
        withdrawReading(sub.id, unit2Actor, {}, appClient.db)
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      // Admin cũng không được rút hộ người nộp -> 403
      await expect(
        withdrawReading(sub.id, admin1Actor, {}, appClient.db)
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      // Chính người nộp rút -> thành công
      const wRes = await withdrawReading(sub.id, unit1Actor, {}, appClient.db);
      expect(wRes.status).toBe('withdrawn');

      // Rút lại lần 2 -> 409 INVALID_STATE
      await expect(
        withdrawReading(sub.id, unit1Actor, {}, appClient.db)
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });

    it('tự duyệt bị từ chối 403 SELF_APPROVAL khi có >= 2 admin hoạt động', async () => {
      // Admin 1 tự nộp số liệu
      const sub = await submitReading(
        testIndicator.id,
        { periodKey: '2026-10', valueNum: 5 },
        admin1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      // Admin 1 tự duyệt -> 403 SELF_APPROVAL vì có 2 admin (adm1 và adm2)
      await expect(
        approveReading(sub.id, admin1Actor, {}, appClient.db)
      ).rejects.toMatchObject({ code: 'SELF_APPROVAL' });

      // Admin 2 duyệt -> thành công
      const aRes = await approveReading(sub.id, admin2Actor, {}, appClient.db);
      expect(aRes.status).toBe('approved');
      expect(aRes.reviewedBy?.fullName).toBe('Admin Hai');

      // Duyệt lại bản đã approved -> 409 INVALID_STATE
      await expect(
        approveReading(sub.id, admin2Actor, {}, appClient.db)
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });

    it('tự duyệt được phép khi chỉ có duy nhất 1 admin hoạt động (nhật ký có selfApproved: true)', async () => {
      // Tạm tắt hoạt động của admin2
      await appClient.db
        .update(appUser)
        .set({ isActive: false })
        .where(eq(appUser.id, admin2User.id));

      const sub = await submitReading(
        testIndicator.id,
        { periodKey: '2026-10', valueNum: 6 },
        admin1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      // Lúc này chỉ còn đúng 1 admin -> tự duyệt được phép
      const aRes = await approveReading(sub.id, admin1Actor, {}, appClient.db);
      expect(aRes.status).toBe('approved');

      // Kiểm tra nhật ký audit_log có after.selfApproved = true
      const [log] = await appClient.db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'approve_submission'),
            eq(auditLog.entityId, sub.id)
          )
        );
      expect(log).toBeDefined();
      expect((log.after as any).selfApproved).toBe(true);

      // Bật lại admin2
      await appClient.db
        .update(appUser)
        .set({ isActive: true })
        .where(eq(appUser.id, admin2User.id));
    });

    it('từ chối thiếu lý do (< 5 ký tự) -> 422 VALIDATION; có lý do -> 200 rejected', async () => {
      const sub = await submitReading(
        testIndicator.id,
        { periodKey: '2026-10', valueNum: 5 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      // Lý do ngắn < 5 ký tự
      await expect(
        rejectReading(sub.id, 'sai', admin1Actor, {}, appClient.db)
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      // Từ chối hợp lệ
      const rRes = await rejectReading(
        sub.id,
        'Số liệu chưa có tài liệu kiểm chứng kèm theo',
        admin1Actor,
        {},
        appClient.db
      );
      expect(rRes.status).toBe('rejected');
      expect(rRes.reviewNote).toBe('Số liệu chưa có tài liệu kiểm chứng kèm theo');

      // Duyệt hoặc từ chối lại bản đã rejected -> 409 INVALID_STATE
      await expect(
        approveReading(sub.id, admin1Actor, {}, appClient.db)
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });

    it('kỳ đã bị khóa chặn cả duyệt, từ chối và rút lại -> 409 PERIOD_CLOSED', async () => {
      const sub = await submitReading(
        testIndicator.id,
        { periodKey: '2026-10', valueNum: 5 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      // Khóa kỳ 2026-10
      await appClient.db
        .update(period)
        .set({ closedAt: new Date() })
        .where(and(eq(period.cycleId, testCycleId), eq(period.key, '2026-10')));

      await expect(
        approveReading(sub.id, admin1Actor, {}, appClient.db)
      ).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });

      await expect(
        rejectReading(sub.id, 'Lý do từ chối khi khóa', admin1Actor, {}, appClient.db)
      ).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });

      await expect(
        withdrawReading(sub.id, unit1Actor, {}, appClient.db)
      ).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });

      // Mở lại kỳ
      await appClient.db
        .update(period)
        .set({ closedAt: null })
        .where(and(eq(period.cycleId, testCycleId), eq(period.key, '2026-10')));
    });

    it('các thao tác trên task-updates (withdraw, approve, reject) tuân thủ đúng máy trạng thái', async () => {
      const tSub = await submitTaskUpdate(
        testTask.id,
        { periodKey: '2026-Q4', progress: 50 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      // Từ chối
      const rej = await rejectTaskUpdate(
        tSub.id,
        'Cần phân rã chi tiết các mốc hoàn thành',
        admin1Actor,
        {},
        appClient.db
      );
      expect(rej.status).toBe('rejected');

      // Nộp lại bản mới
      const tSub2 = await submitTaskUpdate(
        testTask.id,
        { periodKey: '2026-Q4', progress: 55 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      // Duyệt
      const app = await approveTaskUpdate(tSub2.id, admin1Actor, {}, appClient.db);
      expect(app.status).toBe('approved');
      expect(app.progress).toBe(55);
    });
  });

  describe('2. Duyệt hàng loạt (bulkApprove)', () => {
    it('mục trùng nhau trong danh sách -> 422 VALIDATION', async () => {
      const id = crypto.randomUUID();
      await expect(
        bulkApprove(
          [
            { kind: 'reading', id },
            { kind: 'reading', id },
          ],
          admin1Actor,
          {},
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('S3: có 1 mục lỗi trong lô 3 mục -> cả lô rollback, không mục nào được duyệt, details luôn là mảng 1 phần tử', async () => {
      // Tạo 2 bản nộp hợp lệ
      const rSub1 = await submitReading(
        testIndicator.id,
        { periodKey: '2026-10', valueNum: 5 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      const tSub1 = await submitTaskUpdate(
        testTask.id,
        { periodKey: '2026-Q4', progress: 90 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      const fakeId = crypto.randomUUID();

      // Gọi bulk-approve với 3 mục, mục thứ hai bị lỗi
      let thrownError: any;
      try {
        await bulkApprove(
          [
            { kind: 'reading', id: rSub1.id },
            { kind: 'reading', id: fakeId },
            { kind: 'task_update', id: tSub1.id },
          ],
          admin1Actor,
          {},
          appClient.db
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError.code).toBe('NOT_FOUND');
      // S3: details LUÔN LÀ MẢNG
      expect(Array.isArray(thrownError.details)).toBe(true);
      expect(thrownError.details).toHaveLength(1);
      expect(thrownError.details[0]).toEqual({
        kind: 'reading',
        id: fakeId,
        code: 'NOT_FOUND',
        message: expect.any(String),
      });

      // Kiểm tra cả 2 bản nộp vẫn ở trạng thái pending (không có mục nào được duyệt)
      const [rCheck] = await appClient.db
        .select()
        .from(indicatorReading)
        .where(eq(indicatorReading.id, rSub1.id));
      expect(rCheck.status).toBe('pending');

      const [tCheck] = await appClient.db
        .select()
        .from(actionUpdate)
        .where(eq(actionUpdate.id, tSub1.id));
      expect(tCheck.status).toBe('pending');
    });

    it('toàn bộ mục hợp lệ -> duyệt thành công cả lô trong 1 transaction', async () => {
      const rSub = await submitReading(
        testIndicator.id,
        { periodKey: '2026-10', valueNum: 5 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      const tSub = await submitTaskUpdate(
        testTask.id,
        { periodKey: '2026-Q4', progress: 70 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      const res = await bulkApprove(
        [
          { kind: 'reading', id: rSub.id },
          { kind: 'task_update', id: tSub.id },
        ],
        admin1Actor,
        {},
        appClient.db
      );

      expect(res.approved).toBe(2);

      const [rCheck] = await appClient.db
        .select()
        .from(indicatorReading)
        .where(eq(indicatorReading.id, rSub.id));
      expect(rCheck.status).toBe('approved');

      const [tCheck] = await appClient.db
        .select()
        .from(actionUpdate)
        .where(eq(actionUpdate.id, tSub.id));
      expect(tCheck.status).toBe('approved');
    });
  });

  describe('3. Hàng chờ duyệt (getApprovals) và Tích hợp thay đổi Tổng quan', () => {
    it('hàng chờ duyệt: unit chỉ thấy mục của đơn vị mình, admin/ban4 thấy mọi mục', async () => {
      // Tạo 1 bản chờ của TT1
      await submitReading(
        testIndicator.id,
        { periodKey: '2026-10', valueNum: 8 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      // Unit 1 (TT1) thấy bản chờ
      const u1List = await getApprovals({ cycle: 2026 }, unit1Actor, appClient.db);
      expect(u1List.length).toBeGreaterThan(0);
      expect(u1List.some((item) => item.targetName === testIndicator.name)).toBe(true);

      // Unit 2 (TT2) không thấy bản chờ của TT1
      const u2List = await getApprovals({ cycle: 2026 }, unit2Actor, appClient.db);
      expect(u2List.some((item) => item.targetName === testIndicator.name)).toBe(false);

      // Admin thấy bản chờ
      const admList = await getApprovals({ cycle: 2026 }, admin1Actor, appClient.db);
      expect(admList.some((item) => item.targetName === testIndicator.name)).toBe(true);

      // canApprove: admin1 có quyền duyệt (canApprove = true), unit1 không có (canApprove = false)
      const itemAdm = admList.find((i) => i.targetName === testIndicator.name)!;
      expect(itemAdm.canApprove).toBe(true);

      const itemU1 = u1List.find((i) => i.targetName === testIndicator.name)!;
      expect(itemU1.canApprove).toBe(false);
    });

    it('S2: targetName của mục task_update là mô tả KH (action_plan.description) thay vì "Toàn bộ kế hoạch"', async () => {
      const tSub = await submitTaskUpdate(
        testTask.id,
        { periodKey: '2026-Q4', progress: 85, note: 'Tiến độ quý 4 đạt 85%' },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      const [expectedPlan] = await appClient.db
        .select({ description: actionPlan.description })
        .from(actionTask)
        .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
        .where(eq(actionTask.id, testTask.id));

      const admList = await getApprovals({ cycle: 2026 }, admin1Actor, appClient.db);
      const taskItem = admList.find((i) => i.kind === 'task_update' && i.submission.id === tSub.id);
      expect(taskItem).toBeDefined();
      expect(taskItem!.targetName).toBe(expectedPlan.description);
      expect(taskItem!.targetName).not.toBe('Toàn bộ kế hoạch');
    });

    it('tích hợp: nộp KRI đỏ -> overview chưa đổi -> duyệt -> overview đổi đúng (KRI đỏ tăng)', async () => {
      // Lấy overview trước khi nộp
      const ovBefore = await getOverview({ cycle: 2026, period: '2026-10' }, appClient.db);
      const redBefore = ovBefore.kri.red;

      // Nộp valueNum = 15 cho KRI01 (vùng đỏ)
      const sub = await submitReading(
        testIndicator.id,
        { periodKey: '2026-10', valueNum: 15 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      // Overview chưa đổi
      const ovPending = await getOverview({ cycle: 2026, period: '2026-10' }, appClient.db);
      expect(ovPending.kri.red).toBe(redBefore);

      // Admin duyệt
      await approveReading(sub.id, admin1Actor, {}, appClient.db);

      // Overview đổi: KRI đỏ tăng lên 1
      const ovAfter = await getOverview({ cycle: 2026, period: '2026-10' }, appClient.db);
      expect(ovAfter.kri.red).toBe(redBefore + 1);
    });

    it('S4: không truyền cycle thì dùng chu kỳ đang mở có năm lớn nhất; cycle không tồn tại trả 404 NOT_FOUND', async () => {
      // 1. Cycle không tồn tại -> 404 NOT_FOUND
      await expect(
        getApprovals({ cycle: 2099 }, admin1Actor, appClient.db)
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      // 2. Tạo chu kỳ 2025 (đã đóng) với 1 bản nộp pending
      const [existingProfile] = await appClient.db.select().from(riskProfile).limit(1);
      const [cycle2025] = await appClient.db
        .insert(cycle)
        .values({
          year: 2025,
          status: 'archived',
        })
        .returning();

      const [p2025] = await appClient.db
        .insert(period)
        .values({
          cycleId: cycle2025.id,
          key: '2025-10',
          label: 'Tháng 10/2025',
          kind: 'month',
          startsOn: '2025-10-01',
          endsOn: '2025-10-31',
          dueAt: new Date('2025-11-10T23:59:59Z'),
        })
        .returning();

      const [rp2025] = await appClient.db
        .insert(riskProfile)
        .values({
          ...existingProfile,
          id: crypto.randomUUID(),
          cycleId: cycle2025.id,
          riskCode: 'RR2025_TEST',
        })
        .returning();

      const [existingInd] = await appClient.db
        .select()
        .from(indicator)
        .where(eq(indicator.profileId, existingProfile.id))
        .limit(1);

      const [ind2025] = await appClient.db
        .insert(indicator)
        .values({
          ...existingInd,
          id: crypto.randomUUID(),
          profileId: rp2025.id,
          code: 'KRI_2025_01',
          periodKind: 'month',
        })
        .returning();

      const [sub2025] = await appClient.db
        .insert(indicatorReading)
        .values({
          indicatorId: ind2025.id,
          periodKey: '2025-10',
          valueNum: '10',
          zone: 'green',
          zoneSource: 'manual',
          zoneNote: 'Lý do ghi nhận 2025',
          status: 'pending',
          submittedBy: unit1Actor.userId,
        })
        .returning();

      // Tạo 1 bản nộp pending ở chu kỳ 2026 (đang mở)
      const sub2026 = await submitReading(
        testIndicator.id,
        { periodKey: '2026-10', valueNum: 5 },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      // Gọi getApprovals không truyền cycle -> phải tự resolve cycle 2026 (chu kỳ đang mở năm lớn nhất)
      const defaultList = await getApprovals({}, admin1Actor, appClient.db);
      expect(defaultList.some((item) => item.submission.id === sub2026.id)).toBe(true);
      expect(defaultList.some((item) => item.submission.id === sub2025.id)).toBe(false);

      // Gọi getApprovals với cycle: 2025 -> chỉ chứa bản nộp của 2025
      const list2025 = await getApprovals({ cycle: 2025 }, admin1Actor, appClient.db);
      expect(list2025.some((item) => item.submission.id === sub2025.id)).toBe(true);
      expect(list2025.some((item) => item.submission.id === sub2026.id)).toBe(false);
    });

    it('S5: current trong ReadingApprovalItem phải tuân thủ currentReading của domain (kỳ gần nhất theo ends_on, không phải reviewed_at lớn nhất mọi kỳ)', async () => {
      // 1. Duyệt một bản cho kỳ 2026-11
      const sub11 = await submitReading(
        testIndicator.id,
        { periodKey: '2026-11', valueNum: 11 },
        unit1Actor,
        { today: '2026-11-05' },
        appClient.db
      );
      await approveReading(sub11.id, admin1Actor, {}, appClient.db);
      // Đặt reviewedAt sớm hơn (10/11/2026)
      await appClient.db
        .update(indicatorReading)
        .set({ reviewedAt: new Date('2026-11-10T10:00:00Z') })
        .where(eq(indicatorReading.id, sub11.id));

      // 2. Duyệt một bản sửa cho kỳ 2026-10 với reviewedAt muộn hơn (20/11/2026)
      const sub10 = await submitReading(
        testIndicator.id,
        { periodKey: '2026-10', valueNum: 10 },
        unit1Actor,
        { today: '2026-11-15' },
        appClient.db
      );
      await approveReading(sub10.id, admin1Actor, {}, appClient.db);
      await appClient.db
        .update(indicatorReading)
        .set({ reviewedAt: new Date('2026-11-20T10:00:00Z') })
        .where(eq(indicatorReading.id, sub10.id));

      // 3. Nộp một bản pending mới cho kỳ 2026-12
      const sub12 = await submitReading(
        testIndicator.id,
        { periodKey: '2026-12', valueNum: 12 },
        unit1Actor,
        { today: '2026-12-05' },
        appClient.db
      );

      // 4. Lấy hàng chờ duyệt
      const admList = await getApprovals({ cycle: 2026 }, admin1Actor, appClient.db);
      const item12 = admList.find((i) => i.kind === 'reading' && i.submission.id === sub12.id);
      expect(item12).toBeDefined();

      // current phải là của kỳ 2026-11 (ends_on 30/11 > 31/10 của 2026-10), KHÔNG phải 2026-10 dù 2026-10 có reviewed_at muộn hơn
      expect(item12!.current).not.toBeNull();
      expect(item12!.current!.periodKey).toBe('2026-11');
      expect(item12!.current!.valueNum).toBe(11);
    });
  });
});
