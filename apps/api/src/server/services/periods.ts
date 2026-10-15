import { db as defaultDb } from '../db/client';
import {
  cycle,
  period,
  appSetting,
  indicatorReading,
  actionUpdate,
  appUser,
} from '../db/schema';
import { withAudit } from './audit';
import { eq, and, desc, asc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { AppError } from '../errors';
import type { Actor } from '../types';
import {
  toPeriodSummaryDto,
  getPeriodsByYear,
  type PeriodSummaryDto,
} from './queries';

export type PeriodRecord = typeof period.$inferSelect;
export type DbType = PostgresJsDatabase<typeof schema>;

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0).getDate();
  return String(d).padStart(2, '0');
}

async function getDueDay(db: DbType): Promise<number> {
  const [dueSetting] = await db
    .select()
    .from(appSetting)
    .where(eq(appSetting.key, 'period.due_day'));

  return typeof dueSetting?.value === 'number'
    ? dueSetting.value
    : typeof dueSetting?.value === 'string'
      ? parseInt(dueSetting.value, 10)
      : 10;
}

export async function seedInitialPeriods(
  cycleId: string,
  db: DbType = defaultDb
): Promise<PeriodRecord[]> {
  const [cycleRow] = await db.select().from(cycle).where(eq(cycle.id, cycleId));
  const year = cycleRow?.year ?? 2026;
  const dueDay = await getDueDay(db);

  const targetPeriods = [
    {
      cycleId,
      key: `${year}-10`,
      kind: 'month' as const,
      label: `Tháng 10/${year}`,
      startsOn: `${year}-10-01`,
      endsOn: `${year}-10-31`,
      dueAt: new Date(Date.UTC(year, 10, dueDay, 16, 59, 59)),
    },
    {
      cycleId,
      key: `${year}-11`,
      kind: 'month' as const,
      label: `Tháng 11/${year}`,
      startsOn: `${year}-11-01`,
      endsOn: `${year}-11-30`,
      dueAt: new Date(Date.UTC(year, 11, dueDay, 16, 59, 59)),
    },
    {
      cycleId,
      key: `${year}-12`,
      kind: 'month' as const,
      label: `Tháng 12/${year}`,
      startsOn: `${year}-12-01`,
      endsOn: `${year}-12-31`,
      dueAt: new Date(Date.UTC(year + 1, 0, dueDay, 16, 59, 59)),
    },
    {
      cycleId,
      key: `${year}-Q4`,
      kind: 'quarter' as const,
      label: `Quý 4/${year}`,
      startsOn: `${year}-10-01`,
      endsOn: `${year}-12-31`,
      dueAt: new Date(Date.UTC(year + 1, 0, dueDay, 16, 59, 59)),
    },
  ];

  const existing = await db
    .select()
    .from(period)
    .where(eq(period.cycleId, cycleId));

  const existingMap = new Map(existing.map((p) => [p.key, p]));

  const hasChanges = targetPeriods.some((tp) => {
    const cur = existingMap.get(tp.key);
    if (!cur) return true;
    return (
      cur.kind !== tp.kind ||
      cur.label !== tp.label ||
      cur.startsOn !== tp.startsOn ||
      cur.endsOn !== tp.endsOn ||
      cur.dueAt.getTime() !== tp.dueAt.getTime()
    );
  });

  if (!hasChanges && existing.length >= targetPeriods.length) {
    return existing;
  }

  return await withAudit(
    null,
    {
      action: 'seed_periods',
      entity: 'period',
    },
    async (tx) => {
      const results: PeriodRecord[] = [];

      for (const tp of targetPeriods) {
        const [upserted] = await tx
          .insert(period)
          .values(tp)
          .onConflictDoUpdate({
            target: [period.cycleId, period.key],
            set: {
              kind: tp.kind,
              label: tp.label,
              startsOn: tp.startsOn,
              endsOn: tp.endsOn,
              dueAt: tp.dueAt,
            },
          })
          .returning();
        results.push(upserted);
      }

      return {
        entityId: cycleId,
        after: results.map((r) => ({
          key: r.key,
          kind: r.kind,
          label: r.label,
          startsOn: r.startsOn,
          endsOn: r.endsOn,
          dueAt: r.dueAt.toISOString(),
        })),
        result: results,
      };
    },
    db
  );
}

/**
 * Tạo các kỳ tháng và quý còn thiếu của chu kỳ (backend-design 4.11 mục 10)
 */
export async function ensurePeriods(
  year: number,
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<PeriodSummaryDto[]> {
  if (actor && actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền tạo kỳ');
  }

  const [cycleRow] = await db.select().from(cycle).where(eq(cycle.year, year));
  if (!cycleRow) {
    throw new AppError('NOT_FOUND', `Không tìm thấy chu kỳ năm ${year}`);
  }

  if (cycleRow.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể sửa đổi');
  }

  const dueDay = await getDueDay(db);

  const existingPeriods = await db
    .select()
    .from(period)
    .where(eq(period.cycleId, cycleRow.id));

  const existingKeySet = new Set(existingPeriods.map((p) => p.key));

  const monthNumbers: number[] = [];
  for (const p of existingPeriods) {
    const mMatch = p.key.match(new RegExp(`^${year}-(\\d{2})$`));
    if (mMatch) {
      monthNumbers.push(parseInt(mMatch[1], 10));
    }
    const qMatch = p.key.match(new RegExp(`^${year}-Q(\\d)$`));
    if (qMatch) {
      monthNumbers.push((parseInt(qMatch[1], 10) - 1) * 3 + 1);
    }
  }

  const minMonth = monthNumbers.length > 0 ? Math.min(...monthNumbers) : 1;

  const newPeriodsToInsert: Array<typeof period.$inferInsert> = [];

  for (let m = minMonth; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    if (!existingKeySet.has(key)) {
      const mm = String(m).padStart(2, '0');
      const lastDay = lastDayOfMonth(year, m);
      const nextMonth = m === 12 ? 1 : m + 1;
      const nextYear = m === 12 ? year + 1 : year;
      newPeriodsToInsert.push({
        cycleId: cycleRow.id,
        key,
        kind: 'month',
        label: `Tháng ${m}/${year}`,
        startsOn: `${year}-${mm}-01`,
        endsOn: `${year}-${mm}-${lastDay}`,
        dueAt: new Date(Date.UTC(nextYear, nextMonth - 1, dueDay, 16, 59, 59)),
      });
    }
  }

  const minQuarter = Math.ceil(minMonth / 3);
  for (let q = minQuarter; q <= 4; q++) {
    const key = `${year}-Q${q}`;
    if (!existingKeySet.has(key)) {
      const startMonth = String((q - 1) * 3 + 1).padStart(2, '0');
      const endMonth = q * 3;
      const endMonthStr = String(endMonth).padStart(2, '0');
      const lastDay = lastDayOfMonth(year, endMonth);
      const nextMonth = q === 4 ? 1 : q * 3 + 1;
      const nextYear = q === 4 ? year + 1 : year;
      newPeriodsToInsert.push({
        cycleId: cycleRow.id,
        key,
        kind: 'quarter',
        label: `Quý ${q}/${year}`,
        startsOn: `${year}-${startMonth}-01`,
        endsOn: `${year}-${endMonthStr}-${lastDay}`,
        dueAt: new Date(Date.UTC(nextYear, nextMonth - 1, dueDay, 16, 59, 59)),
      });
    }
  }

  if (newPeriodsToInsert.length > 0) {
    await withAudit(
      actor,
      {
        action: 'ensure_periods',
        entity: 'period',
      },
      async (tx) => {
        for (const np of newPeriodsToInsert) {
          await tx.insert(period).values(np);
        }
        return {
          entityId: cycleRow.id,
          after: newPeriodsToInsert.map((p) => ({
            key: p.key,
            kind: p.kind,
            label: p.label,
          })),
          result: true,
        };
      },
      db
    );
  }

  return await getPeriodsByYear(year, db);
}

/**
 * Tạo một kỳ loại đợt (cho chỉ số theo đợt) (backend-design 4.11 mục 11)
 */
export async function createEventPeriod(
  year: number,
  data: { label: string; startsOn: string; endsOn: string },
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<PeriodSummaryDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền tạo kỳ đợt');
  }

  const [cycleRow] = await db.select().from(cycle).where(eq(cycle.year, year));
  if (!cycleRow) {
    throw new AppError('NOT_FOUND', `Không tìm thấy chu kỳ năm ${year}`);
  }

  if (cycleRow.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể sửa đổi');
  }

  const label = data.label?.trim() ?? '';
  if (label.length < 3 || label.length > 100) {
    throw new AppError('VALIDATION', 'Tên kỳ đợt phải từ 3 đến 100 ký tự');
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(data.startsOn) || !datePattern.test(data.endsOn)) {
    throw new AppError('VALIDATION', 'Định dạng ngày không hợp lệ (YYYY-MM-DD)');
  }

  if (!data.startsOn.startsWith(`${year}-`) || !data.endsOn.startsWith(`${year}-`)) {
    throw new AppError('VALIDATION', 'Thời gian kỳ đợt phải nằm trong năm của chu kỳ');
  }

  if (data.startsOn > data.endsOn) {
    throw new AppError('VALIDATION', 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc');
  }

  const existingEvents = await db
    .select()
    .from(period)
    .where(and(eq(period.cycleId, cycleRow.id), eq(period.kind, 'event')));

  let maxN = 0;
  for (const ep of existingEvents) {
    const m = ep.key.match(new RegExp(`^${year}-E(\\d+)$`));
    if (m) {
      const val = parseInt(m[1], 10);
      if (val > maxN) maxN = val;
    }
  }

  const newKey = `${year}-E${maxN + 1}`;
  const dueDay = await getDueDay(db);

  const endMonth = parseInt(data.endsOn.slice(5, 7), 10);
  const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
  const nextYear = endMonth === 12 ? year + 1 : year;
  const dueAt = new Date(Date.UTC(nextYear, nextMonth - 1, dueDay, 16, 59, 59));

  return await withAudit(
    actor,
    {
      action: 'create_event_period',
      entity: 'period',
    },
    async (tx) => {
      const [inserted] = await tx
        .insert(period)
        .values({
          cycleId: cycleRow.id,
          key: newKey,
          kind: 'event',
          label,
          startsOn: data.startsOn,
          endsOn: data.endsOn,
          dueAt,
        })
        .returning();

      return {
        entityId: inserted.id,
        after: {
          key: inserted.key,
          kind: inserted.kind,
          label: inserted.label,
          startsOn: inserted.startsOn,
          endsOn: inserted.endsOn,
          dueAt: inserted.dueAt.toISOString(),
        },
        result: toPeriodSummaryDto(inserted, null),
      };
    },
    db
  );
}

/**
 * Khóa kỳ (backend-design 4.11 mục 9)
 */
export async function closePeriod(
  year: number,
  key: string,
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<PeriodSummaryDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền khóa kỳ');
  }

  const [cycleRow] = await db.select().from(cycle).where(eq(cycle.year, year));
  if (!cycleRow) {
    throw new AppError('NOT_FOUND', `Không tìm thấy chu kỳ năm ${year}`);
  }

  if (cycleRow.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể sửa đổi');
  }

  const [closer] = await db
    .select({ fullName: appUser.fullName })
    .from(appUser)
    .where(eq(appUser.id, actor.userId));
  const closedByName = closer?.fullName ?? null;

  return await withAudit(
    actor,
    {
      action: 'close_period',
      entity: 'period',
      ip: meta?.ip,
    },
    async (tx) => {
      // Khóa dòng period FOR UPDATE trước khi kiểm tra bản pending
      const [periodRow] = await tx
        .select()
        .from(period)
        .where(and(eq(period.cycleId, cycleRow.id), eq(period.key, key)))
        .for('update');

      if (!periodRow) {
        throw new AppError('PERIOD_NOT_FOUND', `Không tìm thấy kỳ ${key} trong chu kỳ năm ${year}`);
      }

      if (periodRow.closedAt !== null) {
        throw new AppError('INVALID_STATE', 'Kỳ đã bị khóa trước đó');
      }

      // Kiểm tra còn bản pending của kỳ không TRONG CÙNG TRANSACTION ĐANG GIỮ KHÓA FOR UPDATE
      const pendingReadings = await tx
        .select({ id: indicatorReading.id })
        .from(indicatorReading)
        .where(
          and(
            eq(indicatorReading.periodKey, key),
            eq(indicatorReading.status, 'pending')
          )
        );

      const pendingUpdates = await tx
        .select({ id: actionUpdate.id })
        .from(actionUpdate)
        .where(
          and(
            eq(actionUpdate.periodKey, key),
            eq(actionUpdate.status, 'pending')
          )
        );

      if (pendingReadings.length > 0 || pendingUpdates.length > 0) {
        const details = [
          ...pendingReadings.map((r) => ({ kind: 'reading', id: r.id })),
          ...pendingUpdates.map((u) => ({ kind: 'task_update', id: u.id })),
        ];
        throw new AppError('INVALID_STATE', 'Không thể khóa kỳ khi còn bản nộp đang chờ duyệt', {
          details,
        });
      }

      const now = new Date();

      const [updated] = await tx
        .update(period)
        .set({
          closedAt: now,
          closedBy: actor.userId,
        })
        .where(eq(period.id, periodRow.id))
        .returning();

      return {
        entityId: periodRow.id,
        before: {
          closed: false,
        },
        after: {
          closed: true,
          closedAt: now.toISOString(),
          closedBy: actor.userId,
        },
        result: toPeriodSummaryDto(updated, closedByName),
      };
    },
    db
  );
}

/**
 * Mở lại kỳ đã khóa (backend-design 4.11 mục 9)
 */
export async function reopenPeriod(
  year: number,
  key: string,
  reason: string,
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<PeriodSummaryDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền mở lại kỳ');
  }

  const trimmedReason = reason?.trim() ?? '';
  if (trimmedReason.length < 5 || trimmedReason.length > 500) {
    throw new AppError('VALIDATION', 'Lý do mở lại phải từ 5 đến 500 ký tự');
  }

  const [cycleRow] = await db.select().from(cycle).where(eq(cycle.year, year));
  if (!cycleRow) {
    throw new AppError('NOT_FOUND', `Không tìm thấy chu kỳ năm ${year}`);
  }

  if (cycleRow.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể sửa đổi');
  }

  return await withAudit(
    actor,
    {
      action: 'reopen_period',
      entity: 'period',
      ip: meta?.ip,
    },
    async (tx) => {
      // Khóa dòng period FOR UPDATE
      const [periodRow] = await tx
        .select()
        .from(period)
        .where(and(eq(period.cycleId, cycleRow.id), eq(period.key, key)))
        .for('update');

      if (!periodRow) {
        throw new AppError('PERIOD_NOT_FOUND', `Không tìm thấy kỳ ${key} trong chu kỳ năm ${year}`);
      }

      if (periodRow.closedAt === null) {
        throw new AppError('INVALID_STATE', 'Kỳ đang mở, không cần mở lại');
      }

      const closedAtIso = periodRow.closedAt.toISOString();

      const [updated] = await tx
        .update(period)
        .set({
          closedAt: null,
          closedBy: null,
          reopenReason: trimmedReason,
        })
        .where(eq(period.id, periodRow.id))
        .returning();

      return {
        entityId: periodRow.id,
        before: {
          closed: true,
          closedAt: closedAtIso,
        },
        after: {
          closed: false,
          reopenReason: trimmedReason,
        },
        result: toPeriodSummaryDto(updated, null),
      };
    },
    db
  );
}
