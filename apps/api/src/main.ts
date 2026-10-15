import 'reflect-metadata';
import crypto from 'crypto';
import { NestFactory } from '@nestjs/core';
import { LoggerService } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppErrorFilter } from './http/filters/app-error.filter';
import { loadConfig, getClientIp } from './server/config';

export class JsonLogger implements LoggerService {
  log(message: any, ...optionalParams: any[]) {
    this.print('INFO', message, optionalParams);
  }
  error(message: any, ...optionalParams: any[]) {
    this.print('ERROR', message, optionalParams);
  }
  warn(message: any, ...optionalParams: any[]) {
    this.print('WARN', message, optionalParams);
  }
  debug(message: any, ...optionalParams: any[]) {
    this.print('DEBUG', message, optionalParams);
  }
  verbose(message: any, ...optionalParams: any[]) {
    this.print('VERBOSE', message, optionalParams);
  }

  private print(level: string, message: any, params: any[]) {
    const entry: Record<string, any> = {
      timestamp: new Date().toISOString(),
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };
    if (params && params.length > 0 && typeof params[0] === 'string') {
      entry.context = params[0];
    }
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}

async function bootstrap() {
  loadConfig();
  const logger = new JsonLogger();
  const app = await NestFactory.create(AppModule, {
    logger,
  });

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AppErrorFilter());

  // Middleware ghi nhận request, gắn requestId, tiêu đề bảo mật và log JSON ra stdout
  app.use((req: any, res: any, next: any) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');

    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO',
        requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs,
        clientIp: getClientIp(req),
      };
      // Tuyệt đối không ghi mật khẩu hay token vào log theo AGENTS.md §2.7
      process.stdout.write(JSON.stringify(logEntry) + '\n');
    });

    next();
  });

  const port = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 3001;
  await app.listen(port);
  logger.log(`Backend API đang chạy trên cổng ${port} (prefix /api)`, 'Bootstrap');
}

bootstrap();
