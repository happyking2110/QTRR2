import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OriginGuard } from './origin.guard';
import { SessionGuard } from './session.guard';
import { PasswordChangeGuard } from './password-change.guard';
import { RolesGuard } from './roles.guard';
import { AppError } from '../../server/errors';

describe('3A.2 Global Guards & Flow', () => {
  function createMockContext(req: Record<string, unknown>, handlerMeta: Record<string, unknown> = {}) {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
      }),
      getHandler: () => handlerMeta.handler || (() => {}),
      getClass: () => handlerMeta.class || class {},
    } as unknown as ExecutionContext;
  }

  describe('OriginGuard', () => {
    let guard: OriginGuard;

    beforeEach(() => {
      guard = new OriginGuard();
    });

    it('allows GET, HEAD, OPTIONS requests without Origin header', () => {
      for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        const ctx = createMockContext({ method, headers: {} });
        expect(guard.canActivate(ctx)).toBe(true);
      }
    });

    it('allows mutating requests (POST, PUT, PATCH, DELETE) when Origin matches APP_ORIGIN', () => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const ctx = createMockContext({
          method,
          headers: { origin: 'http://localhost:3000' },
        });
        expect(guard.canActivate(ctx)).toBe(true);
      }
    });

    it('throws 403 FORBIDDEN when Origin is missing on mutating requests', () => {
      const ctx = createMockContext({
        method: 'POST',
        url: '/api/auth/login',
        headers: {},
      });
      try {
        guard.canActivate(ctx);
        expect.fail('Should throw');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('FORBIDDEN');
        expect((err as AppError).message).toBe('Yêu cầu không hợp lệ hoặc bị từ chối truy cập');
        expect((err as AppError).message).not.toContain('http://localhost:3000');
      }
    });

    it('throws 403 FORBIDDEN when Origin does not match APP_ORIGIN', () => {
      const ctx = createMockContext({
        method: 'POST',
        headers: { origin: 'http://malicious-site.com' },
      });
      try {
        guard.canActivate(ctx);
        expect.fail('Should throw');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('FORBIDDEN');
      }
    });
  });

  describe('PasswordChangeGuard', () => {
    let reflector: Reflector;
    let guard: PasswordChangeGuard;

    beforeEach(() => {
      reflector = new Reflector();
      guard = new PasswordChangeGuard(reflector);
    });

    it('allows any request if mustChangePassword is false', () => {
      const ctx = createMockContext({
        method: 'GET',
        url: '/api/profiles',
        mustChangePassword: false,
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows public routes even when mustChangePassword is true', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const ctx = createMockContext({
        method: 'GET',
        url: '/api/health',
        mustChangePassword: true,
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows only /api/auth/change-password, /api/auth/logout, and /api/auth/me when mustChangePassword is true', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const allowedRoutes = [
        { method: 'POST', url: '/api/auth/change-password' },
        { method: 'POST', url: '/api/auth/logout' },
        { method: 'GET', url: '/api/auth/me' },
      ];

      for (const r of allowedRoutes) {
        const ctx = createMockContext({
          method: r.method,
          url: r.url,
          mustChangePassword: true,
        });
        expect(guard.canActivate(ctx)).toBe(true);
      }
    });

    it('blocks other endpoints with 403 MUST_CHANGE_PASSWORD when mustChangePassword is true', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const ctx = createMockContext({
        method: 'GET',
        url: '/api/overview',
        mustChangePassword: true,
      });

      try {
        guard.canActivate(ctx);
        expect.fail('Should throw');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('MUST_CHANGE_PASSWORD');
      }
    });
  });

  describe('RolesGuard', () => {
    let reflector: Reflector;
    let guard: RolesGuard;

    beforeEach(() => {
      reflector = new Reflector();
      guard = new RolesGuard(reflector);
    });

    it('allows public endpoints without checking roles', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === 'isPublic') return true;
        return ['admin'];
      });

      const ctx = createMockContext({ actor: undefined });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows any actor when no roles specified on endpoint', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === 'isPublic') return false;
        if (key === 'roles') return undefined;
        return undefined;
      });

      const ctx = createMockContext({
        actor: { userId: 'u1', role: 'viewer', unitId: null },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows actor whose role is in allowed roles', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === 'isPublic') return false;
        if (key === 'roles') return ['admin', 'ban4'];
        return undefined;
      });

      const ctxAdmin = createMockContext({
        actor: { userId: 'u1', role: 'admin', unitId: null },
      });
      expect(guard.canActivate(ctxAdmin)).toBe(true);

      const ctxBan4 = createMockContext({
        actor: { userId: 'u2', role: 'ban4', unitId: 'unit-1' },
      });
      expect(guard.canActivate(ctxBan4)).toBe(true);
    });

    it('throws 403 FORBIDDEN when actor role is not in allowed roles', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === 'isPublic') return false;
        if (key === 'roles') return ['admin'];
        return undefined;
      });

      const ctxUnit = createMockContext({
        actor: { userId: 'u3', role: 'unit', unitId: 'unit-1' },
      });

      try {
        guard.canActivate(ctxUnit);
        expect.fail('Should throw');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('FORBIDDEN');
      }
    });
  });
});
