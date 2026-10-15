import { Actor } from '../types';

export interface AuthResult {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Actor['role'];
    unitId: string | null;
    mustChangePassword: boolean;
    isActive: boolean;
  };
}

export interface AuthProvider {
  authenticate(credentials: { email: string; password: string }): Promise<AuthResult | null>;
}

export interface PasswordProvider extends AuthProvider {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
}
