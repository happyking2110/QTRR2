import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import postgres from 'postgres';
import { HealthController, DATABASE_CONNECTION } from './health.controller';
import { AppErrorFilter } from '../filters/app-error.filter';
import { conn } from '../../server/db/client';

describe('HealthController - GET /api/health', () => {
  let appOk: INestApplication;
  let appFail: INestApplication;
  let failingSql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    // 1. Ứng dụng với DB sẵn sàng (dùng conn thật từ client)
    const moduleOk: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DATABASE_CONNECTION,
          useValue: conn,
        },
      ],
    }).compile();

    appOk = moduleOk.createNestApplication();
    appOk.setGlobalPrefix('api');
    appOk.useGlobalFilters(new AppErrorFilter());
    await appOk.init();

    // 2. Ứng dụng giả lập DB lỗi (kết nối tới cổng/URL không tồn tại, ghi rõ là giả lập)
    failingSql = postgres('postgres://invalid_user:invalid_pass@127.0.0.1:54399/invalid_db_test', {
      connect_timeout: 1,
      max: 1,
    });

    const moduleFail: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DATABASE_CONNECTION,
          useValue: failingSql,
        },
      ],
    }).compile();

    appFail = moduleFail.createNestApplication();
    appFail.setGlobalPrefix('api');
    appFail.useGlobalFilters(new AppErrorFilter());
    await appFail.init();
  });

  afterAll(async () => {
    await appOk?.close();
    await appFail?.close();
    await failingSql?.end();
  });

  it('1. GET /api/health -> 200 { status: "ok" } khi cơ sở dữ liệu sẵn sàng', async () => {
    const res = await request(appOk.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('2. GET /api/health -> 503 với thân ErrorBody khi DB lỗi kết nối (giả lập), không lộ chi tiết', async () => {
    const res = await request(appFail.getHttpServer()).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      code: 'INTERNAL',
      message: 'Dịch vụ chưa sẵn sàng',
    });

    // Rào chắn bảo mật: không lộ chuỗi kết nối, mật khẩu, tên host, hay tên bảng
    const rawBody = JSON.stringify(res.body);
    expect(rawBody).not.toContain('invalid_user');
    expect(rawBody).not.toContain('invalid_pass');
    expect(rawBody).not.toContain('54399');
    expect(rawBody).not.toContain('postgres://');
    expect(rawBody).not.toContain('invalid_db_test');
    expect(res.body).not.toHaveProperty('stack');
  });
});
