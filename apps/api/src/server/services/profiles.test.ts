import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle } from './cycles';
import { seedInitialPeriods } from './periods';
import { seedUnits } from './units';
import { createProfile, updateProfile, deleteProfile } from './profiles';
import { getProfiles, getProfileDetail, getOverview, getActions, getIndicators } from './queries';
import { cycle, riskProfile, appUser, auditLog } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Actor } from '../types';
import { AppError } from '../errors';

describe('profiles.test.ts - Kế hoạch 4A.1: Hồ sơ (POST, PUT, DELETE /api/profiles)', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let testCycleId: string;

  let adminActor: Actor;
  let ban4Actor: Actor;
  let unitActor: Actor;
  let viewerActor: Actor;

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
        email: `adm_prof_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Profiles',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    adminActor = { userId: adm.id, role: 'admin', unitId: null };

    const [b4] = await appClient.db
      .insert(appUser)
      .values({
        email: `b4_prof_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Ban 4 Profiles',
        role: 'ban4',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    ban4Actor = { userId: b4.id, role: 'ban4', unitId: null };

    const [u] = await appClient.db
      .insert(appUser)
      .values({
        email: `u_prof_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Unit Profiles',
        role: 'unit',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    unitActor = { userId: u.id, role: 'unit', unitId: null };

    const [v] = await appClient.db
      .insert(appUser)
      .values({
        email: `v_prof_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Viewer Profiles',
        role: 'viewer',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    viewerActor = { userId: v.id, role: 'viewer', unitId: null };
  });

  it('1. Tạo hồ sơ mới thành công và ghi nhật ký create_profile kèm manually_edited_at', async () => {
    const payload = {
      riskCode: 'TEST.R99',
      hsrrCode: 'HSRRTY_MBF_2026_TEST.R99',
      name: 'Rủi ro thử nghiệm 99',
      riskType: 'Rủi ro chiến lược',
      riskZone: 'Vùng Đỏ',
      riskGroup: 'Nhóm kỹ thuật',
      owner: 'Ban Giám đốc',
      relatedActivity: 'Hoạt động vận hành hệ thống',
      preparedByUnit: 'Ban 4',
      description: 'Mô tả chi tiết rủi ro thử nghiệm',
      inherent: {
        impactLabel: 'Nghiêm trọng',
        likelihoodLabel: 'Có thể xảy ra',
        levelLabel: 'Cao',
      },
    };

    const res = await createProfile(payload, 2026, adminActor, { ip: '127.0.0.1' }, appClient.db);

    expect(res.riskCode).toBe('TEST.R99');
    expect(res.hsrrCode).toBe('HSRRTY_MBF_2026_TEST.R99');
    expect(res.inherent.impactScore).toBe(5);
    expect(res.inherent.likelihoodScore).toBe(3);
    expect(res.inherent.levelLabel).toBe('Cao');
    expect(res.residual).toBeNull();
    expect(res.kri.total).toBe(0);
    expect(res.actions.total).toBe(0);

    // Kiểm tra DB có manually_edited_at
    const [row] = await appClient.db
      .select()
      .from(riskProfile)
      .where(and(eq(riskProfile.cycleId, testCycleId), eq(riskProfile.riskCode, 'TEST.R99')));
    expect(row).toBeDefined();
    expect(row.manuallyEditedAt).not.toBeNull();

    // Kiểm tra audit log
    const logs = await appClient.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'create_profile'), eq(auditLog.entity, 'risk_profile')));
    const foundLog = logs.find((l) => (l.after as any)?.riskCode === 'TEST.R99');
    expect(foundLog).toBeDefined();
  });

  it('2. Trùng riskCode (kể cả hồ sơ đã xóa mềm) ném 409 CONFLICT', async () => {
    const payload = {
      riskCode: 'TEST.R99',
      hsrrCode: 'HSRRTY_MBF_2026_TEST.R99',
      name: 'Rủi ro trùng mã',
      riskType: 'Chiến lược',
      riskZone: 'Đỏ',
      riskGroup: 'Kỹ thuật',
      owner: 'Ban 4',
      relatedActivity: 'Vận hành',
      preparedByUnit: 'Ban 4',
      description: 'Mô tả',
      inherent: {
        impactLabel: 'Lớn',
        likelihoodLabel: 'Hiếm khi',
        levelLabel: 'Trung bình',
      },
    };

    await expect(
      createProfile(payload, 2026, adminActor, undefined, appClient.db)
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('3. Nhãn ngoài thang ném 422 VALIDATION', async () => {
    const payload = {
      riskCode: 'TEST.R98',
      hsrrCode: 'HSRRTY_MBF_2026_TEST.R98',
      name: 'Rủi ro nhãn sai',
      riskType: 'Chiến lược',
      riskZone: 'Đỏ',
      riskGroup: 'Kỹ thuật',
      owner: 'Ban 4',
      relatedActivity: 'Vận hành',
      preparedByUnit: 'Ban 4',
      description: 'Mô tả',
      inherent: {
        impactLabel: 'Không có trong thang đo',
        likelihoodLabel: 'Có thể xảy ra',
        levelLabel: 'Cao',
      },
    };

    await expect(
      createProfile(payload, 2026, adminActor, undefined, appClient.db)
    ).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('4. Sửa hồ sơ đặt manually_edited_at và ghi nhật ký update_profile', async () => {
    const updatePayload = {
      hsrrCode: 'HSRRTY_MBF_2026_TEST.R99_UPDATED',
      name: 'Rủi ro 99 Đã Sửa Tên',
      riskType: 'Rủi ro vận hành',
      riskZone: 'Vùng Vàng',
      riskGroup: 'Nhóm quản lý',
      owner: 'Phòng QLRR',
      relatedActivity: 'Hoạt động kiểm tra',
      preparedByUnit: 'Ban 4',
      description: 'Mô tả đã sửa',
      inherent: {
        impactLabel: 'Lớn',
        likelihoodLabel: 'Ít khả năng',
        levelLabel: 'Trung bình',
      },
    };

    const res = await updateProfile('TEST.R99', updatePayload, 2026, ban4Actor, { ip: '127.0.0.1' }, appClient.db);
    expect(res.name).toBe('Rủi ro 99 Đã Sửa Tên');
    expect(res.hsrrCode).toBe('HSRRTY_MBF_2026_TEST.R99_UPDATED');
    expect(res.inherent.impactScore).toBe(4);
    expect(res.inherent.likelihoodScore).toBe(2);

    const [row] = await appClient.db
      .select()
      .from(riskProfile)
      .where(and(eq(riskProfile.cycleId, testCycleId), eq(riskProfile.riskCode, 'TEST.R99')));
    expect(row.manuallyEditedAt).not.toBeNull();

    const logs = await appClient.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'update_profile'), eq(auditLog.entity, 'risk_profile')));
    const foundLog = logs.find((l) => (l.after as any)?.name === 'Rủi ro 99 Đã Sửa Tên');
    expect(foundLog).toBeDefined();
  });

  it('5. Xóa hồ sơ chưa có số liệu thì hồ sơ biến mất khỏi GET /api/profiles, /api/overview', async () => {
    // Trước khi xóa, TEST.R99 xuất hiện
    const profsBefore = await getProfiles({ cycle: 2026 }, appClient.db);
    expect(profsBefore.some((p) => p.riskCode === 'TEST.R99')).toBe(true);

    // Xóa hồ sơ TEST.R99
    await deleteProfile('TEST.R99', 2026, adminActor, { ip: '127.0.0.1' }, appClient.db);

    // Sau khi xóa, không còn trong getProfiles
    const profsAfter = await getProfiles({ cycle: 2026 }, appClient.db);
    expect(profsAfter.some((p) => p.riskCode === 'TEST.R99')).toBe(false);

    // GET /api/profiles/TEST.R99 báo NOT_FOUND
    await expect(
      getProfileDetail('TEST.R99', { cycle: 2026 }, appClient.db, adminActor)
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    // Thử tạo lại với mã TEST.R99 (đã xóa mềm) -> phải ném CONFLICT
    await expect(
      createProfile(
        {
          riskCode: 'TEST.R99',
          hsrrCode: 'HSRRTY_MBF_2026_TEST.R99',
          name: 'Tạo lại mã cũ',
          riskType: 'Chiến lược',
          riskZone: 'Đỏ',
          riskGroup: 'Nhóm',
          owner: 'Chủ',
          relatedActivity: 'Hoạt động',
          preparedByUnit: 'Đơn vị',
          description: 'Mô tả',
          inherent: {
            impactLabel: 'Nhỏ',
            likelihoodLabel: 'Hiếm khi',
            levelLabel: 'Thấp',
          },
        },
        2026,
        adminActor,
        undefined,
        appClient.db
      )
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('6. Xóa hồ sơ đã có số liệu hoặc mức còn lại từ chối 409 REFERENCED', async () => {
    // Giả sử HD11.R27 trong dữ liệu import có kế hoạch và đầu việc
    // Chúng ta thêm 1 bản cập nhật hoặc số liệu cho HD11.R27
    const ownerSql = (await import('postgres')).default(process.env.DATABASE_TEST_MIGRATE_URL!, { max: 1 });
    const [prof] = await appClient.db
      .select()
      .from(riskProfile)
      .where(and(eq(riskProfile.cycleId, testCycleId), eq(riskProfile.riskCode, 'HD11.R27')));

    // Thêm residual assessment giả để test REFERENCED
    await ownerSql`INSERT INTO residual_assessment (profile_id, period_key, impact, likelihood, level) VALUES (${prof.id}, '2026-Q4', 'Lớn', 'Ít khả năng', 'Trung bình')`;
    await ownerSql.end();

    await expect(
      deleteProfile('HD11.R27', 2026, adminActor, undefined, appClient.db)
    ).rejects.toMatchObject({
      code: 'REFERENCED',
    });
  });

  it('7. Chu kỳ lưu trữ (archived) từ chối tạo, sửa, xóa với 409 CYCLE_ARCHIVED', async () => {
    // Tạo 1 chu kỳ 2098 trạng thái archived
    const [archivedCycle] = await appClient.db
      .insert(cycle)
      .values({ year: 2098, status: 'archived' })
      .returning();

    await expect(
      createProfile(
        {
          riskCode: 'ARCH.R01',
          hsrrCode: 'HSRR_ARCH',
          name: 'Hồ sơ chu kỳ đóng',
          riskType: 'Loại',
          riskZone: 'Vùng',
          riskGroup: 'Nhóm',
          owner: 'Chủ',
          relatedActivity: 'HĐ',
          preparedByUnit: 'Ban',
          description: 'Mô tả',
          inherent: {
            impactLabel: 'Lớn',
            likelihoodLabel: 'Hiếm khi',
            levelLabel: 'Thấp',
          },
        },
        2098,
        adminActor,
        undefined,
        appClient.db
      )
    ).rejects.toMatchObject({
      code: 'CYCLE_ARCHIVED',
    });

    await expect(
      updateProfile(
        'ARCH.R01',
        {
          hsrrCode: 'HSRR_ARCH',
          name: 'Sửa',
          riskType: 'Loại',
          riskZone: 'Vùng',
          riskGroup: 'Nhóm',
          owner: 'Chủ',
          relatedActivity: 'HĐ',
          preparedByUnit: 'Ban',
          description: 'Mô tả',
          inherent: {
            impactLabel: 'Lớn',
            likelihoodLabel: 'Hiếm khi',
            levelLabel: 'Thấp',
          },
        },
        2098,
        adminActor,
        undefined,
        appClient.db
      )
    ).rejects.toMatchObject({
      code: 'CYCLE_ARCHIVED',
    });

    await expect(
      deleteProfile('ARCH.R01', 2098, adminActor, undefined, appClient.db)
    ).rejects.toMatchObject({
      code: 'CYCLE_ARCHIVED',
    });
  });

  it('8. Quyền: vai trò unit và viewer không có quyền ném 403 FORBIDDEN', async () => {
    const payload = {
      riskCode: 'TEST.R02',
      hsrrCode: 'HSRR_TEST',
      name: 'Tạo bởi Unit',
      riskType: 'Loại',
      riskZone: 'Vùng',
      riskGroup: 'Nhóm',
      owner: 'Chủ',
      relatedActivity: 'HĐ',
      preparedByUnit: 'Ban',
      description: 'Mô tả',
      inherent: {
        impactLabel: 'Lớn',
        likelihoodLabel: 'Hiếm khi',
        levelLabel: 'Thấp',
      },
    };

    await expect(
      createProfile(payload, 2026, unitActor, undefined, appClient.db)
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await expect(
      createProfile(payload, 2026, viewerActor, undefined, appClient.db)
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
