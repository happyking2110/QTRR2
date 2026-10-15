import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import postgres from 'postgres';
import { AppModule } from '../../app.module';
import { AppErrorFilter } from '../../http/filters/app-error.filter';
import { runMigrations } from '../db/migrate';
import { createCustomClient, DATABASE_DB } from '../db/client';
import { DATABASE_CONNECTION } from '../../http/controllers/health.controller';
import { importCycle } from './cycles';
import { seedInitialPeriods } from './periods';
import { appUser, unit, indicator, indicatorReading, residualAssessment } from '../db/schema';
import { hashPassword } from '../auth/password';
import { eq } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs';

function getRequiredTestUrl(varName: string): string {
  const url = process.env[varName];
  if (!url) throw new Error(`Thiếu biến môi trường ${varName}`);
  return url;
}

const testMigrateUrl = getRequiredTestUrl('DATABASE_TEST_MIGRATE_URL');
const testAppUrl = getRequiredTestUrl('DATABASE_TEST_URL');

describe('Kịch bản bắt buộc Kế hoạch 4C (Section 3)', () => {
  let app: INestApplication;
  let testAppClient: any;
  let adminCookie: string;
  let ban4Cookie: string;
  let tt1Cookie: string;
  let ban3Cookie: string;

  beforeAll(async () => {
    await runMigrations(testMigrateUrl);
    testAppClient = createCustomClient(testAppUrl);

    // Clean DB
    const sql = postgres(testMigrateUrl);
    await sql.unsafe(`
      TRUNCATE TABLE session, audit_log, indicator_reading, action_update,
                     residual_assessment, action_task, action_control,
                     control_cause, action_plan, indicator, control,
                     impact, cause, risk_profile, period, cycle,
                     app_user, unit CASCADE;
    `);
    await sql.end();

    const excelPath = path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
    const fileBuffer = fs.readFileSync(excelPath);
    await importCycle({ year: 2026, file: fileBuffer }, testAppClient.db);
    const cycleRow = await testAppClient.db.query.cycle.findFirst({
      where: (c: any, { eq }: any) => eq(c.year, 2026),
    });
    await seedInitialPeriods(cycleRow.id, testAppClient.db);

    // Create units
    const [uBan4] = await testAppClient.db
      .insert(unit)
      .values({ code: 'BAN4', name: 'Ban 4', kind: 'department' })
      .returning();
    const [uBan3] = await testAppClient.db
      .insert(unit)
      .values({ code: 'BAN3', name: 'Ban 3', kind: 'department' })
      .returning();
    const [uTT1] = await testAppClient.db
      .insert(unit)
      .values({ code: 'TT1', name: 'TT1', kind: 'center' })
      .returning();

    // Assign ownerUnitId for CN03.R14.KRI01 to TT1, HD11.R27.KCI02 to BAN3
    await testAppClient.db
      .update(indicator)
      .set({ ownerUnitId: uTT1.id })
      .where(eq(indicator.code, 'CN03.R14.KRI01'));

    await testAppClient.db
      .update(indicator)
      .set({ ownerUnitId: uBan3.id })
      .where(eq(indicator.code, 'HD11.R27.KCI02'));

    // Create users
    const pwdHash = await hashPassword('password123');
    await testAppClient.db.insert(appUser).values([
      {
        email: 'admin@mbf.vn',
        fullName: 'Admin User',
        role: 'admin',
        isActive: true,
        mustChangePassword: false,
        passwordHash: pwdHash,
      },
      {
        email: 'ban4@mbf.vn',
        fullName: 'Ban 4 User',
        role: 'ban4',
        unitId: uBan4.id,
        isActive: true,
        mustChangePassword: false,
        passwordHash: pwdHash,
      },
      {
        email: 'tt1@mbf.vn',
        fullName: 'TT1 User',
        role: 'unit',
        unitId: uTT1.id,
        isActive: true,
        mustChangePassword: false,
        passwordHash: pwdHash,
      },
      {
        email: 'ban3@mbf.vn',
        fullName: 'Ban 3 User',
        role: 'unit',
        unitId: uBan3.id,
        isActive: true,
        mustChangePassword: false,
        passwordHash: pwdHash,
      },
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_DB)
      .useValue(testAppClient.db)
      .overrideProvider(DATABASE_CONNECTION)
      .useValue(testAppClient.client)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();

    // Logins
    const resAdmin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'admin@mbf.vn', password: 'password123' });
    adminCookie = resAdmin.headers['set-cookie'][0];

    const resBan4 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'ban4@mbf.vn', password: 'password123' });
    ban4Cookie = resBan4.headers['set-cookie'][0];

    const resTT1 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'tt1@mbf.vn', password: 'password123' });
    tt1Cookie = resTT1.headers['set-cookie'][0];

    const resBan3 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'ban3@mbf.vn', password: 'password123' });
    ban3Cookie = resBan3.headers['set-cookie'][0];
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testAppClient) await testAppClient.client.end();
  });

  it('Bước 1: Đăng nhập admin thiết lập CN03.R14.KRI01 (vụ việc, higher_is_worse, vàng 1, đỏ 2)', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/profiles/CN03.R14/indicators/CN03.R14.KRI01/targets')
      .set('Cookie', adminCookie)
      .set('Origin', 'http://localhost:3000')
      .send({
        unitKind: 'count',
        unitLabel: 'vụ việc',
        direction: 'higher_is_worse',
        yellowAt: 1,
        redAt: 2,
        targetValue: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('CN03.R14.KRI01');
    expect(res.body.unitKind).toBe('count');
    expect(res.body.unitLabel).toBe('vụ việc');
    expect(res.body.direction).toBe('higher_is_worse');
    expect(res.body.yellowAt).toBe(1);
    expect(res.body.redAt).toBe(2);
    expect(res.body.targetValue).toBeNull();
  });

  it('Bước 2: Đăng nhập ban4: thử thiết lập cùng chỉ số -> nhận 403', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/profiles/CN03.R14/indicators/CN03.R14.KRI01/targets')
      .set('Cookie', ban4Cookie)
      .set('Origin', 'http://localhost:3000')
      .send({
        unitKind: 'count',
        unitLabel: 'vụ việc',
        direction: 'higher_is_worse',
        yellowAt: 1,
        redAt: 2,
        targetValue: null,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('Bước 3: Đăng nhập unit TT1 xem trước zone-preview hoặc nộp thấy đúng xanh, vàng, đỏ', async () => {
    const kri = await testAppClient.db.query.indicator.findFirst({
      where: (i: any, { eq }: any) => eq(i.code, 'CN03.R14.KRI01'),
    });

    const resGreen = await request(app.getHttpServer())
      .get(`/api/indicators/${kri.id}/zone-preview?value=0`)
      .set('Cookie', tt1Cookie);
    expect(resGreen.status).toBe(200);
    expect(resGreen.body.zone).toBe('green');

    const resYellow = await request(app.getHttpServer())
      .get(`/api/indicators/${kri.id}/zone-preview?value=1`)
      .set('Cookie', tt1Cookie);
    expect(resYellow.status).toBe(200);
    expect(resYellow.body.zone).toBe('yellow');

    const resRed = await request(app.getHttpServer())
      .get(`/api/indicators/${kri.id}/zone-preview?value=3`)
      .set('Cookie', tt1Cookie);
    expect(resRed.status).toBe(200);
    expect(resRed.body.zone).toBe('red');
  });

  it('Bước 4: Đăng nhập admin thiết lập HD11.R27.KCI02 (đơn vị %, lower_is_worse, vàng 95, đỏ 80, mục tiêu 100)', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/profiles/HD11.R27/indicators/HD11.R27.KCI02/targets')
      .set('Cookie', adminCookie)
      .set('Origin', 'http://localhost:3000')
      .send({
        unitKind: 'percent',
        unitLabel: '%',
        direction: 'lower_is_worse',
        yellowAt: 95,
        redAt: 80,
        targetValue: 100,
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('HD11.R27.KCI02');
    expect(res.body.unitKind).toBe('percent');
    expect(res.body.unitLabel).toBe('%');
    expect(res.body.direction).toBe('lower_is_worse');
    expect(res.body.yellowAt).toBe(95);
    expect(res.body.redAt).toBe(80);
    expect(res.body.targetValue).toBe(100);
  });

  it('Bước 5: Unit BAN3 nộp 92 cho KCI02, admin duyệt bản nộp', async () => {
    const kci = await testAppClient.db.query.indicator.findFirst({
      where: (i: any, { eq }: any) => eq(i.code, 'HD11.R27.KCI02'),
    });

    const resSubmit = await request(app.getHttpServer())
      .post(`/api/indicators/${kci.id}/readings`)
      .set('Cookie', ban3Cookie)
      .set('Origin', 'http://localhost:3000')
      .send({
        periodKey: '2026-Q4',
        valueNum: 92,
      });

    expect(resSubmit.status).toBe(201);
    const readingId = resSubmit.body.id;

    const resApprove = await request(app.getHttpServer())
      .post(`/api/readings/${readingId}/approve`)
      .set('Cookie', adminCookie)
      .set('Origin', 'http://localhost:3000')
      .send({});

    expect(resApprove.status).toBe(200);
    expect(resApprove.body.status).toBe('approved');
  });

  it('Bước 6: Gọi GET /api/profiles/HD11.R27: targetProgress = 92, score = 20', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/profiles/HD11.R27?cycle=2026&period=2026-Q4')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    const kci = res.body.indicators.find((ind: any) => ind.code === 'HD11.R27.KCI02');
    expect(kci).toBeDefined();
    expect(kci.targetProgress).toBe(92);
    expect(kci.current).toBeDefined();
    expect(kci.current.valueNum).toBe(92);
    expect(kci.current.zone).toBe('yellow');

    expect(res.body.profile.inherent).toBeDefined();
    expect(res.body.profile.inherent.score).toBe(20); // 5 * 4 = 20
  });
});
