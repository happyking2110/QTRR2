import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomClient } from '../db/client';
import { runMigrations } from '../db/migrate';
import { importCycle, cloneCycle, archiveCycle } from './cycles';
import { updateCause, deleteIndicator } from './sub-items';
import { createTask } from './tasks';
import {
  cycle,
  riskProfile,
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
  period,
  unitAssignment,
  appUser,
} from '../db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Actor } from '../types';

describe('cycles-4a.test.ts - Kế hoạch 4A.4: Quản lý chu kỳ (import, clone, archive)', () => {
  let appClient: ReturnType<typeof createCustomClient>;
  let adminActor: Actor;
  let excelBuffer: Buffer;

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

    const excelPath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
      : fs.existsSync(path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx')
      : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
    excelBuffer = fs.readFileSync(excelPath);

    const [adm] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm_cycle4a_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin Cycle 4A',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
      })
      .returning();
    adminActor = { userId: adm.id, role: 'admin', unitId: null };
  });

  it('1. Import file thật vào năm 2099 đúng số bản ghi 4/16/15/17/10/10/9/12 và cảnh báo đúng 5 MANUAL_ZONE và 7 LINK_ONE_SIDED', async () => {
    const report = await importCycle(
      {
        year: 2099,
        file: excelBuffer,
        actor: adminActor,
      },
      appClient.db
    );

    expect(report.year).toBe(2099);
    expect(report.counts.profiles).toBe(4);
    expect(report.counts.causes).toBe(16);
    expect(report.counts.impacts).toBe(15);
    expect(report.counts.controls).toBe(17);
    expect(report.counts.actions).toBe(10);
    expect(report.counts.tasksCreated).toBe(10);
    expect(report.counts.kri).toBe(9);
    expect(report.counts.kci).toBe(12);
    expect(report.counts.periodsCreated).toBe(0);

    // S2: importCycle không tự động tạo kỳ, số kỳ năm 2099 trong DB phải là 0
    const [periodsCount2099] = await appClient.db
      .select({ count: sql<number>`count(*)::int` })
      .from(period)
      .where(eq(period.cycleId, report.cycleId));
    expect(periodsCount2099.count).toBe(0);

    // Kiểm tra cảnh báo
    const manualZoneWarnings = report.issues.filter((i) => i.code === 'MANUAL_ZONE');
    const linkOneSidedWarnings = report.issues.filter((i) => i.code === 'LINK_ONE_SIDED');

    expect(manualZoneWarnings).toHaveLength(5);
    expect(linkOneSidedWarnings).toHaveLength(7);

    // Mọi issue phải có code thuộc danh sách quy định
    const validCodes = [
      'LINK_ONE_SIDED',
      'MANUAL_ZONE',
      'NO_DUE_DATE',
      'SKIPPED_EDITED',
      'SKIPPED_DELETED',
      'BAD_REFERENCE',
      'DUPLICATE_CODE',
      'BAD_PREFIX',
      'MISSING_CODE',
      'UNKNOWN_SCALE_LABEL',
      'UNKNOWN_FREQUENCY',
      'EMPTY_SECTION',
    ];
    for (const issue of report.issues) {
      expect(validCodes).toContain(issue.code);
    }
  });

  it('2. Sửa tay một nguyên nhân rồi import lại: nội dung sửa tay giữ nguyên và có SKIPPED_EDITED', async () => {
    // Sửa nguyên nhân HD11.R27.NN01 trong năm 2099
    await updateCause(
      'HD11.R27',
      'HD11.R27.NN01',
      {
        group: 'Nhóm sửa tay 2099',
        description: 'Mô tả sửa tay đặc biệt 2099',
      },
      2099,
      adminActor,
      undefined,
      appClient.db
    );

    // Import lại cùng file vào năm 2099
    const reportReimport = await importCycle(
      {
        year: 2099,
        file: excelBuffer,
        actor: adminActor,
      },
      appClient.db
    );

    // Phải có cảnh báo SKIPPED_EDITED cho HD11.R27.NN01
    const skippedEdited = reportReimport.issues.find(
      (i) => i.code === 'SKIPPED_EDITED' && i.ref === 'HD11.R27.NN01'
    );
    expect(skippedEdited).toBeDefined();

    // Kiểm tra trong DB: nội dung sửa tay vẫn giữ nguyên
    const [cRow] = await appClient.db
      .select()
      .from(cause)
      .where(eq(cause.code, 'HD11.R27.NN01'));
    expect(cRow.causeGroup).toBe('Nhóm sửa tay 2099');
    expect(cRow.description).toBe('Mô tả sửa tay đặc biệt 2099');
  });

  it('3. Xóa mềm một chỉ số rồi import lại: không sống lại, có SKIPPED_DELETED', async () => {
    // Xóa mềm chỉ số TT07.R46.KRI03 (chưa có bản nộp nào trong 2099)
    await deleteIndicator('TT07.R46', 'TT07.R46.KRI03', 2099, adminActor, undefined, appClient.db);

    // Import lại
    const reportReimport = await importCycle(
      {
        year: 2099,
        file: excelBuffer,
        actor: adminActor,
      },
      appClient.db
    );

    // Phải có cảnh báo SKIPPED_DELETED cho TT07.R46.KRI03
    const skippedDeleted = reportReimport.issues.find(
      (i) => i.code === 'SKIPPED_DELETED' && i.ref === 'TT07.R46.KRI03'
    );
    expect(skippedDeleted).toBeDefined();

    // Kiểm tra trong DB: chỉ số vẫn là deleted (deletedAt !== null)
    const [indRow] = await appClient.db
      .select()
      .from(indicator)
      .where(eq(indicator.code, 'TT07.R46.KRI03'));
    expect(indRow.deletedAt).not.toBeNull();
  });

  it('4. Nhân bản chu kỳ sang năm mới (2099 -> 2098) và kiểm tra lỗi trùng (409 CONFLICT)', async () => {
    // Thử nhân bản sang 2099 đã tồn tại -> 409 CONFLICT
    await expect(
      cloneCycle(2099, 2099, adminActor, undefined, appClient.db)
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // Nhân bản sang 2098 mới
    const cloneReport = await cloneCycle(2099, 2098, adminActor, undefined, appClient.db);

    expect(cloneReport.year).toBe(2098);
    expect(cloneReport.counts.profiles).toBe(4);
    expect(cloneReport.counts.causes).toBe(16);
    expect(cloneReport.counts.impacts).toBe(15);
    expect(cloneReport.counts.controls).toBe(17);
    expect(cloneReport.counts.actions).toBe(10);
    // 9 kri trừ 1 chỉ số KRI03 đã bị xóa mềm trước đó = 8 kri
    expect(cloneReport.counts.kri).toBe(8);
    expect(cloneReport.counts.kci).toBe(12);
    expect(cloneReport.counts.periodsCreated).toBe(16);

    // Kiểm tra trong DB 2098: manually_edited_at đều là null
    const [cyc2098] = await appClient.db.select().from(cycle).where(eq(cycle.year, 2098));
    const causes2098 = await appClient.db
      .select()
      .from(cause)
      .innerJoin(riskProfile, eq(cause.profileId, riskProfile.id))
      .where(eq(riskProfile.cycleId, cyc2098.id));

    for (const c of causes2098) {
      expect(c.cause.manuallyEditedAt).toBeNull();
    }
  });

  it('5. Lưu trữ chu kỳ còn bản nộp pending báo 409 INVALID_STATE, không còn bản pending thì thành công', async () => {
    // Lấy 1 chỉ số của 2098 và chèn 1 reading pending
    const [ind] = await appClient.db
      .select()
      .from(indicator)
      .innerJoin(riskProfile, eq(indicator.profileId, riskProfile.id))
      .where(eq(riskProfile.cycleId, (await appClient.db.select().from(cycle).where(eq(cycle.year, 2098)))[0].id));

    const ownerSql = (await import('postgres')).default(process.env.DATABASE_TEST_MIGRATE_URL!, { max: 1 });
    await ownerSql`INSERT INTO indicator_reading (indicator_id, period_key, value_num, zone, status) VALUES (${ind.indicator.id}, '2098-10', 50, 'green', 'pending')`;
    await ownerSql.end();

    // Thử lưu trữ 2098 -> 409 INVALID_STATE
    await expect(
      archiveCycle(2098, adminActor, undefined, appClient.db)
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });

    // Xóa bản pending
    const ownerSql2 = (await import('postgres')).default(process.env.DATABASE_TEST_MIGRATE_URL!, { max: 1 });
    await ownerSql2`DELETE FROM indicator_reading WHERE indicator_id = ${ind.indicator.id}`;
    await ownerSql2.end();

    // Lưu trữ thành công
    const archived = await archiveCycle(2098, adminActor, undefined, appClient.db);
    expect(archived.status).toBe('archived');

    // Thao tác ghi trên chu kỳ đã lưu trữ bị chặn 409 CYCLE_ARCHIVED
    await expect(
      createTask(
        'HD11.R27',
        'HD11.R27.KH01',
        { name: 'Đầu việc mới', unitCode: null, dueDate: null },
        2098,
        adminActor,
        undefined,
        appClient.db
      )
    ).rejects.toMatchObject({ code: 'CYCLE_ARCHIVED' });
  });
});
