import { CanActivate, ExecutionContext, Injectable, Inject, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../../server/types';
import { AppError } from '../../server/errors';

@Injectable()
export class RolesGuard implements CanActivate {
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

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const actor = request.actor;
    if (!actor || !requiredRoles.includes(actor.role)) {
      throw new AppError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này');
    }

    return true;
  }
}
