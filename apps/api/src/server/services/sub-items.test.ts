import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { seedInitialPeriods } from './periods';
import { seedUnits } from './units';
import {
  createCause,
  updateCause,
  deleteCause,
  createImpact,
  updateImpact,
  deleteImpact,
  createControl,
  updateControl,
  deleteControl,
  linkControlCauses,
  createActionPlan,
  updateActionPlan,
  deleteActionPlan,
  linkActionControls,
  createIndicator,
  updateIndicator,
  deleteIndicator,
  setIndicatorTargets,
} from './sub-items';
import {
  cause,
  impact,
  control,
  controlCause,
  actionPlan,
  actionControl,
  actionTask,
  actionUpdate,
  indicator,
  indicatorReading,
  appUser,
} from '../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Actor } from '../types';

describe('sub-items.test.ts - Kế hoạch 4A.2: Mục con và liên kết', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let testCycleId: string;

  let adminActor: Actor;
  let ban4Actor: Actor;

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

    const [adm] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm_sub_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin SubItems',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    adminActor = { userId: adm.id, role: 'admin', unitId: null };

    const [b4] = await appClient.db
      .insert(appUser)
      .values({
        email: `b4_sub_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Ban 4 SubItems',
        role: 'ban4',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    ban4Actor = { userId: b4.id, role: 'ban4', unitId: null };
  });

  // 1. NGUYÊN NHÂN (causes)
  describe('Nguyên nhân (causes)', () => {
    it('Tạo đúng nguyên nhân mới', async () => {
      const res = await createCause(
        'HD11.R27',
        {
          code: 'HD11.R27.NN06',
          group: 'Nhóm con người',
          description: 'Nguyên nhân thử nghiệm mới',
        },
        2026,
        adminActor,
        undefined,
        appClient.db
      );

      expect(res.code).toBe('HD11.R27.NN06');
      expect(res.group).toBe('Nhóm con người');
      expect(res.description).toBe('Nguyên nhân thử nghiệm mới');
    });

    it('Sai tiền tố hồ sơ báo 422 VALIDATION', async () => {
      await expect(
        createCause(
          'HD11.R27',
          {
            code: 'CN02.R13.NN99',
            group: 'Nhóm',
            description: 'Mô tả',
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('Sai loại (gửi mã KS vào causes) báo 422 VALIDATION', async () => {
      await expect(
        createCause(
          'HD11.R27',
          {
            code: 'HD11.R27.KS99',
            group: 'Nhóm',
            description: 'Mô tả',
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('Trùng mã báo 409 CONFLICT', async () => {
      await expect(
        createCause(
          'HD11.R27',
          {
            code: 'HD11.R27.NN06',
            group: 'Nhóm',
            description: 'Trùng',
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('Sửa nguyên nhân thành công', async () => {
      const res = await updateCause(
        'HD11.R27',
        'HD11.R27.NN06',
        {
          group: 'Nhóm quy trình',
          description: 'Mô tả đã sửa',
        },
        2026,
        ban4Actor,
        undefined,
        appClient.db
      );

      expect(res.group).toBe('Nhóm quy trình');
      expect(res.description).toBe('Mô tả đã sửa');
    });

    it('Xóa nguyên nhân chưa liên kết thành công (204)', async () => {
      await deleteCause('HD11.R27', 'HD11.R27.NN06', 2026, adminActor, undefined, appClient.db);

      // Thử cập nhật sau khi xóa -> 404
      await expect(
        updateCause(
          'HD11.R27',
          'HD11.R27.NN06',
          { group: 'Nhóm', description: 'Sửa' },
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('Xóa nguyên nhân còn liên kết kiểm soát bị 409 REFERENCED', async () => {
      // HD11.R27.NN01 trong file mẫu đã có liên kết với KS01
      await expect(
        deleteCause('HD11.R27', 'HD11.R27.NN01', 2026, adminActor, undefined, appClient.db)
      ).rejects.toMatchObject({ code: 'REFERENCED' });
    });
  });

  // 2. ẢNH HƯỞNG (impacts)
  describe('Ảnh hưởng (impacts)', () => {
    it('Tạo đúng ảnh hưởng mới', async () => {
      const res = await createImpact(
        'HD11.R27',
        {
          code: 'HD11.R27.AH05',
          group: 'Tài chính',
          description: 'Ảnh hưởng tài chính',
          level: 'Nghiêm trọng',
        },
        2026,
        adminActor,
        undefined,
        appClient.db
      );
      expect(res.code).toBe('HD11.R27.AH05');
      expect(res.level).toBe('Nghiêm trọng');
    });

    it('Sai tiền tố hồ sơ báo 422', async () => {
      await expect(
        createImpact(
          'HD11.R27',
          {
            code: 'TT07.R46.AH99',
            group: 'G',
            description: 'D',
            level: 'Lớn',
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('Sai nhãn thang đo báo 422', async () => {
      await expect(
        createImpact(
          'HD11.R27',
          {
            code: 'HD11.R27.AH06',
            group: 'G',
            description: 'D',
            level: 'Nhãn Tự Bịa',
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('Sửa ảnh hưởng thành công', async () => {
      const res = await updateImpact(
        'HD11.R27',
        'HD11.R27.AH05',
        {
          group: 'Uy tín',
          description: 'Ảnh hưởng uy tín',
          level: 'Lớn',
        },
        2026,
        ban4Actor,
        undefined,
        appClient.db
      );
      expect(res.level).toBe('Lớn');
    });

    it('Xóa ảnh hưởng tự do (204)', async () => {
      await deleteImpact('HD11.R27', 'HD11.R27.AH05', 2026, adminActor, undefined, appClient.db);
    });
  });

  // 3. KIỂM SOÁT (controls) VÀ LIÊN KẾT NN-KS
  describe('Kiểm soát (controls) và liên kết NN-KS', () => {
    it('Tạo kiểm soát mới thành công', async () => {
      const res = await createControl(
        'HD11.R27',
        {
          code: 'HD11.R27.KS99',
          description: 'Kiểm soát mới',
          ownerText: 'Phòng QLRR',
          frequency: 'Hàng ngày',
          objective: 'Phòng ngừa',
          method: 'Tự động',
          designEff: 'Hiệu quả',
          operatingEff: 'Hiệu quả',
          overallEff: 'Hiệu quả',
          needsSupplement: false,
        },
        2026,
        adminActor,
        undefined,
        appClient.db
      );
      expect(res.code).toBe('HD11.R27.KS99');
      expect(res.overallEff).toBe('Hiệu quả');
    });

    it('Liên kết kiểm soát tới nguyên nhân hợp lệ (PUT .../controls/{code}/causes)', async () => {
      // Liên kết KS99 với NN01 và NN02
      const res = await linkControlCauses(
        'HD11.R27',
        'HD11.R27.KS99',
        ['HD11.R27.NN01', 'HD11.R27.NN02'],
        2026,
        adminActor,
        undefined,
        appClient.db
      );

      expect(res.causeCodes).toContain('HD11.R27.NN01');
      expect(res.causeCodes).toContain('HD11.R27.NN02');
    });

    it('Liên kết tới mã hồ sơ khác hoặc mã không tồn tại báo 422 VALIDATION', async () => {
      await expect(
        linkControlCauses(
          'HD11.R27',
          'HD11.R27.KS99',
          ['CN02.R13.NN01'],
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('Xóa kiểm soát còn liên kết nguyên nhân báo 409 REFERENCED', async () => {
      await expect(
        deleteControl('HD11.R27', 'HD11.R27.KS99', 2026, adminActor, undefined, appClient.db)
      ).rejects.toMatchObject({ code: 'REFERENCED' });
    });

    it('Gỡ liên kết rồi xóa kiểm soát thành công', async () => {
      // Gỡ liên kết: truyền mảng rỗng
      await linkControlCauses('HD11.R27', 'HD11.R27.KS99', [], 2026, adminActor, undefined, appClient.db);
      // Xóa
      await deleteControl('HD11.R27', 'HD11.R27.KS99', 2026, adminActor, undefined, appClient.db);
    });
  });

  // 4. KẾ HOẠCH HÀNH ĐỘNG (actions) VÀ LIÊN KẾT KS-KH
  describe('Kế hoạch hành động (actions) và liên kết KS-KH', () => {
    it('Tạo KH mới tính dueDate Quý I/2027 ra 2027-03-31', async () => {
      const res = await createActionPlan(
        'HD11.R27',
        {
          code: 'HD11.R27.KH99',
          description: 'Kế hoạch hành động mới',
          responsibilityText: 'Ban 4',
          deliverable: 'Báo cáo',
          dueText: 'Quý I/2027',
        },
        2026,
        adminActor,
        undefined,
        appClient.db
      );

      expect(res.code).toBe('HD11.R27.KH99');
      expect(res.dueText).toBe('Quý I/2027');
      expect(res.dueDate).toBe('2027-03-31');
      expect(res.tasks).toHaveLength(1);
      expect(res.tasks[0].name).toBe('Toàn bộ kế hoạch');
    });

    it('Liên kết KH tới kiểm soát hợp lệ (PUT .../actions/{code}/controls)', async () => {
      const res = await linkActionControls(
        'HD11.R27',
        'HD11.R27.KH99',
        ['HD11.R27.KS01'],
        2026,
        adminActor,
        undefined,
        appClient.db
      );
      expect(res.controlCodes).toContain('HD11.R27.KS01');
    });

    it('Xóa KH chưa có bản cập nhật thì xóa mềm cả đầu việc và gỡ liên kết action_control', async () => {
      await deleteActionPlan('HD11.R27', 'HD11.R27.KH99', 2026, adminActor, undefined, appClient.db);

      // Kiểm tra đầu việc của KH99 đã bị soft-delete
      const [act] = await appClient.db
        .select()
        .from(actionPlan)
        .where(eq(actionPlan.code, 'HD11.R27.KH99'));
      expect(act.deletedAt).not.toBeNull();

      const tasks = await appClient.db
        .select()
        .from(actionTask)
        .where(eq(actionTask.actionId, act.id));
      for (const t of tasks) {
        expect(t.deletedAt).not.toBeNull();
      }

      // Kiểm tra liên kết actionControl đã bị gỡ
      const links = await appClient.db
        .select()
        .from(actionControl)
        .where(eq(actionControl.actionId, act.id));
      expect(links).toHaveLength(0);
    });

    it('Xóa KH có đầu việc đã có bản cập nhật bị từ chối 409 REFERENCED', async () => {
      // Lấy KH01
      const [act] = await appClient.db
        .select()
        .from(actionPlan)
        .where(and(eq(actionPlan.code, 'HD11.R27.KH01'), isNull(actionPlan.deletedAt)));
      const [task] = await appClient.db
        .select()
        .from(actionTask)
        .where(and(eq(actionTask.actionId, act.id), isNull(actionTask.deletedAt)));

      // Tạo 1 action_update giả
      const ownerSql = (await import('postgres')).default(process.env.DATABASE_TEST_MIGRATE_URL!, { max: 1 });
      await ownerSql`INSERT INTO action_update (task_id, period_key, progress, status) VALUES (${task.id}, '2026-Q4', 50, 'pending')`;
      await ownerSql.end();

      await expect(
        deleteActionPlan('HD11.R27', 'HD11.R27.KH01', 2026, adminActor, undefined, appClient.db)
      ).rejects.toMatchObject({ code: 'REFERENCED' });
    });
  });

  // 5. CHỈ SỐ (indicators)
  describe('Chỉ số (indicators)', () => {
    it('Tạo chỉ số mới KRI tính zone_rules auto', async () => {
      const res = await createIndicator(
        'HD11.R27',
        {
          code: 'HD11.R27.KRI99',
          name: 'Chỉ số rủi ro mới',
          formula: 'Số lượng / Tổng',
          frequency: 'Tháng',
          thresholds: {
            green: '≤ 5%',
            yellow: '> 5% - 10%',
            red: '> 10%',
          },
          note: null,
        },
        2026,
        adminActor,
        undefined,
        appClient.db
      );

      expect(res.code).toBe('HD11.R27.KRI99');
      expect(res.kind).toBe('kri');
      expect(res.periodKind).toBe('month');
      expect(res.mode).toBe('auto');
    });

    it('Tạo chỉ số với ngưỡng không tự động thì zoneMode là manual', async () => {
      const res = await createIndicator(
        'HD11.R27',
        {
          code: 'HD11.R27.KRI98',
          name: 'Chỉ số rủi ro manual',
          formula: 'Mô tả',
          frequency: 'Quý',
          thresholds: {
            green: 'Không phát sinh',
            yellow: 'Phát sinh 01',
            red: 'Phát sinh ≥ 02',
          },
          note: 'Chỉ số định tính',
        },
        2026,
        adminActor,
        undefined,
        appClient.db
      );

      expect(res.code).toBe('HD11.R27.KRI98');
      expect(res.periodKind).toBe('quarter');
      expect(res.mode).toBe('manual');
    });

    it('Đổi ngưỡng tính lại zone_rules thành công', async () => {
      const res = await updateIndicator(
        'HD11.R27',
        'HD11.R27.KRI99',
        {
          name: 'Chỉ số rủi ro mới (đã sửa)',
          formula: 'Công thức mới',
          frequency: 'Tháng',
          thresholds: {
            green: '≤ 2%',
            yellow: '> 2% - 8%',
            red: '> 8%',
          },
          note: 'Ghi chú',
        },
        2026,
        adminActor,
        undefined,
        appClient.db
      );

      expect(res.mode).toBe('auto');
      expect(res.thresholds.green).toBe('≤ 2%');
    });

    it('Đổi tần suất làm đổi loại kỳ khi đã có bản nộp báo 409 INVALID_STATE', async () => {
      const [ind] = await appClient.db
        .select()
        .from(indicator)
        .where(eq(indicator.code, 'HD11.R27.KRI99'));

      // Chèn 1 bản nộp giả cho chỉ số KRI99
      const ownerSql = (await import('postgres')).default(process.env.DATABASE_TEST_MIGRATE_URL!, { max: 1 });
      await ownerSql`INSERT INTO indicator_reading (indicator_id, period_key, value_num, zone, status) VALUES (${ind.id}, '2026-10', 1, 'green', 'approved')`;
      await ownerSql.end();

      // Thử đổi từ 'Tháng' sang 'Quý'
      await expect(
        updateIndicator(
          'HD11.R27',
          'HD11.R27.KRI99',
          {
            name: 'Đổi tần suất',
            formula: 'Công thức',
            frequency: 'Quý',
            thresholds: {
              green: '≤ 2%',
              yellow: '> 2% - 8%',
              red: '> 8%',
            },
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        )
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });

    it('Xóa chỉ số đã có bản nộp báo 409 REFERENCED', async () => {
      await expect(
        deleteIndicator('HD11.R27', 'HD11.R27.KRI99', 2026, adminActor, undefined, appClient.db)
      ).rejects.toMatchObject({ code: 'REFERENCED' });
    });

    it('Xóa chỉ số chưa có bản nộp thành công', async () => {
      await deleteIndicator('HD11.R27', 'HD11.R27.KRI98', 2026, adminActor, undefined, appClient.db);
    });

    describe('setIndicatorTargets (4C.2)', () => {
      it('Admin thiết lập ngưỡng số và chiều cho KRI thành công', async () => {
        const res = await setIndicatorTargets(
          'HD11.R27',
          'HD11.R27.KRI01',
          {
            unitKind: 'count',
            unitLabel: 'vụ việc',
            direction: 'higher_is_worse',
            yellowAt: 1,
            redAt: 2,
            targetValue: null,
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        );

        expect(res.code).toBe('HD11.R27.KRI01');
        expect(res.unitKind).toBe('count');
        expect(res.unitLabel).toBe('vụ việc');
        expect(res.direction).toBe('higher_is_worse');
        expect(res.yellowAt).toBe(1);
        expect(res.redAt).toBe(2);
        expect(res.targetValue).toBeNull();
        expect(res.mode).toBe('auto');
      });

      it('Admin thiết lập mục tiêu và ngưỡng cho KCI thành công', async () => {
        const res = await setIndicatorTargets(
          'HD11.R27',
          'HD11.R27.KCI02',
          {
            unitKind: 'percent',
            unitLabel: '%',
            direction: 'lower_is_worse',
            yellowAt: 95,
            redAt: 80,
            targetValue: 100,
          },
          2026,
          adminActor,
          undefined,
          appClient.db
        );

        expect(res.code).toBe('HD11.R27.KCI02');
        expect(res.unitKind).toBe('percent');
        expect(res.unitLabel).toBe('%');
        expect(res.direction).toBe('lower_is_worse');
        expect(res.yellowAt).toBe(95);
        expect(res.redAt).toBe(80);
        expect(res.targetValue).toBe(100);
        expect(res.mode).toBe('auto');
      });

      it('Từ chối targetValue !== null với KRI (422 VALIDATION)', async () => {
        await expect(
          setIndicatorTargets(
            'HD11.R27',
            'HD11.R27.KRI01',
            {
              unitKind: 'count',
              unitLabel: 'vụ việc',
              direction: 'higher_is_worse',
              yellowAt: 1,
              redAt: 2,
              targetValue: 10,
            },
            2026,
            adminActor,
            undefined,
            appClient.db
          )
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      });

      it('Từ chối khi yellowAt và redAt không cùng có hoặc cùng null (422 VALIDATION)', async () => {
        await expect(
          setIndicatorTargets(
            'HD11.R27',
            'HD11.R27.KRI01',
            {
              unitKind: 'count',
              unitLabel: 'vụ việc',
              direction: 'higher_is_worse',
              yellowAt: 1,
              redAt: null,
              targetValue: null,
            },
            2026,
            adminActor,
            undefined,
            appClient.db
          )
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      });

      it('Từ chối khi sai thứ tự ngưỡng theo chiều (422 VALIDATION)', async () => {
        // higher_is_worse nhưng yellow >= red
        await expect(
          setIndicatorTargets(
            'HD11.R27',
            'HD11.R27.KRI01',
            {
              unitKind: 'count',
              unitLabel: 'vụ việc',
              direction: 'higher_is_worse',
              yellowAt: 5,
              redAt: 2,
              targetValue: null,
            },
            2026,
            adminActor,
            undefined,
            appClient.db
          )
        ).rejects.toMatchObject({ code: 'VALIDATION' });

        // lower_is_worse nhưng yellow <= red
        await expect(
          setIndicatorTargets(
            'HD11.R27',
            'HD11.R27.KCI02',
            {
              unitKind: 'percent',
              unitLabel: '%',
              direction: 'lower_is_worse',
              yellowAt: 80,
              redAt: 95,
              targetValue: 100,
            },
            2026,
            adminActor,
            undefined,
            appClient.db
          )
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      });

      it('Từ chối khi ban4 gọi setIndicatorTargets (403 FORBIDDEN)', async () => {
        await expect(
          setIndicatorTargets(
            'HD11.R27',
            'HD11.R27.KRI01',
            {
              unitKind: 'count',
              unitLabel: 'vụ việc',
              direction: 'higher_is_worse',
              yellowAt: 1,
              redAt: 2,
              targetValue: null,
            },
            2026,
            ban4Actor,
            undefined,
            appClient.db
          )
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      });
    });
  });
});

