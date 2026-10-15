import crypto from 'crypto';
import { getConfig } from '../config';

export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string, secret?: string): string {
  const key = secret || getConfig().sessionSecret;
  return crypto.createHmac('sha256', key).update(token).digest('hex');
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header || typeof header !== 'string') {
    return {};
  }

  const cookies: Record<string, string> = {};
  const pairs = header.split(';');

  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue; // Must have non-empty name before '='

    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();

    if (key && !(key in cookies)) {
      // Remove surrounding quotes if present
      const cleanVal = val.startsWith('"') && val.endsWith('"') ? val.slice(1, -1) : val;
      cookies[key] = cleanVal;
    }
  }

  return cookies;
}
