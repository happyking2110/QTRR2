import { db as defaultDb } from '../db/client';
import { appSetting } from '../db/schema';
import { withAudit } from './audit';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { AppError } from '../errors';
import type { Actor } from '../types';

export type DbType = PostgresJsDatabase<typeof schema>;

export interface SettingsDto {
  slowDays: number;
  slowProgress: number;
  staleDays: number;
  dueDay: number;
}

export async function getSettings(db: DbType = defaultDb): Promise<SettingsDto> {
  const rows = await db.select().from(appSetting);
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const getNum = (key: string, def: number): number => {
    const val = map.get(key);
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) return parsed;
    }
    return def;
  };

  return {
    slowDays: getNum('risk.slow_days', 60),
    slowProgress: getNum('risk.slow_progress', 70),
    staleDays: getNum('risk.stale_days', 90),
    dueDay: getNum('period.due_day', 10),
  };
}

export async function updateSettings(
  body: SettingsDto,
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<SettingsDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền cập nhật cấu hình');
  }

  if (
    typeof body.slowDays !== 'number' ||
    !Number.isInteger(body.slowDays) ||
    body.slowDays < 1 ||
    body.slowDays > 365
  ) {
    throw new AppError('VALIDATION', 'slowDays phải là số nguyên từ 1 đến 365');
  }

  if (
    typeof body.slowProgress !== 'number' ||
    !Number.isInteger(body.slowProgress) ||
    body.slowProgress < 0 ||
    body.slowProgress > 100
  ) {
    throw new AppError('VALIDATION', 'slowProgress phải là số nguyên từ 0 đến 100');
  }

  if (
    typeof body.staleDays !== 'number' ||
    !Number.isInteger(body.staleDays) ||
    body.staleDays < 1 ||
    body.staleDays > 365
  ) {
    throw new AppError('VALIDATION', 'staleDays phải là số nguyên từ 1 đến 365');
  }

  if (
    typeof body.dueDay !== 'number' ||
    !Number.isInteger(body.dueDay) ||
    body.dueDay < 1 ||
    body.dueDay > 28
  ) {
    throw new AppError('VALIDATION', 'dueDay phải là số nguyên từ 1 đến 28');
  }

  const before = await getSettings(db);
  const after: SettingsDto = {
    slowDays: body.slowDays,
    slowProgress: body.slowProgress,
    staleDays: body.staleDays,
    dueDay: body.dueDay,
  };

  return await withAudit(
    actor,
    {
      action: 'update_settings',
      entity: 'app_setting',
    },
    async (tx) => {
      const entries = [
        { key: 'risk.slow_days', value: body.slowDays },
        { key: 'risk.slow_progress', value: body.slowProgress },
        { key: 'risk.stale_days', value: body.staleDays },
        { key: 'period.due_day', value: body.dueDay },
      ];

      for (const entry of entries) {
        await tx
          .insert(appSetting)
          .values(entry)
          .onConflictDoUpdate({
            target: appSetting.key,
            set: { value: entry.value },
          });
      }

      return {
        entityId: 'settings',
        before,
        after,
        result: after,
      };
    },
    db
  );
}
