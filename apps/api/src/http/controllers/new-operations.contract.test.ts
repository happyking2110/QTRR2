import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import postgres from 'postgres';
import crypto from 'crypto';
import { AppModule } from '../../app.module';
import { AppErrorFilter } from '../filters/app-error.filter';
import { createCustomClient, DATABASE_DB } from '../../server/db/client';
import { DATABASE_CONNECTION } from './health.controller';
import { hashPassword } from '../../server/auth/password';
import { generateToken, hashToken } from '../../server/auth/session';
import { importCycle } from '../../server/services/cycles';
import { seedInitialPeriods } from '../../server/services/periods';
import { seedUnits } from '../../server/services/units';
import { loginRateLimiter } from '../../server/services/auth';
import {
  appUser,
  passwordHistory,
  session as sessionTable,
  unit as unitTable,
  actionTask,
} from '../../server/db/schema';
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

function findContractPath(): string {
  const candidates = [
    path.resolve(__dirname, '../../../../../contracts/openapi.yaml'),
    path.resolve(process.cwd(), 'contracts/openapi.yaml'),
    path.resolve(process.cwd(), '../../contracts/openapi.yaml'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Không tìm thấy file contracts/openapi.yaml');
}

function assertVietnameseError(body: any) {
  const checkText = (text?: string) => {
    if (!text) return;
    expect(text).not.toMatch(/\b(is invalid|expected|too small|pattern|is required|internal server)\b/i);
  };
  checkText(body.message);
  if (body.fieldErrors) {
    for (const msg of Object.values(body.fieldErrors)) {
      checkText(msg as string);
    }
  }
  if (Array.isArray(body.details)) {
    for (const d of body.details) {
      checkText(d.message);
    }
  }
}

describe('Contract Schema Tests for 15 New Operations (3A.7)', () => {
  let app: INestApplication;
  let ownerSql: postgres.Sql;
  let appClient: ReturnType<typeof createCustomClient>;
  let ajv: InstanceType<typeof Ajv2020>;
  let contractDoc: any;
  const origin = 'http://localhost:3000';

  let adminUser: { id: string; email: string; rawPass: string };
  let viewerUser: { id: string; email: string; rawPass: string };
  let adminCookie: string;
  let viewerCookie: string;
  let sampleTaskId: string;

  async function createSession(userId: string): Promise<string> {
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    await appClient.db.insert(sessionTable).values({
      userId,
      tokenHash,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
    return `hsrr_session=${rawToken}`;
  }

  function validateSchema(schemaPointer: string, data: unknown) {
    const validate = ajv.getSchema(`urn:contracts:openapi#${schemaPointer}`);
    if (!validate) {
      throw new Error(`Schema không tìm thấy tại pointer: ${schemaPointer}`);
    }
    const valid = validate(data);
    if (!valid) {
      console.error('Validation errors:', validate.errors, 'Data:', data);
      expect(validate.errors).toBeNull();
    }
    expect(valid).toBe(true);
  }

  beforeAll(async () => {
    process.env.APP_ORIGIN = origin;
    process.env.SESSION_SECRET = 'a_very_long_random_session_secret_for_tests_at_least_32_chars';
    process.env.TRUSTED_PROXY_IPS = '127.0.0.1,::1';

    ownerSql = postgres(testMigrateUrl, { max: 1 });
    appClient = createCustomClient(testAppUrl);

    // Parse OpenAPI
    const yamlContent = fs.readFileSync(findContractPath(), 'utf8');
    contractDoc = YAML.parse(yamlContent);
    ajv = new Ajv2020({ allErrors: true, strictSchema: false });
    addFormats(ajv);
    contractDoc['$id'] = 'urn:contracts:openapi';
    ajv.addSchema(contractDoc);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue(appClient.client)
      .overrideProvider(DATABASE_DB)
      .useValue(appClient.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();

    // Reset DB and seed
    await ownerSql`TRUNCATE TABLE audit_log, unit_assignment, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, session, password_history, app_user, unit, cycle CASCADE`;

    const excelPath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
      : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
    const buffer = fs.readFileSync(excelPath);
    const report = await importCycle({ year: 2026, file: buffer, actor: null }, appClient.db);
    await seedInitialPeriods(report.cycleId, appClient.db);
    await seedUnits(appClient.db);

    // Get a sample task id
    const [t] = await appClient.db.select().from(actionTask).limit(1);
    sampleTaskId = t.id;

    // Create Admin user
    const adminPass = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
    const adminPassHash = await hashPassword(adminPass);
    const [adm] = await appClient.db
      .insert(appUser)
      .values({
        email: `admin_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Admin User',
        role: 'admin',
        passwordHash: adminPassHash,
        isActive: true,
        mustChangePassword: false,
      })
      .returning();
    await appClient.db.insert(passwordHistory).values({ userId: adm.id, passwordHash: adminPassHash });
    adminUser = { id: adm.id, email: adm.email, rawPass: adminPass };
    adminCookie = await createSession(adm.id);

    // Create Viewer user
    const viewerPass = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
    const viewerPassHash = await hashPassword(viewerPass);
    const [viw] = await appClient.db
      .insert(appUser)
      .values({
        email: `viewer_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Viewer User',
        role: 'viewer',
        passwordHash: viewerPassHash,
        isActive: true,
        mustChangePassword: false,
      })
      .returning();
    await appClient.db.insert(passwordHistory).values({ userId: viw.id, passwordHash: viewerPassHash });
    viewerUser = { id: viw.id, email: viw.email, rawPass: viewerPass };
    viewerCookie = await createSession(viw.id);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (appClient) await appClient.client.end();
    if (ownerSql) await ownerSql.end();
  });

  // 1. POST /api/auth/login
  it('1. POST /api/auth/login: 200 CurrentUser, Set-Cookie, 401 UNAUTHENTICATED, 429 RATE_LIMITED', async () => {
    loginRateLimiter.reset();

    // 200
    const res200 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: adminUser.email, password: adminUser.rawPass });
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/CurrentUser', res200.body);
    const setCookie = res200.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieStr).toContain('hsrr_session=');

    // 401
    const res401 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: adminUser.email, password: 'WrongPassword!123' });
    expect(res401.status).toBe(401);
    validateSchema('/components/schemas/ErrorBody', res401.body);
    assertVietnameseError(res401.body);

    // 429: Rate limited
    for (let i = 0; i < 30; i++) {
      loginRateLimiter.check('127.0.0.1');
    }
    const res429 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: adminUser.email, password: adminUser.rawPass });
    expect(res429.status).toBe(429);
    validateSchema('/components/schemas/ErrorBody', res429.body);
    assertVietnameseError(res429.body);
    loginRateLimiter.reset();
  });

  // 2. POST /api/auth/logout
  it('2. POST /api/auth/logout: 204 No Content không có thân, 401 UNAUTHENTICATED', async () => {
    const tempCookie = await createSession(viewerUser.id);
    const res204 = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Cookie', tempCookie);
    expect(res204.status).toBe(204);
    expect(res204.text).toBe('');

    // 401
    const res401 = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', origin);
    expect(res401.status).toBe(401);
    validateSchema('/components/schemas/ErrorBody', res401.body);
  });

  // 3. GET /api/auth/me
  it('3. GET /api/auth/me: 200 CurrentUser, 401 UNAUTHENTICATED', async () => {
    const res200 = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', adminCookie);
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/CurrentUser', res200.body);

    const res401 = await request(app.getHttpServer()).get('/api/auth/me');
    expect(res401.status).toBe(401);
    validateSchema('/components/schemas/ErrorBody', res401.body);
  });

  // 4. POST /api/auth/change-password
  it('4. POST /api/auth/change-password: 204 No Content, 400, 422 VALIDATION', async () => {
    // Tạo user riêng để đổi pass
    const p1 = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
    const h1 = await hashPassword(p1);
    const [u] = await appClient.db
      .insert(appUser)
      .values({
        email: `change_pwd_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
        fullName: 'Change Pwd User',
        role: 'viewer',
        passwordHash: h1,
        isActive: true,
        mustChangePassword: true,
      })
      .returning();
    await appClient.db.insert(passwordHistory).values({ userId: u.id, passwordHash: h1 });
    const uCookie = await createSession(u.id);

    // 422 Trùng mật khẩu gần đây
    const res422 = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Origin', origin)
      .set('Cookie', uCookie)
      .send({ oldPassword: p1, newPassword: p1 });
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);

    // 422 Sai cấu trúc hoặc không đủ độ phức tạp
    const res422Format = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Origin', origin)
      .set('Cookie', uCookie)
      .send({ oldPassword: p1, newPassword: '123' });
    expect(res422Format.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422Format.body);
    assertVietnameseError(res422Format.body);

    // 204 Thành công
    const p2 = 'MBF_NewPass_' + crypto.randomBytes(6).toString('hex') + '!2026';
    const res204 = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Origin', origin)
      .set('Cookie', uCookie)
      .send({ oldPassword: p1, newPassword: p2 });
    expect(res204.status).toBe(204);
    expect(res204.text).toBe('');
  });

  // 5. GET /api/users
  it('5. GET /api/users: 200 UserList, 403 FORBIDDEN', async () => {
    const res200 = await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', adminCookie);
    expect(res200.status).toBe(200);
    validateSchema('/paths/~1api~1users/get/responses/200/content/application~1json/schema', res200.body);

    // Viewer -> 403
    const res403 = await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', viewerCookie);
    expect(res403.status).toBe(403);
    validateSchema('/components/schemas/ErrorBody', res403.body);
  });

  // 6. POST /api/users
  it('6. POST /api/users: 201 CreatedUser, 409 CONFLICT, 422 VALIDATION', async () => {
    const newEmail = `created_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`;

    // 201
    const res201 = await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ email: newEmail, fullName: 'Người Dùng Mới', role: 'ban4' });
    expect(res201.status).toBe(201);
    validateSchema('/components/schemas/CreatedUser', res201.body);
    expect(res201.body.temporaryPassword).toBeDefined();

    // 409 Trùng email
    const res409 = await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ email: newEmail, fullName: 'Người Dùng Mới', role: 'ban4' });
    expect(res409.status).toBe(409);
    validateSchema('/components/schemas/ErrorBody', res409.body);
    assertVietnameseError(res409.body);

    // 422 Unit role thiếu unitCode
    const res422 = await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ email: `unit_no_code_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`, fullName: 'Unit user', role: 'unit' });
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);
  });

  // 7. POST /api/users/import
  it('7. POST /api/users/import: 201 ImportUsersResult, 422 IMPORT_INVALID với ImportRowError', async () => {
    // 201
    const csvContent = 'email,full_name,role,unit_code\n' +
      `imp1_${crypto.randomBytes(4).toString('hex')}@mobifone.vn,User Imp 1,ban4,\n` +
      `imp2_${crypto.randomBytes(4).toString('hex')}@mobifone.vn,User Imp 2,unit,BAN4`;
    const res201 = await request(app.getHttpServer())
      .post('/api/users/import')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .attach('file', Buffer.from(csvContent, 'utf-8'), 'users.csv');
    expect(res201.status).toBe(201);
    validateSchema('/components/schemas/ImportUsersResult', res201.body);

    // 422
    const badCsv = 'email,full_name,role,unit_code\n' +
      'not_an_email,Invalid Role User,invalid_role,NON_EXISTING';
    const res422 = await request(app.getHttpServer())
      .post('/api/users/import')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .attach('file', Buffer.from(badCsv, 'utf-8'), 'bad.csv');
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    expect(res422.body.code).toBe('IMPORT_INVALID');
    expect(Array.isArray(res422.body.details)).toBe(true);
    for (const d of res422.body.details) {
      validateSchema('/components/schemas/ImportRowError', d);
    }
    assertVietnameseError(res422.body);
  });

  // 8. GET /api/users/import-template
  it('8. GET /api/users/import-template: 200 text/csv và tiêu đề attachment', async () => {
    const res200 = await request(app.getHttpServer())
      .get('/api/users/import-template')
      .set('Cookie', adminCookie);
    expect(res200.status).toBe(200);
    expect(res200.headers['content-type']).toContain('text/csv');
    expect(res200.headers['content-disposition']).toContain('attachment');
    expect(res200.headers['content-disposition']).toContain('mau-nguoi-dung.csv');
  });

  // 9. POST /api/users/{id}/reset-password
  it('9. POST /api/users/{id}/reset-password: 200 ResetPasswordResult, 404 USER_NOT_FOUND', async () => {
    const res200 = await request(app.getHttpServer())
      .post(`/api/users/${viewerUser.id}/reset-password`)
      .set('Origin', origin)
      .set('Cookie', adminCookie);
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/ResetPasswordResult', res200.body);
    expect(res200.body.temporaryPassword).toBeDefined();

    // 404
    const res404 = await request(app.getHttpServer())
      .post(`/api/users/${crypto.randomUUID()}/reset-password`)
      .set('Origin', origin)
      .set('Cookie', adminCookie);
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 10. PATCH /api/users/{id}
  it('10. PATCH /api/users/{id}: 200 UserListItem, 404, 409 INVALID_STATE', async () => {
    // 200
    const res200 = await request(app.getHttpServer())
      .patch(`/api/users/${viewerUser.id}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ isActive: false });
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/UserListItem', res200.body);
    expect(res200.body.isActive).toBe(false);

    // 404
    const res404 = await request(app.getHttpServer())
      .patch(`/api/users/${crypto.randomUUID()}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ isActive: true });
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);

    // 409 Không được tắt admin hoạt động cuối cùng
    const res409 = await request(app.getHttpServer())
      .patch(`/api/users/${adminUser.id}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ isActive: false });
    expect(res409.status).toBe(409);
    validateSchema('/components/schemas/ErrorBody', res409.body);
    assertVietnameseError(res409.body);
  });

  // 11. PUT /api/units/{code}
  it('11. PUT /api/units/{code}: 200 UnitSummary, 422 VALIDATION', async () => {
    const res200 = await request(app.getHttpServer())
      .put('/api/units/TT1')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ name: 'Trung tâm Tính cước 1', kind: 'center' });
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/UnitSummary', res200.body);

    // 422 Invalid kind
    const res422 = await request(app.getHttpServer())
      .put('/api/units/TT1')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ name: 'Trung tâm', kind: 'invalid_kind' });
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);
  });

  // 12. GET /api/profiles/{riskCode}/assignments
  it('12. GET /api/profiles/{riskCode}/assignments: 200 Assignments, 404 NOT_FOUND', async () => {
    const res200 = await request(app.getHttpServer())
      .get('/api/profiles/HD11.R27/assignments?cycle=2026')
      .set('Cookie', adminCookie);
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/Assignments', res200.body);

    // 404
    const res404 = await request(app.getHttpServer())
      .get('/api/profiles/HD99.R99/assignments?cycle=2026')
      .set('Cookie', adminCookie);
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
  });

  // 13. PUT /api/profiles/{riskCode}/controls/{code}/units
  it('13. PUT /api/profiles/{riskCode}/controls/{code}/units: 200 UnitSummary[], 422 VALIDATION', async () => {
    const res200 = await request(app.getHttpServer())
      .put('/api/profiles/HD11.R27/controls/HD11.R27.KS01/units?cycle=2026')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ unitCodes: ['BAN4', 'TT1'] });
    expect(res200.status).toBe(200);
    validateSchema('/paths/~1api~1profiles~1{riskCode}~1controls~1{code}~1units/put/responses/200/content/application~1json/schema', res200.body);

    // 422 unitCode không tồn tại
    const res422 = await request(app.getHttpServer())
      .put('/api/profiles/HD11.R27/controls/HD11.R27.KS01/units?cycle=2026')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ unitCodes: ['NON_EXISTING_UNIT'] });
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);
  });

  // 14. PUT /api/profiles/{riskCode}/indicators/{code}/owner
  it('14. PUT /api/profiles/{riskCode}/indicators/{code}/owner: 200 OwnerUnitResult, 404 NOT_FOUND', async () => {
    const res200 = await request(app.getHttpServer())
      .put('/api/profiles/HD11.R27/indicators/HD11.R27.KRI01/owner?cycle=2026')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ unitCode: 'BAN3' });
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/OwnerUnitResult', res200.body);

    // 404 Chỉ số không tồn tại
    const res404 = await request(app.getHttpServer())
      .put('/api/profiles/HD11.R27/indicators/HD11.R27.KRI99/owner?cycle=2026')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ unitCode: 'BAN3' });
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
  });

  // 15. PUT /api/tasks/{id}/unit
  it('15. PUT /api/tasks/{id}/unit: 200 TaskUnitResult, 404 NOT_FOUND', async () => {
    const res200 = await request(app.getHttpServer())
      .put(`/api/tasks/${sampleTaskId}/unit?cycle=2026`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ unitCode: 'BAN4' });
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/TaskUnitResult', res200.body);

    // 404 Task không tồn tại
    const res404 = await request(app.getHttpServer())
      .put(`/api/tasks/${crypto.randomUUID()}/unit?cycle=2026`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ unitCode: 'BAN4' });
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
  });
});
