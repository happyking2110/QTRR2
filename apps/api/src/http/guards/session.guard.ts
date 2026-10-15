import { CanActivate, ExecutionContext, Injectable, Inject, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { parseCookieHeader, hashToken } from '../../server/auth/session';
import { getDb, DATABASE_DB } from '../../server/db/client';
import { session as sessionTable, appUser as appUserTable } from '../../server/db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../../server/errors';

const SESSION_COOKIE_NAME = 'hsrr_session';
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const TOUCH_INTERVAL_MS = 60 * 1000; // 1 minute

@Injectable()
export class SessionGuard implements CanActivate {
  private reflector: Reflector;

  constructor(
    @Optional() @Inject(Reflector) reflector?: Reflector,
    @Optional() @Inject(DATABASE_DB) private customDb?: any,
  ) {
    this.reflector = reflector ?? new Reflector();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const cookies = parseCookieHeader(request.headers['cookie']);
    const token = cookies[SESSION_COOKIE_NAME];

    if (!token) {
      if (isPublic) {
        return true;
      }
      throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
    }

    const tokenHash = hashToken(token);
    const db = this.customDb || getDb();

    // Query session joined with app_user to always get fresh role & status from DB
    const rows = await db
      .select({
        sessionId: sessionTable.id,
        userId: sessionTable.userId,
        createdAt: sessionTable.createdAt,
        lastSeenAt: sessionTable.lastSeenAt,
        expiresAt: sessionTable.expiresAt,
        userRole: appUserTable.role,
        unitId: appUserTable.unitId,
        isActive: appUserTable.isActive,
        mustChangePassword: appUserTable.mustChangePassword,
        email: appUserTable.email,
        fullName: appUserTable.fullName,
      })
      .from(sessionTable)
      .innerJoin(appUserTable, eq(sessionTable.userId, appUserTable.id))
      .where(eq(sessionTable.tokenHash, tokenHash))
      .limit(1);

    if (rows.length === 0) {
      if (isPublic) return true;
      throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
    }

    const s = rows[0];
    const now = new Date();
    const nowTime = now.getTime();
    const lastSeenTime = s.lastSeenAt.getTime();
    const expiresTime = s.expiresAt.getTime();

    // Check absolute expiration (12h) or inactivity (60m)
    const isExpired = nowTime > expiresTime || nowTime - lastSeenTime > INACTIVITY_TIMEOUT_MS;
    if (isExpired || !s.isActive) {
      // Delete expired or inactive session
      await db.delete(sessionTable).where(eq(sessionTable.id, s.sessionId));
      if (isPublic) return true;
      throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
    }

    // Extend lastSeenAt at most once every minute
    if (nowTime - lastSeenTime > TOUCH_INTERVAL_MS) {
      await db
        .update(sessionTable)
        .set({ lastSeenAt: now })
        .where(eq(sessionTable.id, s.sessionId));
    }

    // Build Actor and attach to request
    request.actor = {
      userId: s.userId,
      role: s.userRole,
      unitId: s.unitId,
    };
    request.mustChangePassword = s.mustChangePassword;
    request.user = {
      id: s.userId,
      email: s.email,
      fullName: s.fullName,
      role: s.userRole,
      unitId: s.unitId,
      mustChangePassword: s.mustChangePassword,
      isActive: s.isActive,
    };
    request.session = {
      id: s.sessionId,
      tokenHash,
    };
    request.sessionToken = token;

    return true;
  }
}
