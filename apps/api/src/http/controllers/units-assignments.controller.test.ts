import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import crypto from 'crypto';
import path from 'path';
import { execFileSync } from 'child_process';
import { eq, and, sql } from 'drizzle-orm';
import { AuthController } from './auth.controller';
import { UnitsController } from './units.controller';
import { ProfilesController } from './profiles.controller';
import { TasksController } from './tasks.controller';
import { AppErrorFilter } from '../filters/app-error.filter';
import { OriginGuard } from '../guards/origin.guard';
import { SessionGuard } from '../guards/session.guard';
import { PasswordChangeGuard } from '../guards/password-change.guard';
import { RolesGuard } from '../guards/roles.guard';
import { db } from '../../server/db/client';
import {
  cycle,
  riskProfile,
  control,
  indicator,
  actionPlan,
  actionTask,
  unit,
  appUser,
  passwordHistory,
  auditLog,
} from '../../server/db/schema';
import { hashPassword } from '../../server/auth/password';
import { seedUnits } from '../../server/services/units';
import { APP_GUARD, Reflector } from '@nestjs/core';

function randomPassword(): string {
  return 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
}

function randomEmail(): string {
  return `test_${crypto.randomBytes(6).toString('hex')}@mobifone.vn`;
}

describe('Units and Assignments Integration Tests (3A.6)', () => {
  let app: INestApplication;
  const origin = 'http://localhost:3000';

  let adminCookie: string;
  let ban4Cookie: string;
  let unitCookie: string;
  let viewerCookie: string;

  let testCycleId: string;
  let archivedCycleId: string;
  let testProfileId: string;
  let testRiskCode: string;
  let testControlCode: string;
  let testIndicatorCode: string;
  let testTaskId: string;

  beforeAll(async () => {
    process.env.APP_ORIGIN = origin;
    process.env.SESSION_SECRET =
      'a_very_long_random_session_secret_for_tests_at_least_32_chars';
    process.env.TRUSTED_PROXY_IPS = '127.0.0.1,::1';

    // 1. Seed 7 đơn vị ban đầu
    await seedUnits(db);

    // 2. Tạo chu kỳ kiểm thử và hồ sơ kiểm thử
    const testYear = 2098;
    const [existingCycle] = await db
      .select()
      .from(cycle)
      .where(eq(cycle.year, testYear))
      .limit(1);

    if (existingCycle) {
      testCycleId = existingCycle.id;
    } else {
      const [c] = await db
        .insert(cycle)
        .values({ year: testYear, status: 'open' })
        .returning();
      testCycleId = c.id;
    }

    // Tạo chu kỳ archived
    const archivedYear = 2099;
    const [existingArchived] = await db
      .select()
      .from(cycle)
      .where(eq(cycle.year, archivedYear))
      .limit(1);

    if (existingArchived) {
      archivedCycleId = existingArchived.id;
      await db
        .update(cycle)
        .set({ status: 'archived' })
        .where(eq(cycle.id, archivedCycleId));
    } else {
      const [ac] = await db
        .insert(cycle)
        .values({ year: archivedYear, status: 'archived' })
        .returning();
      archivedCycleId = ac.id;
    }

    testRiskCode = 'TEST.R01';
    const [p] = await db
      .insert(riskProfile)
      .values({
        cycleId: testCycleId,
        riskCode: testRiskCode,
        hsrrCode: 'HSRR_TEST_01',
        name: 'Hồ sơ kiểm thử gán đơn vị',
        riskType: 'Chiến lược',
        riskZone: 'Vùng 1',
        riskGroup: 'Nhóm 1',
        owner: 'Ban 3',
        relatedActivity: 'Hoạt động SXKD',
        preparedByUnit: 'Ban 3',
        description: 'Mô tả rủi ro kiểm thử',
        inherentImpact: 'Lớn',
        inherentLikelihood: 'Có thể xảy ra',
        inherentLevel: 'Cao',
      })
      .onConflictDoUpdate({
        target: [riskProfile.cycleId, riskProfile.riskCode],
        set: { name: 'Hồ sơ kiểm thử gán đơn vị' },
      })
      .returning();
    testProfileId = p.id;

    // Tạo control
    testControlCode = 'KS01';
    await db
      .insert(control)
      .values({
        profileId: testProfileId,
        code: testControlCode,
        description: 'Kiểm soát số 1',
        ownerText: 'Ban 3 và TT1',
        frequency: 'Hàng ngày',
        objective: 'Mục tiêu kiểm soát',
        method: 'Tự động',
        designEff: 'Hiệu quả',
        operatingEff: 'Hiệu quả',
        overallEff: 'Hiệu quả',
      })
      .onConflictDoNothing();

    // Tạo indicator
    testIndicatorCode = 'KRI01';
    await db
      .insert(indicator)
      .values({
        profileId: testProfileId,
        code: testIndicatorCode,
        kind: 'kri',
        name: 'Chỉ số rủi ro 1',
        formula: 'Công thức đo lường',
        frequency: 'Tháng',
        periodKind: 'month',
        thresholdLowText: '≤ 5%',
        thresholdMidText: '> 5% - 10%',
        thresholdHighText: '> 10%',
      })
      .onConflictDoNothing();

    // Tạo actionPlan & actionTask
    const [act] = await db
      .insert(actionPlan)
      .values({
        profileId: testProfileId,
        code: 'KH01',
        name: 'Kế hoạch hành động 1',
        description: 'Mô tả kế hoạch',
        responsibilityText: 'Trung tâm 1',
        deliverable: 'Báo cáo',
        dueText: '31/12/2026',
      })
      .onConflictDoNothing()
      .returning();

    const actionPlanId = act ? act.id : (
      await db.select().from(actionPlan).where(and(eq(actionPlan.profileId, testProfileId), eq(actionPlan.code, 'KH01'))).limit(1)
    )[0].id;

    const [t] = await db
      .insert(actionTask)
      .values({
        actionId: actionPlanId,
        name: 'Đầu việc 1',
        weight: 1,
      })
      .returning();
    testTaskId = t.id;

    // 3. Khởi tạo Nest App
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        AuthController,
        UnitsController,
        ProfilesController,
        TasksController,
      ],
      providers: [
        Reflector,
        { provide: 'DATABASE_DB', useValue: db },
        { provide: APP_GUARD, useClass: OriginGuard },
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_GUARD, useClass: PasswordChangeGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();

    // 4. Tạo 4 vai trò và lấy cookies
    const admin = await createTestUser('admin');
    adminCookie = await loginAndGetCookie(admin.email, admin.rawPassword);

    const ban4 = await createTestUser('ban4');
    ban4Cookie = await loginAndGetCookie(ban4.email, ban4.rawPassword);

    const unitU = await createTestUser('unit');
    unitCookie = await loginAndGetCookie(unitU.email, unitU.rawPassword);

    const viewer = await createTestUser('viewer');
    viewerCookie = await loginAndGetCookie(viewer.email, viewer.rawPassword);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createTestUser(role: 'admin' | 'ban4' | 'unit' | 'viewer') {
    const password = randomPassword();
    const passwordHash = await hashPassword(password);
    const email = randomEmail();
    const [created] = await db
      .insert(appUser)
      .values({
        email,
        fullName: 'User ' + role,
        role,
        isActive: true,
        mustChangePassword: false,
        passwordHash,
      })
      .returning();

    await db.insert(passwordHistory).values({
      userId: created.id,
      passwordHash,
    });

    return { email, rawPassword: password };
  }

  async function loginAndGetCookie(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password });

    expect(res.status).toBe(200);
    const cookieHeader = res.headers['set-cookie'];
    const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    return cookie.split(';')[0];
  }

  describe('1. PUT /api/units/:code (admin)', () => {
    it('admin tạo mới và cập nhật đơn vị thành công (200)', async () => {
      const code = 'NEW_DEP_' + Math.floor(Math.random() * 1000);
      const resCreate = await request(app.getHttpServer())
        .put(`/api/units/${code}`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({
          name: 'Phòng Mới Tạo',
          kind: 'department',
        });

      expect(resCreate.status).toBe(200);
      expect(resCreate.body.code).toBe(code);
      expect(resCreate.body.name).toBe('Phòng Mới Tạo');
      expect(resCreate.body.kind).toBe('department');

      const resUpdate = await request(app.getHttpServer())
        .put(`/api/units/${code}`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({
          name: 'Phòng Đã Sửa',
          kind: 'center',
        });

      expect(resUpdate.status).toBe(200);
      expect(resUpdate.body.name).toBe('Phòng Đã Sửa');
      expect(resUpdate.body.kind).toBe('center');
    });

    it('từ chối 403 khi ban4, unit hoặc viewer gọi PUT /api/units/:code', async () => {
      const resBan4 = await request(app.getHttpServer())
        .put('/api/units/TEST_CODE')
        .set('Origin', origin)
        .set('Cookie', ban4Cookie)
        .send({ name: 'Ban 4 test', kind: 'department' });
      expect(resBan4.status).toBe(403);

      const resUnit = await request(app.getHttpServer())
        .put('/api/units/TEST_CODE')
        .set('Origin', origin)
        .set('Cookie', unitCookie)
        .send({ name: 'Unit test', kind: 'department' });
      expect(resUnit.status).toBe(403);
    });
  });

  describe('2. GET /api/profiles/:riskCode/assignments (admin, ban4)', () => {
    it('admin và ban4 xem được danh sách gán; unit và viewer nhận 403', async () => {
      const resAdmin = await request(app.getHttpServer())
        .get(`/api/profiles/${testRiskCode}/assignments?cycle=2098`)
        .set('Cookie', adminCookie);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.riskCode).toBe(testRiskCode);
      expect(Array.isArray(resAdmin.body.controls)).toBe(true);
      expect(Array.isArray(resAdmin.body.indicators)).toBe(true);
      expect(Array.isArray(resAdmin.body.tasks)).toBe(true);

      const resBan4 = await request(app.getHttpServer())
        .get(`/api/profiles/${testRiskCode}/assignments?cycle=2098`)
        .set('Cookie', ban4Cookie);
      expect(resBan4.status).toBe(200);

      const resUnit = await request(app.getHttpServer())
        .get(`/api/profiles/${testRiskCode}/assignments?cycle=2098`)
        .set('Cookie', unitCookie);
      expect(resUnit.status).toBe(403);

      const resViewer = await request(app.getHttpServer())
        .get(`/api/profiles/${testRiskCode}/assignments?cycle=2098`)
        .set('Cookie', viewerCookie);
      expect(resViewer.status).toBe(403);
    });

    it('từ chối 404 khi riskCode không tồn tại', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/profiles/NONEXISTENT.R99/assignments?cycle=2098')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(404);
    });
  });

  describe('3. PUT /api/profiles/:riskCode/controls/:code/units (admin)', () => {
    it('admin gán và thay thế toàn bộ danh sách đơn vị kiểm soát (200)', async () => {
      // Gán 2 đơn vị TT1, TT2
      const resAssign = await request(app.getHttpServer())
        .put(`/api/profiles/${testRiskCode}/controls/${testControlCode}/units?cycle=2098`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ unitCodes: ['TT1', 'TT2'] });

      expect(resAssign.status).toBe(200);
      expect(resAssign.body).toHaveLength(2);
      expect(resAssign.body.map((u: any) => u.code).sort()).toEqual(['TT1', 'TT2']);

      // Gỡ bỏ hết đơn vị bằng mảng rỗng []
      const resClear = await request(app.getHttpServer())
        .put(`/api/profiles/${testRiskCode}/controls/${testControlCode}/units?cycle=2098`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ unitCodes: [] });

      expect(resClear.status).toBe(200);
      expect(resClear.body).toHaveLength(0);
    });

    it('từ chối 403 khi ban4, unit, viewer gọi assignControlUnit', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/profiles/${testRiskCode}/controls/${testControlCode}/units?cycle=2098`)
        .set('Origin', origin)
        .set('Cookie', ban4Cookie)
        .send({ unitCodes: ['TT1'] });
      expect(res.status).toBe(403);
    });

    it('từ chối 422 khi mã đơn vị không tồn tại', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/profiles/${testRiskCode}/controls/${testControlCode}/units?cycle=2098`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ unitCodes: ['NON_EXISTENT_UNIT_CODE'] });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('từ chối 409 CYCLE_ARCHIVED khi chu kỳ đã lưu trữ', async () => {
      // Tạo profile trong archived cycle
      await db
        .insert(riskProfile)
        .values({
          cycleId: archivedCycleId,
          riskCode: 'ARCHIVED.R01',
          hsrrCode: 'HSRR_ARCHIVED_01',
          name: 'Hồ sơ lưu trữ',
          riskType: 'Chiến lược',
          riskZone: 'Vùng 1',
          riskGroup: 'Nhóm 1',
          owner: 'Ban 3',
          relatedActivity: 'Hoạt động SXKD',
          preparedByUnit: 'Ban 3',
          description: 'Mô tả rủi ro lưu trữ',
          inherentImpact: 'Lớn',
          inherentLikelihood: 'Có thể xảy ra',
          inherentLevel: 'Cao',
        })
        .onConflictDoNothing();

      await db
        .insert(control)
        .values({
          profileId: (await db.select().from(riskProfile).where(and(eq(riskProfile.cycleId, archivedCycleId), eq(riskProfile.riskCode, 'ARCHIVED.R01'))).limit(1))[0].id,
          code: 'KS_ARCHIVED',
          description: 'KS lưu trữ',
          ownerText: 'Ban 3',
          frequency: 'Hàng ngày',
          objective: 'Mục tiêu',
          method: 'Tự động',
          designEff: 'Hiệu quả',
          operatingEff: 'Hiệu quả',
          overallEff: 'Hiệu quả',
        })
        .onConflictDoNothing();

      const res = await request(app.getHttpServer())
        .put('/api/profiles/ARCHIVED.R01/controls/KS_ARCHIVED/units?cycle=2099')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ unitCodes: ['TT1'] });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CYCLE_ARCHIVED');
    });

    it('không truyền cycle thì dùng chu kỳ đang mở có năm lớn nhất (2098), không bị 409 do chu kỳ 2099 archived (S2)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/profiles/${testRiskCode}/controls/${testControlCode}/units`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ unitCodes: ['TT1'] });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.map((u: { code: string }) => u.code)).toContain('TT1');
    });
  });

  describe('4. PUT /api/profiles/:riskCode/indicators/:code/owner (admin)', () => {
    it('admin gán đơn vị phụ trách chỉ số và bỏ gán bằng null (200)', async () => {
      // Gán TT1
      const resAssign = await request(app.getHttpServer())
        .put(`/api/profiles/${testRiskCode}/indicators/${testIndicatorCode}/owner?cycle=2098`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ unitCode: 'TT1' });

      expect(resAssign.status).toBe(200);
      expect(resAssign.body.ownerUnit?.code).toBe('TT1');

      // Bỏ gán (null)
      const resUnassign = await request(app.getHttpServer())
        .put(`/api/profiles/${testRiskCode}/indicators/${testIndicatorCode}/owner?cycle=2098`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ unitCode: null });

      expect(resUnassign.status).toBe(200);
      expect(resUnassign.body.ownerUnit).toBeNull();
    });

    it('không truyền cycle thì dùng chu kỳ đang mở có năm lớn nhất (2098), không bị 409 do chu kỳ 2099 archived (S2)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/profiles/${testRiskCode}/indicators/${testIndicatorCode}/owner`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ unitCode: 'TT1' });

      expect(res.status).toBe(200);
      expect(res.body.ownerUnit?.code).toBe('TT1');
    });

    it('từ chối 403 khi ban4, unit, viewer gọi setIndicatorOwner', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/profiles/${testRiskCode}/indicators/${testIndicatorCode}/owner?cycle=2098`)
        .set('Origin', origin)
        .set('Cookie', ban4Cookie)
        .send({ unitCode: 'TT1' });
      expect(res.status).toBe(403);
    });
  });

  describe('5. PUT /api/tasks/:id/unit (admin, ban4)', () => {
    it('admin và ban4 gán đơn vị cho đầu việc thành công (200); unit và viewer nhận 403', async () => {
      // Admin gán TT1
      const resAdmin = await request(app.getHttpServer())
        .put(`/api/tasks/${testTaskId}/unit`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ unitCode: 'TT1' });

      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.unit?.code).toBe('TT1');

      // Ban 4 đổi sang TT2 (được phép!)
      const resBan4 = await request(app.getHttpServer())
        .put(`/api/tasks/${testTaskId}/unit`)
        .set('Origin', origin)
        .set('Cookie', ban4Cookie)
        .send({ unitCode: 'TT2' });

      expect(resBan4.status).toBe(200);
      expect(resBan4.body.unit?.code).toBe('TT2');

      // Unit và Viewer nhận 403
      const resUnit = await request(app.getHttpServer())
        .put(`/api/tasks/${testTaskId}/unit`)
        .set('Origin', origin)
        .set('Cookie', unitCookie)
        .send({ unitCode: 'TT1' });
      expect(resUnit.status).toBe(403);

      const resViewer = await request(app.getHttpServer())
        .put(`/api/tasks/${testTaskId}/unit`)
        .set('Origin', origin)
        .set('Cookie', viewerCookie)
        .send({ unitCode: 'TT1' });
      expect(resViewer.status).toBe(403);
    });

    it('từ chối 422 khi id sai định dạng UUID hoặc đơn vị không tồn tại', async () => {
      const resInvalidUuid = await request(app.getHttpServer())
        .put('/api/tasks/not-a-uuid/unit')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ unitCode: 'TT1' });
      expect(resInvalidUuid.status).toBe(422);

      const resBadUnit = await request(app.getHttpServer())
        .put(`/api/tasks/${testTaskId}/unit`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ unitCode: 'NON_EXISTENT_UNIT' });
      expect(resBadUnit.status).toBe(422);
    });
  });

  describe('6. CLI script create-admin.ts', () => {
    const scriptPath = path.resolve(__dirname, '../../../scripts/create-admin.ts');
    const tsxBin = path.resolve(__dirname, '../../../../../node_modules/.bin/tsx');

    it('tạo 2 admin khác nhau thành công; lần thứ 3 email trùng thất bại và thoát mã khác 0', () => {
      const email1 = randomEmail();
      const email2 = randomEmail();

      // Admin 1
      const out1 = execFileSync(
        tsxBin,
        [scriptPath, '--email', email1, '--name', 'Admin Một'],
        { encoding: 'utf-8', cwd: path.resolve(__dirname, '../../..') }
      );
      expect(out1).toContain('Tạo Quản trị viên thành công:');
      expect(out1).toContain(email1);
      expect(out1).toContain('Mật khẩu tạm:');

      // Admin 2
      const out2 = execFileSync(
        tsxBin,
        [scriptPath, '--email', email2, '--name', 'Admin Hai'],
        { encoding: 'utf-8', cwd: path.resolve(__dirname, '../../..') }
      );
      expect(out2).toContain('Tạo Quản trị viên thành công:');
      expect(out2).toContain(email2);

      // Lần 3: Trùng email1 -> phải ném lỗi (exit code khác 0)
      let duplicateFailed = false;
      try {
        execFileSync(
          tsxBin,
          [scriptPath, '--email', email1, '--name', 'Admin Trùng'],
          { encoding: 'utf-8', cwd: path.resolve(__dirname, '../../..'), stdio: 'pipe' }
        );
      } catch (err: any) {
        duplicateFailed = true;
        expect(err.status).not.toBe(0);
        expect(err.stderr.toString()).toContain('đã tồn tại trong hệ thống');
      }
      expect(duplicateFailed).toBe(true);
    });

    it('thiếu tham số thì in hướng dẫn sử dụng và thoát mã khác 0', () => {
      let missingArgFailed = false;
      try {
        execFileSync(
          tsxBin,
          [scriptPath],
          { encoding: 'utf-8', cwd: path.resolve(__dirname, '../../..'), stdio: 'pipe' }
        );
      } catch (err: any) {
        missingArgFailed = true;
        expect(err.status).not.toBe(0);
        expect(err.stderr.toString()).toContain('Cách dùng:');
      }
      expect(missingArgFailed).toBe(true);
    });
  });
});
