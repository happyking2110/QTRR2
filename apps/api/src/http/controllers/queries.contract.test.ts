import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import postgres from 'postgres';
import { AppModule } from '../../app.module';
import { AppErrorFilter } from '../filters/app-error.filter';
import { runMigrations } from '../../server/db/migrate';
import { createCustomClient, DATABASE_DB } from '../../server/db/client';
import { DATABASE_CONNECTION } from './health.controller';
import { importCycle } from '../../server/services/cycles';
import { seedInitialPeriods } from '../../server/services/periods';
import {
  cycle,
  period,
  indicator,
  indicatorReading,
  actionPlan,
  actionTask,
  actionUpdate,
  residualAssessment,
  appUser,
} from '../../server/db/schema';
import crypto from 'crypto';
import { hashPassword } from '../../server/auth/password';
import { eq, and } from 'drizzle-orm';

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

describe('Contract Tests & Verification for Plan 2 Endpoints (2.4)', () => {
  let app: INestApplication;
  let ownerSql: postgres.Sql;
  let appClient: ReturnType<typeof createCustomClient>;
  let ajv: InstanceType<typeof Ajv2020>;
  let contractDoc: any;
  let testCycleId: string;
  let authCookie: string;

  const excelPath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
    ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
    : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
  const buffer = fs.readFileSync(excelPath);

  async function getAuthCookie(role: 'admin' | 'ban4' | 'unit' | 'viewer' = 'viewer'): Promise<string> {
    const password = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
    const passwordHash = await hashPassword(password);
    const email = `test_${crypto.randomBytes(6).toString('hex')}@mobifone.vn`;

    const [u] = await appClient.db
      .insert(appUser)
      .values({
        email,
        fullName: 'Test User ' + crypto.randomInt(100, 999),
        role,
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      })
      .returning();

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', process.env.APP_ORIGIN || 'http://localhost:3000')
      .send({ email: u.email, password });

    const setCookie = loginRes.headers['set-cookie'];
    return Array.isArray(setCookie) ? setCookie[0] : setCookie;
  }

  beforeAll(async () => {
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.SESSION_SECRET = 'a_very_long_random_session_secret_for_tests_at_least_32_chars';
    process.env.TRUSTED_PROXY_IPS = '127.0.0.1,::1';

    // 1. Setup DB
    await runMigrations(testMigrateUrl);
    ownerSql = postgres(testMigrateUrl, { max: 1 });
    appClient = createCustomClient(testAppUrl);

    // 2. Parse OpenAPI Schema
    const contractPath = findContractPath();
    const yamlContent = fs.readFileSync(contractPath, 'utf8');
    contractDoc = YAML.parse(yamlContent);

    ajv = new Ajv2020({ allErrors: true, strictSchema: false });
    addFormats(ajv);
    contractDoc['$id'] = 'urn:contracts:openapi';
    ajv.addSchema(contractDoc);

    // 3. Setup NestJS App
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
  });

  afterAll(async () => {
    if (app) await app.close();
    if (appClient) await appClient.client.end();
    if (ownerSql) await ownerSql.end();
  });

  beforeEach(async () => {
    // Dọn sạch hsrr_test và import lại chu kỳ 2026
    await ownerSql`TRUNCATE TABLE audit_log, unit_assignment, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, session, password_history, app_user, unit, cycle CASCADE`;

    const report = await importCycle({ year: 2026, file: buffer, actor: null }, appClient.db);
    testCycleId = report.cycleId;
    await seedInitialPeriods(testCycleId, appClient.db);
    authCookie = await getAuthCookie('viewer');
  });

  // Helper validate schema từ OpenAPI
  function validateSchema(schemaPointer: string, data: unknown) {
    const validate = ajv.getSchema(`urn:contracts:openapi#${schemaPointer}`);
    if (!validate) {
      throw new Error(`Schema không tìm thấy tại pointer: ${schemaPointer}`);
    }
    const valid = validate(data);
    if (!valid) {
      console.error('Validation errors:', validate.errors);
      expect(validate.errors).toBeNull();
    }
    expect(valid).toBe(true);
  }

  it('1. Test hợp đồng cho cả 11 endpoint: 200, 404, 422 hợp lệ với schema', async () => {
    const errorValidate = ajv.getSchema('urn:contracts:openapi#/components/schemas/ErrorBody');
    expect(errorValidate).toBeDefined();

    // 1. GET /api/health
    const resHealth = await request(app.getHttpServer()).get('/api/health');
    expect(resHealth.status).toBe(200);
    validateSchema('/paths/~1api~1health/get/responses/200/content/application~1json/schema', resHealth.body);

    // 2. GET /api/cycles
    const resCycles = await request(app.getHttpServer()).get('/api/cycles').set('Cookie', authCookie);
    expect(resCycles.status).toBe(200);
    validateSchema('/paths/~1api~1cycles/get/responses/200/content/application~1json/schema', resCycles.body);

    // 3. GET /api/cycles/{year}/periods
    const resPeriods = await request(app.getHttpServer()).get('/api/cycles/2026/periods').set('Cookie', authCookie);
    expect(resPeriods.status).toBe(200);
    validateSchema('/paths/~1api~1cycles~1{year}~1periods/get/responses/200/content/application~1json/schema', resPeriods.body);

    // 3b. 404 cho cycles/{year}/periods
    const resPeriods404 = await request(app.getHttpServer()).get('/api/cycles/2099/periods').set('Cookie', authCookie);
    expect(resPeriods404.status).toBe(404);
    expect(errorValidate!(resPeriods404.body)).toBe(true);

    // 3c. 422 cho cycles/{year}/periods
    const resPeriods422 = await request(app.getHttpServer()).get('/api/cycles/invalid_year/periods').set('Cookie', authCookie);
    expect(resPeriods422.status).toBe(422);
    expect(errorValidate!(resPeriods422.body)).toBe(true);

    // 4. GET /api/units
    const resUnits = await request(app.getHttpServer()).get('/api/units').set('Cookie', authCookie);
    expect(resUnits.status).toBe(200);
    validateSchema('/paths/~1api~1units/get/responses/200/content/application~1json/schema', resUnits.body);

    // 5. GET /api/profiles
    const resProfiles = await request(app.getHttpServer()).get('/api/profiles?cycle=2026').set('Cookie', authCookie);
    expect(resProfiles.status).toBe(200);
    validateSchema('/paths/~1api~1profiles/get/responses/200/content/application~1json/schema', resProfiles.body);

    // 5b. 404 cho profiles (cycle không tồn tại)
    const resProfiles404 = await request(app.getHttpServer()).get('/api/profiles?cycle=2099').set('Cookie', authCookie);
    expect(resProfiles404.status).toBe(404);
    expect(errorValidate!(resProfiles404.body)).toBe(true);

    // 5c. 404 cho profiles (period không tồn tại)
    const resProfilesPeriod404 = await request(app.getHttpServer()).get('/api/profiles?cycle=2026&period=2026-E99').set('Cookie', authCookie);
    expect(resProfilesPeriod404.status).toBe(404);
    expect(errorValidate!(resProfilesPeriod404.body)).toBe(true);

    // 5d. 422 cho profiles (period sai pattern)
    const resProfiles422 = await request(app.getHttpServer()).get('/api/profiles?period=invalid').set('Cookie', authCookie);
    expect(resProfiles422.status).toBe(422);
    expect(errorValidate!(resProfiles422.body)).toBe(true);

    // 6. GET /api/profiles/{riskCode}
    const resProfile = await request(app.getHttpServer()).get('/api/profiles/HD11.R27').set('Cookie', authCookie);
    expect(resProfile.status).toBe(200);
    validateSchema('/paths/~1api~1profiles~1{riskCode}/get/responses/200/content/application~1json/schema', resProfile.body);

    // 6b. 404 cho profiles/{riskCode}
    const resProfile404 = await request(app.getHttpServer()).get('/api/profiles/HD99.R99').set('Cookie', authCookie);
    expect(resProfile404.status).toBe(404);
    expect(errorValidate!(resProfile404.body)).toBe(true);

    // 6c. 422 cho profiles/{riskCode}
    const resProfile422 = await request(app.getHttpServer()).get('/api/profiles/invalid-code').set('Cookie', authCookie);
    expect(resProfile422.status).toBe(422);
    expect(errorValidate!(resProfile422.body)).toBe(true);

    // 7. GET /api/overview
    const resOverview = await request(app.getHttpServer()).get('/api/overview?cycle=2026').set('Cookie', authCookie);
    expect(resOverview.status).toBe(200);
    validateSchema('/paths/~1api~1overview/get/responses/200/content/application~1json/schema', resOverview.body);

    // 8. GET /api/heatmap
    const resHeatmap = await request(app.getHttpServer()).get('/api/heatmap?cycle=2026').set('Cookie', authCookie);
    expect(resHeatmap.status).toBe(200);
    validateSchema('/paths/~1api~1heatmap/get/responses/200/content/application~1json/schema', resHeatmap.body);

    // 9. GET /api/actions
    const resActions = await request(app.getHttpServer()).get('/api/actions?cycle=2026').set('Cookie', authCookie);
    expect(resActions.status).toBe(200);
    validateSchema('/paths/~1api~1actions/get/responses/200/content/application~1json/schema', resActions.body);

    // 10. GET /api/indicators
    const resIndicators = await request(app.getHttpServer()).get('/api/indicators?cycle=2026').set('Cookie', authCookie);
    expect(resIndicators.status).toBe(200);
    validateSchema('/paths/~1api~1indicators/get/responses/200/content/application~1json/schema', resIndicators.body);

    // 11. GET /api/indicators/{id}/history
    const [ind] = await appClient.db.select().from(indicator).limit(1);
    const resHistory = await request(app.getHttpServer()).get(`/api/indicators/${ind.id}/history`).set('Cookie', authCookie);
    expect(resHistory.status).toBe(200);
    validateSchema('/paths/~1api~1indicators~1{id}~1history/get/responses/200/content/application~1json/schema', resHistory.body);

    // 11b. 404 cho indicators/{id}/history
    const resHistory404 = await request(app.getHttpServer()).get('/api/indicators/00000000-0000-0000-0000-000000000000/history').set('Cookie', authCookie);
    expect(resHistory404.status).toBe(404);
    expect(errorValidate!(resHistory404.body)).toBe(true);

    // 11c. 422 cho indicators/{id}/history (uuid sai)
    const resHistory422 = await request(app.getHttpServer()).get('/api/indicators/not-a-uuid/history').set('Cookie', authCookie);
    expect(resHistory422.status).toBe(422);
    expect(errorValidate!(resHistory422.body)).toBe(true);
  });

  it('2. Trạng thái rỗng: ngay sau import trả đúng các số liệu rỗng mục 2', async () => {
    const resOverview = await request(app.getHttpServer()).get('/api/overview?cycle=2026').set('Cookie', authCookie);
    expect(resOverview.status).toBe(200);
    const ov = resOverview.body;

    expect(ov.hasApprovedData).toBe(false);
    expect(ov.asOfDate).toBeNull();
    expect(ov.profileCount).toBe(4);
    expect(ov.kri).toEqual({ total: 9, green: 0, yellow: 0, red: 0, noData: 9 });
    expect(ov.kci).toEqual({ total: 12, green: 0, yellow: 0, red: 0, noData: 12 });
    expect(ov.actions).toEqual({
      total: 10,
      completed: 0,
      overdue: 0,
      atRisk: 0,
      inProgress: 0,
      notStarted: 10,
    });
    expect(ov.actionProgressAverage).toBe(0);

    const resProfiles = await request(app.getHttpServer()).get('/api/profiles?cycle=2026').set('Cookie', authCookie);
    for (const p of resProfiles.body) {
      expect(p.residual).toBeNull();
    }

    const resIndicators = await request(app.getHttpServer()).get('/api/indicators?cycle=2026').set('Cookie', authCookie);
    for (const item of resIndicators.body) {
      expect(item.indicator.current).toBeNull();
    }
  });

  it('3. Có số liệu giả lập: vùng tự động/thủ công, pending/rejected không tính, 2026-Q4 thắng 2026-10, as-of lọc đúng', async () => {
    // Lấy 1 chỉ số tự động và 1 chỉ số thủ công
    const [indAuto] = await appClient.db
      .select()
      .from(indicator)
      .where(eq(indicator.code, 'HD11.R27.KRI01')); // Auto (tháng)
    const [indManual] = await appClient.db
      .select()
      .from(indicator)
      .where(eq(indicator.code, 'CN02.R13.KRI01')); // Manual (quý)

    // Giả lập reading pending và rejected (không được ảnh hưởng)
    await appClient.db.insert(indicatorReading).values([
      {
        indicatorId: indAuto.id,
        periodKey: '2026-10',
        valueNum: '10',
        zone: 'red',
        zoneSource: 'auto',
        status: 'pending',
        reviewedAt: null,
      },
      {
        indicatorId: indAuto.id,
        periodKey: '2026-10',
        valueNum: '10',
        zone: 'red',
        zoneSource: 'auto',
        status: 'rejected',
        reviewedAt: new Date('2026-11-02T10:00:00Z'),
      },
    ]);

    // Giả lập approved reading cho 2026-10 (green)
    await appClient.db.insert(indicatorReading).values({
      indicatorId: indAuto.id,
      periodKey: '2026-10',
      valueNum: '5',
      zone: 'green',
      zoneSource: 'auto',
      status: 'approved',
      reviewedAt: new Date('2026-11-05T10:00:00Z'),
    });

    // Giả lập approved reading cho 2026-Q4 (red) trên cùng chỉ số
    await appClient.db.insert(indicatorReading).values({
      indicatorId: indAuto.id,
      periodKey: '2026-Q4',
      valueNum: '30',
      zone: 'red',
      zoneSource: 'auto',
      status: 'approved',
      reviewedAt: new Date('2026-11-01T10:00:00Z'), // reviewed trước nhưng kỳ kết thúc muộn hơn!
    });

    // Giả lập manual reading cho CN02.R13.KRI01 ở 2026-Q4
    await appClient.db.insert(indicatorReading).values({
      indicatorId: indManual.id,
      periodKey: '2026-Q4',
      valueText: 'Sự cố giả lập kiểm thử',
      zone: 'yellow',
      zoneSource: 'manual',
      status: 'approved',
      reviewedAt: new Date('2027-01-05T10:00:00Z'),
    });

    // Kiểm tra không truyền period: kỳ 2026-Q4 (kết thúc 31/12) phải thắng 2026-10 (kết thúc 31/10)
    const resDef = await request(app.getHttpServer()).get(`/api/indicators?cycle=2026&riskCode=HD11.R27`).set('Cookie', authCookie);
    const indItemDef = resDef.body.find((i: any) => i.indicator.code === 'HD11.R27.KRI01');
    expect(indItemDef.indicator.current).toBeDefined();
    expect(indItemDef.indicator.current.periodKey).toBe('2026-Q4');
    expect(indItemDef.indicator.current.zone).toBe('red');

    // Kiểm tra khi chọn period=2026-10: không thấy số của quý, chỉ thấy số của 2026-10
    const res10 = await request(app.getHttpServer()).get(`/api/indicators?cycle=2026&period=2026-10&riskCode=HD11.R27`).set('Cookie', authCookie);
    const indItem10 = res10.body.find((i: any) => i.indicator.code === 'HD11.R27.KRI01');
    expect(indItem10.indicator.current.periodKey).toBe('2026-10');
    expect(indItem10.indicator.current.zone).toBe('green');

    // Chỉ số manual CN02.R13.KRI01 ở kỳ 2026-10 sẽ không có số liệu (current = null) vì nó được nhập ở 2026-Q4
    const resManual10 = await request(app.getHttpServer()).get(`/api/indicators?cycle=2026&period=2026-10&riskCode=CN02.R13`).set('Cookie', authCookie);
    const manualItem10 = resManual10.body.find((i: any) => i.indicator.code === 'CN02.R13.KRI01');
    expect(manualItem10.indicator.current).toBeNull();
  });

  it('4. Không có endpoint ngoài hợp đồng: khớp đúng 77 thao tác trong openapi.yaml (4C.6)', async () => {
    const expressApp = app.getHttpAdapter().getInstance();
    const stack = (expressApp.router?.stack || expressApp._router?.stack || []) as any[];

    const registeredRoutes: { method: string; path: string }[] = [];
    for (const layer of stack) {
      if (layer.route) {
        const routePath = layer.route.path;
        for (const method of Object.keys(layer.route.methods)) {
          registeredRoutes.push({
            method: method.toUpperCase(),
            path: routePath,
          });
        }
      }
    }

    // Lấy danh sách từ openapi.yaml
    const contractRoutes: { method: string; path: string }[] = [];
    for (const [p, pathItem] of Object.entries(contractDoc.paths as Record<string, any>)) {
      // Đổi {param} thành :param
      const nestPath = p.replace(/\{([^}]+)\}/g, ':$1');
      for (const m of ['get', 'post', 'put', 'delete', 'patch']) {
        if (pathItem[m]) {
          contractRoutes.push({
            method: m.toUpperCase(),
            path: nestPath,
          });
        }
      }
    }

    const sortFn = (a: { method: string; path: string }, b: { method: string; path: string }) =>
      `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`);

    registeredRoutes.sort(sortFn);
    contractRoutes.sort(sortFn);

    expect(registeredRoutes).toEqual(contractRoutes);
    expect(registeredRoutes).toHaveLength(77);
  });

  it('5. Bộ lọc và sắp xếp của /api/actions và /api/indicators', async () => {
    // Lọc actions theo q không phân biệt hoa thường
    const resQ = await request(app.getHttpServer()).get('/api/actions?q=HD11.r27').set('Cookie', authCookie);
    expect(resQ.status).toBe(200);
    expect(resQ.body.length).toBeGreaterThan(0);
    for (const item of resQ.body) {
      expect(
        item.action.code.toLowerCase().includes('hd11.r27') ||
          item.action.description.toLowerCase().includes('hd11.r27')
      ).toBe(true);
    }

    // Lọc actions theo status
    const resStatus = await request(app.getHttpServer()).get('/api/actions?status=not_started').set('Cookie', authCookie);
    expect(resStatus.status).toBe(200);
    expect(resStatus.body).toHaveLength(10);

    // Lọc actions theo dueFrom / dueTo
    const resDue = await request(app.getHttpServer()).get('/api/actions?dueFrom=2026-01-01&dueTo=2027-12-31').set('Cookie', authCookie);
    expect(resDue.status).toBe(200);
    for (const item of resDue.body) {
      expect(item.action.dueDate).toBeTruthy();
      expect(item.action.dueDate >= '2026-01-01').toBe(true);
      expect(item.action.dueDate <= '2027-12-31').toBe(true);
    }

    // Sắp xếp actions: hạn tăng dần, không có hạn ở cuối
    const resAllActions = await request(app.getHttpServer()).get('/api/actions').set('Cookie', authCookie);
    let seenNullDue = false;
    let prevDue: string | null = null;
    for (const item of resAllActions.body) {
      const d = item.action.dueDate;
      if (d === null) {
        seenNullDue = true;
      } else {
        expect(seenNullDue).toBe(false); // Không thể có non-null sau khi đã gặp null
        if (prevDue) {
          expect(d >= prevDue).toBe(true);
        }
        prevDue = d;
      }
    }

    // Lọc indicators theo kind
    const resKri = await request(app.getHttpServer()).get('/api/indicators?kind=kri').set('Cookie', authCookie);
    expect(resKri.status).toBe(200);
    expect(resKri.body).toHaveLength(9);
    for (const item of resKri.body) {
      expect(item.indicator.kind).toBe('kri');
    }

    const resKci = await request(app.getHttpServer()).get('/api/indicators?kind=kci').set('Cookie', authCookie);
    expect(resKci.status).toBe(200);
    expect(resKci.body).toHaveLength(12);

    // Lọc indicators theo zone=none
    const resZoneNone = await request(app.getHttpServer()).get('/api/indicators?zone=none').set('Cookie', authCookie);
    expect(resZoneNone.status).toBe(200);
    expect(resZoneNone.body).toHaveLength(21); // Khi chưa có số liệu, toàn bộ 21 chỉ số là none
  });

  it('6. /api/profiles/HD11.R27: đủ số lượng so với Excel và giữ nguyên format', async () => {
    const res = await request(app.getHttpServer()).get('/api/profiles/HD11.R27').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    const detail = res.body;

    // HD11.R27: 5 NN, 4 AH, 5 KS, 3 KH, 3 KRI + 3 KCI
    expect(detail.causes).toHaveLength(5);
    expect(detail.impacts).toHaveLength(4);
    expect(detail.controls).toHaveLength(5);
    expect(detail.actions).toHaveLength(3);

    const kris = detail.indicators.filter((i: any) => i.kind === 'kri');
    const kcis = detail.indicators.filter((i: any) => i.kind === 'kci');
    expect(kris).toHaveLength(3);
    expect(kcis).toHaveLength(3);

    // Mô tả giữ nguyên xuống dòng
    expect(detail.description).toContain('\n');

    // Kiểm tra liên kết hai chiều hợp nhất
    // HD11.R27: KS02 <-> KH02 (trong Excel chỉ khai báo ở cột KH)
    const kh02 = detail.actions.find((a: any) => a.code === 'HD11.R27.KH02');
    const ks02 = detail.controls.find((c: any) => c.code === 'HD11.R27.KS02');
    expect(kh02.controlCodes).toContain('HD11.R27.KS02');
    expect(ks02.actionCodes).toContain('HD11.R27.KH02');
  });

  it('7. Mã riskCode viết sai hoa thường hoặc không tồn tại -> 404 NOT_FOUND, không lộ chi tiết', async () => {
    // Viết thường
    const resLower = await request(app.getHttpServer()).get('/api/profiles/hd11.r27').set('Cookie', authCookie);
    expect(resLower.status).toBe(422); // Bị chặn bởi regex hoa thường của OpenAPI

    // Viết hoa đúng cú pháp nhưng không tồn tại trong DB
    const resNotFound = await request(app.getHttpServer()).get('/api/profiles/XX99.R99').set('Cookie', authCookie);
    expect(resNotFound.status).toBe(404);
    expect(resNotFound.body.code).toBe('NOT_FOUND');
    expect(resNotFound.body.message).toBe('Không tìm thấy hồ sơ rủi ro XX99.R99');
    expect(resNotFound.body.details).toBeUndefined();
  });

  it('8. Header đáp ứng dữ liệu luôn có Cache-Control: no-store', async () => {
    const endpoints = [
      '/api/cycles',
      '/api/cycles/2026/periods',
      '/api/units',
      '/api/profiles',
      '/api/profiles/HD11.R27',
      '/api/overview',
      '/api/heatmap',
      '/api/actions',
      '/api/indicators',
    ];

    for (const ep of endpoints) {
      const res = await request(app.getHttpServer()).get(ep).set('Cookie', authCookie);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('9. Lỗi kiểm tra dữ liệu qua HTTP: thông báo bằng tiếng Việt, không chứa chữ tiếng Anh (S3)', async () => {
    const cases = [
      {
        path: '/api/indicators/1/history',
        expectedField: 'id',
      },
      {
        path: '/api/profiles/NOPE',
        expectedField: 'riskCode',
      },
      {
        path: '/api/cycles/1999/periods',
        expectedField: 'year',
      },
      {
        path: '/api/actions?status=bad',
        expectedField: 'status',
      },
    ];

    for (const c of cases) {
      const res = await request(app.getHttpServer()).get(c.path).set('Cookie', authCookie);
      expect(res.status).toBe(422);
      validateSchema('/components/schemas/ErrorBody', res.body);
      expect(res.body.code).toBe('VALIDATION');
      expect(res.body.fieldErrors).toBeDefined();
      expect(res.body.fieldErrors).toHaveProperty(c.expectedField);

      const bodyStr = JSON.stringify(res.body);
      // Không được chứa các chuỗi tiếng Anh từ zod
      expect(bodyStr).not.toMatch(/invalid/i);
      expect(bodyStr).not.toMatch(/expected/i);
      expect(bodyStr).not.toMatch(/too small/i);
      expect(bodyStr).not.toMatch(/pattern/i);
    }
  });

  it('10. Bắt buộc phiên (3A.4): gọi 10 endpoint không có cookie thì 401 UNAUTHENTICATED hợp lệ với ErrorBody; GET /api/health vẫn mở', async () => {
    const errorValidate = ajv.getSchema('urn:contracts:openapi#/components/schemas/ErrorBody');

    // GET /api/health không cần cookie vẫn trả 200
    const resHealth = await request(app.getHttpServer()).get('/api/health');
    expect(resHealth.status).toBe(200);

    const endpoints = [
      '/api/cycles',
      '/api/cycles/2026/periods',
      '/api/units',
      '/api/profiles',
      '/api/profiles/HD11.R27',
      '/api/overview',
      '/api/heatmap',
      '/api/actions',
      '/api/indicators',
      '/api/indicators/00000000-0000-0000-0000-000000000000/history',
    ];

    for (const ep of endpoints) {
      const res = await request(app.getHttpServer()).get(ep);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
      expect(res.body.message).toBe('Bạn chưa đăng nhập hoặc phiên đã hết hạn');
      expect(errorValidate!(res.body)).toBe(true);
    }
  });
});
