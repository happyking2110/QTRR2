import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import crypto from 'crypto';
import postgres from 'postgres';
import { AppModule } from '../../app.module';
import { AppErrorFilter } from '../filters/app-error.filter';
import { DATABASE_CONNECTION } from './health.controller';
import { DATABASE_DB, createCustomClient, type CustomClient } from '../../server/db/client';
import { appUser, passwordHistory, cycle, session as sessionTable } from '../../server/db/schema';
import { hashPassword } from '../../server/auth/password';
import { generateToken, hashToken } from '../../server/auth/session';

const testAppUrl =
  process.env.DATABASE_TEST_URL ||
  'postgres://hsrr_app:hsrr_app_secret@localhost:5432/hsrr_test';
const testMigrateUrl =
  process.env.DATABASE_TEST_MIGRATE_URL ||
  'postgres://hsrr_owner:hsrr_owner_secret@localhost:5432/hsrr_test';

const ALL_ROLES = ['admin', 'ban4', 'unit', 'viewer'] as const;
type Role = typeof ALL_ROLES[number];

function findContractPath(): string {
  const p1 = path.resolve(process.cwd(), 'contracts/openapi.yaml');
  if (fs.existsSync(p1)) return p1;
  const p2 = path.resolve(__dirname, '../../../../../contracts/openapi.yaml');
  if (fs.existsSync(p2)) return p2;
  return p1;
}

describe('Role Permissions auto-generated from openapi.yaml x-roles (3A.7)', () => {
  let app: INestApplication;
  let ownerSql: postgres.Sql;
  let appClient: CustomClient;
  const origin = 'http://localhost:3000';
  const testUsers: Record<Role, { id: string; email: string }> = {} as any;

  async function getFreshCookie(role: Role): Promise<string> {
    const user = testUsers[role];
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    await appClient.db.insert(sessionTable).values({
      userId: user.id,
      tokenHash,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
    return `hsrr_session=${rawToken}`;
  }

  const contractDoc = yaml.parse(fs.readFileSync(findContractPath(), 'utf8'));

  beforeAll(async () => {
    process.env.APP_ORIGIN = origin;
    process.env.SESSION_SECRET =
      'a_very_long_random_session_secret_for_tests_at_least_32_chars';
    process.env.TRUSTED_PROXY_IPS = '127.0.0.1,::1';

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

    // Dọn sạch và tạo 4 users tương ứng 4 roles
    await ownerSql`TRUNCATE TABLE audit_log, unit_assignment, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, session, password_history, app_user, unit, cycle CASCADE`;

    // Tạo cycle 2026 open để các truy vấn không lỗi cycle archived
    await appClient.db.insert(cycle).values({ year: 2026, status: 'open' }).onConflictDoNothing();

    for (const r of ALL_ROLES) {
      const password = 'MBF_' + crypto.randomBytes(8).toString('hex') + '!2026';
      const passwordHash = await hashPassword(password);
      const email = `test_perm_${r}_${crypto.randomBytes(4).toString('hex')}@mobifone.vn`;

      const [u] = await appClient.db
        .insert(appUser)
        .values({
          email,
          fullName: 'Test ' + r,
          role: r,
          passwordHash,
          isActive: true,
          mustChangePassword: false,
        })
        .returning();

      await appClient.db.insert(passwordHistory).values({
        userId: u.id,
        passwordHash,
      });

      testUsers[r] = { id: u.id, email: u.email };
    }
  });

  afterAll(async () => {
    if (app) await app.close();
    if (appClient) await appClient.client.end();
    if (ownerSql) await ownerSql.end();
  });

  const operations: Array<{
    path: string;
    method: 'get' | 'post' | 'put' | 'delete' | 'patch';
    xRoles: string[];
    summary?: string;
  }> = [];

  for (const [p, pathItem] of Object.entries(contractDoc.paths as Record<string, any>)) {
    for (const m of ['get', 'post', 'put', 'delete', 'patch'] as const) {
      if (pathItem[m]) {
        operations.push({
          path: p,
          method: m,
          xRoles: pathItem[m]['x-roles'],
          summary: pathItem[m].summary,
        });
      }
    }
  }

  it('tất cả mọi thao tác trong hợp đồng đều bắt buộc có trường x-roles', () => {
    expect(operations.length).toBe(77);
    for (const op of operations) {
      expect(
        op.xRoles,
        `Thao tác ${op.method.toUpperCase()} ${op.path} thiếu trường x-roles!`
      ).toBeDefined();
      expect(Array.isArray(op.xRoles)).toBe(true);
    }
  });

  function getTestUrl(openApiPath: string): string {
    return openApiPath
      .replace('{year}', '2026')
      .replace('{riskCode}', 'HD11.R27')
      .replace('{code}', 'KS01')
      .replace('{id}', '00000000-0000-0000-0000-000000000000')
      .replace('{key}', '2026-10');
  }

  function getRequestBody(openApiPath: string, method: string): any {
    if (method === 'get') return undefined;
    if (openApiPath.includes('/auth/login')) {
      return { email: 'fake@mobifone.vn', password: 'FakePassword!123' };
    }
    if (openApiPath.includes('/auth/change-password')) {
      return { oldPassword: 'old', newPassword: 'new' };
    }
    if (openApiPath.endsWith('/users') && method === 'post') {
      return { email: 'test_body@mobifone.vn', fullName: 'Test', role: 'viewer' };
    }
    if (openApiPath.endsWith('/users/{id}') && method === 'patch') {
      return { isActive: true };
    }
    if (openApiPath.includes('/units/{code}') && method === 'put') {
      return { name: 'Đơn vị', kind: 'department' };
    }
    if (openApiPath.includes('/controls/{code}/units') && method === 'put') {
      return { unitCodes: [] };
    }
    if (openApiPath.includes('/indicators/{code}/owner') && method === 'put') {
      return { unitCode: null };
    }
    if (openApiPath.includes('/indicators/{code}/targets') && method === 'put') {
      return {
        unitKind: 'percent',
        unitLabel: '%',
        direction: 'higher_is_worse',
        yellowAt: 10,
        redAt: 20,
        targetValue: null,
      };
    }
    if (openApiPath.includes('/tasks/{id}/unit') && method === 'put') {
      return { unitCode: null };
    }
    return {};
  }

  // Chạy test phân quyền tự động cho từng operation
  for (const op of operations) {
    const url = getTestUrl(op.path);

    describe(`${op.method.toUpperCase()} ${op.path} [${op.xRoles.join(', ')}]`, () => {
      if (op.xRoles.length === 0) {
        it('công khai: gọi không có cookie không bị chặn 401 hoặc 403', async () => {
          const res = await (request(app.getHttpServer()) as any)
            [op.method](url)
            .set('Origin', origin);
          expect(res.status).not.toBe(401);
          expect(res.status).not.toBe(403);
        });
      } else {
        it('bắt buộc đăng nhập: gọi không có cookie nhận 401', async () => {
          const res = await (request(app.getHttpServer()) as any)
            [op.method](url)
            .set('Origin', origin)
            .send(getRequestBody(op.path, op.method));
          expect(res.status).toBe(401);
        });

        for (const role of ALL_ROLES) {
          if (op.xRoles.includes(role)) {
            it(`vai trò [${role}] ĐƯỢC PHÉP trong x-roles: không nhận 401 hoặc 403`, async () => {
              const cookie = await getFreshCookie(role);
              const res = await (request(app.getHttpServer()) as any)
                [op.method](url)
                .set('Origin', origin)
                .set('Cookie', cookie)
                .send(getRequestBody(op.path, op.method));

              expect(res.status).not.toBe(401);
              expect(res.status).not.toBe(403);
            });
          } else {
            it(`vai trò [${role}] KHÔNG CÓ trong x-roles: nhận đúng 403 FORBIDDEN`, async () => {
              const cookie = await getFreshCookie(role);
              const res = await (request(app.getHttpServer()) as any)
                [op.method](url)
                .set('Origin', origin)
                .set('Cookie', cookie)
                .send(getRequestBody(op.path, op.method));

              expect(res.status).toBe(403);
              expect(res.body.code).toBe('FORBIDDEN');
            });
          }
        }
      }
    });
  }
});
