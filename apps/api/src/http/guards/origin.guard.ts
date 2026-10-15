import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { getConfig } from '../../server/config';
import { AppError } from '../../server/errors';

@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method = request.method?.toUpperCase();

    // Only inspect mutating HTTP methods (POST, PUT, PATCH, DELETE)
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const origin = request.headers['origin'];
      const expectedOrigin = getConfig().appOrigin;
      if (!origin || origin !== expectedOrigin) {
        throw new AppError('FORBIDDEN', 'Yêu cầu không hợp lệ hoặc bị từ chối truy cập');
      }
    }

    return true;
  }
}
