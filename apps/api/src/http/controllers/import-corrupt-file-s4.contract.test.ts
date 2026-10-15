import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import crypto from 'crypto';
import { AppModule } from '../../app.module';
import { AppErrorFilter } from '../filters/app-error.filter';
import { createCustomClient, DATABASE_DB } from '../../server/db/client';
import { DATABASE_CONNECTION } from './health.controller';
import { generateToken, hashToken } from '../../server/auth/session';
import { appUser, session as sessionTable } from '../../server/db/schema';
import postgres from 'postgres';

import { loadConfig, getConfig } from '../../server/config';

function getRequiredTestUrl(varName: string): string {
  const url = process.env[varName];
  if (!url) {
    throw new Error(`Thiếu biến môi trường ${varName}`);
  }
  return url;
}

const testAppUrl = getRequiredTestUrl('DATABASE_TEST_URL');

describe('import-corrupt-file-s4.contract.test.ts - Kiểm thử S4: tệp hỏng và tệp > 5 MB trả 422 VALIDATION với fieldErrors', () => {
  let app: INestApplication;
  let appClient: ReturnType<typeof createCustomClient>;
  let sqlClient: postgres.Sql;
  let origin: string;
  let adminCookie: string;

  beforeAll(async () => {
    loadConfig();
    origin = getConfig().appOrigin;
    sqlClient = postgres(testAppUrl, { max: 10 });
    appClient = createCustomClient(testAppUrl);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue(sqlClient)
      .overrideProvider(DATABASE_DB)
      .useValue(appClient.db)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();

    // Tạo admin user
    const [admin] = await appClient.db
      .insert(appUser)
      .values({
        email: `adm_s4_${Date.now()}@mobifone.vn`,
        fullName: 'Admin S4 Test',
        role: 'admin',
        passwordHash: 'dummy',
        isActive: true,
        mustChangePassword: false,
      })
      .returning();

    // Tạo session
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    await appClient.db.insert(sessionTable).values({
      userId: admin.id,
      tokenHash,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000),
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
    adminCookie = `hsrr_session=${rawToken}`;
  });

  afterAll(async () => {
    await app?.close();
    await sqlClient?.end();
  });

  it('1. POST /api/cycles/import với file .xlsx bị hỏng (100 byte) trả 422 VALIDATION với fieldErrors.file = "Tệp không đúng định dạng Excel .xlsx"', async () => {
    const corruptBuffer = crypto.randomBytes(100);
    const res = await request(app.getHttpServer())
      .post('/api/cycles/import')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .field('year', 2026)
      .attach('file', corruptBuffer, 'corrupt.xlsx');

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.fieldErrors?.file).toBe('Tệp không đúng định dạng Excel .xlsx');
  });

  it('2. POST /api/users/import với file .xlsx bị hỏng (100 byte) trả 422 VALIDATION với fieldErrors.file = "Tệp không đúng định dạng Excel .xlsx"', async () => {
    const corruptBuffer = crypto.randomBytes(100);
    const res = await request(app.getHttpServer())
      .post('/api/users/import')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .attach('file', corruptBuffer, 'corrupt_users.xlsx');

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.fieldErrors?.file).toBe('Tệp không đúng định dạng Excel .xlsx');
  });

  it('3. POST /api/cycles/import với file > 5 MB (6 MB) trả 422 VALIDATION với fieldErrors.file = "Tệp vượt quá 5 MB"', async () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
    const res = await request(app.getHttpServer())
      .post('/api/cycles/import')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .field('year', 2026)
      .attach('file', largeBuffer, 'large.xlsx');

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.fieldErrors?.file).toBe('Tệp vượt quá 5 MB');
  });

  it('4. POST /api/users/import với file > 5 MB (6 MB) trả 422 VALIDATION với fieldErrors.file = "Tệp vượt quá 5 MB"', async () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
    const res = await request(app.getHttpServer())
      .post('/api/users/import')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .attach('file', largeBuffer, 'large_users.xlsx');

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.fieldErrors?.file).toBe('Tệp vượt quá 5 MB');
  });
});
