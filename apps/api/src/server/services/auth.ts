import { eq, and, ne, desc, sql, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { db as defaultDb } from '../db/client';
import {
  appUser,
  session as sessionTable,
  passwordHistory,
  unit as unitTable,
} from '../db/schema';
import {
  hashPassword,
  verifyPassword,
  validateNewPassword,
} from '../auth/password';
import { generateToken, hashToken } from '../auth/session';
import { MemoryRateLimiter } from '../auth/rate-limit';
import { writeAuditLog, type Actor } from './audit';
import { AppError } from '../errors';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'ban4' | 'unit' | 'viewer';
  unit: {
    code: string;
    name: string;
    kind: 'department' | 'center' | 'group';
  } | null;
  mustChangePassword: boolean;
}

export const loginRateLimiter = new MemoryRateLimiter(30, 15 * 60 * 1000);

let dummyHashPromise: Promise<string> | null = null;
async function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword('dummy_timing_protection_secret_2026');
  }
  return dummyHashPromise;
}

export async function login(
  credentials: { email: string; password: string },
  meta: { ip?: string | null },
  db: PostgresJsDatabase<typeof schema> = defaultDb,
): Promise<{ user: CurrentUser; token: string }> {
  const normalizedEmail = credentials.email.trim().toLowerCase();

  const [existingUser] = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      fullName: appUser.fullName,
      role: appUser.role,
      unitId: appUser.unitId,
      passwordHash: appUser.passwordHash,
      mustChangePassword: appUser.mustChangePassword,
      isActive: appUser.isActive,
      failedAttempts: appUser.failedAttempts,
      lockedUntil: appUser.lockedUntil,
      unitCode: unitTable.code,
      unitName: unitTable.name,
      unitKind: unitTable.kind,
    })
    .from(appUser)
    .leftJoin(unitTable, eq(appUser.unitId, unitTable.id))
    .where(sql`lower(${appUser.email}) = ${normalizedEmail}`)
    .limit(1);

  if (!existingUser) {
    // Luôn băm giả để chống timing attack
    const dummy = await getDummyHash();
    await verifyPassword(credentials.password, dummy);

    await writeAuditLog(
      {
        action: 'login_failed',
        entity: 'app_user',
        entityId: null,
        after: { email: normalizedEmail },
        ip: meta.ip,
      },
      db,
    );

    throw new AppError('UNAUTHENTICATED', 'Email hoặc mật khẩu không đúng');
  }

  const now = new Date();

  // Kiểm tra tài khoản đang bị khóa
  if (existingUser.lockedUntil && existingUser.lockedUntil.getTime() > now.getTime()) {
    throw new AppError('ACCOUNT_LOCKED', 'Tài khoản đang bị tạm khóa. Vui lòng thử lại sau.');
  }

  const isPasswordValid = await verifyPassword(credentials.password, existingUser.passwordHash);

  if (!isPasswordValid) {
    const isLockExpired =
      existingUser.lockedUntil && existingUser.lockedUntil.getTime() <= now.getTime();
    const currentFailures = isLockExpired ? 0 : existingUser.failedAttempts;
    const nextFailures = currentFailures + 1;
    const lockedUntil =
      nextFailures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null;

    await db
      .update(appUser)
      .set({
        failedAttempts: nextFailures,
        lockedUntil,
      })
      .where(eq(appUser.id, existingUser.id));

    await writeAuditLog(
      {
        userId: existingUser.id,
        action: 'login_failed',
        entity: 'app_user',
        entityId: existingUser.id,
        after: { email: existingUser.email },
        ip: meta.ip,
      },
      db,
    );

    throw new AppError('UNAUTHENTICATED', 'Email hoặc mật khẩu không đúng');
  }

  // Mật khẩu đúng nhưng tài khoản bị tắt
  if (!existingUser.isActive) {
    await writeAuditLog(
      {
        userId: existingUser.id,
        action: 'login_failed',
        entity: 'app_user',
        entityId: existingUser.id,
        after: { email: existingUser.email },
        ip: meta.ip,
      },
      db,
    );

    throw new AppError('UNAUTHENTICATED', 'Email hoặc mật khẩu không đúng');
  }

  // Đăng nhập thành công: reset failedAttempts và lockedUntil
  await db
    .update(appUser)
    .set({
      failedAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(appUser.id, existingUser.id));

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours

  await db.insert(sessionTable).values({
    userId: existingUser.id,
    tokenHash,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });

  await writeAuditLog(
    {
      userId: existingUser.id,
      action: 'login',
      entity: 'app_user',
      entityId: existingUser.id,
      after: { email: existingUser.email },
      ip: meta.ip,
    },
    db,
  );

  const currentUser: CurrentUser = {
    id: existingUser.id,
    email: existingUser.email,
    fullName: existingUser.fullName,
    role: existingUser.role,
    unit: existingUser.unitCode
      ? {
          code: existingUser.unitCode,
          name: existingUser.unitName!,
          kind: existingUser.unitKind!,
        }
      : null,
    mustChangePassword: existingUser.mustChangePassword,
  };

  return { user: currentUser, token: rawToken };
}

export async function logout(
  rawToken: string | null,
  actor: Actor,
  meta: { ip?: string | null },
  db: PostgresJsDatabase<typeof schema> = defaultDb,
): Promise<void> {
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    await db.delete(sessionTable).where(eq(sessionTable.tokenHash, tokenHash));
  }

  await writeAuditLog(
    {
      userId: actor.userId,
      action: 'logout',
      entity: 'app_user',
      entityId: actor.userId,
      after: null,
      ip: meta.ip,
    },
    db,
  );
}

export async function getCurrentUser(
  actor: Actor,
  db: PostgresJsDatabase<typeof schema> = defaultDb,
): Promise<CurrentUser> {
  const [row] = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      fullName: appUser.fullName,
      role: appUser.role,
      isActive: appUser.isActive,
      mustChangePassword: appUser.mustChangePassword,
      unitCode: unitTable.code,
      unitName: unitTable.name,
      unitKind: unitTable.kind,
    })
    .from(appUser)
    .leftJoin(unitTable, eq(appUser.unitId, unitTable.id))
    .where(eq(appUser.id, actor.userId))
    .limit(1);

  if (!row || !row.isActive) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    unit: row.unitCode
      ? {
          code: row.unitCode,
          name: row.unitName!,
          kind: row.unitKind!,
        }
      : null,
    mustChangePassword: row.mustChangePassword,
  };
}

export async function changePassword(
  actor: Actor,
  currentRawToken: string | null,
  payload: { oldPassword: string; newPassword: string },
  meta: { ip?: string | null },
  db: PostgresJsDatabase<typeof schema> = defaultDb,
): Promise<void> {
  const [user] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.id, actor.userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  const isOldValid = await verifyPassword(payload.oldPassword, user.passwordHash);
  if (!isOldValid) {
    throw new AppError('VALIDATION', 'Dữ liệu không hợp lệ', {
      fieldErrors: { oldPassword: 'Mật khẩu hiện tại không đúng' },
    });
  }

  // Tra cứu 5 mật khẩu gần nhất
  const historyRows = await db
    .select({ passwordHash: passwordHistory.passwordHash })
    .from(passwordHistory)
    .where(eq(passwordHistory.userId, user.id))
    .orderBy(desc(passwordHistory.createdAt))
    .limit(5);

  const recentHashes = historyRows.map((h) => h.passwordHash);

  const validation = await validateNewPassword(
    payload.newPassword,
    payload.oldPassword,
    [user.passwordHash, ...recentHashes],
  );

  if (!validation.valid) {
    let msg = 'Mật khẩu mới không hợp lệ';
    if (validation.reason === 'too_short') {
      msg = 'Mật khẩu mới phải có tối thiểu 10 ký tự';
    } else if (validation.reason === 'too_long') {
      msg = 'Mật khẩu mới không được vượt quá 128 ký tự';
    } else if (validation.reason === 'same_as_current') {
      msg = 'Mật khẩu mới không được trùng với mật khẩu hiện tại';
    } else if (validation.reason === 'recently_used') {
      msg = 'Mật khẩu mới không được trùng với 5 mật khẩu gần nhất';
    }

    throw new AppError('VALIDATION', 'Dữ liệu không hợp lệ', {
      fieldErrors: { newPassword: msg },
    });
  }

  const newHash = await hashPassword(payload.newPassword);

  await db.transaction(async (tx) => {
    // 1. Cập nhật mật khẩu và tắt cờ buộc đổi
    await tx
      .update(appUser)
      .set({
        passwordHash: newHash,
        mustChangePassword: false,
      })
      .where(eq(appUser.id, user.id));

    // 2. Thêm vào password_history
    await tx.insert(passwordHistory).values({
      userId: user.id,
      passwordHash: newHash,
    });

    // 3. Giữ đúng 5 bản ghi mới nhất trong password_history, xóa bản ghi cũ hơn
    const userHistory = await tx
      .select({ id: passwordHistory.id })
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, user.id))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(5);

    const keepIds = userHistory.map((h) => h.id);
    if (keepIds.length > 0) {
      await tx
        .delete(passwordHistory)
        .where(
          and(
            eq(passwordHistory.userId, user.id),
            sql`${passwordHistory.id} NOT IN (${sql.join(keepIds.map((id) => sql`${id}`), sql`, `)})`,
          ),
        );
    }

    // 4. Thu hồi mọi phiên khác của người này, giữ phiên hiện tại
    if (currentRawToken) {
      const currentTokenHash = hashToken(currentRawToken);
      await tx
        .delete(sessionTable)
        .where(
          and(
            eq(sessionTable.userId, user.id),
            ne(sessionTable.tokenHash, currentTokenHash),
          ),
        );
    } else {
      await tx.delete(sessionTable).where(eq(sessionTable.userId, user.id));
    }

    // 5. Ghi nhật ký (không chứa mật khẩu, băm, token)
    await writeAuditLog(
      {
        userId: user.id,
        action: 'change_password',
        entity: 'app_user',
        entityId: user.id,
        after: { email: user.email },
        ip: meta.ip,
      },
      tx,
    );
  });
}
