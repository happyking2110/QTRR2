import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { createCustomClient, type CustomClient } from '../db/client';
import {
  cycle,
  period,
  appUser,
  passwordHistory,
  indicator,
  indicatorReading,
  riskProfile,
  unit,
} from '../db/schema';
import {
  ensurePeriods,
  createEventPeriod,
  closePeriod,
  reopenPeriod,
} from './periods';
import { submitReading } from './readings';
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

describe('periods-3b4.test.ts - Kế hoạch 3B.4: Kỳ (tạo còn thiếu, kỳ đợt, khóa, mở lại)', () => {
  let ownerSql: postgres.Sql;
  let appClient: CustomClient;

  let adminActor: Actor;
  let unitActor: Actor;
  let testCycleId2026: string;
  let testCycleId2027: string;
  let testIndicatorId: string;
  let testUnitId: string;

  beforeAll(async () => {
    ownerSql = postgres(testMigrateUrl, { max: 1 });
    appClient = createCustomClient(testAppUrl);

    // TRUNCATE sạch hsrr_test
    await ownerSql`TRUNCATE TABLE audit_log, unit_assignment, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, session, password_history, app_user, unit, cycle CASCADE`;

    const passwordHash = await hashPassword('AdminPass!2026');
    const [uAdmin] = await appClient.db
      .insert(appUser)
      .values({
        email: 'admin_periods_3b4@mobifone.vn',
        fullName: 'Admin Quản trị Kỳ',
        role: 'admin',
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      })
      .returning();

    adminActor = {
      userId: uAdmin.id,
      email: uAdmin.email,
      fullName: uAdmin.fullName,
      role: 'admin',
      unitId: null,
      unitCode: null,
    };

    const [uUnit] = await appClient.db
      .insert(appUser)
      .values({
        email: 'unit_periods_3b4@mobifone.vn',
        fullName: 'Chuyên viên TT1',
        role: 'unit',
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      })
      .returning();

    const [unitRow] = await appClient.db
      .insert(unit)
      .values({
        code: 'TT1',
        name: 'Trung tâm Tính cước 1',
        kind: 'center',
      })
      .returning();
    testUnitId = unitRow.id;

    await appClient.db
      .update(appUser)
      .set({ unitId: testUnitId })
      .where(eq(appUser.id, uUnit.id));

    unitActor = {
      userId: uUnit.id,
      email: uUnit.email,
      fullName: uUnit.fullName,
      role: 'unit',
      unitId: testUnitId,
      unitCode: 'TT1',
    };

    // Tạo cycle 2026 và 4 kỳ ban đầu: 10, 11, 12, Q4
    const [c2026] = await appClient.db
      .insert(cycle)
      .values({ year: 2026, status: 'open' })
      .returning();
    testCycleId2026 = c2026.id;

    const initialDueAt = new Date(Date.UTC(2026, 10, 10, 16, 59, 59));
    await appClient.db.insert(period).values([
      {
        cycleId: testCycleId2026,
        key: '2026-10',
        kind: 'month',
        label: 'Tháng 10/2026',
        startsOn: '2026-10-01',
        endsOn: '2026-10-31',
        dueAt: initialDueAt,
      },
      {
        cycleId: testCycleId2026,
        key: '2026-11',
        kind: 'month',
        label: 'Tháng 11/2026',
        startsOn: '2026-11-01',
        endsOn: '2026-11-30',
        dueAt: new Date(Date.UTC(2026, 11, 10, 16, 59, 59)),
      },
      {
        cycleId: testCycleId2026,
        key: '2026-12',
        kind: 'month',
        label: 'Tháng 12/2026',
        startsOn: '2026-12-01',
        endsOn: '2026-12-31',
        dueAt: new Date(Date.UTC(2027, 0, 10, 16, 59, 59)),
      },
      {
        cycleId: testCycleId2026,
        key: '2026-Q4',
        kind: 'quarter',
        label: 'Quý 4/2026',
        startsOn: '2026-10-01',
        endsOn: '2026-12-31',
        dueAt: new Date(Date.UTC(2027, 0, 10, 16, 59, 59)),
      },
    ]);

    // Tạo cycle 2027 trống (chưa có kỳ nào)
    const [c2027] = await appClient.db
      .insert(cycle)
      .values({ year: 2027, status: 'open' })
      .returning();
    testCycleId2027 = c2027.id;

    // Tạo riskProfile và indicator để test pending submission khi khóa kỳ
    const [profile] = await appClient.db
      .insert(riskProfile)
      .values({
        cycleId: testCycleId2026,
        riskCode: 'HD11.R27',
        hsrrCode: '01/HSRR-HD11',
        name: 'Rủi ro test 3B.4',
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

    const [ind] = await appClient.db
      .insert(indicator)
      .values({
        profileId: profile.id,
        code: 'HD11.R27.KRI01',
        kind: 'kri',
        name: 'KRI test 3B.4',
        formula: 'A / B',
        frequency: 'Tháng',
        periodKind: 'month',
        thresholdLowText: '<= 5%',
        thresholdMidText: '> 5% - 10%',
        thresholdHighText: '> 10%',
        zoneRules: [
          { zone: 'green', lo: null, loInclusive: false, hi: 5, hiInclusive: true },
          { zone: 'yellow', lo: 5, loInclusive: false, hi: 10, hiInclusive: true },
          { zone: 'red', lo: 10, loInclusive: false, hi: null, hiInclusive: false },
        ],
        ownerUnitId: testUnitId,
        unitKind: 'percent',
        unitLabel: '%',
      })
      .returning();
    testIndicatorId = ind.id;
  });

  afterAll(async () => {
    if (appClient) await appClient.client.end();
    if (ownerSql) await ownerSql.end();
  });

  describe('1. ensurePeriods: tạo các kỳ còn thiếu', () => {
    it('ensure cho 2026 (đã có 10, 11, 12, Q4) không tạo gì mới và không đổi due_at', async () => {
      const beforeList = await appClient.db
        .select()
        .from(period)
        .where(eq(period.cycleId, testCycleId2026));
      expect(beforeList.length).toBe(4);

      const result = await ensurePeriods(2026, adminActor, undefined, appClient.db);
      expect(result.length).toBe(4);

      const afterList = await appClient.db
        .select()
        .from(period)
        .where(eq(period.cycleId, testCycleId2026));
      expect(afterList.length).toBe(4);

      const p10 = afterList.find((p) => p.key === '2026-10');
      expect(p10?.dueAt.toISOString()).toBe('2026-11-10T16:59:59.000Z');
    });

    it('cho một chu kỳ thử chưa có kỳ nào (2027) tạo đủ 12 tháng và 4 quý với hạn đúng', async () => {
      const result = await ensurePeriods(2027, adminActor, undefined, appClient.db);
      expect(result.length).toBe(16); // 12 tháng + 4 quý

      const months = result.filter((p) => p.kind === 'month');
      expect(months.length).toBe(12);

      const quarters = result.filter((p) => p.kind === 'quarter');
      expect(quarters.length).toBe(4);

      // Kiểm tra kỳ 2027-02: hạn 23:59:59 giờ Việt Nam ngày 10/03/2027 (16:59:59 UTC ngày 10/03/2027)
      const pFeb = result.find((p) => p.key === '2027-02');
      expect(pFeb).toBeDefined();
      expect(pFeb?.label).toBe('Tháng 2/2027');
      expect(pFeb?.startsOn).toBe('2027-02-01');
      expect(pFeb?.endsOn).toBe('2027-02-28');
      expect(pFeb?.dueAt).toBe('2027-03-10T16:59:59.000Z');

      // Kiểm tra kỳ 2027-Q1
      const pQ1 = result.find((p) => p.key === '2027-Q1');
      expect(pQ1).toBeDefined();
      expect(pQ1?.label).toBe('Quý 1/2027');
      expect(pQ1?.startsOn).toBe('2027-01-01');
      expect(pQ1?.endsOn).toBe('2027-03-31');
      expect(pQ1?.dueAt).toBe('2027-04-10T16:59:59.000Z');

      // Kiểm tra kỳ 2027-12
      const pDec = result.find((p) => p.key === '2027-12');
      expect(pDec?.startsOn).toBe('2027-12-01');
      expect(pDec?.endsOn).toBe('2027-12-31');
      expect(pDec?.dueAt).toBe('2028-01-10T16:59:59.000Z');
    });
  });

  describe('2. createEventPeriod: tạo kỳ loại đợt', () => {
    it('tạo kỳ đợt sinh khóa E1, E2 liên tiếp', async () => {
      const e1 = await createEventPeriod(
        2026,
        {
          label: 'Đợt diễn tập an toàn thông tin lần 1',
          startsOn: '2026-05-01',
          endsOn: '2026-05-15',
        },
        adminActor,
        undefined,
        appClient.db
      );

      expect(e1.key).toBe('2026-E1');
      expect(e1.kind).toBe('event');
      expect(e1.label).toBe('Đợt diễn tập an toàn thông tin lần 1');
      expect(e1.startsOn).toBe('2026-05-01');
      expect(e1.endsOn).toBe('2026-05-15');
      // endsOn trong tháng 5 -> hạn nhập tháng 6 (10/06/2026)
      expect(e1.dueAt).toBe('2026-06-10T16:59:59.000Z');

      const e2 = await createEventPeriod(
        2026,
        {
          label: 'Đợt diễn tập an toàn thông tin lần 2',
          startsOn: '2026-08-01',
          endsOn: '2026-08-20',
        },
        adminActor,
        undefined,
        appClient.db
      );

      expect(e2.key).toBe('2026-E2');
      expect(e2.dueAt).toBe('2026-09-10T16:59:59.000Z');
    });

    it('ngày ngoài năm của chu kỳ -> 422 VALIDATION', async () => {
      await expect(
        createEventPeriod(
          2026,
          {
            label: 'Đợt sai năm',
            startsOn: '2025-12-01',
            endsOn: '2026-01-10',
          },
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toThrowError(AppError);
    });

    it('startsOn > endsOn -> 422 VALIDATION', async () => {
      await expect(
        createEventPeriod(
          2026,
          {
            label: 'Đợt ngày ngược',
            startsOn: '2026-06-20',
            endsOn: '2026-06-10',
          },
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toThrowError(AppError);
    });
  });

  describe('3. closePeriod & reopenPeriod: khóa và mở lại kỳ', () => {
    it('khóa kỳ khi còn bản nộp pending -> 409 INVALID_STATE kèm danh sách', async () => {
      // Unit nộp 1 bản pending cho kỳ 2026-10
      await submitReading(
        testIndicatorId,
        {
          periodKey: '2026-10',
          valueNum: 7.5,
        },
        unitActor,
        undefined,
        appClient.db
      );

      try {
        await closePeriod(2026, '2026-10', adminActor, undefined, appClient.db);
        expect.unreachable('Khóa kỳ khi còn bản pending phải ném lỗi');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('INVALID_STATE');
        expect(err.details).toBeDefined();
        expect(Array.isArray(err.details)).toBe(true);
        expect(err.details.length).toBeGreaterThanOrEqual(1);
        expect(err.details[0].kind).toBe('reading');
      }
    });

    it('khi đã duyệt hoặc không còn pending: khóa kỳ thành công (200), closed = true', async () => {
      // Dọn dẹp bản pending vừa nộp bằng cách xóa hoặc cập nhật approved
      await appClient.db
        .update(indicatorReading)
        .set({ status: 'approved' })
        .where(eq(indicatorReading.periodKey, '2026-10'));

      const closed = await closePeriod(2026, '2026-10', adminActor, undefined, appClient.db);
      expect(closed.closed).toBe(true);
      expect(closed.closedAt).not.toBeNull();
      expect(closed.closedByName).toBe('Admin Quản trị Kỳ');

      // Khóa lại kỳ đã khóa -> 409 INVALID_STATE
      await expect(
        closePeriod(2026, '2026-10', adminActor, undefined, appClient.db)
      ).rejects.toThrowError(AppError);
    });

    it('nộp số liệu vào kỳ đã khóa -> 409 PERIOD_CLOSED', async () => {
      await expect(
        submitReading(
          testIndicatorId,
          {
            periodKey: '2026-10',
            valueNum: 6.0,
          },
          unitActor,
          undefined,
          appClient.db
        )
      ).rejects.toThrowError(AppError);
    });

    it('mở lại kỳ thiếu lý do (< 5 ký tự) -> 422 VALIDATION', async () => {
      await expect(
        reopenPeriod(2026, '2026-10', 'abc', adminActor, undefined, appClient.db)
      ).rejects.toThrowError(AppError);
    });

    it('mở lại kỳ hợp lệ -> 200, closed = false, reopenReason được lưu', async () => {
      const reopened = await reopenPeriod(
        2026,
        '2026-10',
        'Mở lại để đơn vị bổ sung số liệu điều chỉnh theo chỉ đạo',
        adminActor,
        undefined,
        appClient.db
      );

      expect(reopened.closed).toBe(false);
      expect(reopened.closedAt).toBeNull();
      expect(reopened.closedByName).toBeNull();
      expect(reopened.reopenReason).toBe(
        'Mở lại để đơn vị bổ sung số liệu điều chỉnh theo chỉ đạo'
      );

      // Mở lại kỳ đang mở -> 409 INVALID_STATE
      await expect(
        reopenPeriod(
          2026,
          '2026-10',
          'Lý do mở lại tiếp',
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toThrowError(AppError);
    });

    it('S6.1: khóa hoặc mở lại kỳ không tồn tại (2026-13) trả 404 PERIOD_NOT_FOUND; chu kỳ không tồn tại trả 404 NOT_FOUND', async () => {
      // 1. Kỳ không tồn tại trong chu kỳ 2026 -> 404 PERIOD_NOT_FOUND
      try {
        await closePeriod(2026, '2026-13', adminActor, undefined, appClient.db);
        expect.unreachable('Phải ném lỗi khi kỳ không tồn tại');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('PERIOD_NOT_FOUND');
      }

      try {
        await reopenPeriod(2026, '2026-13', 'Lý do hợp lệ để mở lại', adminActor, undefined, appClient.db);
        expect.unreachable('Phải ném lỗi khi kỳ không tồn tại');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('PERIOD_NOT_FOUND');
      }

      // 2. Chu kỳ không tồn tại -> 404 NOT_FOUND
      try {
        await closePeriod(2099, '2026-10', adminActor, undefined, appClient.db);
        expect.unreachable('Phải ném lỗi khi chu kỳ không tồn tại');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('NOT_FOUND');
      }

      try {
        await reopenPeriod(2099, '2026-10', 'Lý do hợp lệ để mở lại', adminActor, undefined, appClient.db);
        expect.unreachable('Phải ném lỗi khi chu kỳ không tồn tại');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('NOT_FOUND');
      }
    });

    it('mở lại rồi thì nộp được bình thường', async () => {
      const res = await submitReading(
        testIndicatorId,
        {
          periodKey: '2026-10',
          valueNum: 8.0,
        },
        unitActor,
        undefined,
        appClient.db
      );
      expect(res.status).toBe('pending');
      expect(res.valueNum).toBe(8.0);
    });
  });
});
