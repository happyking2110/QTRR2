import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import postgres from 'postgres';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { AppModule } from '../../app.module';
import { AppErrorFilter } from '../filters/app-error.filter';
import { DATABASE_CONNECTION } from './health.controller';
import { DATABASE_DB, createCustomClient } from '../../server/db/client';
import { runMigrations } from '../../server/db/migrate';
import { hashPassword } from '../../server/auth/password';
import { importCycle } from '../../server/services/cycles';
import { ensurePeriods } from '../../server/services/periods';
import {
  unit,
  appUser,
  passwordHistory,
  session,
  riskProfile,
  control,
  unitAssignment,
} from '../../server/db/schema';
import { eq } from 'drizzle-orm';

describe('export.controller.test.ts - Kế hoạch 4A.5: API xuất BM06 và Tổng quan', () => {
  let app: INestApplication;
  let ownerSql: postgres.Sql;
  let appClient: ReturnType<typeof createCustomClient>;

  const cookies: Record<string, string> = {};
  let unitWithAccessCookie: string;
  let unitNoAccessCookie: string;
  let testUnitWithAccessId: string;
  let testUnitNoAccessId: string;

  beforeAll(async () => {
    const testMigrateUrl = process.env.DATABASE_TEST_MIGRATE_URL;
    const testAppUrl = process.env.DATABASE_TEST_URL;
    if (!testMigrateUrl || !testAppUrl) {
      throw new Error('Thiếu DATABASE_TEST_MIGRATE_URL hoặc DATABASE_TEST_URL');
    }

    process.env.APP_ENV = 'test';
    process.env.SESSION_SECRET = 'a_very_long_random_session_secret_for_tests_at_least_32_chars';
    process.env.TRUSTED_PROXY_IPS = '127.0.0.1,::1';

    await runMigrations(testMigrateUrl);
    ownerSql = postgres(testMigrateUrl, { max: 1 });
    appClient = createCustomClient(testAppUrl);

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

    await ownerSql`TRUNCATE TABLE audit_log, unit_assignment, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, session, password_history, app_user, unit, cycle CASCADE`;

    // 1. Tạo đơn vị
    const [u1] = await appClient.db
      .insert(unit)
      .values({ code: 'UNIT_EXP_YES', name: 'Đơn vị có quyền', kind: 'department' })
      .returning();
    testUnitWithAccessId = u1.id;

    const [u2] = await appClient.db
      .insert(unit)
      .values({ code: 'UNIT_EXP_NO', name: 'Đơn vị không có quyền', kind: 'center' })
      .returning();
    testUnitNoAccessId = u2.id;

    const origin = 'http://localhost:3000';
    async function loginAndGetCookie(email: string, pass: string): Promise<string> {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', origin)
        .send({ email, password: pass });
      expect(res.status).toBe(200);
      const cookieHeader = res.headers['set-cookie'];
      const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
      return cookie.split(';')[0];
    }

    // 2. Tạo users và đăng nhập để lấy cookie
    const roles = ['admin', 'ban4', 'viewer'] as const;
    for (const r of roles) {
      const rawPassword = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
      const passwordHash = await hashPassword(rawPassword);
      const email = `test_exp_${r}_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`;

      const [u] = await appClient.db
        .insert(appUser)
        .values({
          email,
          fullName: 'User ' + r,
          role: r,
          passwordHash,
          isActive: true,
          mustChangePassword: false,
        })
        .returning();

      await appClient.db.insert(passwordHistory).values({ userId: u.id, passwordHash });

      cookies[r] = await loginAndGetCookie(email, rawPassword);
    }

    // User unit có quyền
    {
      const rawPassword = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
      const passwordHash = await hashPassword(rawPassword);
      const email = `test_exp_unit_yes_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`;
      const [u] = await appClient.db
        .insert(appUser)
        .values({
          email,
          fullName: 'Unit User Yes',
          role: 'unit',
          unitId: testUnitWithAccessId,
          passwordHash,
          isActive: true,
          mustChangePassword: false,
        })
        .returning();
      await appClient.db.insert(passwordHistory).values({ userId: u.id, passwordHash });
      unitWithAccessCookie = await loginAndGetCookie(email, rawPassword);
    }

    // User unit không có quyền
    {
      const rawPassword = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
      const passwordHash = await hashPassword(rawPassword);
      const email = `test_exp_unit_no_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`;
      const [u] = await appClient.db
        .insert(appUser)
        .values({
          email,
          fullName: 'Unit User No',
          role: 'unit',
          unitId: testUnitNoAccessId,
          passwordHash,
          isActive: true,
          mustChangePassword: false,
        })
        .returning();
      await appClient.db.insert(passwordHistory).values({ userId: u.id, passwordHash });
      unitNoAccessCookie = await loginAndGetCookie(email, rawPassword);
    }

    // 3. Import cycle 2026
    const excelPath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
      : fs.existsSync(path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx'))
      ? path.resolve(process.cwd(), '../data/RRTY2026.MBF.xlsx')
      : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
    const excelBuffer = fs.readFileSync(excelPath);

    await importCycle({ year: 2026, file: excelBuffer, actor: null }, appClient.db);
    await ensurePeriods(2026, null, appClient.db);

    // Gán unit1 vào 1 control của HD11.R27
    const [profR27] = await appClient.db
      .select()
      .from(riskProfile)
      .where(eq(riskProfile.riskCode, 'HD11.R27'));

    const [ctrlR27] = await appClient.db
      .select()
      .from(control)
      .where(eq(control.profileId, profR27.id))
      .limit(1);

    await appClient.db.insert(unitAssignment).values({
      targetType: 'control',
      targetId: ctrlR27.id,
      unitId: testUnitWithAccessId,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (ownerSql) await ownerSql.end();
  });

  describe('GET /api/export/profile/:riskCode', () => {
    it('chưa đăng nhập: 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/export/profile/HD11.R27');
      expect(res.status).toBe(401);
    });

    it('viewer: 403 FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/export/profile/HD11.R27')
        .set('Cookie', cookies.viewer);
      expect(res.status).toBe(403);
    });

    it('unit không có mục trong hồ sơ: 403 FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/export/profile/HD11.R27')
        .set('Cookie', unitNoAccessCookie);
      expect(res.status).toBe(403);
    });

    it('unit có mục trong hồ sơ: 200 xlsx', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/export/profile/HD11.R27')
        .set('Cookie', unitWithAccessCookie);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('BM06_HD11.R27_hien-hanh.xlsx');
    });

    it('admin với period: 200 xlsx và tên tệp có periodKey', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/export/profile/HD11.R27?period=2026-Q1')
        .set('Cookie', cookies.admin)
        .buffer()
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (chunk) => chunks.push(chunk));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('BM06_HD11.R27_2026-Q1.xlsx');

      // Đọc file trả về
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body);
      expect(wb.worksheets.length).toBeGreaterThan(0);
    });

    it('hồ sơ không tồn tại: 404 NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/export/profile/UNKNOWN.R99')
        .set('Cookie', cookies.admin);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/export/summary', () => {
    it('chưa đăng nhập: 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/export/summary');
      expect(res.status).toBe(401);
    });

    it('viewer xuất tổng quan: 200 xlsx', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/export/summary')
        .set('Cookie', cookies.viewer);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('Tong_quan_hien-hanh.xlsx');
    });

    it('admin xuất tổng quan kèm period: 200 xlsx với tên tệp đúng', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/export/summary?period=2026-Q1')
        .set('Cookie', cookies.admin);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('Tong_quan_2026-Q1.xlsx');
    });
  });
});
