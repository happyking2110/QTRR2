import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Actor } from '../../server/types';

export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => {
    const request = ctx.switchToHttp().getRequest();
    return request.actor;
  },
);
