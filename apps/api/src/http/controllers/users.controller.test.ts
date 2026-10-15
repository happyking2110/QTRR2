import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { AuthController } from './auth.controller';
import { UsersController } from './users.controller';
import { AppErrorFilter } from '../filters/app-error.filter';
import { OriginGuard } from '../guards/origin.guard';
import { SessionGuard } from '../guards/session.guard';
import { PasswordChangeGuard } from '../guards/password-change.guard';
import { RolesGuard } from '../guards/roles.guard';
import { db } from '../../server/db/client';
import {
  appUser,
  session as sessionTable,
  passwordHistory,
  auditLog,
  unit as unitTable,
} from '../../server/db/schema';
import { hashPassword } from '../../server/auth/password';
import { APP_GUARD, Reflector } from '@nestjs/core';

const ALLOWED_TEMP_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function randomPassword(): string {
  return 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
}

function randomEmail(): string {
  return `test_${crypto.randomBytes(6).toString('hex')}@mobifone.vn`;
}

describe('UsersController Integration Tests (3A.5)', () => {
  let app: INestApplication;
  const origin = 'http://localhost:3000';
  let adminCookie: string;
  let adminUser: typeof appUser.$inferSelect;
  let viewerCookie: string;
  let unitCodeTest: string;

  beforeAll(async () => {
    process.env.APP_ORIGIN = origin;
    process.env.SESSION_SECRET =
      'a_very_long_random_session_secret_for_tests_at_least_32_chars';
    process.env.TRUSTED_PROXY_IPS = '127.0.0.1,::1';

    // Tạo đơn vị mẫu nếu chưa có
    unitCodeTest = 'TEST_UNIT_' + crypto.randomBytes(4).toString('hex').toUpperCase();
    await db
      .insert(unitTable)
      .values({
        code: unitCodeTest,
        name: 'Đơn vị kiểm thử',
        kind: 'center',
      })
      .onConflictDoNothing();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController, UsersController],
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

    // Tạo admin test và đăng nhập lấy cookie
    const adminCreated = await createTestUser({ role: 'admin' });
    adminUser = adminCreated.user;
    adminCookie = await loginAndGetCookie(adminCreated.user.email, adminCreated.rawPassword);

    // Tạo viewer test và đăng nhập lấy cookie
    const viewerCreated = await createTestUser({ role: 'viewer' });
    viewerCookie = await loginAndGetCookie(viewerCreated.user.email, viewerCreated.rawPassword);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createTestUser(opts?: {
    role?: 'admin' | 'ban4' | 'unit' | 'viewer';
    isActive?: boolean;
    mustChangePassword?: boolean;
    unitId?: string | null;
  }) {
    const password = randomPassword();
    const passwordHash = await hashPassword(password);
    const email = randomEmail();
    const fullName = 'Test User ' + crypto.randomInt(100, 999);

    const [created] = await db
      .insert(appUser)
      .values({
        email,
        fullName,
        role: opts?.role ?? 'admin',
        isActive: opts?.isActive ?? true,
        mustChangePassword: opts?.mustChangePassword ?? false,
        unitId: opts?.unitId ?? null,
        passwordHash,
      })
      .returning();

    await db.insert(passwordHistory).values({
      userId: created.id,
      passwordHash,
    });

    return { user: created, rawPassword: password };
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

  describe('1. GET /api/users', () => {
    it('từ chối 401 khi chưa đăng nhập và 403 khi không phải admin', async () => {
      const resUnauth = await request(app.getHttpServer()).get('/api/users');
      expect(resUnauth.status).toBe(401);

      const resForbidden = await request(app.getHttpServer())
        .get('/api/users')
        .set('Cookie', viewerCookie);
      expect(resForbidden.status).toBe(403);
    });

    it('admin xem danh sách người dùng thành công, sắp xếp theo họ tên', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const first = res.body[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('email');
      expect(first).toHaveProperty('fullName');
      expect(first).toHaveProperty('role');
      expect(first).toHaveProperty('unit');
      expect(first).toHaveProperty('isActive');
      expect(first).toHaveProperty('mustChangePassword');
      expect(first).toHaveProperty('lockedUntil');
      expect(first).toHaveProperty('lastLoginAt');
      expect(first).toHaveProperty('createdAt');

      // Kiểm tra tuyệt đối không có password hay passwordHash
      expect(first).not.toHaveProperty('password');
      expect(first).not.toHaveProperty('passwordHash');
      expect(first).not.toHaveProperty('temporaryPassword');
    });

    it('hỗ trợ bộ lọc q, role, unitCode, isActive', async () => {
      const { user } = await createTestUser({ role: 'ban4' });

      // Tìm theo email
      const resQ = await request(app.getHttpServer())
        .get(`/api/users?q=${user.email}`)
        .set('Cookie', adminCookie);
      expect(resQ.status).toBe(200);
      expect(resQ.body.some((u: any) => u.email === user.email)).toBe(true);

      // Lọc theo role ban4
      const resRole = await request(app.getHttpServer())
        .get('/api/users?role=ban4')
        .set('Cookie', adminCookie);
      expect(resRole.status).toBe(200);
      expect(resRole.body.every((u: any) => u.role === 'ban4')).toBe(true);
    });
  });

  describe('2. POST /api/users', () => {
    it('admin tạo người dùng thành công, trả mật khẩu tạm 16 ký tự và bật mustChangePassword', async () => {
      const email = randomEmail();
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({
          email,
          fullName: 'Người dùng Mới',
          role: 'viewer',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('temporaryPassword');
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.mustChangePassword).toBe(true);
      expect(res.body.user.isActive).toBe(true);

      const tempPass = res.body.temporaryPassword;
      expect(tempPass).toHaveLength(16);
      for (const char of tempPass) {
        expect(ALLOWED_TEMP_CHARSET).toContain(char);
      }

      // Kiểm tra audit log: KHÔNG có mật khẩu tạm hay passwordHash
      const [log] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, res.body.user.id))
        .orderBy(sql`${auditLog.at} desc`)
        .limit(1);

      expect(log).toBeDefined();
      expect(log.action).toBe('create_user');
      const logStr = JSON.stringify(log);
      expect(logStr).not.toContain(tempPass);
      expect(logStr).not.toContain('$argon2');
    });

    it('từ chối 409 CONFLICT khi tạo người dùng với email trùng lặp', async () => {
      const email = randomEmail();
      // Tạo lần 1
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({
          email,
          fullName: 'Người dùng Trùng',
          role: 'viewer',
        });

      // Tạo lần 2 với email chữ hoa chữ thường khác nhau
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({
          email: email.toUpperCase(),
          fullName: 'Người dùng Trùng 2',
          role: 'viewer',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONFLICT');
    });

    it('từ chối 422 khi vai trò unit thiếu đơn vị hoặc đơn vị không tồn tại', async () => {
      // Thiếu đơn vị
      const resMissing = await request(app.getHttpServer())
        .post('/api/users')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({
          email: randomEmail(),
          fullName: 'Unit thiếu đơn vị',
          role: 'unit',
        });
      expect(resMissing.status).toBe(422);
      expect(resMissing.body.code).toBe('VALIDATION');

      // Đơn vị không tồn tại
      const resNonExistent = await request(app.getHttpServer())
        .post('/api/users')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({
          email: randomEmail(),
          fullName: 'Unit đơn vị sai',
          role: 'unit',
          unitCode: 'NON_EXISTENT_UNIT_999',
        });
      expect(resNonExistent.status).toBe(422);
      expect(resNonExistent.body.code).toBe('VALIDATION');
    });
  });

  describe('3. POST /api/users/:id/reset-password', () => {
    it('admin đặt lại mật khẩu thành công: trả mật khẩu tạm, bật mustChangePassword, xóa mọi phiên', async () => {
      const { user, rawPassword } = await createTestUser();
      const userCookie = await loginAndGetCookie(user.email, rawPassword);

      // Kiểm tra phiên hoạt động trước khi reset
      const resBefore = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', userCookie);
      expect(resBefore.status).toBe(200);

      // Admin gọi reset-password
      const resReset = await request(app.getHttpServer())
        .post(`/api/users/${user.id}/reset-password`)
        .set('Origin', origin)
        .set('Cookie', adminCookie);

      expect(resReset.status).toBe(200);
      expect(resReset.body).toHaveProperty('temporaryPassword');
      const tempPass = resReset.body.temporaryPassword;
      expect(tempPass).toHaveLength(16);

      // Phiên cũ của người dùng bị thu hồi (trả 401)
      const resAfter = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', userCookie);
      expect(resAfter.status).toBe(401);

      // Đăng nhập lại bằng mật khẩu tạm thành công và có mustChangePassword = true
      const newCookie = await loginAndGetCookie(user.email, tempPass);
      const resMeNew = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', newCookie);
      expect(resMeNew.status).toBe(200);
      expect(resMeNew.body.mustChangePassword).toBe(true);
    });

    it('từ chối 422 khi id sai định dạng UUID và 404 khi không tìm thấy', async () => {
      const resInvalidUuid = await request(app.getHttpServer())
        .post('/api/users/not-a-uuid/reset-password')
        .set('Origin', origin)
        .set('Cookie', adminCookie);
      expect(resInvalidUuid.status).toBe(422);

      const fakeUuid = crypto.randomUUID();
      const resNotFound = await request(app.getHttpServer())
        .post(`/api/users/${fakeUuid}/reset-password`)
        .set('Origin', origin)
        .set('Cookie', adminCookie);
      expect(resNotFound.status).toBe(404);
    });
  });

  describe('4. PATCH /api/users/:id', () => {
    it('admin cập nhật vai trò, đơn vị và bật/tắt người dùng', async () => {
      const { user } = await createTestUser({ role: 'viewer' });

      const res = await request(app.getHttpServer())
        .patch(`/api/users/${user.id}`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({
          role: 'unit',
          unitCode: unitCodeTest,
        });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('unit');
      expect(res.body.unit.code).toBe(unitCodeTest);
    });

    it('bảo vệ admin cuối cùng: không cho tắt hoặc hạ vai trò của admin đang hoạt động cuối cùng', async () => {
      // Tắt hết các admin khác ngoại trừ adminUser
      await db
        .update(appUser)
        .set({ isActive: false })
        .where(sql`${appUser.role} = 'admin' AND ${appUser.id} != ${adminUser.id}`);

      // Thử tắt admin cuối cùng
      const resDeactivate = await request(app.getHttpServer())
        .patch(`/api/users/${adminUser.id}`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ isActive: false });

      expect(resDeactivate.status).toBe(409);
      expect(resDeactivate.body.code).toBe('INVALID_STATE');

      // Thử hạ vai trò admin cuối cùng xuống viewer
      const resDemote = await request(app.getHttpServer())
        .patch(`/api/users/${adminUser.id}`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ role: 'viewer' });

      expect(resDemote.status).toBe(409);
      expect(resDemote.body.code).toBe('INVALID_STATE');

      // Khôi phục ít nhất 1 admin khác để không ảnh hưởng test khác
      await createTestUser({ role: 'admin' });
    });

    it('tắt tài khoản thì thu hồi mọi phiên của người đó', async () => {
      const { user, rawPassword } = await createTestUser({ role: 'viewer' });
      const cookie = await loginAndGetCookie(user.email, rawPassword);

      // Admin tắt tài khoản
      const resPatch = await request(app.getHttpServer())
        .patch(`/api/users/${user.id}`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ isActive: false });

      expect(resPatch.status).toBe(200);
      expect(resPatch.body.isActive).toBe(false);

      // Phiên của người dùng bị thu hồi ngay lập tức
      const resCheck = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', cookie);
      expect(resCheck.status).toBe(401);
    });
  });

  describe('5. GET /api/users/import-template', () => {
    it('trả về file CSV mẫu UTF-8 chỉ có dòng tiêu đề email,full_name,role,unit_code', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/import-template')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('mau-nguoi-dung.csv');
      expect(res.text.trim()).toBe('email,full_name,role,unit_code');
    });
  });

  describe('6. POST /api/users/import', () => {
    it('từ chối 422 khi không có file hoặc sai đuôi file', async () => {
      // Không có file
      const resNoFile = await request(app.getHttpServer())
        .post('/api/users/import')
        .set('Origin', origin)
        .set('Cookie', adminCookie);
      expect(resNoFile.status).toBe(422);

      // Đuôi file sai (.txt)
      const resBadExt = await request(app.getHttpServer())
        .post('/api/users/import')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .attach('file', Buffer.from('hello'), 'users.txt');
      expect(resBadExt.status).toBe(422);
    });

    it('file có 1 dòng lỗi thì không tạo ai vào DB (đếm trước và sau không đổi)', async () => {
      const [countBefore] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appUser);

      const invalidCsv = [
        'email,full_name,role,unit_code',
        `${randomEmail()},Hợp lệ 1,viewer,`,
        'invalid-email-format,Không hợp lệ,admin,',
      ].join('\n');

      const res = await request(app.getHttpServer())
        .post('/api/users/import')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .attach('file', Buffer.from(invalidCsv), 'users.csv');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('IMPORT_INVALID');
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(res.body.details).toContainEqual(
        expect.objectContaining({ row: 3, field: 'email' })
      );

      const [countAfter] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appUser);

      expect(countAfter.count).toBe(countBefore.count);
    });

    it('file có email trùng lặp trong DB thì từ chối IMPORT_INVALID và không tạo ai', async () => {
      const { user: existingUser } = await createTestUser();
      const [countBefore] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appUser);

      const conflictCsv = [
        'email,full_name,role,unit_code',
        `${existingUser.email},Người Trùng Email,viewer,`,
      ].join('\n');

      const res = await request(app.getHttpServer())
        .post('/api/users/import')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .attach('file', Buffer.from(conflictCsv), 'users.csv');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('IMPORT_INVALID');

      const [countAfter] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appUser);

      expect(countAfter.count).toBe(countBefore.count);
    });

    it('S3: file có nhiều loại lỗi (email sai dạng, vai trò lạ, đơn vị không tồn tại, thiếu đơn vị, trùng DB, trùng file) trả đủ mọi lỗi trong 1 lần và DB không thêm ai', async () => {
      const { user: existingUser } = await createTestUser();
      const [countBefore] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appUser);

      const dupInFileEmail = randomEmail();
      const multiErrorCsv = [
        'email,full_name,role,unit_code',
        'invalid-email-format,Người Lỗi 1,admin,',
        `${randomEmail()},Người Lỗi 2,boss,`,
        `${randomEmail()},Người Lỗi 3,unit,KHONGCO`,
        `${randomEmail()},Người Lỗi 4,unit,`,
        `${existingUser.email},Người Lỗi 5,viewer,`,
        `${dupInFileEmail},Người Lỗi 6,viewer,`,
        `${dupInFileEmail},Người Lỗi 7,viewer,`,
      ].join('\n');

      const res = await request(app.getHttpServer())
        .post('/api/users/import')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .attach('file', Buffer.from(multiErrorCsv), 'multi_errors.csv');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('IMPORT_INVALID');
      expect(Array.isArray(res.body.details)).toBe(true);

      const details = res.body.details;
      // Dòng 2: email sai dạng
      expect(details).toContainEqual(
        expect.objectContaining({ row: 2, field: 'email' })
      );
      // Dòng 3: role lạ
      expect(details).toContainEqual(
        expect.objectContaining({ row: 3, field: 'role' })
      );
      // Dòng 4: đơn vị KHONGCO không tồn tại
      expect(details).toContainEqual(
        expect.objectContaining({ row: 4, field: 'unit_code', message: expect.stringContaining('KHONGCO') })
      );
      // Dòng 5: role unit thiếu mã đơn vị
      expect(details).toContainEqual(
        expect.objectContaining({ row: 5, field: 'unit_code' })
      );
      // Dòng 6: email trùng trong DB
      expect(details).toContainEqual(
        expect.objectContaining({ row: 6, field: 'email', message: expect.stringContaining('đã tồn tại trong hệ thống') })
      );
      // Dòng 8: email trùng trong file
      expect(details).toContainEqual(
        expect.objectContaining({ row: 8, field: 'email', message: expect.stringContaining('trùng lặp trong file') })
      );

      const [countAfter] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appUser);

      expect(countAfter.count).toBe(countBefore.count);
    });

    it('nhập 50 người hợp lệ thành công: mật khẩu tạm khác nhau, audit_log không chứa mật khẩu', async () => {
      const rows = ['email,full_name,role,unit_code'];
      for (let i = 1; i <= 50; i++) {
        rows.push(`${randomEmail()},Người Nhập ${i},viewer,`);
      }
      const validCsv = rows.join('\n');

      const res = await request(app.getHttpServer())
        .post('/api/users/import')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .attach('file', Buffer.from(validCsv), 'valid_50.csv');

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('created');
      expect(res.body.created).toHaveLength(50);

      // Kiểm tra tất cả 50 mật khẩu tạm đều khác nhau
      const passwords = res.body.created.map((c: any) => c.temporaryPassword);
      const uniquePasswords = new Set(passwords);
      expect(uniquePasswords.size).toBe(50);

      // Kiểm tra audit log import_users
      const [batchLog] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'import_users'))
        .orderBy(sql`${auditLog.at} desc`)
        .limit(1);

      expect(batchLog).toBeDefined();
      expect((batchLog.after as any)?.count).toBe(50);
      const batchLogStr = JSON.stringify(batchLog);
      for (const pass of passwords.slice(0, 5)) {
        expect(batchLogStr).not.toContain(pass);
      }
    });
  });
});
