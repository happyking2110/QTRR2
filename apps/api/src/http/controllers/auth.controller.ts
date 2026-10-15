import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  Inject,
  Optional,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  login,
  logout,
  getCurrentUser,
  changePassword,
  loginRateLimiter,
  type CurrentUser,
} from '../../server/services/auth';
import { DATABASE_DB, type DbType } from '../../server/db/client';
import { getConfig, getClientIp } from '../../server/config';
import { AppError } from '../../server/errors';
import type { Actor } from '../../server/types';

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

@Controller('auth')
export class AuthController {
  constructor(
    @Optional()
    @Inject(DATABASE_DB)
    private readonly db?: DbType,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>,
  ): Promise<CurrentUser> {
    const clientIp = getClientIp(req);
    const rateCheck = loginRateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      throw new AppError(
        'RATE_LIMITED',
        'Đã vượt quá số lần thử đăng nhập. Vui lòng thử lại sau 15 phút.',
      );
    }

    const result = await login(body, { ip: clientIp }, this.db);

    const isSecure = getConfig().appOrigin.startsWith('https://');
    res.cookie('hsrr_session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isSecure,
    });

    return result.user;
  }

  @Post('logout')
  @Roles('admin', 'ban4', 'unit', 'viewer')
  @HttpCode(204)
  async logout(
    @Req() req: Request & { actor: Actor; sessionToken?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const clientIp = getClientIp(req);
    await logout(req.sessionToken || null, req.actor, { ip: clientIp }, this.db);

    const isSecure = getConfig().appOrigin.startsWith('https://');
    res.clearCookie('hsrr_session', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isSecure,
    });
  }

  @Get('me')
  @Roles('admin', 'ban4', 'unit', 'viewer')
  async me(@CurrentActor() actor: Actor): Promise<CurrentUser> {
    return getCurrentUser(actor, this.db);
  }

  @Post('change-password')
  @Roles('admin', 'ban4', 'unit', 'viewer')
  @HttpCode(204)
  async changePassword(
    @CurrentActor() actor: Actor,
    @Req() req: Request & { sessionToken?: string },
    @Body(new ZodValidationPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
  ): Promise<void> {
    const clientIp = getClientIp(req);
    await changePassword(actor, req.sessionToken || null, body, { ip: clientIp }, this.db);
  }
}

