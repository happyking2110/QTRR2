import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { createCustomClient, type CustomClient } from '../db/client';
import {
  cycle,
  period,
  appUser,
  riskProfile,
  actionPlan,
  actionTask,
  actionUpdate,
  appSetting,
} from '../db/schema';
import { getSettings, updateSettings } from './settings';
import { setResidual } from './residuals';
import { ensurePeriods, closePeriod } from './periods';
import { getProfileDetail, getHeatmap, getActions } from './queries';
import { hashPassword } from '../auth/password';
import { AppError } from '../errors';
import type { Actor } from '../types';
import { eq } from 'drizzle-orm';

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

describe('settings-residuals-3b5.test.ts - Kế hoạch 3B.5: Cấu hình và rủi ro còn lại', () => {
  let ownerSql: postgres.Sql;
  let appClient: CustomClient;

  let adminActor: Actor;
  let ban4Actor: Actor;
  let unitActor: Actor;
  let testCycleId: string;
  let testProfileId: string;
  let testActionId: string;
  let testTaskId: string;

  beforeAll(async () => {
    ownerSql = postgres(testMigrateUrl, { max: 1 });
    appClient = createCustomClient(testAppUrl);

    await ownerSql`TRUNCATE TABLE audit_log, unit_assignment, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, session, password_history, app_user, unit, cycle CASCADE`;

    const passwordHash = await hashPassword('TestPass!2026');
    const [uAdmin] = await appClient.db
      .insert(appUser)
      .values({
        email: 'admin_3b5@mobifone.vn',
        fullName: 'Admin 3B5',
        role: 'admin',
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      })
      .returning();

    adminActor = {
      userId: uAdmin.id,
      role: 'admin',
      unitId: null,
    };

    const [uBan4] = await appClient.db
      .insert(appUser)
      .values({
        email: 'ban4_3b5@mobifone.vn',
        fullName: 'Ban 4 3B5',
        role: 'ban4',
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      })
      .returning();

    ban4Actor = {
      userId: uBan4.id,
      role: 'ban4',
      unitId: null,
    };

    const [uUnit] = await appClient.db
      .insert(appUser)
      .values({
        email: 'unit_3b5@mobifone.vn',
        fullName: 'Unit 3B5',
        role: 'unit',
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      })
      .returning();

    unitActor = {
      userId: uUnit.id,
      role: 'unit',
      unitId: null,
    };

    // Cycle 2026
    const [c2026] = await appClient.db
      .insert(cycle)
      .values({ year: 2026, status: 'open' })
      .returning();
    testCycleId = c2026.id;

    // Period 2026-Q4
    await appClient.db.insert(period).values({
      cycleId: testCycleId,
      key: '2026-Q4',
      kind: 'quarter',
      label: 'Quý 4/2026',
      startsOn: '2026-10-01',
      endsOn: '2026-12-31',
      dueAt: new Date(Date.UTC(2027, 0, 10, 16, 59, 59)),
    });

    // Profile HD11.R27
    const [profile] = await appClient.db
      .insert(riskProfile)
      .values({
        cycleId: testCycleId,
        riskCode: 'HD11.R27',
        hsrrCode: '01/HSRR-HD11',
        name: 'Rủi ro test 3B.5',
        riskType: 'Chính sách',
        riskZone: 'Vùng 1',
        riskGroup: 'Nhóm 1',
        owner: 'Ban CNTT',
        relatedActivity: 'Hoạt động',
        preparedByUnit: 'Ban CNTT',
        description: 'Mô tả',
        inherentImpact: 'Lớn',
        inherentLikelihood: 'Có thể xảy ra',
        inherentLevel: 'Cao',
      })
      .returning();
    testProfileId = profile.id;

    // Action plan & task để test slowDays
    const [act] = await appClient.db
      .insert(actionPlan)
      .values({
        profileId: profile.id,
        code: 'HD11.R27.KH01',
        description: 'Kế hoạch hành động 1',
        responsibilityText: 'Ban CNTT',
        deliverable: 'Báo cáo',
        dueText: '31/12/2026',
        dueDate: '2026-12-31',
      })
      .returning();
    testActionId = act.id;

    const [tsk] = await appClient.db
      .insert(actionTask)
      .values({
        actionId: act.id,
        name: 'Đầu việc 1',
        dueDate: '2026-12-31',
        weight: 1,
      })
      .returning();
    testTaskId = tsk.id;

    // Approved update với tiến độ 50%
    await appClient.db.insert(actionUpdate).values({
      taskId: tsk.id,
      periodKey: '2026-Q4',
      progress: 50,
      status: 'approved',
      reviewedAt: new Date('2026-11-01T10:00:00.000Z'),
    });
  });

  afterAll(async () => {
    if (appClient) await appClient.client.end();
    if (ownerSql) await ownerSql.end();
  });

  describe('1. Cấu hình hệ thống (Settings)', () => {
    it('GET /api/settings trả về đúng 4 giá trị cấu hình', async () => {
      const s = await getSettings(appClient.db);
      expect(s.slowDays).toBe(60);
      expect(s.slowProgress).toBe(70);
      expect(s.staleDays).toBe(90);
      expect(s.dueDay).toBe(10);
    });

    it('PUT /api/settings kiểm tra khoảng giá trị của từng khóa (ngoài khoảng ném 422)', async () => {
      // slowDays ngoài 1..365
      await expect(
        updateSettings(
          { slowDays: 0, slowProgress: 70, staleDays: 90, dueDay: 10 },
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toThrowError(AppError);

      // slowProgress ngoài 0..100
      await expect(
        updateSettings(
          { slowDays: 60, slowProgress: 105, staleDays: 90, dueDay: 10 },
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toThrowError(AppError);

      // dueDay ngoài 1..28
      await expect(
        updateSettings(
          { slowDays: 60, slowProgress: 70, staleDays: 90, dueDay: 30 },
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toThrowError(AppError);
    });

    it('PUT /api/settings lưu cả 4 giá trị thành công trong transaction', async () => {
      const updated = await updateSettings(
        { slowDays: 45, slowProgress: 60, staleDays: 75, dueDay: 15 },
        adminActor,
        undefined,
        appClient.db
      );

      expect(updated.slowDays).toBe(45);
      expect(updated.slowProgress).toBe(60);
      expect(updated.staleDays).toBe(75);
      expect(updated.dueDay).toBe(15);

      const reRead = await getSettings(appClient.db);
      expect(reRead.slowDays).toBe(45);
      expect(reRead.dueDay).toBe(15);
    });

    it('đổi slowDays làm đổi trạng thái KH tính ở lần truy vấn sau (test với today)', async () => {
      // DueDate: 2026-12-31, Progress: 50%
      // Giả sử today là 2026-11-20 (còn 41 ngày nữa đến hạn)
      // Với slowDays = 45 và slowProgress = 60: 41 <= 45 và progress (50%) < 60% -> at_risk!
      const testToday = new Date('2026-11-20T00:00:00.000Z');
      const actions1 = await getActions(
        { cycle: 2026, period: '2026-Q4' },
        appClient.db,
        adminActor,
        testToday
      );
      expect(actions1.find((a) => a.action.code === 'HD11.R27.KH01')?.action.status).toBe('at_risk');

      // Giảm slowDays xuống 30: 41 ngày > 30 ngày -> in_progress!
      await updateSettings(
        { slowDays: 30, slowProgress: 60, staleDays: 75, dueDay: 15 },
        adminActor,
        undefined,
        appClient.db
      );

      const actions2 = await getActions(
        { cycle: 2026, period: '2026-Q4' },
        appClient.db,
        adminActor,
        testToday
      );
      expect(actions2.find((a) => a.action.code === 'HD11.R27.KH01')?.action.status).toBe('in_progress');
    });

    it('đổi dueDay không đổi due_at kỳ đã có nhưng kỳ tạo sau dùng giá trị mới', async () => {
      // Kỳ 2026-Q4 đã có với dueAt ngày 10 (2027-01-10T16:59:59.000Z)
      const [existingQ4] = await appClient.db
        .select()
        .from(period)
        .where(eq(period.key, '2026-Q4'));
      expect(existingQ4.dueAt.toISOString()).toBe('2027-01-10T16:59:59.000Z');

      // Đổi dueDay thành 20
      await updateSettings(
        { slowDays: 60, slowProgress: 70, staleDays: 90, dueDay: 20 },
        adminActor,
        undefined,
        appClient.db
      );

      // ensurePeriods cho chu kỳ 2026: kỳ 2026-Q4 giữ nguyên do đã có
      await ensurePeriods(2026, adminActor, undefined, appClient.db);
      const [q4After] = await appClient.db
        .select()
        .from(period)
        .where(eq(period.key, '2026-Q4'));
      expect(q4After.dueAt.toISOString()).toBe('2027-01-10T16:59:59.000Z');

      // Tạo một chu kỳ mới 2028: kỳ tạo ra dùng dueDay = 20 (ngày 20)
      await appClient.db.insert(cycle).values({ year: 2028, status: 'open' });
      const p2028 = await ensurePeriods(2028, adminActor, undefined, appClient.db);
      const jan2028 = p2028.find((p) => p.key === '2028-01');
      expect(jan2028?.dueAt).toBe('2028-02-20T16:59:59.000Z');
    });
  });

  describe('2. Đánh giá rủi ro còn lại (Residual Risk)', () => {
    it('khóa kỳ tháng trong periodKey ném 422 VALIDATION', async () => {
      await expect(
        setResidual(
          'HD11.R27',
          '2026-10', // không phải định dạng quý YYYY-Qx
          {
            impactLabel: 'Lớn',
            likelihoodLabel: 'Có thể xảy ra',
            levelLabel: 'Cao',
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toThrowError(AppError);
    });

    it('kỳ quý không tồn tại trong chu kỳ ném 404 PERIOD_NOT_FOUND', async () => {
      try {
        await setResidual(
          'HD11.R27',
          '2026-Q1', // không có trong cycle 2026
          {
            impactLabel: 'Lớn',
            likelihoodLabel: 'Có thể xảy ra',
            levelLabel: 'Cao',
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        );
        expect.unreachable('Kỳ không có phải ném 404');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('PERIOD_NOT_FOUND');
      }
    });

    it('nhãn ngoài thang đo ném 422 VALIDATION', async () => {
      await expect(
        setResidual(
          'HD11.R27',
          '2026-Q4',
          {
            impactLabel: 'Nhãn lạ không có',
            likelihoodLabel: 'Có thể xảy ra',
            levelLabel: 'Cao',
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toThrowError(AppError);

      await expect(
        setResidual(
          'HD11.R27',
          '2026-Q4',
          {
            impactLabel: 'Lớn',
            likelihoodLabel: 'Khả năng kỳ lạ',
            levelLabel: 'Cao',
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toThrowError(AppError);
    });

    it('lưu thành công mức rủi ro còn lại và ghi đè lần hai', async () => {
      // Ban 4 lưu lần 1
      const res1 = await setResidual(
        'HD11.R27',
        '2026-Q4',
        {
          impactLabel: 'Trung bình',
          likelihoodLabel: 'Ít khả năng',
          levelLabel: 'Trung bình',
        },
        2026,
        ban4Actor,
        undefined,
        appClient.db
      );

      expect(res1.periodKey).toBe('2026-Q4');
      expect(res1.rating.impactLabel).toBe('Trung bình');
      expect(res1.rating.impactScore).toBe(3);
      expect(res1.rating.likelihoodLabel).toBe('Ít khả năng');
      expect(res1.rating.likelihoodScore).toBe(2);
      expect(res1.rating.levelLabel).toBe('Trung bình');

      // Ban 4 ghi đè lần 2 với mức khác
      const res2 = await setResidual(
        'HD11.R27',
        '2026-Q4',
        {
          impactLabel: 'Nhỏ',
          likelihoodLabel: 'Hiếm khi',
          levelLabel: 'Thấp',
        },
        2026,
        ban4Actor,
        undefined,
        appClient.db
      );

      expect(res2.rating.impactLabel).toBe('Nhỏ');
      expect(res2.rating.impactScore).toBe(2);
      expect(res2.rating.likelihoodLabel).toBe('Hiếm khi');
      expect(res2.rating.likelihoodScore).toBe(1);
      expect(res2.rating.levelLabel).toBe('Thấp');
    });

    it('GET /api/heatmap và GET /api/profiles phản ánh mức còn lại mới', async () => {
      const prof = await getProfileDetail('HD11.R27', { cycle: 2026, period: '2026-Q4' }, appClient.db, adminActor);
      expect(prof.profile.residual?.impactLabel).toBe('Nhỏ');
      expect(prof.profile.residual?.levelLabel).toBe('Thấp');

      const heatmap = await getHeatmap({ cycle: 2026, period: '2026-Q4' }, appClient.db);
      const pt = heatmap.points.find((p) => p.riskCode === 'HD11.R27');
      expect(pt?.residual?.impactLabel).toBe('Nhỏ');
      expect(pt?.residual?.likelihoodLabel).toBe('Hiếm khi');
      expect(pt?.residual?.levelLabel).toBe('Thấp');
      expect(pt?.residual?.impactScore).toBe(2);
      expect(pt?.residual?.likelihoodScore).toBe(1);
    });

    it('kỳ đã bị khóa chặn cập nhật rủi ro còn lại -> 409 PERIOD_CLOSED', async () => {
      await closePeriod(2026, '2026-Q4', adminActor, undefined, appClient.db);

      await expect(
        setResidual(
          'HD11.R27',
          '2026-Q4',
          {
            impactLabel: 'Trung bình',
            likelihoodLabel: 'Có thể xảy ra',
            levelLabel: 'Trung bình',
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toThrowError(AppError);
    });
  });
});
