import { describe, it, expect, beforeAll } from 'vitest';
import postgres from 'postgres';
import { createCustomClient, type CustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import {
  cycle,
  riskProfile,
  cause,
  impact,
  control,
  actionPlan,
  actionTask,
  indicator,
  auditLog,
  appUser,
} from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import crypto from 'crypto';
import type { Actor } from '../types';
import { createProfile, updateProfile, deleteProfile } from './profiles';
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
} from './sub-items';
import { createTask, updateTask, deleteTask, splitTask } from './tasks';
import { cloneCycle, archiveCycle } from './cycles';

describe('audit-4a.test.ts - Kế hoạch 4A.6: Kiểm chứng nhật ký của các thao tác ghi 4A', () => {
  let ownerSql: postgres.Sql;
  let appClient: CustomClient;
  let adminActor: Actor;
  let cycleId: string;

  beforeAll(async () => {
    const testMigrateUrl = process.env.DATABASE_TEST_MIGRATE_URL;
    const testAppUrl = process.env.DATABASE_TEST_URL;
    if (!testMigrateUrl || !testAppUrl) {
      throw new Error('Thiếu DATABASE_TEST_MIGRATE_URL hoặc DATABASE_TEST_URL');
    }

    await runMigrations(testMigrateUrl);
    ownerSql = postgres(testMigrateUrl, { max: 1 });
    await ownerSql`TRUNCATE TABLE audit_log, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, unit_assignment, unit, cycle, app_user CASCADE`;

    appClient = createCustomClient(testAppUrl);

    // Tạo admin user
    const [adm] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm_audit4a_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Audit 4A',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    adminActor = { userId: adm.id, role: 'admin', unitId: null };

    // Tạo chu kỳ 2026
    const [c] = await appClient.db
      .insert(cycle)
      .values({ year: 2026, status: 'open' })
      .returning();
    cycleId = c.id;
  });

  async function getLastAuditLog() {
    const [last] = await appClient.db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.id))
      .limit(1);
    return last;
  }

  it('1. create_profile, update_profile, delete_profile ghi nhật ký chuẩn xác', async () => {
    // 1.1 create_profile
    await createProfile(
      {
        riskCode: 'AU01.R01',
        hsrrCode: 'HSRRTY_MBF_2026_AU01.R01',
        name: 'Rủi ro kiểm thử nhật ký',
        riskType: 'Chiến lược',
        riskZone: 'Đỏ',
        riskGroup: 'Nhóm 1',
        owner: 'Ban CNTT',
        relatedActivity: 'Chuyển đổi số',
        preparedByUnit: 'Ban CNTT',
        description: 'Mô tả rủi ro',
        inherent: {
          impactLabel: 'Nghiêm trọng',
          likelihoodLabel: 'Có thể xảy ra',
          levelLabel: 'Cao',
        },
      },
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );

    const logCreate = await getLastAuditLog();
    expect(logCreate.action).toBe('create_profile');
    expect(logCreate.entity).toBe('risk_profile');
    expect(logCreate.userId).toBe(adminActor.userId);
    expect((logCreate.after as any).riskCode).toBe('AU01.R01');

    // 1.2 update_profile
    await updateProfile(
      'AU01.R01',
      {
        hsrrCode: 'HSRRTY_MBF_2026_AU01.R01',
        name: 'Rủi ro kiểm thử nhật ký (đã sửa)',
        riskType: 'Chiến lược',
        riskZone: 'Đỏ',
        riskGroup: 'Nhóm 1',
        owner: 'Ban CNTT',
        relatedActivity: 'Chuyển đổi số',
        preparedByUnit: 'Ban CNTT',
        description: 'Mô tả rủi ro đã sửa',
        inherent: {
          impactLabel: 'Lớn',
          likelihoodLabel: 'Ít khả năng',
          levelLabel: 'Trung bình',
        },
      },
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );

    const logUpdate = await getLastAuditLog();
    expect(logUpdate.action).toBe('update_profile');
    expect(logUpdate.entity).toBe('risk_profile');
    expect((logUpdate.before as any).name).toBe('Rủi ro kiểm thử nhật ký');
    expect((logUpdate.after as any).name).toBe('Rủi ro kiểm thử nhật ký (đã sửa)');

    // 1.3 delete_profile
    await deleteProfile('AU01.R01', 2026, adminActor, { ip: '127.0.0.1' }, appClient.db);
    const logDelete = await getLastAuditLog();
    expect(logDelete.action).toBe('delete_profile');
    expect(logDelete.entity).toBe('risk_profile');
    expect(logDelete.after).toBeNull();
  });

  it('2. CRUD các loại sub-items và liên kết ghi nhật ký chuẩn xác', async () => {
    // Tạo hồ sơ cho sub-items
    await createProfile(
      {
        riskCode: 'AU02.R02',
        hsrrCode: 'HSRRTY_MBF_2026_AU02.R02',
        name: 'Hồ sơ mục con',
        riskType: 'Hoạt động',
        riskZone: 'Vàng',
        riskGroup: 'Nhóm 2',
        owner: 'Ban QLCL',
        relatedActivity: 'Vận hành',
        preparedByUnit: 'Ban QLCL',
        description: 'Mô tả',
        inherent: {
          impactLabel: 'Trung bình',
          likelihoodLabel: 'Có thể xảy ra',
          levelLabel: 'Trung bình',
        },
      },
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );

    // 2.1 create_item & update_item & delete_item cho Cause
    await createCause(
      'AU02.R02',
      { code: 'AU02.R02.NN01', group: 'Nhóm NN', description: 'Nguyên nhân 1' },
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );
    let log = await getLastAuditLog();
    expect(log.action).toBe('create_item');
    expect(log.entity).toBe('cause');

    await updateCause(
      'AU02.R02',
      'AU02.R02.NN01',
      { group: 'Nhóm NN mới', description: 'Nguyên nhân đã sửa' },
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );
    log = await getLastAuditLog();
    expect(log.action).toBe('update_item');
    expect(log.entity).toBe('cause');

    // 2.2 create_item cho Control
    await createControl(
      'AU02.R02',
      {
        code: 'AU02.R02.KS01',
        description: 'Kiểm soát 1',
        ownerText: 'Ban QLCL',
        frequency: 'Tháng',
        objective: 'Mục tiêu',
        method: 'Thủ công',
        designEff: 'Hiệu quả',
        operatingEff: 'Hiệu quả',
        overallEff: 'Hiệu quả',
        needsSupplement: false,
      },
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );
    log = await getLastAuditLog();
    expect(log.action).toBe('create_item');
    expect(log.entity).toBe('control');

    // 2.3 link_control_causes
    await linkControlCauses(
      'AU02.R02',
      'AU02.R02.KS01',
      ['AU02.R02.NN01'],
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );
    log = await getLastAuditLog();
    expect(log.action).toBe('link_control_causes');
    expect(log.entity).toBe('control');

    // Gỡ link để xóa cause
    await linkControlCauses('AU02.R02', 'AU02.R02.KS01', [], 2026, adminActor, { ip: '127.0.0.1' }, appClient.db);
    await deleteCause('AU02.R02', 'AU02.R02.NN01', 2026, adminActor, { ip: '127.0.0.1' }, appClient.db);
    log = await getLastAuditLog();
    expect(log.action).toBe('delete_item');
    expect(log.entity).toBe('cause');

    // 2.4 ActionPlan và link_action_controls
    await createActionPlan(
      'AU02.R02',
      {
        code: 'AU02.R02.KH01',
        description: 'KH 1',
        responsibilityText: 'Ban QLCL',
        deliverable: 'Báo cáo',
        dueText: '31/12/2026',
      },
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );
    log = await getLastAuditLog();
    expect(log.action).toBe('create_item');
    expect(log.entity).toBe('action_plan');

    await linkActionControls(
      'AU02.R02',
      'AU02.R02.KH01',
      ['AU02.R02.KS01'],
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );
    log = await getLastAuditLog();
    expect(log.action).toBe('link_action_controls');
    expect(log.entity).toBe('action_plan');

    // 2.5 Indicator
    await createIndicator(
      'AU02.R02',
      {
        code: 'AU02.R02.KRI01',
        name: 'Chỉ số 1',
        formula: 'A / B',
        frequency: 'Tháng',
        thresholds: { green: '≤ 5%', yellow: '> 5% - 10%', red: '> 10%' },
      },
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );
    log = await getLastAuditLog();
    expect(log.action).toBe('create_item');
    expect(log.entity).toBe('indicator');

    await updateIndicator(
      'AU02.R02',
      'AU02.R02.KRI01',
      {
        name: 'Chỉ số 1 đã sửa',
        formula: 'A / B',
        frequency: 'Tháng',
        thresholds: { green: '≤ 3%', yellow: '> 3% - 8%', red: '> 8%' },
      },
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );
    log = await getLastAuditLog();
    expect(log.action).toBe('update_item');
    expect(log.entity).toBe('indicator');

    await deleteIndicator('AU02.R02', 'AU02.R02.KRI01', 2026, adminActor, { ip: '127.0.0.1' }, appClient.db);
    log = await getLastAuditLog();
    expect(log.action).toBe('delete_item');
    expect(log.entity).toBe('indicator');
  });

  it('3. Tasks CRUD và Split ghi nhật ký chuẩn xác', async () => {
    // 3.1 create_task
    const createdTask = await createTask(
      'AU02.R02',
      'AU02.R02.KH01',
      { name: 'Đầu việc 1', dueDate: '2026-12-31' },
      2026,
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );
    let log = await getLastAuditLog();
    expect(log.action).toBe('create_task');
    expect(log.entity).toBe('action_task');

    // 3.2 update_task
    await updateTask(
      createdTask.id,
      { name: 'Đầu việc 1 đã sửa' },
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );
    log = await getLastAuditLog();
    expect(log.action).toBe('update_task');
    expect(log.entity).toBe('action_task');

    // 3.3 split_task
    const splitResult = await splitTask(
      createdTask.id,
      {
        parts: [
          { name: 'Phần A' },
          { name: 'Phần B' },
        ],
      },
      adminActor,
      { ip: '127.0.0.1' },
      appClient.db
    );
    log = await getLastAuditLog();
    expect(log.action).toBe('split_task');
    expect(log.entity).toBe('action_task');

    // 3.4 delete_task
    await deleteTask(splitResult[1].id, adminActor, { ip: '127.0.0.1' }, appClient.db);
    log = await getLastAuditLog();
    expect(log.action).toBe('delete_task');
    expect(log.entity).toBe('action_task');
  });

  it('4. Clone và Archive chu kỳ ghi nhật ký chuẩn xác', async () => {
    // 4.1 clone_cycle sang năm 2097
    await cloneCycle(2026, 2097, adminActor, { ip: '127.0.0.1' }, appClient.db);
    let log = await getLastAuditLog();
    expect(log.action).toBe('clone_cycle');
    expect(log.entity).toBe('cycle');

    // 4.2 archive_cycle năm 2097
    await archiveCycle(2097, adminActor, { ip: '127.0.0.1' }, appClient.db);
    log = await getLastAuditLog();
    expect(log.action).toBe('archive_cycle');
    expect(log.entity).toBe('cycle');
  });
});
