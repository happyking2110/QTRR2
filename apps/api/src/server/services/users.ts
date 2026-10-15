import { eq, and, sql, ilike, or, inArray, asc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { defaultDb, type DbType } from '../db/client';
import { appUser, unit, session, passwordHistory, auditLog } from '../db/schema';
import { AppError } from '../errors';
import { hashPassword, generateTemporaryPassword } from '../auth/password';
import { writeAuditLog } from './audit';
import { readUsersFile, type ImportRowError } from '../../lib/import/read-users';
import type { Actor } from '../types';

export interface UserSummaryUnit {
  code: string;
  name: string;
  kind: 'department' | 'center' | 'group';
}

export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'ban4' | 'unit' | 'viewer';
  unit: UserSummaryUnit | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreateUserPayload {
  email: string;
  fullName: string;
  role: 'admin' | 'ban4' | 'unit' | 'viewer';
  unitCode?: string | null;
}

export interface CreatedUser {
  user: UserListItem;
  temporaryPassword: string;
}

export interface UpdateUserPayload {
  role?: 'admin' | 'ban4' | 'unit' | 'viewer';
  unitCode?: string | null;
  isActive?: boolean;
}

export interface ResetPasswordResult {
  temporaryPassword: string;
}

export interface ImportedUser {
  email: string;
  fullName: string;
  role: 'admin' | 'ban4' | 'unit' | 'viewer';
  temporaryPassword: string;
}

export interface ImportUsersResult {
  created: ImportedUser[];
}

export interface ServiceMeta {
  actor?: Actor | null;
  ip?: string;
}

/**
 * Danh sách người dùng hệ thống (admin).
 * Lọc theo q, role, unitCode, isActive.
 * lastLoginAt lấy từ nhật ký (audit_log.action = 'login').
 */
export async function listUsers(
  query: {
    q?: string;
    role?: 'admin' | 'ban4' | 'unit' | 'viewer';
    unitCode?: string;
    isActive?: boolean;
  },
  db: DbType = defaultDb
): Promise<UserListItem[]> {
  const conditions = [];

  if (query.q && query.q.trim()) {
    const term = `%${query.q.trim()}%`;
    conditions.push(or(ilike(appUser.email, term), ilike(appUser.fullName, term)));
  }

  if (query.role) {
    conditions.push(eq(appUser.role, query.role));
  }

  if (query.unitCode) {
    conditions.push(eq(unit.code, query.unitCode.toUpperCase()));
  }

  if (query.isActive !== undefined) {
    conditions.push(eq(appUser.isActive, query.isActive));
  }

  const rows = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      fullName: appUser.fullName,
      role: appUser.role,
      isActive: appUser.isActive,
      mustChangePassword: appUser.mustChangePassword,
      lockedUntil: appUser.lockedUntil,
      createdAt: appUser.createdAt,
      unitCode: unit.code,
      unitName: unit.name,
      unitKind: unit.kind,
    })
    .from(appUser)
    .leftJoin(unit, eq(appUser.unitId, unit.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(appUser.fullName));

  if (rows.length === 0) {
    return [];
  }

  // Lấy lastLoginAt từ audit_log cho tập user này
  const userIds = rows.map((r) => r.id);
  const loginAuditRows = await db
    .select({
      userId: auditLog.userId,
      maxAt: sql<string>`max(${auditLog.at})`.as('max_at'),
    })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'login'), inArray(auditLog.userId, userIds)))
    .groupBy(auditLog.userId);

  const lastLoginMap = new Map<string, string>();
  for (const item of loginAuditRows) {
    if (item.userId && item.maxAt) {
      lastLoginMap.set(item.userId, new Date(item.maxAt).toISOString());
    }
  }

  const now = new Date();

  return rows.map((r) => {
    let lockedUntilStr: string | null = null;
    if (r.lockedUntil && new Date(r.lockedUntil) > now) {
      lockedUntilStr = new Date(r.lockedUntil).toISOString();
    }

    return {
      id: r.id,
      email: r.email,
      fullName: r.fullName,
      role: r.role,
      unit: r.unitCode
        ? {
            code: r.unitCode,
            name: r.unitName!,
            kind: r.unitKind!,
          }
        : null,
      isActive: r.isActive,
      mustChangePassword: r.mustChangePassword,
      lockedUntil: lockedUntilStr,
      lastLoginAt: lastLoginMap.get(r.id) ?? null,
      createdAt: new Date(r.createdAt).toISOString(),
    };
  });
}

/**
 * Tạo mới một người dùng, sinh mật khẩu tạm trả về một lần.
 */
export async function createUser(
  payload: CreateUserPayload,
  meta: ServiceMeta,
  db: DbType = defaultDb
): Promise<CreatedUser> {
  const normalizedEmail = payload.email.trim().toLowerCase();

  // Kiểm tra email duy nhất
  const [existingUser] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(sql`lower(${appUser.email}) = ${normalizedEmail}`)
    .limit(1);

  if (existingUser) {
    throw new AppError('CONFLICT', 'Email đã được sử dụng trong hệ thống');
  }

  // Kiểm tra đơn vị
  const normalizedUnitCode = payload.unitCode?.trim()
    ? payload.unitCode.trim().toUpperCase()
    : null;

  if (payload.role === 'unit' && !normalizedUnitCode) {
    throw new AppError('VALIDATION', 'Vai trò unit bắt buộc có đơn vị', {
      fieldErrors: { unitCode: 'Vai trò unit bắt buộc có đơn vị' },
    });
  }

  let unitRow: typeof unit.$inferSelect | undefined;
  if (normalizedUnitCode) {
    const [foundUnit] = await db
      .select()
      .from(unit)
      .where(eq(unit.code, normalizedUnitCode))
      .limit(1);

    if (!foundUnit) {
      throw new AppError('VALIDATION', `Đơn vị ${normalizedUnitCode} không tồn tại`, {
        fieldErrors: { unitCode: `Đơn vị ${normalizedUnitCode} không tồn tại` },
      });
    }
    unitRow = foundUnit;
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const [newUser] = await db
    .insert(appUser)
    .values({
      email: normalizedEmail,
      fullName: payload.fullName.trim(),
      role: payload.role,
      unitId: unitRow ? unitRow.id : null,
      passwordHash,
      mustChangePassword: true,
      isActive: true,
      failedAttempts: 0,
    })
    .returning();

  // Lưu lịch sử mật khẩu
  await db.insert(passwordHistory).values({
    userId: newUser.id,
    passwordHash,
  });

  // Ghi nhật ký: TUYỆT ĐỐI KHÔNG LƯU MẬT KHẨU HAY HASH
  await writeAuditLog(
    {
      action: 'create_user',
      entity: 'app_user',
      entityId: newUser.id,
      userId: meta.actor?.userId ?? null,
      ip: meta.ip,
      after: {
        email: newUser.email,
        fullName: newUser.fullName,
        role: newUser.role,
        unitCode: unitRow ? unitRow.code : null,
      },
    },
    db
  );

  const userItem: UserListItem = {
    id: newUser.id,
    email: newUser.email,
    fullName: newUser.fullName,
    role: newUser.role,
    unit: unitRow
      ? {
          code: unitRow.code,
          name: unitRow.name,
          kind: unitRow.kind,
        }
      : null,
    isActive: newUser.isActive,
    mustChangePassword: newUser.mustChangePassword,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date(newUser.createdAt).toISOString(),
  };

  return {
    user: userItem,
    temporaryPassword,
  };
}

/**
 * Đặt lại mật khẩu tạm thời cho người dùng.
 * Bật cờ mustChangePassword, xóa toàn bộ phiên hiện tại của người dùng.
 */
export async function resetPassword(
  userId: string,
  meta: ServiceMeta,
  db: DbType = defaultDb
): Promise<ResetPasswordResult> {
  const [user] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy người dùng');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await db
    .update(appUser)
    .set({
      passwordHash,
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(appUser.id, userId));

  await db.insert(passwordHistory).values({
    userId,
    passwordHash,
  });

  // Xóa mọi phiên của người này
  await db.delete(session).where(eq(session.userId, userId));

  // Ghi nhật ký: TUYỆT ĐỐI KHÔNG LƯU MẬT KHẨU
  await writeAuditLog(
    {
      action: 'reset_password',
      entity: 'app_user',
      entityId: userId,
      userId: meta.actor?.userId ?? null,
      ip: meta.ip,
      after: { mustChangePassword: true },
    },
    db
  );

  return { temporaryPassword };
}

/**
 * Cập nhật vai trò, đơn vị hoặc trạng thái hoạt động của người dùng.
 * Không cho phép tắt hoặc hạ vai trò của admin đang hoạt động cuối cùng.
 */
export async function updateUser(
  userId: string,
  payload: UpdateUserPayload,
  meta: ServiceMeta,
  db: DbType = defaultDb
): Promise<UserListItem> {
  const [user] = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      fullName: appUser.fullName,
      role: appUser.role,
      unitId: appUser.unitId,
      isActive: appUser.isActive,
      mustChangePassword: appUser.mustChangePassword,
      lockedUntil: appUser.lockedUntil,
      createdAt: appUser.createdAt,
    })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy người dùng');
  }

  // Bảo vệ admin cuối cùng (Quy tắc 4.10 mục 12)
  if (user.role === 'admin' && user.isActive) {
    const isDemoting = payload.role !== undefined && payload.role !== 'admin';
    const isDeactivating = payload.isActive === false;

    if (isDemoting || isDeactivating) {
      const [adminCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appUser)
        .where(and(eq(appUser.role, 'admin'), eq(appUser.isActive, true)));

      if ((adminCount?.count ?? 0) <= 1) {
        throw new AppError(
          'INVALID_STATE',
          'Không thể tắt hoặc hạ vai trò của Quản trị viên đang hoạt động cuối cùng trong hệ thống'
        );
      }
    }
  }

  const targetRole = payload.role ?? user.role;
  let targetUnitId = user.unitId;

  if (payload.unitCode !== undefined) {
    if (payload.unitCode === null || payload.unitCode === '') {
      targetUnitId = null;
    } else {
      const normalizedCode = payload.unitCode.trim().toUpperCase();
      const [foundUnit] = await db
        .select()
        .from(unit)
        .where(eq(unit.code, normalizedCode))
        .limit(1);

      if (!foundUnit) {
        throw new AppError('VALIDATION', `Đơn vị ${normalizedCode} không tồn tại`, {
          fieldErrors: { unitCode: `Đơn vị ${normalizedCode} không tồn tại` },
        });
      }
      targetUnitId = foundUnit.id;
    }
  }

  if (targetRole === 'unit' && !targetUnitId) {
    throw new AppError('VALIDATION', 'Vai trò unit bắt buộc có đơn vị', {
      fieldErrors: { unitCode: 'Vai trò unit bắt buộc có đơn vị' },
    });
  }

  const updateValues: Partial<typeof appUser.$inferInsert> = {};
  if (payload.role !== undefined) {
    updateValues.role = payload.role;
  }
  if (payload.unitCode !== undefined) {
    updateValues.unitId = targetUnitId;
  }
  if (payload.isActive !== undefined) {
    updateValues.isActive = payload.isActive;
  }

  // Tắt tài khoản thì thu hồi mọi phiên của người đó
  if (payload.isActive === false) {
    await db.delete(session).where(eq(session.userId, userId));
  }

  await db.update(appUser).set(updateValues).where(eq(appUser.id, userId));

  // Ghi nhật ký
  await writeAuditLog(
    {
      action: 'update_user',
      entity: 'app_user',
      entityId: userId,
      userId: meta.actor?.userId ?? null,
      ip: meta.ip,
      before: {
        role: user.role,
        unitId: user.unitId,
        isActive: user.isActive,
      },
      after: {
        role: targetRole,
        unitId: targetUnitId,
        isActive: payload.isActive ?? user.isActive,
      },
    },
    db
  );

  // Lấy thông tin đơn vị mới sau khi update
  let targetUnit: UserSummaryUnit | null = null;
  if (targetUnitId) {
    const [u] = await db
      .select({ code: unit.code, name: unit.name, kind: unit.kind })
      .from(unit)
      .where(eq(unit.id, targetUnitId))
      .limit(1);
    if (u) {
      targetUnit = u;
    }
  }

  // Lấy lastLoginAt
  const [loginAudit] = await db
    .select({ maxAt: sql<string>`max(${auditLog.at})`.as('max_at') })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'login'), eq(auditLog.userId, userId)));

  let lockedUntilStr: string | null = null;
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    lockedUntilStr = new Date(user.lockedUntil).toISOString();
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: targetRole,
    unit: targetUnit,
    isActive: payload.isActive ?? user.isActive,
    mustChangePassword: user.mustChangePassword,
    lockedUntil: lockedUntilStr,
    lastLoginAt: loginAudit?.maxAt ? new Date(loginAudit.maxAt).toISOString() : null,
    createdAt: new Date(user.createdAt).toISOString(),
  };
}

/**
 * Nhập người dùng hàng loạt từ file CSV hoặc XLSX.
 * Toàn bộ thực thi trong một transaction; lỗi bất kỳ dòng nào sẽ hủy toàn bộ.
 */
export async function importUsers(
  fileBuffer: Buffer,
  filename: string,
  meta: ServiceMeta,
  db: DbType = defaultDb
): Promise<ImportUsersResult> {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext !== 'csv' && ext !== 'xlsx') {
    throw new AppError(
      'VALIDATION',
      'Định dạng file không hỗ trợ. Vui lòng tải lên file CSV hoặc XLSX.'
    );
  }

  // Lấy email và đơn vị đã có trong DB để kiểm tra trong 1 lần duy nhất
  const [existingUsers, allUnits] = await Promise.all([
    db
      .select({ email: sql<string>`lower(${appUser.email})`.as('email') })
      .from(appUser),
    db
      .select({ code: unit.code, id: unit.id })
      .from(unit),
  ]);

  const existingEmails = new Set(existingUsers.map((u) => u.email));
  const existingUnitCodes = new Set(allUnits.map((u) => u.code.toUpperCase()));
  const unitMap = new Map(allUnits.map((u) => [u.code.toUpperCase(), u.id]));

  const parseResult = await readUsersFile(fileBuffer, filename, {
    existingEmails,
    existingUnitCodes,
  });

  if (!parseResult.ok) {
    if (parseResult.errors.some((e) => e.message.includes('CSV hoặc XLSX'))) {
      throw new AppError(
        'VALIDATION',
        'Định dạng file không hỗ trợ. Vui lòng tải lên file CSV hoặc XLSX.'
      );
    }

    throw new AppError(
      'IMPORT_INVALID',
      'File dữ liệu người dùng không hợp lệ',
      { details: parseResult.errors }
    );
  }

  const { rows } = parseResult;

  // Thực hiện thêm toàn bộ trong 1 transaction
  const createdList: ImportedUser[] = [];

  await db.transaction(async (tx) => {
    for (const r of rows) {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const unitId = r.unitCode ? unitMap.get(r.unitCode.toUpperCase()) ?? null : null;

      const [newUser] = await tx
        .insert(appUser)
        .values({
          email: r.email.toLowerCase(),
          fullName: r.fullName,
          role: r.role,
          unitId,
          passwordHash,
          mustChangePassword: true,
          isActive: true,
          failedAttempts: 0,
        })
        .returning();

      await tx.insert(passwordHistory).values({
        userId: newUser.id,
        passwordHash,
      });

      // Ghi nhật ký từng user: KHÔNG LƯU MẬT KHẨU
      await writeAuditLog(
        {
          action: 'create_user',
          entity: 'app_user',
          entityId: newUser.id,
          userId: meta.actor?.userId ?? null,
          ip: meta.ip,
          after: {
            email: newUser.email,
            fullName: newUser.fullName,
            role: newUser.role,
            unitCode: r.unitCode,
          },
        },
        tx as unknown as DbType
      );

      createdList.push({
        email: r.email,
        fullName: r.fullName,
        role: r.role,
        temporaryPassword,
      });
    }

    // Ghi nhật ký tổng hợp import_users
    await writeAuditLog(
      {
        action: 'import_users',
        entity: 'app_user',
        userId: meta.actor?.userId ?? null,
        ip: meta.ip,
        after: {
          count: rows.length,
          filename,
        },
      },
      tx as unknown as DbType
    );
  });

  return { created: createdList };
}

export interface PersonRefDto {
  fullName: string;
  unitName: string | null;
}

export async function getPersonRef(
  userId: string | null,
  db: PostgresJsDatabase<typeof schema> = defaultDb
): Promise<PersonRefDto | null> {
  if (!userId) return null;
  const [row] = await db
    .select({
      fullName: appUser.fullName,
      unitName: unit.name,
    })
    .from(appUser)
    .leftJoin(unit, eq(appUser.unitId, unit.id))
    .where(eq(appUser.id, userId))
    .limit(1);

  if (!row) return null;
  return {
    fullName: row.fullName,
    unitName: row.unitName ?? null,
  };
}
