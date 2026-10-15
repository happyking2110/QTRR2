import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Controller, Post, Body, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { z } from 'zod';
import { AppError } from '../../server/errors';
import { AppErrorFilter } from '../filters/app-error.filter';
import { ZodValidationPipe } from './zod-validation.pipe';

const sampleSchema = z.object({
  name: z.string().min(3, 'Tên phải có ít nhất 3 ký tự'),
  score: z.number().int().min(0, 'Điểm không được âm').max(100, 'Điểm tối đa là 100'),
  nested: z.object({
    code: z.string().min(1, 'Mã không được để trống'),
  }),
});

@Controller('test-pipe')
class TestPipeController {
  @Post('item')
  createItem(@Body(new ZodValidationPipe(sampleSchema)) body: unknown) {
    return { ok: true, data: body };
  }
}

describe('ZodValidationPipe - Pipe kiểm tra dữ liệu đầu vào bằng Zod', () => {
  let app: INestApplication;
  const pipe = new ZodValidationPipe(sampleSchema);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TestPipeController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('trả về dữ liệu đã parse khi đầu vào hợp lệ', () => {
    const validData = { name: 'Nguyễn Văn A', score: 85, nested: { code: 'MBF01' } };
    const result = pipe.transform(validData);
    expect(result).toEqual(validData);
  });

  it('ném AppError VALIDATION kèm fieldErrors chi tiết khi đầu vào không hợp lệ', () => {
    const invalidData = { name: 'A', score: 150, nested: { code: '' } };
    try {
      pipe.transform(invalidData);
      expect.fail('Cần phải ném AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe('VALIDATION');
      expect(appErr.fieldErrors).toEqual({
        name: 'Tên phải có ít nhất 3 ký tự',
        score: 'Điểm tối đa là 100',
        'nested.code': 'Mã không được để trống',
      });
    }
  });

  it('controller trả về HTTP 422 và ErrorBody khi request body sai', async () => {
    const res = await request(app.getHttpServer())
      .post('/test-pipe/item')
      .send({ name: 'AB', score: -5, nested: { code: '' } });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.message).toBe('Dữ liệu không hợp lệ');
    expect(res.body.fieldErrors).toHaveProperty('name');
    expect(res.body.fieldErrors).toHaveProperty('score');
    expect(res.body.fieldErrors).toHaveProperty('nested.code');
  });

  it('controller trả về HTTP 201 khi request body đúng', async () => {
    const res = await request(app.getHttpServer())
      .post('/test-pipe/item')
      .send({ name: 'Chính xác', score: 90, nested: { code: 'ABC' } });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.name).toBe('Chính xác');
  });

  it('S6.2: trường thiếu ra "Trường dữ liệu này là bắt buộc", trường sai kiểu ra "Kiểu dữ liệu không đúng"', () => {
    // 1. Trường thiếu (score không được truyền)
    try {
      pipe.transform({ name: 'Nguyễn Văn A', nested: { code: 'MBF01' } });
      expect.fail('Cần phải ném AppError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.fieldErrors.score).toBe('Trường dữ liệu này là bắt buộc');
    }

    // 2. Trường có giá trị nhưng sai kiểu (score truyền string "abc" thay vì number)
    try {
      pipe.transform({ name: 'Nguyễn Văn A', score: 'abc', nested: { code: 'MBF01' } });
      expect.fail('Cần phải ném AppError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.fieldErrors.score).toBe('Kiểu dữ liệu không đúng');
    }
  });

  it('4A.7: schema .strict() báo lỗi 422 VALIDATION với fieldErrors đúng tên trường thừa', () => {
    const strictPipe = new ZodValidationPipe(sampleSchema.strict());
    try {
      strictPipe.transform({
        name: 'Nguyễn Văn A',
        score: 85,
        nested: { code: 'MBF01' },
        extraField: 'not allowed',
      });
      expect.fail('Cần phải ném AppError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('VALIDATION');
      expect(err.fieldErrors).toHaveProperty('extraField');
    }
  });
});
