import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import crypto from 'crypto';
import { AppError, ErrorCode, ErrorBody } from '../../server/errors';

interface CustomResponse {
  status(code: number): this;
  json(body: unknown): void;
}

const ERROR_CODE_TO_STATUS: Record<ErrorCode, number> = {
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

@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<CustomResponse>();

    // 1. Lỗi miền nghiệp vụ từ hệ thống (AppError)
    if (exception instanceof AppError) {
      const status = ERROR_CODE_TO_STATUS[exception.code] || 500;
      const body: ErrorBody = {
        code: exception.code,
        message: exception.message,
      };
      if (exception.fieldErrors) {
        body.fieldErrors = exception.fieldErrors;
      }
      if (exception.details !== undefined) {
        body.details = exception.details;
      }
      return response.status(status).json(body);
    }

    // 1.1 Lỗi giới hạn kích thước tệp tải lên (Multer hoặc PayloadTooLarge)
    const errObj = exception as any;
    const isFileSizeLimit =
      errObj?.code === 'LIMIT_FILE_SIZE' ||
      (errObj?.name === 'MulterError' && errObj?.code === 'LIMIT_FILE_SIZE') ||
      (typeof errObj?.message === 'string' &&
        (errObj.message.includes('File too large') || errObj.message.includes('LIMIT_FILE_SIZE')));

    if (isFileSizeLimit) {
      this.logger.warn(`[422] Tệp vượt quá 5 MB`);
      const body: ErrorBody = {
        code: 'VALIDATION',
        message: 'Tệp vượt quá 5 MB',
        fieldErrors: {
          file: 'Tệp vượt quá 5 MB',
        },
      };
      return response.status(422).json(body);
    }

    // 2. Lỗi do khung NestJS hoặc middleware HTTP sinh ra (§8.2.1)
    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : typeof exception === 'object' &&
          exception !== null &&
          ('status' in exception || 'statusCode' in exception)
        ? Number((exception as any).status || (exception as any).statusCode)
        : undefined;

    if (httpStatus !== undefined) {
      const rawMessage =
        exception instanceof HttpException
          ? typeof exception.getResponse() === 'string'
            ? exception.getResponse()
            : (exception.getResponse() as Record<string, unknown>).message?.toString() ||
              exception.message
          : exception instanceof Error
          ? exception.message
          : String(exception);

      if (httpStatus === 404) {
        this.logger.warn(`[404] Đường dẫn không tồn tại: ${rawMessage}`);
        const body: ErrorBody = {
          code: 'NOT_FOUND',
          message: 'Không tìm thấy tài nguyên yêu cầu',
        };
        return response.status(404).json(body);
      }

      if (httpStatus === 400 || httpStatus === 413 || httpStatus === 415) {
        this.logger.warn(`[${httpStatus}] Dữ liệu yêu cầu không hợp lệ: ${rawMessage}`);
        const body: ErrorBody = {
          code: 'VALIDATION',
          message: 'Dữ liệu gửi lên không hợp lệ',
        };
        return response.status(422).json(body);
      }

      if (httpStatus === 401) {
        const body: ErrorBody = {
          code: 'UNAUTHENTICATED',
          message: 'Bạn chưa đăng nhập hoặc phiên đã hết hạn',
        };
        return response.status(401).json(body);
      }

      if (httpStatus === 403) {
        const body: ErrorBody = {
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền thực hiện thao tác này',
        };
        return response.status(403).json(body);
      }

      // Mọi trạng thái khác (kể cả 5xx của khung hay mã lạ như 418) -> 500 INTERNAL, message 'Lỗi hệ thống nội bộ', ghi log
      const requestId = crypto.randomUUID();
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`[${requestId}] Lỗi khung HTTP (${httpStatus}): ${rawMessage}`, stack);
      const body: ErrorBody = {
        code: 'INTERNAL',
        message: 'Lỗi hệ thống nội bộ',
      };
      return response.status(500).json(body);
    }

    // 4. Lỗi không dự kiến: sinh UUID log, ghi log qua Logger, trả 500 INTERNAL với thông báo chung
    const err = exception instanceof Error ? exception : new Error(String(exception));
    const requestId = crypto.randomUUID();
    this.logger.error(`[${requestId}] Lỗi không dự kiến: ${err.message}`, err.stack);

    const body: ErrorBody = {
      code: 'INTERNAL',
      message: 'Lỗi hệ thống nội bộ',
    };
    return response.status(500).json(body);
  }
}
