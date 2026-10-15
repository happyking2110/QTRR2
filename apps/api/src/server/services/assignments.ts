import { eq, and, sql, inArray, isNull, desc, asc } from 'drizzle-orm';
import { defaultDb, type DbType } from '../db/client';
import {
  cycle,
  riskProfile,
  control,
  indicator,
  actionPlan,
  actionTask,
  unit,
  unitAssignment,
} from '../db/schema';
import { AppError } from '../errors';
import { writeAuditLog } from './audit';
import type { Actor } from '../types';
import { resolveActiveCycle } from './cycles';

export interface UnitSummaryDto {
  code: string;
  name: string;
  kind: 'department' | 'center' | 'group';
}

export interface AssignmentControlDto {
  code: string;
  description: string;
  ownerText: string;
  units: UnitSummaryDto[];
}

export interface AssignmentIndicatorDto {
  code: string;
  kind: 'kri' | 'kci';
  name: string;
  ownerUnit: UnitSummaryDto | null;
}

export interface AssignmentTaskDto {
  id: string;
  actionCode: string;
  name: string;
  responsibilityText: string;
  unit: UnitSummaryDto | null;
}

export interface AssignmentsDto {
  riskCode: string;
  controls: AssignmentControlDto[];
  indicators: AssignmentIndicatorDto[];
  tasks: AssignmentTaskDto[];
}

export interface ServiceMeta {
  actor?: Actor | null;
  ip?: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Lấy danh sách kiểm soát, chỉ số và đầu việc của hồ sơ kèm đơn vị đã gán.
 */
export async function listAssignments(
  riskCode: string,
  cycleYear?: number,
  db: DbType = defaultDb
): Promise<AssignmentsDto> {
  const c = await resolveActiveCycle(cycleYear, db);

  const [profile] = await db
    .select()
    .from(riskProfile)
    .where(
      and(
        eq(riskProfile.cycleId, c.id),
        sql`lower(${riskProfile.riskCode}) = ${riskCode.toLowerCase()}`,
        isNull(riskProfile.deletedAt)
      )
    )
    .limit(1);

  if (!profile) {
    throw new AppError('NOT_FOUND', `Không tìm thấy hồ sơ rủi ro ${riskCode}`);
  }

  // 1. Kiểm soát
  const controls = await db
    .select({
      id: control.id,
      code: control.code,
      description: control.description,
      ownerText: control.ownerText,
    })
    .from(control)
    .where(and(eq(control.profileId, profile.id), isNull(control.deletedAt)))
    .orderBy(asc(control.code));

  const controlIds = controls.map((k) => k.id);
  const controlUnitsMap = new Map<string, UnitSummaryDto[]>();

  if (controlIds.length > 0) {
    const assignments = await db
      .select({
        controlId: unitAssignment.targetId,
        unitCode: unit.code,
        unitName: unit.name,
        unitKind: unit.kind,
      })
      .from(unitAssignment)
      .innerJoin(unit, eq(unitAssignment.unitId, unit.id))
      .where(
        and(
          eq(unitAssignment.targetType, 'control'),
          inArray(unitAssignment.targetId, controlIds)
        )
      )
      .orderBy(asc(unit.code));

    for (const a of assignments) {
      const list = controlUnitsMap.get(a.controlId) ?? [];
      list.push({ code: a.unitCode, name: a.unitName, kind: a.unitKind });
      controlUnitsMap.set(a.controlId, list);
    }
  }

  const controlDtos: AssignmentControlDto[] = controls.map((k) => ({
    code: k.code,
    description: k.description,
    ownerText: k.ownerText ?? '',
    units: controlUnitsMap.get(k.id) ?? [],
  }));

  // 2. Chỉ số KRI/KCI
  const indicators = await db
    .select({
      id: indicator.id,
      code: indicator.code,
      kind: indicator.kind,
      name: indicator.name,
      unitCode: unit.code,
      unitName: unit.name,
      unitKind: unit.kind,
    })
    .from(indicator)
    .leftJoin(unit, eq(indicator.ownerUnitId, unit.id))
    .where(and(eq(indicator.profileId, profile.id), isNull(indicator.deletedAt)))
    .orderBy(asc(indicator.code));

  const indicatorDtos: AssignmentIndicatorDto[] = indicators.map((i) => ({
    code: i.code,
    kind: i.kind as 'kri' | 'kci',
    name: i.name,
    ownerUnit: i.unitCode
      ? { code: i.unitCode, name: i.unitName!, kind: i.unitKind! }
      : null,
  }));

  // 3. Đầu việc
  const tasks = await db
    .select({
      id: actionTask.id,
      name: actionTask.name,
      actionCode: actionPlan.code,
      responsibilityText: actionPlan.responsibilityText,
      unitCode: unit.code,
      unitName: unit.name,
      unitKind: unit.kind,
    })
    .from(actionTask)
    .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
    .leftJoin(unit, eq(actionTask.unitId, unit.id))
    .where(
      and(
        eq(actionPlan.profileId, profile.id),
        isNull(actionPlan.deletedAt),
        isNull(actionTask.deletedAt)
      )
    )
    .orderBy(asc(actionPlan.code), asc(actionTask.name));

  const taskDtos: AssignmentTaskDto[] = tasks.map((t) => ({
    id: t.id,
    actionCode: t.actionCode,
    name: t.name,
    responsibilityText: t.responsibilityText ?? '',
    unit: t.unitCode
      ? { code: t.unitCode, name: t.unitName!, kind: t.unitKind! }
      : null,
  }));

  return {
    riskCode: profile.riskCode,
    controls: controlDtos,
    indicators: indicatorDtos,
    tasks: taskDtos,
  };
}

/**
 * Gán đơn vị cho kiểm soát, thay toàn bộ danh sách.
 */
export async function assignControlUnits(
  riskCode: string,
  controlCode: string,
  unitCodes: string[],
  meta: ServiceMeta,
  cycleYear?: number,
  db: DbType = defaultDb
): Promise<UnitSummaryDto[]> {
  const c = await resolveActiveCycle(cycleYear, db);

  if (c.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ, không thể chỉnh sửa');
  }

  const [profile] = await db
    .select({ id: riskProfile.id })
    .from(riskProfile)
    .where(
      and(
        eq(riskProfile.cycleId, c.id),
        sql`lower(${riskProfile.riskCode}) = ${riskCode.toLowerCase()}`,
        isNull(riskProfile.deletedAt)
      )
    )
    .limit(1);

  if (!profile) {
    throw new AppError('NOT_FOUND', `Không tìm thấy hồ sơ rủi ro ${riskCode}`);
  }

  const [ctrl] = await db
    .select({ id: control.id, code: control.code })
    .from(control)
    .where(
      and(
        eq(control.profileId, profile.id),
        sql`lower(${control.code}) = ${controlCode.toLowerCase()}`,
        isNull(control.deletedAt)
      )
    )
    .limit(1);

  if (!ctrl) {
    throw new AppError('NOT_FOUND', `Không tìm thấy kiểm soát ${controlCode}`);
  }

  const normalizedCodes = [...new Set(unitCodes.map((cd) => cd.trim().toUpperCase()))];
  const unitsInDb =
    normalizedCodes.length > 0
      ? await db
          .select({ id: unit.id, code: unit.code, name: unit.name, kind: unit.kind })
          .from(unit)
          .where(inArray(unit.code, normalizedCodes))
      : [];

  const foundCodeMap = new Map(unitsInDb.map((u) => [u.code, u]));
  for (const requestedCode of normalizedCodes) {
    if (!foundCodeMap.has(requestedCode)) {
      throw new AppError('VALIDATION', `Đơn vị không tồn tại: ${requestedCode}`, {
        fieldErrors: { unitCodes: `Đơn vị không tồn tại: ${requestedCode}` },
      });
    }
  }

  // Lấy danh sách cũ
  const existingAssignments = await db
    .select({ unitCode: unit.code })
    .from(unitAssignment)
    .innerJoin(unit, eq(unitAssignment.unitId, unit.id))
    .where(
      and(
        eq(unitAssignment.targetType, 'control'),
        eq(unitAssignment.targetId, ctrl.id)
      )
    );
  const oldCodes = existingAssignments.map((a) => a.unitCode).sort();

  await db.transaction(async (tx) => {
    // Xóa các gán cũ
    await tx
      .delete(unitAssignment)
      .where(
        and(
          eq(unitAssignment.targetType, 'control'),
          eq(unitAssignment.targetId, ctrl.id)
        )
      );

    // Chèn mới
    for (const code of normalizedCodes) {
      const u = foundCodeMap.get(code)!;
      await tx.insert(unitAssignment).values({
        targetType: 'control',
        targetId: ctrl.id,
        unitId: u.id,
      });
    }

    // Ghi audit log
    await writeAuditLog(
      {
        action: 'assign_control_units',
        entity: 'control',
        entityId: ctrl.code,
        userId: meta.actor?.userId ?? null,
        ip: meta.ip,
        before: { unitCodes: oldCodes },
        after: { unitCodes: normalizedCodes },
      },
      tx as unknown as DbType
    );
  });

  return normalizedCodes.map((code) => {
    const u = foundCodeMap.get(code)!;
    return { code: u.code, name: u.name, kind: u.kind };
  });
}

/**
 * Gán đơn vị phụ trách chỉ số KRI/KCI.
 */
export async function setIndicatorOwner(
  riskCode: string,
  indicatorCode: string,
  unitCode: string | null,
  meta: ServiceMeta,
  cycleYear?: number,
  db: DbType = defaultDb
): Promise<{ ownerUnit: UnitSummaryDto | null }> {
  const c = await resolveActiveCycle(cycleYear, db);

  if (c.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ, không thể chỉnh sửa');
  }

  const [profile] = await db
    .select({ id: riskProfile.id })
    .from(riskProfile)
    .where(
      and(
        eq(riskProfile.cycleId, c.id),
        sql`lower(${riskProfile.riskCode}) = ${riskCode.toLowerCase()}`,
        isNull(riskProfile.deletedAt)
      )
    )
    .limit(1);

  if (!profile) {
    throw new AppError('NOT_FOUND', `Không tìm thấy hồ sơ rủi ro ${riskCode}`);
  }

  const [ind] = await db
    .select({ id: indicator.id, code: indicator.code, ownerUnitId: indicator.ownerUnitId })
    .from(indicator)
    .where(
      and(
        eq(indicator.profileId, profile.id),
        sql`lower(${indicator.code}) = ${indicatorCode.toLowerCase()}`,
        isNull(indicator.deletedAt)
      )
    )
    .limit(1);

  if (!ind) {
    throw new AppError('NOT_FOUND', `Không tìm thấy chỉ số ${indicatorCode}`);
  }

  let targetUnit: typeof unit.$inferSelect | null = null;
  if (unitCode) {
    const normalizedCode = unitCode.trim().toUpperCase();
    const [u] = await db
      .select()
      .from(unit)
      .where(eq(unit.code, normalizedCode))
      .limit(1);

    if (!u) {
      throw new AppError('VALIDATION', `Đơn vị ${unitCode} không tồn tại`, {
        fieldErrors: { unitCode: `Đơn vị ${unitCode} không tồn tại` },
      });
    }
    targetUnit = u;
  }

  // Lấy mã đơn vị cũ
  let oldUnitCode: string | null = null;
  if (ind.ownerUnitId) {
    const [oldU] = await db
      .select({ code: unit.code })
      .from(unit)
      .where(eq(unit.id, ind.ownerUnitId))
      .limit(1);
    oldUnitCode = oldU?.code ?? null;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(indicator)
      .set({ ownerUnitId: targetUnit ? targetUnit.id : null })
      .where(eq(indicator.id, ind.id));

    await writeAuditLog(
      {
        action: 'set_indicator_owner',
        entity: 'indicator',
        entityId: ind.code,
        userId: meta.actor?.userId ?? null,
        ip: meta.ip,
        before: { unitCode: oldUnitCode },
        after: { unitCode: targetUnit ? targetUnit.code : null },
      },
      tx as unknown as DbType
    );
  });

  return {
    ownerUnit: targetUnit
      ? { code: targetUnit.code, name: targetUnit.name, kind: targetUnit.kind }
      : null,
  };
}

/**
 * Gán đơn vị cho đầu việc.
 */
export async function setTaskUnit(
  taskId: string,
  unitCode: string | null,
  meta: ServiceMeta,
  db: DbType = defaultDb
): Promise<{ unit: UnitSummaryDto | null }> {
  if (!UUID_REGEX.test(taskId)) {
    throw new AppError('VALIDATION', 'Mã đầu việc không đúng định dạng UUID', {
      fieldErrors: { id: 'Mã đầu việc không đúng định dạng UUID' },
    });
  }

  const [taskRecord] = await db
    .select({
      id: actionTask.id,
      unitId: actionTask.unitId,
      cycleStatus: cycle.status,
    })
    .from(actionTask)
    .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
    .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
    .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
    .where(and(eq(actionTask.id, taskId), isNull(actionTask.deletedAt)))
    .limit(1);

  if (!taskRecord) {
    throw new AppError('NOT_FOUND', `Không tìm thấy đầu việc ${taskId}`);
  }

  if (taskRecord.cycleStatus === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ, không thể chỉnh sửa');
  }

  let targetUnit: typeof unit.$inferSelect | null = null;
  if (unitCode) {
    const normalizedCode = unitCode.trim().toUpperCase();
    const [u] = await db
      .select()
      .from(unit)
      .where(eq(unit.code, normalizedCode))
      .limit(1);

    if (!u) {
      throw new AppError('VALIDATION', `Đơn vị ${unitCode} không tồn tại`, {
        fieldErrors: { unitCode: `Đơn vị ${unitCode} không tồn tại` },
      });
    }
    targetUnit = u;
  }

  let oldUnitCode: string | null = null;
  if (taskRecord.unitId) {
    const [oldU] = await db
      .select({ code: unit.code })
      .from(unit)
      .where(eq(unit.id, taskRecord.unitId))
      .limit(1);
    oldUnitCode = oldU?.code ?? null;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(actionTask)
      .set({ unitId: targetUnit ? targetUnit.id : null })
      .where(eq(actionTask.id, taskId));

    await writeAuditLog(
      {
        action: 'set_task_unit',
        entity: 'action_task',
        entityId: taskId,
        userId: meta.actor?.userId ?? null,
        ip: meta.ip,
        before: { unitCode: oldUnitCode },
        after: { unitCode: targetUnit ? targetUnit.code : null },
      },
      tx as unknown as DbType
    );
  });

  return {
    unit: targetUnit
      ? { code: targetUnit.code, name: targetUnit.name, kind: targetUnit.kind }
      : null,
  };
}
