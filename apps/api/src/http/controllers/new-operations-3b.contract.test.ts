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
import {
  appUser,
  passwordHistory,
  session as sessionTable,
  indicator as indicatorTable,
  actionTask as actionTaskTable,
  actionPlan as actionPlanTable,
  unit as unitTable,
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

describe('Contract Schema Tests for 21 New Operations (3B.7)', () => {
  let app: INestApplication;
  let ownerSql: postgres.Sql;
  let appClient: ReturnType<typeof createCustomClient>;
  let ajv: InstanceType<typeof Ajv2020>;
  let contractDoc: any;
  const origin = 'http://localhost:3000';

  let admin1Cookie: string;
  let admin2Cookie: string;
  let unitCookie: string;
  let ban4Cookie: string;

  let autoIndicatorId: string;
  let manualIndicatorId: string;
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

    // Create Admin 1
    const p1 = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
    const h1 = await hashPassword(p1);
    const [adm1] = await appClient.db.insert(appUser).values({
      email: `admin1_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
      fullName: 'Admin 1 User',
      role: 'admin',
      passwordHash: h1,
      isActive: true,
      mustChangePassword: false,
    }).returning();
    await appClient.db.insert(passwordHistory).values({ userId: adm1.id, passwordHash: h1 });
    admin1Cookie = await createSession(adm1.id);

    // Create Admin 2
    const p2 = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
    const h2 = await hashPassword(p2);
    const [adm2] = await appClient.db.insert(appUser).values({
      email: `admin2_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
      fullName: 'Admin 2 User',
      role: 'admin',
      passwordHash: h2,
      isActive: true,
      mustChangePassword: false,
    }).returning();
    await appClient.db.insert(passwordHistory).values({ userId: adm2.id, passwordHash: h2 });
    admin2Cookie = await createSession(adm2.id);

    // Get units
    const [tt1Unit] = await appClient.db.select().from(unitTable).where(eq(unitTable.code, 'TT1')).limit(1);
    const [ban4Unit] = await appClient.db.select().from(unitTable).where(eq(unitTable.code, 'BAN4')).limit(1);

    // Create Unit User (TT1)
    const p3 = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
    const h3 = await hashPassword(p3);
    const [uUser] = await appClient.db.insert(appUser).values({
      email: `unit_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
      fullName: 'TT1 Unit User',
      role: 'unit',
      unitId: tt1Unit.id,
      passwordHash: h3,
      isActive: true,
      mustChangePassword: false,
    }).returning();
    await appClient.db.insert(passwordHistory).values({ userId: uUser.id, passwordHash: h3 });
    unitCookie = await createSession(uUser.id);

    // Create BAN4 User
    const p4 = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
    const h4 = await hashPassword(p4);
    const [bUser] = await appClient.db.insert(appUser).values({
      email: `ban4_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`,
      fullName: 'BAN4 User',
      role: 'ban4',
      unitId: ban4Unit.id,
      passwordHash: h4,
      isActive: true,
      mustChangePassword: false,
    }).returning();
    await appClient.db.insert(passwordHistory).values({ userId: bUser.id, passwordHash: h4 });
    ban4Cookie = await createSession(bUser.id);

    // Find sample indicators
    const inds = await appClient.db.select().from(indicatorTable);
    const autoInd = inds.find((i) => i.code === 'HD11.R27.KRI01') || inds[0];
    const manualInd = inds.find((i) => !i.greenLower && !i.greenUpper && !i.yellowLower && !i.yellowUpper) || inds[1];
    autoIndicatorId = autoInd.id;
    manualIndicatorId = manualInd.id;

    // Sample task
    const [sampleTask] = await appClient.db.select().from(actionTaskTable).limit(1);
    sampleTaskId = sampleTask.id;

    // Assign autoIndicator and sampleTask to TT1
    await appClient.db.update(indicatorTable).set({ ownerUnitId: tt1Unit.id }).where(eq(indicatorTable.id, autoIndicatorId));
    await appClient.db.update(actionTaskTable).set({ unitId: tt1Unit.id }).where(eq(actionTaskTable.id, sampleTaskId));
  });

  afterAll(async () => {
    if (app) await app.close();
    if (appClient) await appClient.client.end();
    if (ownerSql) await ownerSql.end();
  });

  // 1. GET /api/indicators/{id}/zone-preview
  it('1. GET /api/indicators/{id}/zone-preview: 200 ZonePreview, 422 ErrorBody', async () => {
    const res200 = await request(app.getHttpServer())
      .get(`/api/indicators/${autoIndicatorId}/zone-preview?value=5`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/ZonePreview', res200.body);

    const res422 = await request(app.getHttpServer())
      .get(`/api/indicators/${autoIndicatorId}/zone-preview?value=150`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);
  });

  // 2. POST /api/indicators/{id}/readings
  let createdReadingId: string;
  it('2. POST /api/indicators/{id}/readings: 201 ReadingSubmission, 422 ErrorBody, 404 ErrorBody', async () => {
    const res201 = await request(app.getHttpServer())
      .post(`/api/indicators/${autoIndicatorId}/readings`)
      .set('Origin', origin)
      .set('Cookie', unitCookie)
      .send({ periodKey: '2026-10', valueNum: 7.5, note: 'Số liệu kiểm thử hợp đồng' });
    expect(res201.status).toBe(201);
    validateSchema('/components/schemas/ReadingSubmission', res201.body);
    createdReadingId = res201.body.id;

    const res422 = await request(app.getHttpServer())
      .post(`/api/indicators/${autoIndicatorId}/readings`)
      .set('Origin', origin)
      .set('Cookie', unitCookie)
      .send({ periodKey: '2026-10', valueNum: 999 });
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);

    const res404 = await request(app.getHttpServer())
      .post(`/api/indicators/${crypto.randomUUID()}/readings`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({ periodKey: '2026-10', valueNum: 5 });
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 3. GET /api/indicators/{id}/readings
  it('3. GET /api/indicators/{id}/readings: 200 array of ReadingSubmission, 404 ErrorBody', async () => {
    const res200 = await request(app.getHttpServer())
      .get(`/api/indicators/${autoIndicatorId}/readings?period=2026-10`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res200.status).toBe(200);
    validateSchema('/paths/~1api~1indicators~1{id}~1readings/get/responses/200/content/application~1json/schema', res200.body);

    const res404 = await request(app.getHttpServer())
      .get(`/api/indicators/${crypto.randomUUID()}/readings`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 4. POST /api/tasks/{id}/updates
  let createdTaskUpdateId: string;
  it('4. POST /api/tasks/{id}/updates: 201 TaskUpdateSubmission, 422 ErrorBody, 404 ErrorBody', async () => {
    const res201 = await request(app.getHttpServer())
      .post(`/api/tasks/${sampleTaskId}/updates`)
      .set('Origin', origin)
      .set('Cookie', unitCookie)
      .send({ periodKey: '2026-Q4', progress: 40, note: 'Cập nhật tiến độ kiểm thử' });
    expect(res201.status).toBe(201);
    validateSchema('/components/schemas/TaskUpdateSubmission', res201.body);
    createdTaskUpdateId = res201.body.id;

    const res422 = await request(app.getHttpServer())
      .post(`/api/tasks/${sampleTaskId}/updates`)
      .set('Origin', origin)
      .set('Cookie', unitCookie)
      .send({ periodKey: '2026-Q4', progress: 150 });
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);

    const res404 = await request(app.getHttpServer())
      .post(`/api/tasks/${crypto.randomUUID()}/updates`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({ periodKey: '2026-Q4', progress: 50 });
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 5. GET /api/tasks/{id}/updates
  it('5. GET /api/tasks/{id}/updates: 200 array of TaskUpdateSubmission, 404 ErrorBody', async () => {
    const res200 = await request(app.getHttpServer())
      .get(`/api/tasks/${sampleTaskId}/updates`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res200.status).toBe(200);
    validateSchema('/paths/~1api~1tasks~1{id}~1updates/get/responses/200/content/application~1json/schema', res200.body);

    const res404 = await request(app.getHttpServer())
      .get(`/api/tasks/${crypto.randomUUID()}/updates`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 12. GET /api/approvals (Verify ReadingApprovalItem and TaskUpdateApprovalItem)
  it('12. GET /api/approvals: 200 array of ApprovalItem (cả hai loại reading & task_update)', async () => {
    const res200 = await request(app.getHttpServer())
      .get('/api/approvals?cycle=2026')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res200.status).toBe(200);
    validateSchema('/paths/~1api~1approvals/get/responses/200/content/application~1json/schema', res200.body);

    const readingItem = res200.body.find((item: any) => item.kind === 'reading');
    const taskItem = res200.body.find((item: any) => item.kind === 'task_update');
    expect(readingItem).toBeDefined();
    expect(taskItem).toBeDefined();

    const [expectedActionPlan] = await appClient.db
      .select({
        code: actionPlanTable.code,
        description: actionPlanTable.description,
      })
      .from(actionTaskTable)
      .innerJoin(actionPlanTable, eq(actionTaskTable.actionId, actionPlanTable.id))
      .where(eq(actionTaskTable.id, sampleTaskId));
    expect(expectedActionPlan.code).toBe('HD11.R27.KH01');
    expect(taskItem.targetName).toBe(expectedActionPlan.description);
    expect(taskItem.targetName).not.toBe('Toàn bộ kế hoạch');

    validateSchema('/components/schemas/ReadingApprovalItem', readingItem);
    validateSchema('/components/schemas/TaskUpdateApprovalItem', taskItem);
    validateSchema('/components/schemas/ApprovalItem', readingItem);
    validateSchema('/components/schemas/ApprovalItem', taskItem);
  });

  // 6. POST /api/readings/{id}/withdraw
  it('6. POST /api/readings/{id}/withdraw: 200 ReadingSubmission, 404 ErrorBody', async () => {
    const res200 = await request(app.getHttpServer())
      .post(`/api/readings/${createdReadingId}/withdraw`)
      .set('Origin', origin)
      .set('Cookie', unitCookie);
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/ReadingSubmission', res200.body);
    expect(res200.body.status).toBe('withdrawn');

    const res404 = await request(app.getHttpServer())
      .post(`/api/readings/${crypto.randomUUID()}/withdraw`)
      .set('Origin', origin)
      .set('Cookie', unitCookie);
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 7. POST /api/readings/{id}/approve
  let approvedReadingId: string;
  it('7. POST /api/readings/{id}/approve: 200 ReadingSubmission, 404 ErrorBody, 409 Conflict', async () => {
    // Tạo bản mới để duyệt
    const resSub = await request(app.getHttpServer())
      .post(`/api/indicators/${autoIndicatorId}/readings`)
      .set('Origin', origin)
      .set('Cookie', unitCookie)
      .send({ periodKey: '2026-10', valueNum: 8.0, note: 'Bản nộp để duyệt' });
    expect(resSub.status).toBe(201);
    approvedReadingId = resSub.body.id;

    // Duyệt bởi admin1 (người nộp là unit)
    const res200 = await request(app.getHttpServer())
      .post(`/api/readings/${approvedReadingId}/approve`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/ReadingSubmission', res200.body);
    expect(res200.body.status).toBe('approved');

    // Thử duyệt lại bản đã duyệt -> 409
    const res409 = await request(app.getHttpServer())
      .post(`/api/readings/${approvedReadingId}/approve`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res409.status).toBe(409);
    validateSchema('/components/schemas/ErrorBody', res409.body);
    assertVietnameseError(res409.body);

    const res404 = await request(app.getHttpServer())
      .post(`/api/readings/${crypto.randomUUID()}/approve`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 8. POST /api/readings/{id}/reject
  it('8. POST /api/readings/{id}/reject: 200 ReadingSubmission, 422 ErrorBody, 404 ErrorBody', async () => {
    // Tạo bản mới để từ chối
    const resSub = await request(app.getHttpServer())
      .post(`/api/indicators/${autoIndicatorId}/readings`)
      .set('Origin', origin)
      .set('Cookie', unitCookie)
      .send({ periodKey: '2026-10', valueNum: 9.0, note: 'Bản nộp để từ chối' });
    expect(resSub.status).toBe(201);
    const rejReadingId = resSub.body.id;

    const res200 = await request(app.getHttpServer())
      .post(`/api/readings/${rejReadingId}/reject`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({ reason: 'Số liệu không chính xác theo báo cáo' });
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/ReadingSubmission', res200.body);
    expect(res200.body.status).toBe('rejected');

    // Thiếu lý do -> 422
    const res422 = await request(app.getHttpServer())
      .post(`/api/readings/${rejReadingId}/reject`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({});
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);

    const res404 = await request(app.getHttpServer())
      .post(`/api/readings/${crypto.randomUUID()}/reject`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({ reason: 'Số liệu không chính xác theo báo cáo' });
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 9. POST /api/task-updates/{id}/withdraw
  it('9. POST /api/task-updates/{id}/withdraw: 200 TaskUpdateSubmission, 404 ErrorBody', async () => {
    const res200 = await request(app.getHttpServer())
      .post(`/api/task-updates/${createdTaskUpdateId}/withdraw`)
      .set('Origin', origin)
      .set('Cookie', unitCookie);
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/TaskUpdateSubmission', res200.body);
    expect(res200.body.status).toBe('withdrawn');

    const res404 = await request(app.getHttpServer())
      .post(`/api/task-updates/${crypto.randomUUID()}/withdraw`)
      .set('Origin', origin)
      .set('Cookie', unitCookie);
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 10. POST /api/task-updates/{id}/approve
  let approvedTaskId: string;
  it('10. POST /api/task-updates/{id}/approve: 200 TaskUpdateSubmission, 404 ErrorBody, 409 Conflict', async () => {
    const resSub = await request(app.getHttpServer())
      .post(`/api/tasks/${sampleTaskId}/updates`)
      .set('Origin', origin)
      .set('Cookie', unitCookie)
      .send({ periodKey: '2026-Q4', progress: 50, note: 'Bản nộp tiến độ để duyệt' });
    expect(resSub.status).toBe(201);
    approvedTaskId = resSub.body.id;

    const res200 = await request(app.getHttpServer())
      .post(`/api/task-updates/${approvedTaskId}/approve`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/TaskUpdateSubmission', res200.body);
    expect(res200.body.status).toBe('approved');

    // Duyệt lại -> 409
    const res409 = await request(app.getHttpServer())
      .post(`/api/task-updates/${approvedTaskId}/approve`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res409.status).toBe(409);
    validateSchema('/components/schemas/ErrorBody', res409.body);
    assertVietnameseError(res409.body);

    const res404 = await request(app.getHttpServer())
      .post(`/api/task-updates/${crypto.randomUUID()}/approve`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 11. POST /api/task-updates/{id}/reject
  it('11. POST /api/task-updates/{id}/reject: 200 TaskUpdateSubmission, 422 ErrorBody, 404 ErrorBody', async () => {
    const resSub = await request(app.getHttpServer())
      .post(`/api/tasks/${sampleTaskId}/updates`)
      .set('Origin', origin)
      .set('Cookie', unitCookie)
      .send({ periodKey: '2026-Q4', progress: 60, note: 'Bản nộp để từ chối' });
    expect(resSub.status).toBe(201);
    const rejTaskId = resSub.body.id;

    const res200 = await request(app.getHttpServer())
      .post(`/api/task-updates/${rejTaskId}/reject`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({ reason: 'Chưa đủ bằng chứng hoàn thành hạng mục' });
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/TaskUpdateSubmission', res200.body);
    expect(res200.body.status).toBe('rejected');

    const res422 = await request(app.getHttpServer())
      .post(`/api/task-updates/${rejTaskId}/reject`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({});
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);

    const res404 = await request(app.getHttpServer())
      .post(`/api/task-updates/${crypto.randomUUID()}/reject`)
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({ reason: 'Chưa đủ bằng chứng hoàn thành hạng mục' });
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 13. POST /api/approvals/bulk-approve
  it('13. POST /api/approvals/bulk-approve: 200 BulkApproveResult, 422 ErrorBody', async () => {
    // Tạo 1 reading và 1 task update chờ duyệt
    const r1 = await request(app.getHttpServer())
      .post(`/api/indicators/${autoIndicatorId}/readings`)
      .set('Origin', origin)
      .set('Cookie', unitCookie)
      .send({ periodKey: '2026-10', valueNum: 5.0, note: 'Bulk test reading' });
    const t1 = await request(app.getHttpServer())
      .post(`/api/tasks/${sampleTaskId}/updates`)
      .set('Origin', origin)
      .set('Cookie', unitCookie)
      .send({ periodKey: '2026-Q4', progress: 70, note: 'Bulk test task' });

    // Trùng lặp mục -> 422
    const res422 = await request(app.getHttpServer())
      .post('/api/approvals/bulk-approve')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({
        items: [
          { kind: 'reading', id: r1.body.id },
          { kind: 'reading', id: r1.body.id },
        ],
      });
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);

    // Một mục lỗi -> 404, details luôn là mảng 1 phần tử
    const res404 = await request(app.getHttpServer())
      .post('/api/approvals/bulk-approve')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({
        items: [
          { kind: 'reading', id: r1.body.id },
          { kind: 'reading', id: crypto.randomUUID() },
          { kind: 'task_update', id: t1.body.id },
        ],
      });
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    expect(Array.isArray(res404.body.details)).toBe(true);
    expect(res404.body.details).toHaveLength(1);
    expect(res404.body.details[0]).toMatchObject({
      kind: 'reading',
      code: 'NOT_FOUND',
    });

    // Duyệt thành công cả 2 mục -> 200
    const res200 = await request(app.getHttpServer())
      .post('/api/approvals/bulk-approve')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({
        items: [
          { kind: 'reading', id: r1.body.id },
          { kind: 'task_update', id: t1.body.id },
        ],
      });
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/BulkApproveResult', res200.body);
    expect(res200.body.approved).toBe(2);
  });

  // 14. POST /api/cycles/{year}/periods/ensure
  it('14. POST /api/cycles/{year}/periods/ensure: 200 array of PeriodSummary, 404 ErrorBody', async () => {
    const res200 = await request(app.getHttpServer())
      .post('/api/cycles/2026/periods/ensure')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res200.status).toBe(200);
    validateSchema('/paths/~1api~1cycles~1{year}~1periods~1ensure/post/responses/200/content/application~1json/schema', res200.body);

    const res404 = await request(app.getHttpServer())
      .post('/api/cycles/2099/periods/ensure')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 15. POST /api/cycles/{year}/periods/events
  it('15. POST /api/cycles/{year}/periods/events: 201 PeriodSummary, 422 ErrorBody', async () => {
    const res201 = await request(app.getHttpServer())
      .post('/api/cycles/2026/periods/events')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({
        label: 'Đợt kiểm tra quý 2',
        startsOn: '2026-05-01',
        endsOn: '2026-05-15',
      });
    expect(res201.status).toBe(201);
    validateSchema('/components/schemas/PeriodSummary', res201.body);

    // Ngày bắt đầu sau ngày kết thúc -> 422
    const res422 = await request(app.getHttpServer())
      .post('/api/cycles/2026/periods/events')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({
        label: 'Đợt lỗi ngày',
        startsOn: '2026-06-20',
        endsOn: '2026-06-10',
      });
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);
  });

  // 16. POST /api/cycles/{year}/periods/{key}/close
  it('16. POST /api/cycles/{year}/periods/{key}/close: 200 PeriodSummary, 404 ErrorBody', async () => {
    // Kỳ 2026-11 không có pending nào -> khóa thành công
    const res200 = await request(app.getHttpServer())
      .post('/api/cycles/2026/periods/2026-11/close')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/PeriodSummary', res200.body);
    expect(res200.body.closed).toBe(true);

    const res404 = await request(app.getHttpServer())
      .post('/api/cycles/2026/periods/2026-99/close')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 17. POST /api/cycles/{year}/periods/{key}/reopen
  it('17. POST /api/cycles/{year}/periods/{key}/reopen: 200 PeriodSummary, 422 ErrorBody', async () => {
    // Mở lại kỳ 2026-11 vừa khóa
    const res200 = await request(app.getHttpServer())
      .post('/api/cycles/2026/periods/2026-11/reopen')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({ reason: 'Mở lại để đơn vị bổ sung số liệu báo cáo' });
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/PeriodSummary', res200.body);
    expect(res200.body.closed).toBe(false);

    // Thiếu lý do -> 422
    const res422 = await request(app.getHttpServer())
      .post('/api/cycles/2026/periods/2026-11/reopen')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({});
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);
  });

  // 18. GET /api/settings
  it('18. GET /api/settings: 200 Settings', async () => {
    const res200 = await request(app.getHttpServer())
      .get('/api/settings')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/Settings', res200.body);
  });

  // 19. PUT /api/settings
  it('19. PUT /api/settings: 200 Settings, 422 ErrorBody', async () => {
    const res200 = await request(app.getHttpServer())
      .put('/api/settings')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({
        slowDays: 14,
        slowProgress: 10,
        staleDays: 45,
        dueDay: 15,
      });
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/Settings', res200.body);
    expect(res200.body.slowDays).toBe(14);

    // Giá trị âm -> 422
    const res422 = await request(app.getHttpServer())
      .put('/api/settings')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({
        slowDays: -1,
        slowProgress: 10,
        staleDays: 45,
        dueDay: 15,
      });
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);
  });

  // 20. PUT /api/profiles/{riskCode}/residual/{periodKey}
  it('20. PUT /api/profiles/{riskCode}/residual/{periodKey}: 200 ResidualEntry, 422 ErrorBody, 404 ErrorBody', async () => {
    const res200 = await request(app.getHttpServer())
      .put('/api/profiles/HD11.R27/residual/2026-Q4?cycle=2026')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({
        impactLabel: 'Trung bình',
        likelihoodLabel: 'Có thể xảy ra',
        levelLabel: 'Trung bình',
      });
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/ResidualEntry', res200.body);
    expect(res200.body.rating.levelLabel).toBe('Trung bình');

    // Sai định dạng kỳ (chỉ nhận quarterly) -> 422
    const res422 = await request(app.getHttpServer())
      .put('/api/profiles/HD11.R27/residual/2026-10?cycle=2026')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({
        impactLabel: 'Trung bình',
        likelihoodLabel: 'Có thể xảy ra',
        levelLabel: 'Trung bình',
      });
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);

    // Hồ sơ không tồn tại -> 404
    const res404 = await request(app.getHttpServer())
      .put('/api/profiles/HD99.R99/residual/2026-Q4?cycle=2026')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie)
      .send({
        impactLabel: 'Trung bình',
        likelihoodLabel: 'Có thể xảy ra',
        levelLabel: 'Trung bình',
      });
    expect(res404.status).toBe(404);
    validateSchema('/components/schemas/ErrorBody', res404.body);
    assertVietnameseError(res404.body);
  });

  // 21. GET /api/audit
  it('21. GET /api/audit: 200 AuditPage, 422 ErrorBody', async () => {
    const res200 = await request(app.getHttpServer())
      .get('/api/audit?limit=20')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res200.status).toBe(200);
    validateSchema('/components/schemas/AuditPage', res200.body);

    // Định dạng ngày không hợp lệ -> 422
    const res422 = await request(app.getHttpServer())
      .get('/api/audit?from=invalid-date')
      .set('Origin', origin)
      .set('Cookie', admin1Cookie);
    expect(res422.status).toBe(422);
    validateSchema('/components/schemas/ErrorBody', res422.body);
    assertVietnameseError(res422.body);
  });
});
