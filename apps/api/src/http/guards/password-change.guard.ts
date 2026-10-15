import { CanActivate, ExecutionContext, Injectable, Inject, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppError } from '../../server/errors';

@Injectable()
export class PasswordChangeGuard implements CanActivate {
  private reflector: Reflector;

  constructor(@Optional() @Inject(Reflector) reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    if (request.mustChangePassword) {
      const url = request.originalUrl || request.url || '';
      const path = url.split('?')[0];
      const method = request.method?.toUpperCase();

      const isAllowed =
        (method === 'POST' && path === '/api/auth/change-password') ||
        (method === 'POST' && path === '/api/auth/logout') ||
        (method === 'GET' && path === '/api/auth/me');

      if (!isAllowed) {
        throw new AppError('MUST_CHANGE_PASSWORD', 'Bạn cần đổi mật khẩu trước khi tiếp tục');
      }
    }

    return true;
  }
}
