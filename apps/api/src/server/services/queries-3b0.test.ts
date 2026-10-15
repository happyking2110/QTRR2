import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { seedInitialPeriods } from './periods';
import { seedUnits } from './units';
import { getPeriodsByYear, getProfileDetail, getActions, getIndicators } from './queries';
import {
  cycle,
  period,
  indicator,
  indicatorReading,
  actionPlan,
  actionTask,
  actionUpdate,
  appUser,
  unit,
} from '../db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Actor } from '../types';

describe('queries-3b0.test.ts - Kiểm thử 3B.0: trường mới PeriodSummary, Indicator, ActionTask theo vai trò & trạng thái kỳ', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let testCycleId: string;
  let adminUser: typeof appUser.$inferSelect;
  let unitUser1: typeof appUser.$inferSelect;
  let unitUser2: typeof appUser.$inferSelect;
  let viewerUser: typeof appUser.$inferSelect;
  let ban4User: typeof appUser.$inferSelect;
  let tt1Unit: typeof unit.$inferSelect;
  let tt2Unit: typeof unit.$inferSelect;

  let adminActor: Actor;
  let ban4Actor: Actor;
  let unit1Actor: Actor;
  let unit2Actor: Actor;
  let viewerActor: Actor;

  beforeAll(async () => {
    const testMigrateUrl = process.env.DATABASE_TEST_MIGRATE_URL;
    const testAppUrl = process.env.DATABASE_TEST_URL;
    if (!testMigrateUrl || !testAppUrl) {
      throw new Error('Thiếu DATABASE_TEST_MIGRATE_URL hoặc DATABASE_TEST_URL');
    }

    await runMigrations(testMigrateUrl);
    appClient = createCustomClient(testAppUrl);

    // Dọn dẹp dữ liệu cũ trên db test
    await appClient.db.delete(indicatorReading);
    await appClient.db.delete(actionUpdate);
    await appClient.db.delete(period);
    await appClient.db.delete(cycle);

    // Import dữ liệu Excel 2026
    const excelPath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
      : fs.existsSync(path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx')
      : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
    const buffer = fs.readFileSync(excelPath);
    const report = await importCycle({ year: 2026, file: buffer, actor: null }, appClient.db);
    testCycleId = report.cycleId;

    // Seed periods ban đầu (2026-10, 2026-11, 2026-12, 2026-Q4)
    await seedInitialPeriods(testCycleId, appClient.db);

    // Seed units ban đầu
    await seedUnits(appClient.db);

    // Lấy hoặc tạo đơn vị TT1, TT2
    const allUnits = await appClient.db.select().from(unit);
    tt1Unit = allUnits.find((u) => u.code === 'TT1') || allUnits[0];
    tt2Unit = allUnits.find((u) => u.code === 'TT2') || allUnits[1];

    // Tạo người dùng cho các vai trò
    const [adm] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Người Khóa Kỳ',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    adminUser = adm;
    adminActor = { userId: adm.id, role: 'admin', unitId: null };

    const [b4] = await appClient.db
      .insert(appUser)
      .values({
        email: `b4_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Ban 4 Phụ Trách',
        role: 'ban4',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    ban4User = b4;
    ban4Actor = { userId: b4.id, role: 'ban4', unitId: null };

    const [u1] = await appClient.db
      .insert(appUser)
      .values({
        email: `u1_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Người Nộp TT1',
        role: 'unit',
        unitId: tt1Unit.id,
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    unitUser1 = u1;
    unit1Actor = { userId: u1.id, role: 'unit', unitId: tt1Unit.id };

    const [u2] = await appClient.db
      .insert(appUser)
      .values({
        email: `u2_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Người Nộp TT2',
        role: 'unit',
        unitId: tt2Unit.id,
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    unitUser2 = u2;
    unit2Actor = { userId: u2.id, role: 'unit', unitId: tt2Unit.id };

    const [vw] = await appClient.db
      .insert(appUser)
      .values({
        email: `vw_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Người Xem Viewer',
        role: 'viewer',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    viewerUser = vw;
    viewerActor = { userId: vw.id, role: 'viewer', unitId: null };
  });

  describe('3B.0.1: PeriodSummary trả thêm closedAt, closedByName, reopenReason', () => {
    it('kỳ đang mở: closed=false, closedAt=null, closedByName=null, reopenReason=null', async () => {
      const periods = await getPeriodsByYear(2026, appClient.db);
      expect(periods.length).toBeGreaterThanOrEqual(4);

      const openPeriod = periods.find((p) => p.key === '2026-10');
      expect(openPeriod).toBeDefined();
      expect(openPeriod?.closed).toBe(false);
      expect(openPeriod?.closedAt).toBeNull();
      expect(openPeriod?.closedByName).toBeNull();
      expect(openPeriod?.reopenReason).toBeNull();
    });

    it('kỳ đã khóa: trả đúng closedAt ISO, closedByName của người khóa', async () => {
      // Khóa kỳ 2026-11
      const lockDate = new Date('2026-10-12T10:00:00Z');
      await appClient.db
        .update(period)
        .set({
          closedAt: lockDate,
          closedBy: adminUser.id,
          reopenReason: 'Đã mở lại thử nghiệm',
        })
        .where(and(eq(period.cycleId, testCycleId), eq(period.key, '2026-11')));

      const periods = await getPeriodsByYear(2026, appClient.db);
      const closedPeriod = periods.find((p) => p.key === '2026-11');

      expect(closedPeriod).toBeDefined();
      expect(closedPeriod?.closed).toBe(true);
      expect(closedPeriod?.closedAt).toBe(lockDate.toISOString());
      expect(closedPeriod?.closedByName).toBe(adminUser.fullName);
      expect(closedPeriod?.reopenReason).toBe('Đã mở lại thử nghiệm');
    });
  });

  describe('3B.0.2: Indicator & ActionTask submitPeriodKeys và pendingSubmissions', () => {
    it('gán KRI01 cho TT1, KCI01 chưa gán, kiểm tra submitPeriodKeys theo vai trò', async () => {
      // Gán chỉ số HD11.R27.KRI01 cho TT1
      const [kri01] = await appClient.db
        .update(indicator)
        .set({ ownerUnitId: tt1Unit.id })
        .where(eq(indicator.code, 'HD11.R27.KRI01'))
        .returning();

      // Chỉ số KCI01 để chưa gán
      const [kci01] = await appClient.db
        .update(indicator)
        .set({ ownerUnitId: null })
        .where(eq(indicator.code, 'HD11.R27.KCI01'))
        .returning();

      // Mock thời điểm kiểm tra: 2026-10-15 (kỳ 2026-10 đã bắt đầu, 2026-11 đã khóa ở test trên, 2026-12 chưa bắt đầu)
      const testToday = new Date('2026-10-15T08:00:00Z');

      // 1. Admin kiểm tra
      const adminDetail = await getProfileDetail(
        'HD11.R27',
        { cycle: 2026 },
        appClient.db,
        adminActor,
        testToday
      );
      const adminKri = adminDetail.indicators.find((i) => i.code === 'HD11.R27.KRI01')!;
      // admin thấy kỳ mở đúng loại (tháng: 2026-10; 2026-11 đã khóa; 2026-12 chưa bắt đầu)
      expect(adminKri.submitPeriodKeys).toContain('2026-10');
      expect(adminKri.submitPeriodKeys).not.toContain('2026-11'); // Đã khóa
      expect(adminKri.submitPeriodKeys).not.toContain('2026-12'); // Chưa bắt đầu

      // 2. Unit TT1 (đơn vị phụ trách KRI01)
      const unit1Detail = await getProfileDetail(
        'HD11.R27',
        { cycle: 2026 },
        appClient.db,
        unit1Actor,
        testToday
      );
      const unit1Kri = unit1Detail.indicators.find((i) => i.code === 'HD11.R27.KRI01')!;
      expect(unit1Kri.submitPeriodKeys).toContain('2026-10');

      // KCI01 chưa gán: unit TT1 không thấy kỳ nộp
      const unit1Kci = unit1Detail.indicators.find((i) => i.code === 'HD11.R27.KCI01')!;
      expect(unit1Kci.submitPeriodKeys).toEqual([]);

      // 3. Unit TT2 (không phụ trách KRI01): không thấy kỳ nộp
      const unit2Detail = await getProfileDetail(
        'HD11.R27',
        { cycle: 2026 },
        appClient.db,
        unit2Actor,
        testToday
      );
      const unit2Kri = unit2Detail.indicators.find((i) => i.code === 'HD11.R27.KRI01')!;
      expect(unit2Kri.submitPeriodKeys).toEqual([]);

      // 4. Viewer: luôn rỗng
      const viewerDetail = await getProfileDetail(
        'HD11.R27',
        { cycle: 2026 },
        appClient.db,
        viewerActor,
        testToday
      );
      const viewerKri = viewerDetail.indicators.find((i) => i.code === 'HD11.R27.KRI01')!;
      expect(viewerKri.submitPeriodKeys).toEqual([]);
    });

    it('pendingSubmissions: hiển thị đúng người nộp, canWithdraw theo vai trò và trạng thái kỳ', async () => {
      const [kri01] = await appClient.db
        .select()
        .from(indicator)
        .where(eq(indicator.code, 'HD11.R27.KRI01'));

      // Thêm 1 bản pending cho kỳ 2026-10 do unit1 nộp
      const submitTime = new Date('2026-10-14T08:00:00Z');
      const [p1] = await appClient.db
        .insert(indicatorReading)
        .values({
          indicatorId: kri01.id,
          periodKey: '2026-10',
          valueNum: '7.5',
          zone: 'yellow',
          zoneSource: 'auto',
          status: 'pending',
          submittedBy: unitUser1.id,
          submittedAt: submitTime,
        })
        .returning();

      // 1. Unit 1 truy vấn: thấy bản nộp của mình và canWithdraw = true
      const u1Detail = await getProfileDetail(
        'HD11.R27',
        { cycle: 2026 },
        appClient.db,
        unit1Actor
      );
      const u1Kri = u1Detail.indicators.find((i) => i.code === 'HD11.R27.KRI01')!;
      expect(u1Kri.pendingSubmissions).toHaveLength(1);
      expect(u1Kri.pendingSubmissions[0].id).toBe(p1.id);
      expect(u1Kri.pendingSubmissions[0].submittedByName).toBe(unitUser1.fullName);
      expect(u1Kri.pendingSubmissions[0].canWithdraw).toBe(true);

      // 2. Unit 2 truy vấn: mục thuộc TT1 nên unit TT2 không thấy pendingSubmissions
      const u2Detail = await getProfileDetail(
        'HD11.R27',
        { cycle: 2026 },
        appClient.db,
        unit2Actor
      );
      const u2Kri = u2Detail.indicators.find((i) => i.code === 'HD11.R27.KRI01')!;
      expect(u2Kri.pendingSubmissions).toEqual([]);

      // 3. Admin truy vấn: thấy bản nộp nhưng canWithdraw = false (admin không phải người nộp)
      const admDetail = await getProfileDetail(
        'HD11.R27',
        { cycle: 2026 },
        appClient.db,
        adminActor
      );
      const admKri = admDetail.indicators.find((i) => i.code === 'HD11.R27.KRI01')!;
      expect(admKri.pendingSubmissions).toHaveLength(1);
      expect(admKri.pendingSubmissions[0].canWithdraw).toBe(false);

      // 4. Viewer truy vấn: luôn rỗng
      const vwDetail = await getProfileDetail(
        'HD11.R27',
        { cycle: 2026 },
        appClient.db,
        viewerActor
      );
      const vwKri = vwDetail.indicators.find((i) => i.code === 'HD11.R27.KRI01')!;
      expect(vwKri.pendingSubmissions).toEqual([]);
    });

    it('ActionTask trong getActions cũng trả đúng submitPeriodKeys và pendingSubmissions', async () => {
      // Gán đầu việc đầu tiên của HD11.R27 cho TT1
      const allTasks = await appClient.db.select().from(actionTask);
      const task1 = allTasks[0];
      await appClient.db
        .update(actionTask)
        .set({ unitId: tt1Unit.id })
        .where(eq(actionTask.id, task1.id));

      const testToday = new Date('2026-10-15T08:00:00Z');
      const actionsRes = await getActions(
        { cycle: 2026 },
        appClient.db,
        unit1Actor,
        testToday
      );

      const targetAction = actionsRes.find((a) =>
        a.action.tasks.some((t) => t.id === task1.id)
      );
      expect(targetAction).toBeDefined();

      const taskDto = targetAction?.action.tasks.find((t) => t.id === task1.id);
      expect(taskDto).toBeDefined();
      // Đầu việc chỉ dùng kỳ quý: 2026-Q4 mở và đã bắt đầu
      expect(taskDto?.submitPeriodKeys).toEqual(['2026-Q4']);
    });
  });
});
