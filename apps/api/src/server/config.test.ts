import { describe, it, expect } from 'vitest';
import { validateConfig, loadConfig } from './config';

describe('Server Config Validation (3A.0)', () => {
  const validEnv: Record<string, string> = {
    SESSION_SECRET: 'a-very-secure-random-secret-key-with-more-than-32-chars',
    APP_ORIGIN: 'http://localhost:3000',
    TRUSTED_PROXY_IPS: '127.0.0.1,::1',
  };

  it('passes with valid environment variables', () => {
    const config = validateConfig(validEnv);
    expect(config.sessionSecret).toBe(validEnv.SESSION_SECRET);
    expect(config.appOrigin).toBe('http://localhost:3000');
    expect(config.trustedProxyIps).toEqual(['127.0.0.1', '::1']);
  });

  it('throws mentioning SESSION_SECRET when SESSION_SECRET is missing', () => {
    const env = { ...validEnv, SESSION_SECRET: '' };
    expect(() => validateConfig(env)).toThrowError(/SESSION_SECRET/);
  });

  it('throws mentioning SESSION_SECRET when SESSION_SECRET is shorter than 32 characters (e.g. 31 chars)', () => {
    const env = { ...validEnv, SESSION_SECRET: '1234567890123456789012345678901' }; // 31 chars
    expect(() => validateConfig(env)).toThrowError(/SESSION_SECRET/);
  });

  it('throws mentioning SESSION_SECRET when SESSION_SECRET starts with change-me', () => {
    const env = { ...validEnv, SESSION_SECRET: 'change-me-32-chars-minimum-secret-key-mbf-risk-2026' };
    expect(() => validateConfig(env)).toThrowError(/SESSION_SECRET/);
  });

  it('never prints the secret value in the error message when SESSION_SECRET is invalid', () => {
    const secret = 'change-me-sensitive-password-that-must-not-leak';
    const env = { ...validEnv, SESSION_SECRET: secret };
    try {
      validateConfig(env);
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      expect((err as Error).message).toContain('SESSION_SECRET');
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it('throws mentioning APP_ORIGIN when APP_ORIGIN is missing', () => {
    const env = { ...validEnv, APP_ORIGIN: '' };
    expect(() => validateConfig(env)).toThrowError(/APP_ORIGIN/);
  });

  it('throws mentioning APP_ORIGIN when APP_ORIGIN does not start with http:// or https://', () => {
    const env = { ...validEnv, APP_ORIGIN: 'ftp://localhost:3000' };
    expect(() => validateConfig(env)).toThrowError(/APP_ORIGIN/);
  });

  it('throws mentioning TRUSTED_PROXY_IPS when TRUSTED_PROXY_IPS is missing', () => {
    const env = { ...validEnv, TRUSTED_PROXY_IPS: '' };
    expect(() => validateConfig(env)).toThrowError(/TRUSTED_PROXY_IPS/);
  });
});
