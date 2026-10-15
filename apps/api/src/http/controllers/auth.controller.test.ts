import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import crypto from 'crypto';
import { eq, desc, sql } from 'drizzle-orm';
import { AuthController } from './auth.controller';
import { OverviewController } from './overview.controller';
import { AppErrorFilter } from '../filters/app-error.filter';
import { OriginGuard } from '../guards/origin.guard';
import { SessionGuard } from '../guards/session.guard';
import { PasswordChangeGuard } from '../guards/password-change.guard';
import { RolesGuard } from '../guards/roles.guard';
import { db, getDb } from '../../server/db/client';
import {
  appUser,
  session as sessionTable,
  passwordHistory,
  auditLog,
  unit as unitTable,
} from '../../server/db/schema';
import { hashPassword } from '../../server/auth/password';
import { hashToken } from '../../server/auth/session';
import { loginRateLimiter } from '../../server/services/auth';
import { APP_GUARD, Reflector } from '@nestjs/core';

function randomPassword(): string {
  return 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
}

function randomEmail(): string {
  return `test_${crypto.randomBytes(6).toString('hex')}@mobifone.vn`;
}

describe('AuthController Integration Tests (3A.3)', () => {
  let app: INestApplication;
  const origin = 'http://localhost:3000';

  beforeAll(async () => {
    process.env.APP_ORIGIN = origin;
    process.env.SESSION_SECRET = 'a_very_long_random_session_secret_for_tests_at_least_32_chars';
    process.env.TRUSTED_PROXY_IPS = '127.0.0.1,::1';

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController, OverviewController],
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
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    loginRateLimiter.reset();
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
    const fullName = 'Nguyễn Văn Test ' + crypto.randomInt(100, 999);

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

  it('1. Đăng nhập thành công trả 200, CurrentUser, và Set-Cookie hợp lệ (không chứa mật khẩu)', async () => {
    const { user, rawPassword } = await createTestUser();

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.email).toBe(user.email);
    expect(res.body.fullName).toBe(user.fullName);
    expect(res.body.role).toBe(user.role);
    expect(res.body.mustChangePassword).toBe(false);

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieStr).toContain('hsrr_session=');
    expect(cookieStr.toLowerCase()).toContain('httponly');
    expect(cookieStr.toLowerCase()).toContain('samesite=lax');
    expect(cookieStr.toLowerCase()).toContain('path=/');
    expect(cookieStr).not.toContain(rawPassword);
  });

  it('2. Đăng nhập sai mật khẩu trả 401 UNAUTHENTICATED với cùng cấu trúc như email không tồn tại', async () => {
    const { user } = await createTestUser();

    const wrongPassRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: 'wrongPassword123!' });

    expect(wrongPassRes.status).toBe(401);
    expect(wrongPassRes.body.code).toBe('UNAUTHENTICATED');
    expect(wrongPassRes.body.message).toBe('Email hoặc mật khẩu không đúng');

    const nonExistentRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'non_existent_email_123456@mobifone.vn', password: 'wrongPassword123!' });

    expect(nonExistentRes.status).toBe(401);
    expect(nonExistentRes.body.code).toBe('UNAUTHENTICATED');
    expect(nonExistentRes.body.message).toBe('Email hoặc mật khẩu không đúng');
    expect(nonExistentRes.body).toEqual(wrongPassRes.body);
  });

  it('3. Tài khoản isActive=false trả 401 UNAUTHENTICATED chung', async () => {
    const { user, rawPassword } = await createTestUser({ isActive: false });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
    expect(res.body.message).toBe('Email hoặc mật khẩu không đúng');
  });

  it('4. Khóa tài khoản sau 5 lần sai liên tiếp: lần 6 trả 423 ACCOUNT_LOCKED (kể cả khi nhập đúng mật khẩu)', async () => {
    const { user, rawPassword } = await createTestUser();

    for (let i = 1; i <= 5; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', origin)
        .send({ email: user.email, password: 'wrongPassword!' });
      expect(res.status).toBe(401);
    }

    // Lần thứ 6 với mật khẩu ĐÚNG -> vẫn bị 423 ACCOUNT_LOCKED
    const lockedRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });

    expect(lockedRes.status).toBe(423);
    expect(lockedRes.body.code).toBe('ACCOUNT_LOCKED');
    expect(lockedRes.body.message).toContain('khóa');

    // Mở khóa qua DB (đặt lockedUntil về quá khứ)
    await db
      .update(appUser)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(appUser.id, user.id));

    // Đăng nhập lại với mật khẩu đúng -> thành công 200, failed_attempts về 0
    const reloginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });

    expect(reloginRes.status).toBe(200);

    const [updatedUser] = await db.select().from(appUser).where(eq(appUser.id, user.id));
    expect(updatedUser.failedAttempts).toBe(0);
    expect(updatedUser.lockedUntil).toBeNull();
  });

  it('5. Rate limit: 30 lần gọi POST /api/auth/login mỗi IP trong 15 phút, lần 31 trả 429 RATE_LIMITED', async () => {
    const { user, rawPassword } = await createTestUser();

    // Giả lập 30 lần gọi
    for (let i = 1; i <= 30; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', origin)
        .send({ email: user.email, password: rawPassword });
      expect(res.status).toBe(200);
    }

    // Lần thứ 31 -> 429
    const res31 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });

    expect(res31.status).toBe(429);
    expect(res31.body.code).toBe('RATE_LIMITED');
  });

  it('6. GET /api/auth/me trả thông tin người dùng và hỗ trợ trường hợp mustChangePassword=true', async () => {
    const { user, rawPassword } = await createTestUser({ mustChangePassword: true });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });

    const cookie = loginRes.headers['set-cookie'];

    // mustChangePassword=true vẫn gọi được GET /api/auth/me
    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.id).toBe(user.id);
    expect(meRes.body.mustChangePassword).toBe(true);

    // Nhưng gọi endpoint khác (như /api/overview) thì bị 403 MUST_CHANGE_PASSWORD
    const overviewRes = await request(app.getHttpServer())
      .get('/api/overview')
      .set('Cookie', cookie);

    expect(overviewRes.status).toBe(403);
    expect(overviewRes.body.code).toBe('MUST_CHANGE_PASSWORD');
  });

  it('7. POST /api/auth/logout xóa cookie và thu hồi phiên', async () => {
    const { user, rawPassword } = await createTestUser();

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });

    const cookie = loginRes.headers['set-cookie'];

    const logoutRes = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie);

    expect(logoutRes.status).toBe(204);

    // Cookie bị xóa (hết hạn hoặc rỗng)
    const clearedCookie = logoutRes.headers['set-cookie'];
    expect(clearedCookie).toBeDefined();

    // Gọi lại /api/auth/me với cookie cũ phải trả 401
    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(meRes.status).toBe(401);
  });

  it('8. Hết hạn phiên: không hoạt động 60 phút hoặc hạn tuyệt đối 12 giờ', async () => {
    const { user, rawPassword } = await createTestUser();

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });

    const cookie = loginRes.headers['set-cookie'];

    // Sửa lastSeenAt thành 61 phút trước
    await db
      .update(sessionTable)
      .set({ lastSeenAt: new Date(Date.now() - 61 * 60 * 1000) })
      .where(eq(sessionTable.userId, user.id));

    const expiredInactivityRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(expiredInactivityRes.status).toBe(401);

    // Phiên bị xóa khỏi DB
    const sessions = await db
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.userId, user.id));
    expect(sessions).toHaveLength(0);
  });

  it('9. POST /api/auth/change-password: kiểm tra mật khẩu hiện tại, độ dài, trùng mật khẩu hiện tại, trùng 5 bản gần nhất', async () => {
    const { user, rawPassword } = await createTestUser({ mustChangePassword: true });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });

    const cookie = loginRes.headers['set-cookie'];

    // 1. Sai mật khẩu hiện tại
    const wrongOldRes = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ oldPassword: 'wrongPasswordOld123', newPassword: randomPassword() });

    expect(wrongOldRes.status).toBe(422);
    expect(wrongOldRes.body.fieldErrors?.oldPassword).toBe('Mật khẩu hiện tại không đúng');

    // 2. Mật khẩu mới quá ngắn (< 10 ký tự)
    const shortNewRes = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ oldPassword: rawPassword, newPassword: 'short' });

    expect(shortNewRes.status).toBe(422);
    expect(shortNewRes.body.fieldErrors?.newPassword).toBe('Mật khẩu mới phải có tối thiểu 10 ký tự');

    // 3. Mật khẩu mới trùng mật khẩu hiện tại
    const sameAsCurrentRes = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ oldPassword: rawPassword, newPassword: rawPassword });

    expect(sameAsCurrentRes.status).toBe(422);
    expect(sameAsCurrentRes.body.fieldErrors?.newPassword).toBe('Mật khẩu mới không được trùng với mật khẩu hiện tại');

    // Đổi mật khẩu lần 1 thành công
    const newPass1 = randomPassword();
    const change1Res = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ oldPassword: rawPassword, newPassword: newPass1 });

    expect(change1Res.status).toBe(204);

    // mustChangePassword đã thành false
    const [u1] = await db.select().from(appUser).where(eq(appUser.id, user.id));
    expect(u1.mustChangePassword).toBe(false);

    // 4. Thử đổi lại về mật khẩu ban đầu (trùng trong lịch sử 5 mật khẩu gần nhất)
    const reuseOldRes = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ oldPassword: newPass1, newPassword: rawPassword });

    expect(reuseOldRes.status).toBe(422);
    expect(reuseOldRes.body.fieldErrors?.newPassword).toBe('Mật khẩu mới không được trùng với 5 mật khẩu gần nhất');
  });

  it('10. Đổi mật khẩu thu hồi mọi phiên khác nhưng giữ phiên hiện tại', async () => {
    const { user, rawPassword } = await createTestUser();

    // Đăng nhập phiên 1
    const login1 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });
    const cookie1 = login1.headers['set-cookie'];

    // Đăng nhập phiên 2
    const login2 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });
    const cookie2 = login2.headers['set-cookie'];

    // Đổi mật khẩu từ phiên 1
    const newPass = randomPassword();
    const changeRes = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Origin', origin)
      .set('Cookie', cookie1)
      .send({ oldPassword: rawPassword, newPassword: newPass });

    expect(changeRes.status).toBe(204);

    // Phiên 1 vẫn hợp lệ
    const me1 = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie1);
    expect(me1.status).toBe(200);

    // Phiên 2 đã bị thu hồi -> 401
    const me2 = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie2);
    expect(me2.status).toBe(401);
  });

  it('11. Kiểm tra nhật ký: login, login_failed, logout, change_password KHÔNG chứa mật khẩu, băm, token', async () => {
    const { user, rawPassword } = await createTestUser();

    // Login failed
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: 'wrongPassword' });

    // Login success
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: rawPassword });
    const cookie = loginRes.headers['set-cookie'];

    // Change password
    const newPass = randomPassword();
    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ oldPassword: rawPassword, newPassword: newPass });

    // Logout
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie);

    // Truy vấn audit_log của người này
    const logs = await db
      .select()
      .from(auditLog)
      .where(sql`${auditLog.userId} = ${user.id} or ${auditLog.after}->>'email' = ${user.email}`)
      .orderBy(desc(auditLog.at));

    const actions = logs.map((l) => l.action);
    expect(actions).toContain('login_failed');
    expect(actions).toContain('login');
    expect(actions).toContain('change_password');
    expect(actions).toContain('logout');

    for (const log of logs) {
      const jsonStr = JSON.stringify(log);
      expect(jsonStr).not.toContain(rawPassword);
      expect(jsonStr).not.toContain(newPass);
      expect(jsonStr).not.toContain('wrongPassword');
      expect(jsonStr).not.toContain(user.passwordHash);
      if (log.after) {
        expect((log.after as any).password).toBeUndefined();
        expect((log.after as any).passwordHash).toBeUndefined();
        expect((log.after as any).token).toBeUndefined();
      }
    }
  });

  it('12. Sai hoặc thiếu Origin trên POST trả 403 FORBIDDEN và không thực hiện thao tác', async () => {
    const { user, rawPassword } = await createTestUser();

    const noOriginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: rawPassword });

    expect(noOriginRes.status).toBe(403);
    expect(noOriginRes.body.code).toBe('FORBIDDEN');

    const wrongOriginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://malicious-site.com')
      .send({ email: user.email, password: rawPassword });

    expect(wrongOriginRes.status).toBe(403);
    expect(wrongOriginRes.body.code).toBe('FORBIDDEN');
  });
});
