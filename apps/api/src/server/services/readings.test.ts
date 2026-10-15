import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { seedInitialPeriods } from './periods';
import { seedUnits } from './units';
import { getZonePreview, submitReading, getIndicatorReadings } from './readings';
import { getOverview } from './queries';
import {
  cycle,
  period,
  indicator,
  indicatorReading,
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

describe('readings.test.ts - Kế hoạch 3B.1: Xem trước vùng, nộp số liệu chỉ số và lịch sử bản nộp', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let testCycleId: string;

  let adminActor: Actor;
  let ban4Actor: Actor;
  let unit1Actor: Actor;
  let unit2Actor: Actor;
  let viewerActor: Actor;

  let tt1Unit: typeof unit.$inferSelect;
  let tt2Unit: typeof unit.$inferSelect;

  let autoKri01: typeof indicator.$inferSelect; // HD11.R27.KRI01 (tháng, auto)
  let autoKri03: typeof indicator.$inferSelect; // HD11.R27.KRI03 (tháng, auto: 0 / >0%-2% / >2%)
  let autoKci03: typeof indicator.$inferSelect; // HD11.R27.KCI03 (quý, auto: 1 / 50%-<100% / <50%)
  let manualKri01: typeof indicator.$inferSelect; // CN02.R13.KRI01 (tháng, manual)

  beforeAll(async () => {
    const testMigrateUrl = process.env.DATABASE_TEST_MIGRATE_URL;
    const testAppUrl = process.env.DATABASE_TEST_URL;
    if (!testMigrateUrl || !testAppUrl) {
      throw new Error('Thiếu DATABASE_TEST_MIGRATE_URL hoặc DATABASE_TEST_URL');
    }

    await runMigrations(testMigrateUrl);
    const ownerSql = (await import('postgres')).default(testMigrateUrl, { max: 1 });
    await ownerSql`TRUNCATE TABLE audit_log, indicator_reading, action_update, period, cycle CASCADE`;
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
        email: `adm_readings_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Duyệt',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    adminActor = { userId: adm.id, role: 'admin', unitId: null };

    const [b4] = await appClient.db
      .insert(appUser)
      .values({
        email: `b4_readings_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
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
        email: `u1_readings_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Nguoi TT1',
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
        email: `u2_readings_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Nguoi TT2',
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
        email: `vw_readings_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Người Xem',
        role: 'viewer',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    viewerActor = { userId: vw.id, role: 'viewer', unitId: null };

    // Lấy các chỉ số mẫu
    const allIndicators = await appClient.db.select().from(indicator);
    autoKri01 = allIndicators.find((i) => i.code === 'HD11.R27.KRI01')!;
    autoKri03 = allIndicators.find((i) => i.code === 'HD11.R27.KRI03')!;
    autoKci03 = allIndicators.find((i) => i.code === 'HD11.R27.KCI03')!;
    manualKri01 = allIndicators.find((i) => i.code === 'CN02.R13.KRI01')!;

    // Gán autoKri01 và manualKri01 cho TT1 để test quyền
    await appClient.db
      .update(indicator)
      .set({ ownerUnitId: tt1Unit.id })
      .where(eq(indicator.id, autoKri01.id));
    await appClient.db
      .update(indicator)
      .set({ ownerUnitId: tt1Unit.id })
      .where(eq(indicator.id, manualKri01.id));
  });

  describe('1. getZonePreview', () => {
    it('chỉ số tự động KRI01: trả đúng auto và vùng tương ứng giá trị (5%, 7.5%, 10%, 15%)', async () => {
      const p5 = await getZonePreview(autoKri01.id, 5, appClient.db);
      expect(p5).toEqual({ mode: 'auto', zone: 'green' });

      const p75 = await getZonePreview(autoKri01.id, 7.5, appClient.db);
      expect(p75).toEqual({ mode: 'auto', zone: 'yellow' });

      const p10 = await getZonePreview(autoKri01.id, 10, appClient.db);
      expect(p10).toEqual({ mode: 'auto', zone: 'yellow' });

      const p15 = await getZonePreview(autoKri01.id, 15, appClient.db);
      expect(p15).toEqual({ mode: 'auto', zone: 'red' });
    });

    it('ca biên thật KRI03 (0 / >0%-2% / >2%): 0 là xanh, 1 là vàng, 2 là vàng, 3 là đỏ', async () => {
      const p0 = await getZonePreview(autoKri03.id, 0, appClient.db);
      expect(p0).toEqual({ mode: 'auto', zone: 'green' });

      const p1 = await getZonePreview(autoKri03.id, 1, appClient.db);
      expect(p1).toEqual({ mode: 'auto', zone: 'yellow' });

      const p2 = await getZonePreview(autoKri03.id, 2, appClient.db);
      expect(p2).toEqual({ mode: 'auto', zone: 'yellow' });

      const p3 = await getZonePreview(autoKri03.id, 3, appClient.db);
      expect(p3).toEqual({ mode: 'auto', zone: 'red' });
    });

    it('ca biên thật KCI03 (1 / 50%-<100% / <50%): 100 là xanh, 99.99 là vàng, 50 là vàng, 49.99 là đỏ', async () => {
      const p100 = await getZonePreview(autoKci03.id, 100, appClient.db);
      expect(p100).toEqual({ mode: 'auto', zone: 'green' });

      const p99 = await getZonePreview(autoKci03.id, 99.99, appClient.db);
      expect(p99).toEqual({ mode: 'auto', zone: 'yellow' });

      const p50 = await getZonePreview(autoKci03.id, 50, appClient.db);
      expect(p50).toEqual({ mode: 'auto', zone: 'yellow' });

      const p49 = await getZonePreview(autoKci03.id, 49.99, appClient.db);
      expect(p49).toEqual({ mode: 'auto', zone: 'red' });
    });

    it('chỉ số thủ công: trả { mode: "manual", zone: null }', async () => {
      const pManual = await getZonePreview(manualKri01.id, 10, appClient.db);
      expect(pManual).toEqual({ mode: 'manual', zone: null });
    });

    it('chỉ số không tồn tại: ném AppError(NOT_FOUND)', async () => {
      await expect(
        getZonePreview('00000000-0000-0000-0000-000000000000', 10, appClient.db)
      ).rejects.toThrowError(AppError);
    });
  });

  describe('2. submitReading: Kiểm tra theo thứ tự mục 5.1 và ma trận quyền', () => {
    it('kỳ không tồn tại trong chu kỳ -> ném 404 PERIOD_NOT_FOUND', async () => {
      await expect(
        submitReading(
          autoKri01.id,
          { periodKey: '2026-99', valueNum: 5 },
          adminActor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'PERIOD_NOT_FOUND' });
    });

    it('kỳ đã bị khóa -> ném 409 PERIOD_CLOSED', async () => {
      // Khóa tạm kỳ 2026-10
      await appClient.db
        .update(period)
        .set({ closedAt: new Date() })
        .where(and(eq(period.cycleId, testCycleId), eq(period.key, '2026-10')));

      await expect(
        submitReading(
          autoKri01.id,
          { periodKey: '2026-10', valueNum: 5 },
          adminActor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });

      // Mở lại kỳ 2026-10 để các test sau chạy
      await appClient.db
        .update(period)
        .set({ closedAt: null })
        .where(and(eq(period.cycleId, testCycleId), eq(period.key, '2026-10')));
    });

    it('kỳ chưa bắt đầu (startsOn > today) -> ném 422 VALIDATION', async () => {
      // Kỳ 2026-12 bắt đầu ngày 2026-12-01, nếu today là 2026-10-15 -> chưa bắt đầu
      await expect(
        submitReading(
          autoKri01.id,
          { periodKey: '2026-12', valueNum: 5 },
          adminActor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('sai loại kỳ (chỉ số tháng nộp kỳ quý 2026-Q4) -> ném 422 VALIDATION', async () => {
      await expect(
        submitReading(
          autoKri01.id,
          { periodKey: '2026-Q4', valueNum: 5 },
          adminActor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('không có quyền (unit xem/nộp mục đơn vị khác hoặc chưa gán) -> ném 403 FORBIDDEN', async () => {
      // autoKri01 được gán cho TT1. unit2 (TT2) nộp -> 403
      await expect(
        submitReading(
          autoKri01.id,
          { periodKey: '2026-10', valueNum: 5 },
          unit2Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      // viewer nộp -> 403
      await expect(
        submitReading(
          autoKri01.id,
          { periodKey: '2026-10', valueNum: 5 },
          viewerActor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      // autoKci03 chưa gán đơn vị -> unit1 nộp bị 403
      await expect(
        submitReading(
          autoKci03.id,
          { periodKey: '2026-Q4', valueNum: 80 },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('chỉ số tự động: thiếu valueNum hoặc ngoài 0-100 -> ném 422 VALIDATION', async () => {
      await expect(
        submitReading(
          autoKri01.id,
          { periodKey: '2026-10', valueNum: null },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      await expect(
        submitReading(
          autoKri01.id,
          { periodKey: '2026-10', valueNum: 105 },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      await expect(
        submitReading(
          autoKri01.id,
          { periodKey: '2026-10', valueNum: -1 },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('chỉ số tự động: bỏ qua zone client gửi, lưu vùng server tính và zoneNote null', async () => {
      // client gửi zone 'green' nhưng valueNum là 7.5 (ngưỡng auto là yellow)
      const res = await submitReading(
        autoKri01.id,
        {
          periodKey: '2026-10',
          valueNum: 7.5,
          zone: 'green',
          zoneNote: 'client muon xanh',
          note: 'Ghi chú thêm',
        },
        unit1Actor,
        { today: '2026-10-15', ip: '127.0.0.1' },
        appClient.db
      );

      expect(res.zone).toBe('yellow');
      expect(res.zoneSource).toBe('auto');
      expect(res.zoneNote).toBeNull();
      expect(res.status).toBe('pending');
      expect(res.valueNum).toBe(7.5);
      expect(res.submittedBy?.fullName).toBe('Nguoi TT1');

      // Đảm bảo có audit_log submit_reading
      const [log] = await appClient.db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'submit_reading'),
            eq(auditLog.entityId, res.id)
          )
        );
      expect(log).toBeDefined();
      expect(log.userId).toBe(unit1Actor.userId);
    });

    it('chỉ số thủ công: thiếu zone hoặc zoneNote < 10 ký tự -> ném 422 VALIDATION', async () => {
      // thiếu zone
      await expect(
        submitReading(
          manualKri01.id,
          { periodKey: '2026-Q4', zone: null, zoneNote: 'Đã giải thích hơn mười ký tự' },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      // thiếu zoneNote
      await expect(
        submitReading(
          manualKri01.id,
          { periodKey: '2026-Q4', zone: 'yellow', zoneNote: null },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      // zoneNote ngắn hơn 10 ký tự sau trim
      await expect(
        submitReading(
          manualKri01.id,
          { periodKey: '2026-Q4', zone: 'yellow', zoneNote: '   ngắn   ' },
          unit1Actor,
          { today: '2026-10-15' },
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('chỉ số thủ công hợp lệ: lưu đúng zone, zoneSource=manual và zoneNote', async () => {
      const res = await submitReading(
        manualKri01.id,
        {
          periodKey: '2026-Q4',
          zone: 'red',
          zoneNote: 'Phát sinh 02 vụ việc mức nghiêm trọng',
          valueText: '02 vụ việc',
        },
        unit1Actor,
        { today: '2026-10-15' },
        appClient.db
      );

      expect(res.zone).toBe('red');
      expect(res.zoneSource).toBe('manual');
      expect(res.zoneNote).toBe('Phát sinh 02 vụ việc mức nghiêm trọng');
      expect(res.status).toBe('pending');
    });

    it('bản nộp mới ở trạng thái pending KHÔNG làm đổi GET /api/overview', async () => {
      const ov = await getOverview({ cycle: 2026, period: '2026-10' }, appClient.db);
      // Khi chưa có bản approved nào, tổng quan KRI vẫn là 0/0/0
      expect(ov.hasApprovedData).toBe(false);
      expect(ov.kri.red).toBe(0);
      expect(ov.kri.yellow).toBe(0);
      expect(ov.kri.green).toBe(0);
    });
  });

  describe('3. getIndicatorReadings: Lịch sử bản nộp', () => {
    it('unit xem chỉ số của đơn vị khác -> ném 403 FORBIDDEN', async () => {
      // autoKri01 gán TT1, unit2 xem -> 403
      await expect(
        getIndicatorReadings(autoKri01.id, {}, unit2Actor, appClient.db)
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('unit xem chỉ số của đơn vị mình -> trả danh sách xếp mới trước', async () => {
      const list = await getIndicatorReadings(autoKri01.id, {}, unit1Actor, appClient.db);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].indicatorCode).toBe('HD11.R27.KRI01');
      expect(list[0].status).toBe('pending');
      expect(list[0].submittedBy?.fullName).toBe('Nguoi TT1');
    });

    it('admin xem được bất kỳ chỉ số nào và lọc đúng theo kỳ', async () => {
      const list = await getIndicatorReadings(
        autoKri01.id,
        { period: '2026-10' },
        adminActor,
        appClient.db
      );
      expect(list.length).toBeGreaterThan(0);
      for (const item of list) {
        expect(item.periodKey).toBe('2026-10');
      }
    });
  });
});
