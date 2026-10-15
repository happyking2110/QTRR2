import { db as defaultDb } from '../db/client';
import { auditLog, appUser } from '../db/schema';
import { and, eq, ilike, or, gte, lte, lt, desc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import type { Actor } from '../types';

export type { Actor };
export type DbType = PostgresJsDatabase<typeof schema>;

export interface AuditMeta {
  action: string;
  entity: string;
  ip?: string | null;
}

export type DbTransaction = Parameters<
  Parameters<PostgresJsDatabase<typeof schema>['transaction']>[0]
>[0];

/**
 * Thực thi một thao tác nghiệp vụ trong database transaction kèm theo một dòng audit_log bất biến.
 * Nếu bất kỳ bước nào thất bại, toàn bộ transaction sẽ bị rollback.
 */
export async function withAudit<T>(
  actor: Actor | null,
  meta: AuditMeta,
  fn: (
    tx: DbTransaction
  ) => Promise<{ entityId: string; before?: unknown; after?: unknown; result: T }>,
  db: PostgresJsDatabase<typeof schema> | DbTransaction = defaultDb
): Promise<T> {
  const isTx = typeof (db as any).rollback === 'function';
  if (isTx) {
    const tx = db as DbTransaction;
    const { entityId, before, after, result } = await fn(tx);

    await tx.insert(auditLog).values({
      userId: actor?.userId ?? null,
      action: meta.action,
      entity: meta.entity,
      entityId,
      before: before ? (before as Record<string, unknown>) : null,
      after: after ? (after as Record<string, unknown>) : null,
      ip: meta.ip ?? null,
    });

    return result;
  }

  return await (db as PostgresJsDatabase<typeof schema>).transaction(async (tx) => {
    const { entityId, before, after, result } = await fn(tx);

    await tx.insert(auditLog).values({
      userId: actor?.userId ?? null,
      action: meta.action,
      entity: meta.entity,
      entityId,
      before: before ? (before as Record<string, unknown>) : null,
      after: after ? (after as Record<string, unknown>) : null,
      ip: meta.ip ?? null,
    });

    return result;
  });
}

export async function writeAuditLog(
  entry: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
  },
  db: PostgresJsDatabase<typeof schema> = defaultDb
): Promise<void> {
  await db.insert(auditLog).values({
    userId: entry.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before ? (entry.before as Record<string, unknown>) : null,
    after: entry.after ? (entry.after as Record<string, unknown>) : null,
    ip: entry.ip ?? null,
  });
}

export interface ListAuditOptions {
  actor?: string;
  entity?: string;
  action?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface AuditEntryDto {
  id: string;
  at: string;
  user: { fullName: string; email: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
}

export interface AuditPageDto {
  items: AuditEntryDto[];
  nextCursor: string | null;
}

export async function listAuditLogs(
  options: ListAuditOptions,
  db: DbType = defaultDb
): Promise<AuditPageDto> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const conditions = [];

  if (options.cursor) {
    const cursorId = parseInt(options.cursor, 10);
    if (!isNaN(cursorId)) {
      conditions.push(lt(auditLog.id, cursorId));
    }
  }

  if (options.action) {
    conditions.push(eq(auditLog.action, options.action));
  }

  if (options.entity) {
    conditions.push(eq(auditLog.entity, options.entity));
  }

  if (options.actor) {
    const actorPattern = `%${options.actor.trim()}%`;
    conditions.push(
      or(
        ilike(appUser.email, actorPattern),
        ilike(appUser.fullName, actorPattern)
      )
    );
  }

  if (options.from) {
    const [y, m, d] = options.from.split('-').map(Number);
    const fromUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 7 * 60 * 60 * 1000);
    conditions.push(gte(auditLog.at, fromUtc));
  }

  if (options.to) {
    const [y, m, d] = options.to.split('-').map(Number);
    const toUtc = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - 7 * 60 * 60 * 1000);
    conditions.push(lte(auditLog.at, toUtc));
  }

  const query = db
    .select({
      auditLog,
      userFullName: appUser.fullName,
      userEmail: appUser.email,
    })
    .from(auditLog)
    .leftJoin(appUser, eq(auditLog.userId, appUser.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limit + 1);

  const rows = await query;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const items: AuditEntryDto[] = pageRows.map((r) => ({
    id: String(r.auditLog.id),
    at: r.auditLog.at.toISOString(),
    user:
      r.userFullName && r.userEmail
        ? { fullName: r.userFullName, email: r.userEmail }
        : null,
    action: r.auditLog.action,
    entity: r.auditLog.entity,
    entityId: r.auditLog.entityId ?? null,
    before: r.auditLog.before,
    after: r.auditLog.after,
    ip: r.auditLog.ip ?? null,
  }));

  const nextCursor =
    hasMore && items.length > 0 ? items[items.length - 1].id : null;

  return {
    items,
    nextCursor,
  };
}
