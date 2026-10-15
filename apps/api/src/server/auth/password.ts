import { hash, verify } from '@node-rs/argon2';
import crypto from 'crypto';

const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export async function validateNewPassword(
  newPassword: string,
  oldPassword: string,
  recentHashes: string[],
): Promise<{ valid: boolean; reason?: 'too_short' | 'too_long' | 'same_as_current' | 'recently_used' }> {
  if (newPassword.length < 10) {
    return { valid: false, reason: 'too_short' };
  }
  if (newPassword.length > 128) {
    return { valid: false, reason: 'too_long' };
  }
  if (newPassword === oldPassword) {
    return { valid: false, reason: 'same_as_current' };
  }

  for (const h of recentHashes) {
    const matches = await verifyPassword(newPassword, h);
    if (matches) {
      return { valid: false, reason: 'recently_used' };
    }
  }

  return { valid: true };
}

export function generateTemporaryPassword(): string {
  let pwd = '';
  const len = TEMP_PASSWORD_ALPHABET.length;
  for (let i = 0; i < 16; i++) {
    const idx = crypto.randomInt(0, len);
    pwd += TEMP_PASSWORD_ALPHABET[idx];
  }
  return pwd;
}
