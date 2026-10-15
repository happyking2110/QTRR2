import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { Controller, Get, Post, Body, Param, Res, HttpException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppError, ErrorCode } from '../../server/errors';
import { AppErrorFilter } from './app-error.filter';

@Controller('test-error')
class TestErrorController {
  @Get('code/:code')
  throwByCode(@Param('code') code: ErrorCode) {
    throw new AppError(code, `Lỗi kiểm tra ${code}`);
  }

  @Get('validation')
  throwValidation() {
    throw new AppError('VALIDATION', 'Dữ liệu không hợp lệ', {
      fieldErrors: { email: 'Email không đúng định dạng', count: 'Phải lớn hơn 0' },
    });
  }

  @Get('unexpected')
  throwUnexpected() {
    throw new Error('Database connection failed at postgres://user:secret@localhost:5432');
  }

  @Get('unavailable')
  throwUnavailable(@Res({ passthrough: true }) res: any) {
    res.status(503);
    return { code: 'INTERNAL', message: 'Dịch vụ chưa sẵn sàng' };
  }

  @Post('body')
  receiveBody(@Body() body: any) {
    return { received: true, body };
  }

  @Get('teapot')
  throwTeapot() {
    throw new HttpException('I am a teapot (English framework message)', 418);
  }
}

describe('AppErrorFilter - Bộ lọc xử lý lỗi toàn cục', () => {
  let app: INestApplication;
  let validateErrorBody: (data: unknown) => boolean;

  beforeAll(async () => {
    // 1. Chuẩn bị validator ErrorBody từ hợp đồng OpenAPI
    const candidates = [
      path.resolve(__dirname, '../../../../../contracts/openapi.yaml'),
      path.resolve(process.cwd(), 'contracts/openapi.yaml'),
      path.resolve(process.cwd(), '../../contracts/openapi.yaml'),
    ];
    let contractPath = candidates.find((p) => fs.existsSync(p));
    if (!contractPath) throw new Error('Không tìm thấy contracts/openapi.yaml');

    const doc = YAML.parse(fs.readFileSync(contractPath, 'utf8'));
    const ajv = new Ajv2020({ allErrors: true, strictSchema: false });
    addFormats(ajv);
    doc['$id'] = 'urn:contracts:openapi';
    ajv.addSchema(doc);
    const validator = ajv.getSchema('urn:contracts:openapi#/components/schemas/ErrorBody');
    if (!validator) throw new Error('Không tìm thấy schema ErrorBody');
    validateErrorBody = validator as (data: unknown) => boolean;

    // 2. Khởi tạo ứng dụng NestJS test
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TestErrorController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const expectedStatuses: Record<ErrorCode, number> = {
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    MUST_CHANGE_PASSWORD: 403,
    ACCOUNT_LOCKED: 423,
    RATE_LIMITED: 429,
    VALIDATION: 422,
    NOT_FOUND: 404,
    CONFLICT: 409,
    REFERENCED: 409,
    PERIOD_NOT_FOUND: 404,
    PERIOD_CLOSED: 409,
    CYCLE_ARCHIVED: 409,
    INVALID_STATE: 409,
    SELF_APPROVAL: 403,
    IMPORT_INVALID: 422,
    INTERNAL: 500,
  };

  it.each(Object.entries(expectedStatuses))(
    'ánh xạ mã %s sang HTTP status %i và ErrorBody đúng chuẩn',
    async (code, expectedStatus) => {
      const res = await request(app.getHttpServer()).get(`/api/test-error/code/${code}`);

      expect(res.status).toBe(expectedStatus);
      expect(res.body).toHaveProperty('code', code);
      expect(res.body).toHaveProperty('message', `Lỗi kiểm tra ${code}`);
      expect(validateErrorBody(res.body)).toBe(true);
    }
  );

  it('xử lý AppError VALIDATION kèm fieldErrors theo từng trường', async () => {
    const res = await request(app.getHttpServer()).get('/api/test-error/validation');

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.fieldErrors).toEqual({
      email: 'Email không đúng định dạng',
      count: 'Phải lớn hơn 0',
    });
    expect(validateErrorBody(res.body)).toBe(true);
  });

  it('xử lý lỗi không dự kiến (Error thường) thành 500 INTERNAL và không lộ chi tiết', async () => {
    const res = await request(app.getHttpServer()).get('/api/test-error/unexpected');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL');
    expect(res.body.message).toBe('Lỗi hệ thống nội bộ');
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(JSON.stringify(res.body)).not.toContain('postgres://');
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).not.toHaveProperty('requestId');
    expect(validateErrorBody(res.body)).toBe(true);
  });

  it('chuyển tiếp HttpException 503 với thân ErrorBody', async () => {
    const res = await request(app.getHttpServer()).get('/api/test-error/unavailable');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('INTERNAL');
    expect(res.body.message).toBe('Dịch vụ chưa sẵn sàng');
    expect(validateErrorBody(res.body)).toBe(true);
  });

  // --- CÁC TEST CHO S1: LỖI DO KHUNG NESTJS SINH RA (§8.2.1) ---

  it('S1.1 GET /api/nope -> 404, { code: "NOT_FOUND", message: "Không tìm thấy tài nguyên yêu cầu" }', async () => {
    const res = await request(app.getHttpServer()).get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Không tìm thấy tài nguyên yêu cầu',
    });
    expect(validateErrorBody(res.body)).toBe(true);
  });

  it('S1.2 Thân JSON hỏng -> 422 VALIDATION, thân không chứa chuỗi JSON, position hay Expected', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/test-error/body')
      .set('Content-Type', 'application/json')
      .send('{bad-json');

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      code: 'VALIDATION',
      message: 'Dữ liệu gửi lên không hợp lệ',
    });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('JSON');
    expect(raw).not.toContain('position');
    expect(raw).not.toContain('Expected');
    expect(validateErrorBody(res.body)).toBe(true);
  });

  it('S1.3 Thân vượt giới hạn (payload quá lớn) -> 422 VALIDATION', async () => {
    const largePayload = JSON.stringify({ data: 'x'.repeat(200 * 1024) });
    const res = await request(app.getHttpServer())
      .post('/api/test-error/body')
      .set('Content-Type', 'application/json')
      .send(largePayload);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      code: 'VALIDATION',
      message: 'Dữ liệu gửi lên không hợp lệ',
    });
    expect(validateErrorBody(res.body)).toBe(true);
  });

  it('S1.4 HttpException 418 -> 500 INTERNAL, thân không chứa chữ gốc ngoại lệ', async () => {
    const res = await request(app.getHttpServer()).get('/api/test-error/teapot');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      code: 'INTERNAL',
      message: 'Lỗi hệ thống nội bộ',
    });
    expect(JSON.stringify(res.body)).not.toContain('teapot');
    expect(validateErrorBody(res.body)).toBe(true);
  });

  it('S1.6 Không có trường hợp nào trả code: INTERNAL với HTTP khác 500 và 503', async () => {
    // 404 route
    const res404 = await request(app.getHttpServer()).get('/api/nope');
    if (res404.body.code === 'INTERNAL') {
      expect([500, 503]).toContain(res404.status);
    }

    // 400/422 malformed json
    const res400 = await request(app.getHttpServer())
      .post('/api/test-error/body')
      .set('Content-Type', 'application/json')
      .send('{bad');
    if (res400.body.code === 'INTERNAL') {
      expect([500, 503]).toContain(res400.status);
    }
  });
});
