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
import { HealthController, DATABASE_CONNECTION } from './health.controller';
import { AppErrorFilter } from '../filters/app-error.filter';
import { conn } from '../../server/db/client';

function findContractPath(): string {
  const candidates = [
    path.resolve(__dirname, '../../../../../contracts/openapi.yaml'),
    path.resolve(process.cwd(), 'contracts/openapi.yaml'),
    path.resolve(process.cwd(), '../../contracts/openapi.yaml'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Không tìm thấy file contracts/openapi.yaml');
}

describe('Contract Test: contracts/openapi.yaml - GET /api/health', () => {
  let appOk: INestApplication;
  let appFail: INestApplication;
  let failingSql: ReturnType<typeof postgres>;
  let ajv: InstanceType<typeof Ajv2020>;

  beforeAll(async () => {
    // 1. Đọc và parse OpenAPI specification
    const contractPath = findContractPath();
    const contractYaml = fs.readFileSync(contractPath, 'utf8');
    const contractDoc = YAML.parse(contractYaml);

    // 2. Khởi tạo Ajv (Draft 2020-12 cho OpenAPI 3.1) với strictSchema: false
    ajv = new Ajv2020({ allErrors: true, strictSchema: false });
    addFormats(ajv);

    contractDoc['$id'] = 'urn:contracts:openapi';
    ajv.addSchema(contractDoc);

    // 3. Khởi tạo Nest application thành công (DB thật)
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

    // 4. Khởi tạo Nest application thất bại (DB giả lập lỗi)
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

  it('1. GET /api/health phản hồi 200 tuân thủ chính xác schema hợp đồng OpenAPI 3.1', async () => {
    const res = await request(appOk.getHttpServer()).get('/api/health');

    // HTTP Status & Headers
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);

    // Schema validation từ hợp đồng openapi.yaml
    const validate = ajv.getSchema(
      'urn:contracts:openapi#/paths/~1api~1health/get/responses/200/content/application~1json/schema'
    );
    expect(validate, 'Schema cho response 200 không tìm thấy trong openapi.yaml').toBeDefined();

    const isValid = validate!(res.body);
    if (!isValid) {
      console.error('Contract validation errors (200):', validate!.errors);
    }
    expect(isValid).toBe(true);
  });

  it('2. GET /api/health phản hồi 503 khi DB lỗi tuân thủ chính xác schema ErrorBody trong hợp đồng OpenAPI 3.1', async () => {
    const res = await request(appFail.getHttpServer()).get('/api/health');

    // HTTP Status & Headers
    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      code: 'INTERNAL',
      message: 'Dịch vụ chưa sẵn sàng',
    });

    // Schema validation từ hợp đồng openapi.yaml
    const validate = ajv.getSchema(
      'urn:contracts:openapi#/paths/~1api~1health/get/responses/503/content/application~1json/schema'
    );
    expect(validate, 'Schema cho response 503 không tìm thấy trong openapi.yaml').toBeDefined();

    const isValid = validate!(res.body);
    if (!isValid) {
      console.error('Contract validation errors (503):', validate!.errors);
    }
    expect(isValid).toBe(true);
  });
});
