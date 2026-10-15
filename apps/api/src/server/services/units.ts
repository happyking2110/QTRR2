import { eq } from 'drizzle-orm';
import { defaultDb, type DbType } from '../db/client';
import { unit } from '../db/schema';
import { AppError } from '../errors';
import { writeAuditLog } from './audit';
import type { Actor } from '../types';

export interface UnitDto {
  code: string;
  name: string;
  kind: 'department' | 'center' | 'group';
}

export interface UpsertUnitPayload {
  name: string;
  kind: 'department' | 'center' | 'group';
}

export interface ServiceMeta {
  actor?: Actor | null;
  ip?: string;
}

export const INITIAL_UNITS: readonly UnitDto[] = [
  { code: 'BAN3', name: 'Ban 3', kind: 'department' },
  { code: 'BAN4', name: 'Ban 4', kind: 'department' },
  { code: 'TT1', name: 'TT1', kind: 'center' },
  { code: 'TT2', name: 'TT2', kind: 'center' },
  { code: 'TT3', name: 'TT3', kind: 'center' },
  { code: 'TT4', name: 'TT4', kind: 'center' },
  { code: 'MBF_TINH_TP', name: 'MBF Tỉnh/TP', kind: 'group' },
] as const;

const UNIT_CODE_REGEX = /^[A-Z0-9_]+$/;

/**
 * Khởi tạo 7 đơn vị ban đầu theo PRD mục 4.
 * Chạy lại không nhân đôi, ghi audit_log với action 'seed_units'.
 */
export async function seedUnits(db: DbType = defaultDb): Promise<UnitDto[]> {
  const seeded: UnitDto[] = [];

  for (const u of INITIAL_UNITS) {
    await db
      .insert(unit)
      .values({
        code: u.code,
        name: u.name,
        kind: u.kind,
      })
      .onConflictDoUpdate({
        target: unit.code,
        set: {
          name: u.name,
          kind: u.kind,
        },
      });
    seeded.push(u);
  }

  await writeAuditLog(
    {
      action: 'seed_units',
      entity: 'unit',
      userId: null,
      after: {
        count: INITIAL_UNITS.length,
        codes: INITIAL_UNITS.map((u) => u.code),
      },
    },
    db
  );

  return seeded;
}

/**
 * Tạo mới hoặc cập nhật đơn vị qua PUT /api/units/{code}.
 */
export async function upsertUnit(
  code: string,
  payload: UpsertUnitPayload,
  meta: ServiceMeta,
  db: DbType = defaultDb
): Promise<UnitDto> {
  const normalizedCode = code.trim().toUpperCase();
  if (!UNIT_CODE_REGEX.test(normalizedCode)) {
    throw new AppError(
      'VALIDATION',
      'Mã đơn vị không đúng định dạng (chỉ gồm chữ hoa, số và dấu gạch dưới)',
      { fieldErrors: { code: 'Mã đơn vị không đúng định dạng' } }
    );
  }

  const trimmedName = payload.name.trim();
  if (!trimmedName) {
    throw new AppError('VALIDATION', 'Tên đơn vị không được để trống', {
      fieldErrors: { name: 'Tên đơn vị không được để trống' },
    });
  }

  const [existing] = await db
    .select()
    .from(unit)
    .where(eq(unit.code, normalizedCode))
    .limit(1);

  if (existing) {
    await db
      .update(unit)
      .set({
        name: trimmedName,
        kind: payload.kind,
      })
      .where(eq(unit.id, existing.id));

    await writeAuditLog(
      {
        action: 'upsert_unit',
        entity: 'unit',
        entityId: normalizedCode,
        userId: meta.actor?.userId ?? null,
        ip: meta.ip,
        before: { name: existing.name, kind: existing.kind },
        after: { name: trimmedName, kind: payload.kind },
      },
      db
    );
  } else {
    await db.insert(unit).values({
      code: normalizedCode,
      name: trimmedName,
      kind: payload.kind,
    });

    await writeAuditLog(
      {
        action: 'upsert_unit',
        entity: 'unit',
        entityId: normalizedCode,
        userId: meta.actor?.userId ?? null,
        ip: meta.ip,
        before: null,
        after: { name: trimmedName, kind: payload.kind },
      },
      db
    );
  }

  return {
    code: normalizedCode,
    name: trimmedName,
    kind: payload.kind,
  };
}
