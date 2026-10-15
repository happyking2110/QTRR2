import { describe, it, expect, vi } from 'vitest';
import { hashPassword, verifyPassword, validateNewPassword, generateTemporaryPassword } from './password';
import { generateToken, hashToken, parseCookieHeader } from './session';
import { MemoryRateLimiter } from './rate-limit';
import { can, Ability } from './policy';
import { Actor } from '../types';

describe('3A.1 Pure Functions & Auth Foundation', () => {
  describe('password.ts', () => {
    it('hashes password and verifies successfully with argon2id', async () => {
      const pwd = 'TestPassword123!';
      const hash = await hashPassword(pwd);
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(await verifyPassword(pwd, hash)).toBe(true);
      expect(await verifyPassword('WrongPassword', hash)).toBe(false);
    });

    it('generateTemporaryPassword generates 16 chars from the specified alphabet without confusing chars', () => {
      const allowed = new Set('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.split(''));
      const set = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        const pwd = generateTemporaryPassword();
        expect(pwd).toHaveLength(16);
        for (const char of pwd) {
          expect(allowed.has(char)).toBe(true);
        }
        // Confusing characters (0, O, 1, I, l) must not appear
        expect(pwd).not.toMatch(/[0O1Il]/);
        expect(set.has(pwd)).toBe(false);
        set.add(pwd);
      }
    });

    it('validateNewPassword checks length 10-128, same as current, and recent hashes', async () => {
      const currentPwd = 'OldSecret123!';
      const currentHash = await hashPassword(currentPwd);
      const pastPwd1 = 'PastSecret111!';
      const pastHash1 = await hashPassword(pastPwd1);

      // Too short (< 10)
      const resShort = await validateNewPassword('short9chr', currentPwd, [currentHash]);
      expect(resShort.valid).toBe(false);
      expect(resShort.reason).toBe('too_short');

      // Too long (> 128)
      const resLong = await validateNewPassword('a'.repeat(129), currentPwd, [currentHash]);
      expect(resLong.valid).toBe(false);
      expect(resLong.reason).toBe('too_long');

      // Same as current password string
      const resSame = await validateNewPassword(currentPwd, currentPwd, [currentHash]);
      expect(resSame.valid).toBe(false);
      expect(resSame.reason).toBe('same_as_current');

      // Matches one of recent hashes (e.g. past password)
      const resRecent = await validateNewPassword(pastPwd1, currentPwd, [currentHash, pastHash1]);
      expect(resRecent.valid).toBe(false);
      expect(resRecent.reason).toBe('recently_used');

      // Valid new password
      const resValid = await validateNewPassword('BrandNewPassword2026!', currentPwd, [currentHash, pastHash1]);
      expect(resValid.valid).toBe(true);
      expect(resValid.reason).toBeUndefined();
    });
  });

  describe('session.ts', () => {
    it('generateToken produces 32-byte base64url string', () => {
      const t1 = generateToken();
      const t2 = generateToken();
      expect(t1).not.toBe(t2);
      expect(t1).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('hashToken produces HMAC-SHA256 hex; deterministic with same secret, different with different secrets', () => {
      const token = 'sample-random-session-token-1234567890';
      const secretA = 'secret-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const secretB = 'secret-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

      const h1 = hashToken(token, secretA);
      const h2 = hashToken(token, secretA);
      const h3 = hashToken(token, secretB);

      expect(h1).toHaveLength(64);
      expect(h1).toMatch(/^[a-f0-9]{64}$/);
      expect(h1).toBe(h2);
      expect(h1).not.toBe(h3);
    });

    it('parseCookieHeader handles empty, multiple, values with "=", garbage input safely without throwing', () => {
      expect(parseCookieHeader(undefined)).toEqual({});
      expect(parseCookieHeader('')).toEqual({});
      expect(parseCookieHeader('   ')).toEqual({});

      const single = parseCookieHeader('hsrr_session=abc123token');
      expect(single).toEqual({ hsrr_session: 'abc123token' });

      const multi = parseCookieHeader('hsrr_session=abc123token; other_cookie=xyz; third=foo=bar');
      expect(multi).toEqual({
        hsrr_session: 'abc123token',
        other_cookie: 'xyz',
        third: 'foo=bar',
      });

      const quoted = parseCookieHeader('user="john doe"; token=secret');
      expect(quoted).toEqual({ user: 'john doe', token: 'secret' });

      const garbage = parseCookieHeader('invalidcookie; =value; key=; =');
      expect(garbage).toEqual({ key: '' });
    });
  });

  describe('rate-limit.ts', () => {
    it('limits to 30 requests per 15 minutes per IP with injected clock', () => {
      let currentTime = 1000000;
      const clock = () => currentTime;
      const limiter = new MemoryRateLimiter(30, 15 * 60 * 1000, clock);

      // Call 30 times: all allowed
      for (let i = 1; i <= 30; i++) {
        const res = limiter.check('1.2.3.4');
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(30 - i);
      }

      // 31st call: blocked
      const blocked = limiter.check('1.2.3.4');
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);

      // Other IP is unaffected
      const otherIp = limiter.check('5.6.7.8');
      expect(otherIp.allowed).toBe(true);

      // Advance clock by 15 minutes + 1 second
      currentTime += 15 * 60 * 1000 + 1000;

      // Now allowed again
      const afterWindow = limiter.check('1.2.3.4');
      expect(afterWindow.allowed).toBe(true);
      expect(afterWindow.remaining).toBe(29);
    });

    it('cleanup removes expired buckets', () => {
      let currentTime = 1000000;
      const limiter = new MemoryRateLimiter(30, 15 * 60 * 1000, () => currentTime);
      limiter.check('1.2.3.4');

      // Advance clock past window
      currentTime += 16 * 60 * 1000;
      limiter.cleanup();

      // Next check will treat as brand new
      const res = limiter.check('1.2.3.4');
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(29);
    });
  });

  describe('policy.ts', () => {
    const adminActor: Actor = { userId: 'u1', role: 'admin', unitId: null };
    const ban4Actor: Actor = { userId: 'u2', role: 'ban4', unitId: 'unit-ban4' };
    const unitActor: Actor = { userId: 'u3', role: 'unit', unitId: 'unit-tt1' };
    const viewerActor: Actor = { userId: 'u4', role: 'viewer', unitId: null };

    const matrix: Array<{ ability: Ability; roles: Record<Actor['role'], boolean> }> = [
      {
        ability: 'users.manage',
        roles: { admin: true, ban4: false, unit: false, viewer: false },
      },
      {
        ability: 'units.manage',
        roles: { admin: true, ban4: false, unit: false, viewer: false },
      },
      {
        ability: 'assignments.control',
        roles: { admin: true, ban4: false, unit: false, viewer: false },
      },
      {
        ability: 'assignments.indicator',
        roles: { admin: true, ban4: false, unit: false, viewer: false },
      },
      {
        ability: 'assignments.task',
        roles: { admin: true, ban4: true, unit: false, viewer: false },
      },
      {
        ability: 'assignments.read',
        roles: { admin: true, ban4: true, unit: false, viewer: false },
      },
      {
        ability: 'data.read',
        roles: { admin: true, ban4: true, unit: true, viewer: true },
      },
    ];

    const actors: Record<Actor['role'], Actor> = {
      admin: adminActor,
      ban4: ban4Actor,
      unit: unitActor,
      viewer: viewerActor,
    };

    for (const item of matrix) {
      for (const [role, expected] of Object.entries(item.roles) as Array<[Actor['role'], boolean]>) {
        it(`${item.ability} for role ${role} should be ${expected}`, () => {
          expect(can(actors[role], item.ability)).toBe(expected);
        });
      }
    }

    it('returns false for null actor', () => {
      expect(can(null, 'data.read')).toBe(false);
      expect(can(null, 'users.manage')).toBe(false);
    });
  });
});
