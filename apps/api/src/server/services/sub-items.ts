import { db as defaultDb } from '../db/client';
import {
  riskProfile,
  cause,
  impact,
  control,
  controlCause,
  actionPlan,
  actionControl,
  actionTask,
  actionUpdate,
  indicator,
  indicatorReading,
} from '../db/schema';
import { withAudit } from './audit';
import { eq, and, isNull, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { AppError } from '../errors';
import type { Actor } from '../types';
import { levelScore } from '../../lib/domain/scales';
import { normalizeCode } from '../../lib/domain/codes';
import { parseDue } from '../../lib/domain/due-date';
import { parseThresholdSet, inferIndicatorUnit, inferDirection } from '../../lib/domain/thresholds';
import { resolveActiveCycle } from './cycles';
import {
  getProfileDetail,
  type CauseDto,
  type ImpactDto,
  type ControlDto,
  type ActionPlanDto,
  type IndicatorDto,
} from './queries';

export type DbType = PostgresJsDatabase<typeof schema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getActiveProfile(
  riskCode: string,
  cycleParam?: number,
  db: DbType = defaultDb
) {
  const cycleRow = await resolveActiveCycle(cycleParam, db);
  if (cycleRow.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể sửa đổi');
  }

  const normalizedRiskCode = normalizeCode(riskCode);
  const [profile] = await db
    .select()
    .from(riskProfile)
    .where(
      and(
        eq(riskProfile.cycleId, cycleRow.id),
        eq(riskProfile.riskCode, normalizedRiskCode),
        isNull(riskProfile.deletedAt)
      )
    );

  if (!profile) {
    throw new AppError('NOT_FOUND', `Không tìm thấy hồ sơ rủi ro ${riskCode}`);
  }

  return { cycleRow, profile, normalizedRiskCode };
}

function checkActorPermission(actor?: Actor | null) {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }
  if (actor.role !== 'admin' && actor.role !== 'ban4') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên hoặc Ban 4 mới có quyền thực hiện thao tác này');
  }
}

function checkAdminOnly(actor?: Actor | null) {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }
  if (actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền thực hiện thao tác này');
  }
}

// ---------------------------------------------------------------------------
// 1. CAUSES (Nguyên nhân)
// ---------------------------------------------------------------------------
export async function createCause(
  riskCode: string,
  body: { code: string; group: string; description: string },
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<CauseDto> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);

  const normalizedCode = normalizeCode(body.code);
  const prefixExpected = `${normalizedRiskCode}.NN`;
  if (!normalizedCode.startsWith(prefixExpected)) {
    throw new AppError('VALIDATION', `Mã nguyên nhân phải bắt đầu bằng "${prefixExpected}"`, {
      fieldErrors: { code: `Mã phải bắt đầu bằng "${prefixExpected}"` },
    });
  }

  // Check trùng mã trong chu kỳ
  const [existing] = await db
    .select({ id: cause.id })
    .from(cause)
    .innerJoin(riskProfile, eq(cause.profileId, riskProfile.id))
    .where(and(eq(riskProfile.cycleId, cycleRow.id), eq(cause.code, normalizedCode)));

  if (existing) {
    throw new AppError('CONFLICT', `Mã nguyên nhân ${normalizedCode} đã tồn tại trong chu kỳ`);
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'create_item',
      entity: 'cause',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      const [inserted] = await tx
        .insert(cause)
        .values({
          profileId: profile.id,
          code: normalizedCode,
          causeGroup: body.group.trim(),
          description: body.description.trim(),
          manuallyEditedAt: now,
        })
        .returning();

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.causes.find((c) => c.code === normalizedCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy nguyên nhân vừa tạo`);
      }

      return {
        entityId: inserted.id,
        after: { code: normalizedCode, group: body.group.trim() },
        result: resItem,
      };
    },
    db
  );
}

export async function updateCause(
  riskCode: string,
  itemCode: string,
  body: { group: string; description: string },
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<CauseDto> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedCode = normalizeCode(itemCode);

  const [existing] = await db
    .select()
    .from(cause)
    .where(and(eq(cause.profileId, profile.id), eq(cause.code, normalizedCode), isNull(cause.deletedAt)));

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy nguyên nhân ${itemCode}`);
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'update_item',
      entity: 'cause',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx
        .update(cause)
        .set({
          causeGroup: body.group.trim(),
          description: body.description.trim(),
          manuallyEditedAt: now,
        })
        .where(eq(cause.id, existing.id));

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.causes.find((c) => c.code === normalizedCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy nguyên nhân sau khi cập nhật`);
      }

      return {
        entityId: existing.id,
        before: { group: existing.causeGroup, description: existing.description },
        after: { group: body.group.trim(), description: body.description.trim() },
        result: resItem,
      };
    },
    db
  );
}

export async function deleteCause(
  riskCode: string,
  itemCode: string,
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<void> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedCode = normalizeCode(itemCode);

  const [existing] = await db
    .select()
    .from(cause)
    .where(and(eq(cause.profileId, profile.id), eq(cause.code, normalizedCode), isNull(cause.deletedAt)));

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy nguyên nhân ${itemCode}`);
  }

  // Kiểm tra còn liên kết kiểm soát (chưa xóa mềm)
  const linkedControls = await db
    .select({ code: control.code })
    .from(controlCause)
    .innerJoin(control, eq(controlCause.controlId, control.id))
    .where(and(eq(controlCause.causeId, existing.id), isNull(control.deletedAt)));

  if (linkedControls.length > 0) {
    throw new AppError('REFERENCED', 'Nguyên nhân đang được liên kết với biện pháp kiểm soát, không thể xóa', {
      details: linkedControls.map((c) => ({ kind: 'control', code: c.code })),
    });
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'delete_item',
      entity: 'cause',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx.update(cause).set({ deletedAt: now }).where(eq(cause.id, existing.id));
      return {
        entityId: existing.id,
        before: { code: existing.code },
        result: undefined,
      };
    },
    db
  );
}

// ---------------------------------------------------------------------------
// 2. IMPACTS (Ảnh hưởng)
// ---------------------------------------------------------------------------
export async function createImpact(
  riskCode: string,
  body: { code: string; group: string; description: string; level: string },
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ImpactDto> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);

  const normalizedCode = normalizeCode(body.code);
  const prefixExpected = `${normalizedRiskCode}.AH`;
  if (!normalizedCode.startsWith(prefixExpected)) {
    throw new AppError('VALIDATION', `Mã ảnh hưởng phải bắt đầu bằng "${prefixExpected}"`, {
      fieldErrors: { code: `Mã phải bắt đầu bằng "${prefixExpected}"` },
    });
  }

  try {
    levelScore('impact', body.level);
  } catch {
    throw new AppError('VALIDATION', `Nhãn mức ảnh hưởng "${body.level}" không thuộc thang đo`, {
      fieldErrors: { level: 'Nhãn không thuộc thang đo' },
    });
  }

  const [existing] = await db
    .select({ id: impact.id })
    .from(impact)
    .innerJoin(riskProfile, eq(impact.profileId, riskProfile.id))
    .where(and(eq(riskProfile.cycleId, cycleRow.id), eq(impact.code, normalizedCode)));

  if (existing) {
    throw new AppError('CONFLICT', `Mã ảnh hưởng ${normalizedCode} đã tồn tại trong chu kỳ`);
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'create_item',
      entity: 'impact',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      const [inserted] = await tx
        .insert(impact)
        .values({
          profileId: profile.id,
          code: normalizedCode,
          impactGroup: body.group.trim(),
          description: body.description.trim(),
          level: body.level.trim(),
          manuallyEditedAt: now,
        })
        .returning();

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.impacts.find((i) => i.code === normalizedCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy ảnh hưởng vừa tạo`);
      }

      return {
        entityId: inserted.id,
        after: { code: normalizedCode, group: body.group.trim(), level: body.level.trim() },
        result: resItem,
      };
    },
    db
  );
}

export async function updateImpact(
  riskCode: string,
  itemCode: string,
  body: { group: string; description: string; level: string },
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ImpactDto> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedCode = normalizeCode(itemCode);

  try {
    levelScore('impact', body.level);
  } catch {
    throw new AppError('VALIDATION', `Nhãn mức ảnh hưởng "${body.level}" không thuộc thang đo`, {
      fieldErrors: { level: 'Nhãn không thuộc thang đo' },
    });
  }

  const [existing] = await db
    .select()
    .from(impact)
    .where(and(eq(impact.profileId, profile.id), eq(impact.code, normalizedCode), isNull(impact.deletedAt)));

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy ảnh hưởng ${itemCode}`);
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'update_item',
      entity: 'impact',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx
        .update(impact)
        .set({
          impactGroup: body.group.trim(),
          description: body.description.trim(),
          level: body.level.trim(),
          manuallyEditedAt: now,
        })
        .where(eq(impact.id, existing.id));

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.impacts.find((i) => i.code === normalizedCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy ảnh hưởng sau khi cập nhật`);
      }

      return {
        entityId: existing.id,
        before: { group: existing.impactGroup, level: existing.level },
        after: { group: body.group.trim(), level: body.level.trim() },
        result: resItem,
      };
    },
    db
  );
}

export async function deleteImpact(
  riskCode: string,
  itemCode: string,
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<void> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedCode = normalizeCode(itemCode);

  const [existing] = await db
    .select()
    .from(impact)
    .where(and(eq(impact.profileId, profile.id), eq(impact.code, normalizedCode), isNull(impact.deletedAt)));

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy ảnh hưởng ${itemCode}`);
  }

  // Ảnh hưởng xóa tự do (4.12 mục 5)
  return await withAudit(
    actor ?? null,
    {
      action: 'delete_item',
      entity: 'impact',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx.update(impact).set({ deletedAt: now }).where(eq(impact.id, existing.id));
      return {
        entityId: existing.id,
        before: { code: existing.code },
        result: undefined,
      };
    },
    db
  );
}

// ---------------------------------------------------------------------------
// 3. CONTROLS (Biện pháp kiểm soát)
// ---------------------------------------------------------------------------
export async function createControl(
  riskCode: string,
  body: {
    code: string;
    description: string;
    ownerText: string;
    frequency: string;
    objective: string;
    method: string;
    designEff: string;
    operatingEff: string;
    overallEff: string;
    needsSupplement: boolean;
  },
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ControlDto> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);

  const normalizedCode = normalizeCode(body.code);
  const prefixExpected = `${normalizedRiskCode}.KS`;
  if (!normalizedCode.startsWith(prefixExpected)) {
    throw new AppError('VALIDATION', `Mã kiểm soát phải bắt đầu bằng "${prefixExpected}"`, {
      fieldErrors: { code: `Mã phải bắt đầu bằng "${prefixExpected}"` },
    });
  }

  const [existing] = await db
    .select({ id: control.id })
    .from(control)
    .innerJoin(riskProfile, eq(control.profileId, riskProfile.id))
    .where(and(eq(riskProfile.cycleId, cycleRow.id), eq(control.code, normalizedCode)));

  if (existing) {
    throw new AppError('CONFLICT', `Mã kiểm soát ${normalizedCode} đã tồn tại trong chu kỳ`);
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'create_item',
      entity: 'control',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      const [inserted] = await tx
        .insert(control)
        .values({
          profileId: profile.id,
          code: normalizedCode,
          description: body.description.trim(),
          ownerText: body.ownerText.trim(),
          frequency: body.frequency.trim(),
          objective: body.objective.trim(),
          method: body.method.trim(),
          designEff: body.designEff.trim(),
          operatingEff: body.operatingEff.trim(),
          overallEff: body.overallEff.trim(),
          needsSupplement: body.needsSupplement,
          manuallyEditedAt: now,
        })
        .returning();

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.controls.find((c) => c.code === normalizedCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy kiểm soát vừa tạo`);
      }

      return {
        entityId: inserted.id,
        after: { code: normalizedCode, description: body.description.trim() },
        result: resItem,
      };
    },
    db
  );
}

export async function updateControl(
  riskCode: string,
  itemCode: string,
  body: {
    description: string;
    ownerText: string;
    frequency: string;
    objective: string;
    method: string;
    designEff: string;
    operatingEff: string;
    overallEff: string;
    needsSupplement: boolean;
  },
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ControlDto> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedCode = normalizeCode(itemCode);

  const [existing] = await db
    .select()
    .from(control)
    .where(and(eq(control.profileId, profile.id), eq(control.code, normalizedCode), isNull(control.deletedAt)));

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy kiểm soát ${itemCode}`);
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'update_item',
      entity: 'control',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx
        .update(control)
        .set({
          description: body.description.trim(),
          ownerText: body.ownerText.trim(),
          frequency: body.frequency.trim(),
          objective: body.objective.trim(),
          method: body.method.trim(),
          designEff: body.designEff.trim(),
          operatingEff: body.operatingEff.trim(),
          overallEff: body.overallEff.trim(),
          needsSupplement: body.needsSupplement,
          manuallyEditedAt: now,
        })
        .where(eq(control.id, existing.id));

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.controls.find((c) => c.code === normalizedCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy kiểm soát sau khi cập nhật`);
      }

      return {
        entityId: existing.id,
        before: { description: existing.description, overallEff: existing.overallEff },
        after: { description: body.description.trim(), overallEff: body.overallEff.trim() },
        result: resItem,
      };
    },
    db
  );
}

export async function deleteControl(
  riskCode: string,
  itemCode: string,
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<void> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedCode = normalizeCode(itemCode);

  const [existing] = await db
    .select()
    .from(control)
    .where(and(eq(control.profileId, profile.id), eq(control.code, normalizedCode), isNull(control.deletedAt)));

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy kiểm soát ${itemCode}`);
  }

  // Ràng buộc: kiểm soát còn liên kết nguyên nhân hoặc KH (chưa xóa mềm)
  const linkedCauses = await db
    .select({ code: cause.code })
    .from(controlCause)
    .innerJoin(cause, eq(controlCause.causeId, cause.id))
    .where(and(eq(controlCause.controlId, existing.id), isNull(cause.deletedAt)));

  const linkedActions = await db
    .select({ code: actionPlan.code })
    .from(actionControl)
    .innerJoin(actionPlan, eq(actionControl.actionId, actionPlan.id))
    .where(and(eq(actionControl.controlId, existing.id), isNull(actionPlan.deletedAt)));

  if (linkedCauses.length > 0 || linkedActions.length > 0) {
    throw new AppError('REFERENCED', 'Kiểm soát đang được liên kết với nguyên nhân hoặc kế hoạch hành động, không thể xóa', {
      details: [
        ...linkedCauses.map((c) => ({ kind: 'cause', code: c.code })),
        ...linkedActions.map((a) => ({ kind: 'action', code: a.code })),
      ],
    });
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'delete_item',
      entity: 'control',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx.update(control).set({ deletedAt: now }).where(eq(control.id, existing.id));
      return {
        entityId: existing.id,
        before: { code: existing.code },
        result: undefined,
      };
    },
    db
  );
}

export async function linkControlCauses(
  riskCode: string,
  itemCode: string,
  causeCodes: string[],
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ControlDto> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedControlCode = normalizeCode(itemCode);

  const [controlRow] = await db
    .select()
    .from(control)
    .where(and(eq(control.profileId, profile.id), eq(control.code, normalizedControlCode), isNull(control.deletedAt)));

  if (!controlRow) {
    throw new AppError('NOT_FOUND', `Không tìm thấy kiểm soát ${itemCode}`);
  }

  const normalizedCauseCodes = causeCodes.map(normalizeCode);

  // Kiểm tra mọi causeCode phải thuộc cùng hồ sơ và chưa xóa
  const activeCauses = await db
    .select({ id: cause.id, code: cause.code })
    .from(cause)
    .where(and(eq(cause.profileId, profile.id), isNull(cause.deletedAt)));

  const activeCauseMap = new Map(activeCauses.map((c) => [c.code, c.id]));
  const invalidCodes: string[] = [];
  const targetCauseIds: string[] = [];

  for (const c of normalizedCauseCodes) {
    const id = activeCauseMap.get(c);
    if (!id) {
      invalidCodes.push(c);
    } else {
      targetCauseIds.push(id);
    }
  }

  if (invalidCodes.length > 0) {
    throw new AppError('VALIDATION', `Các mã nguyên nhân sau không thuộc cùng hồ sơ hoặc đã bị xóa: ${invalidCodes.join(', ')}`, {
      fieldErrors: { codes: `Mã không hợp lệ: ${invalidCodes.join(', ')}` },
    });
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'link_control_causes',
      entity: 'control',
      ip: meta?.ip,
    },
    async (tx) => {
      await tx.delete(controlCause).where(eq(controlCause.controlId, controlRow.id));
      for (const causeId of targetCauseIds) {
        await tx.insert(controlCause).values({
          controlId: controlRow.id,
          causeId,
        });
      }

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.controls.find((c) => c.code === normalizedControlCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy kiểm soát sau khi liên kết`);
      }

      return {
        entityId: controlRow.id,
        after: { causeCodes: normalizedCauseCodes },
        result: resItem,
      };
    },
    db
  );
}

// ---------------------------------------------------------------------------
// 4. ACTION PLANS (Kế hoạch hành động)
// ---------------------------------------------------------------------------
export async function createActionPlan(
  riskCode: string,
  body: {
    code: string;
    description: string;
    responsibilityText: string;
    deliverable: string;
    dueText: string;
  },
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ActionPlanDto> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);

  const normalizedCode = normalizeCode(body.code);
  const prefixExpected = `${normalizedRiskCode}.KH`;
  if (!normalizedCode.startsWith(prefixExpected)) {
    throw new AppError('VALIDATION', `Mã kế hoạch hành động phải bắt đầu bằng "${prefixExpected}"`, {
      fieldErrors: { code: `Mã phải bắt đầu bằng "${prefixExpected}"` },
    });
  }

  const [existing] = await db
    .select({ id: actionPlan.id })
    .from(actionPlan)
    .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
    .where(and(eq(riskProfile.cycleId, cycleRow.id), eq(actionPlan.code, normalizedCode)));

  if (existing) {
    throw new AppError('CONFLICT', `Mã kế hoạch hành động ${normalizedCode} đã tồn tại trong chu kỳ`);
  }

  const { dueDate } = parseDue(body.dueText);

  return await withAudit(
    actor ?? null,
    {
      action: 'create_item',
      entity: 'action_plan',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      const [inserted] = await tx
        .insert(actionPlan)
        .values({
          profileId: profile.id,
          code: normalizedCode,
          description: body.description.trim(),
          responsibilityText: body.responsibilityText.trim(),
          deliverable: body.deliverable.trim(),
          dueText: body.dueText.trim(),
          manuallyEditedAt: now,
        })
        .returning();

      // Tạo đầu việc mặc định theo 7.1 bước 3
      const sourceText = [body.responsibilityText.trim(), body.deliverable.trim(), body.dueText.trim()]
        .filter(Boolean)
        .join('\n');

      await tx.insert(actionTask).values({
        actionId: inserted.id,
        name: 'Toàn bộ kế hoạch',
        unitId: null,
        dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
        weight: 1,
        sourceText,
        sortOrder: 0,
      });

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.actions.find((a) => a.code === normalizedCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy kế hoạch hành động vừa tạo`);
      }

      return {
        entityId: inserted.id,
        after: { code: normalizedCode, dueText: body.dueText.trim() },
        result: resItem,
      };
    },
    db
  );
}

export async function updateActionPlan(
  riskCode: string,
  itemCode: string,
  body: {
    description: string;
    responsibilityText: string;
    deliverable: string;
    dueText: string;
  },
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ActionPlanDto> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedCode = normalizeCode(itemCode);

  const [existing] = await db
    .select()
    .from(actionPlan)
    .where(and(eq(actionPlan.profileId, profile.id), eq(actionPlan.code, normalizedCode), isNull(actionPlan.deletedAt)));

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy kế hoạch hành động ${itemCode}`);
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'update_item',
      entity: 'action_plan',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx
        .update(actionPlan)
        .set({
          description: body.description.trim(),
          responsibilityText: body.responsibilityText.trim(),
          deliverable: body.deliverable.trim(),
          dueText: body.dueText.trim(),
          manuallyEditedAt: now,
        })
        .where(eq(actionPlan.id, existing.id));

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.actions.find((a) => a.code === normalizedCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy kế hoạch hành động sau khi cập nhật`);
      }

      return {
        entityId: existing.id,
        before: { dueText: existing.dueText },
        after: { dueText: body.dueText.trim() },
        result: resItem,
      };
    },
    db
  );
}

export async function deleteActionPlan(
  riskCode: string,
  itemCode: string,
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<void> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedCode = normalizeCode(itemCode);

  const [existing] = await db
    .select()
    .from(actionPlan)
    .where(and(eq(actionPlan.profileId, profile.id), eq(actionPlan.code, normalizedCode), isNull(actionPlan.deletedAt)));

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy kế hoạch hành động ${itemCode}`);
  }

  // Ràng buộc: đầu việc của KH đã có bản cập nhật (mọi trạng thái)
  const updates = await db
    .select({ periodKey: actionUpdate.periodKey })
    .from(actionUpdate)
    .innerJoin(actionTask, eq(actionUpdate.taskId, actionTask.id))
    .where(eq(actionTask.actionId, existing.id));

  if (updates.length > 0) {
    throw new AppError('REFERENCED', 'Kế hoạch hành động có đầu việc đã có bản cập nhật tiến độ, không thể xóa', {
      details: updates.map((u) => ({ kind: 'task_update', periodKey: u.periodKey, code: u.periodKey })),
    });
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'delete_item',
      entity: 'action_plan',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      // Xóa mềm KH
      await tx.update(actionPlan).set({ deletedAt: now }).where(eq(actionPlan.id, existing.id));
      // Xóa mềm các đầu việc của KH
      await tx.update(actionTask).set({ deletedAt: now }).where(and(eq(actionTask.actionId, existing.id), isNull(actionTask.deletedAt)));
      // Gỡ liên kết action_control
      await tx.delete(actionControl).where(eq(actionControl.actionId, existing.id));

      return {
        entityId: existing.id,
        before: { code: existing.code },
        result: undefined,
      };
    },
    db
  );
}

export async function linkActionControls(
  riskCode: string,
  itemCode: string,
  controlCodes: string[],
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ActionPlanDto> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedActionCode = normalizeCode(itemCode);

  const [actionRow] = await db
    .select()
    .from(actionPlan)
    .where(and(eq(actionPlan.profileId, profile.id), eq(actionPlan.code, normalizedActionCode), isNull(actionPlan.deletedAt)));

  if (!actionRow) {
    throw new AppError('NOT_FOUND', `Không tìm thấy kế hoạch hành động ${itemCode}`);
  }

  const normalizedControlCodes = controlCodes.map(normalizeCode);

  // Kiểm tra mọi controlCode phải thuộc cùng hồ sơ và chưa xóa
  const activeControls = await db
    .select({ id: control.id, code: control.code })
    .from(control)
    .where(and(eq(control.profileId, profile.id), isNull(control.deletedAt)));

  const activeControlMap = new Map(activeControls.map((c) => [c.code, c.id]));
  const invalidCodes: string[] = [];
  const targetControlIds: string[] = [];

  for (const c of normalizedControlCodes) {
    const id = activeControlMap.get(c);
    if (!id) {
      invalidCodes.push(c);
    } else {
      targetControlIds.push(id);
    }
  }

  if (invalidCodes.length > 0) {
    throw new AppError('VALIDATION', `Các mã kiểm soát sau không thuộc cùng hồ sơ hoặc đã bị xóa: ${invalidCodes.join(', ')}`, {
      fieldErrors: { codes: `Mã không hợp lệ: ${invalidCodes.join(', ')}` },
    });
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'link_action_controls',
      entity: 'action_plan',
      ip: meta?.ip,
    },
    async (tx) => {
      await tx.delete(actionControl).where(eq(actionControl.actionId, actionRow.id));
      for (const controlId of targetControlIds) {
        await tx.insert(actionControl).values({
          actionId: actionRow.id,
          controlId,
        });
      }

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.actions.find((a) => a.code === normalizedActionCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy kế hoạch hành động sau khi liên kết`);
      }

      return {
        entityId: actionRow.id,
        after: { controlCodes: normalizedControlCodes },
        result: resItem,
      };
    },
    db
  );
}

// ---------------------------------------------------------------------------
// 5. INDICATORS (Chỉ số KRI / KCI)
// ---------------------------------------------------------------------------
function resolvePeriodKind(frequency: string): 'month' | 'quarter' | 'event' {
  const f = frequency.trim();
  if (f === 'Tháng') return 'month';
  if (f === 'Quý' || f === 'Hàng quý') return 'quarter';
  if (f === 'Theo đợt diễn tập') return 'event';
  throw new AppError('VALIDATION', `Tần suất "${frequency}" không hợp lệ`, {
    fieldErrors: { frequency: 'Tần suất không nằm trong danh sách cho phép' },
  });
}

export async function createIndicator(
  riskCode: string,
  body: {
    code: string;
    name: string;
    formula: string;
    frequency: 'Tháng' | 'Quý' | 'Hàng quý' | 'Theo đợt diễn tập';
    thresholds: { green: string; yellow: string; red: string };
    note?: string | null;
  },
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<IndicatorDto> {
  checkAdminOnly(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);

  const normalizedCode = normalizeCode(body.code);
  const isKri = normalizedCode.startsWith(`${normalizedRiskCode}.KRI`);
  const isKci = normalizedCode.startsWith(`${normalizedRiskCode}.KCI`);

  if (!isKri && !isKci) {
    throw new AppError('VALIDATION', `Mã chỉ số phải bắt đầu bằng "${normalizedRiskCode}.KRI" hoặc "${normalizedRiskCode}.KCI"`, {
      fieldErrors: { code: `Mã phải bắt đầu bằng "${normalizedRiskCode}.KRI" hoặc "${normalizedRiskCode}.KCI"` },
    });
  }

  const kind: 'kri' | 'kci' = isKri ? 'kri' : 'kci';
  const periodKind = resolvePeriodKind(body.frequency);

  const [existing] = await db
    .select({ id: indicator.id })
    .from(indicator)
    .innerJoin(riskProfile, eq(indicator.profileId, riskProfile.id))
    .where(and(eq(riskProfile.cycleId, cycleRow.id), eq(indicator.code, normalizedCode)));

  if (existing) {
    throw new AppError('CONFLICT', `Mã chỉ số ${normalizedCode} đã tồn tại trong chu kỳ`);
  }

  // Parse thresholds
  const thresholdSet = parseThresholdSet([body.thresholds.green, body.thresholds.yellow, body.thresholds.red]);
  const zoneRules = thresholdSet.mode === 'auto' ? thresholdSet.rules : null;

  return await withAudit(
    actor ?? null,
    {
      action: 'create_item',
      entity: 'indicator',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      const { unitKind, unitLabel } = inferIndicatorUnit([
        body.thresholds.green,
        body.thresholds.yellow,
        body.thresholds.red,
      ]);
      const direction = inferDirection(body.thresholds.green);

      const [inserted] = await tx
        .insert(indicator)
        .values({
          profileId: profile.id,
          code: normalizedCode,
          kind,
          name: body.name.trim(),
          formula: body.formula.trim(),
          frequency: body.frequency.trim(),
          periodKind,
          thresholdLowText: body.thresholds.green.trim(),
          thresholdMidText: body.thresholds.yellow.trim(),
          thresholdHighText: body.thresholds.red.trim(),
          zoneRules,
          note: body.note?.trim() ?? null,
          unitKind,
          unitLabel,
          direction,
          yellowAt: null,
          redAt: null,
          targetValue: null,
          manuallyEditedAt: now,
        })
        .returning();

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.indicators.find((ind) => ind.code === normalizedCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy chỉ số vừa tạo`);
      }

      return {
        entityId: inserted.id,
        after: { code: normalizedCode, frequency: body.frequency },
        result: resItem,
      };
    },
    db
  );
}

export async function updateIndicator(
  riskCode: string,
  itemCode: string,
  body: {
    name: string;
    formula: string;
    frequency: 'Tháng' | 'Quý' | 'Hàng quý' | 'Theo đợt diễn tập';
    thresholds: { green: string; yellow: string; red: string };
    note?: string | null;
  },
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<IndicatorDto> {
  checkAdminOnly(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedCode = normalizeCode(itemCode);

  const [existing] = await db
    .select()
    .from(indicator)
    .where(and(eq(indicator.profileId, profile.id), eq(indicator.code, normalizedCode), isNull(indicator.deletedAt)));

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy chỉ số ${itemCode}`);
  }

  const newPeriodKind = resolvePeriodKind(body.frequency);

  // Nếu đổi tần suất làm đổi loại kỳ và đã có bản nộp -> 409 INVALID_STATE (4.12 mục 6)
  if (newPeriodKind !== existing.periodKind) {
    const [readingCheck] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(indicatorReading)
      .where(eq(indicatorReading.indicatorId, existing.id));

    if ((readingCheck?.count ?? 0) > 0) {
      throw new AppError(
        'INVALID_STATE',
        'Không thể thay đổi tần suất làm đổi loại kỳ khi chỉ số đã có bản nộp số liệu'
      );
    }
  }

  const thresholdSet = parseThresholdSet([body.thresholds.green, body.thresholds.yellow, body.thresholds.red]);
  const zoneRules = thresholdSet.mode === 'auto' ? thresholdSet.rules : null;

  return await withAudit(
    actor ?? null,
    {
      action: 'update_item',
      entity: 'indicator',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      const { unitKind, unitLabel } = inferIndicatorUnit([
        body.thresholds.green,
        body.thresholds.yellow,
        body.thresholds.red,
      ]);
      const direction = inferDirection(body.thresholds.green);

      await tx
        .update(indicator)
        .set({
          name: body.name.trim(),
          formula: body.formula.trim(),
          frequency: body.frequency.trim(),
          periodKind: newPeriodKind,
          thresholdLowText: body.thresholds.green.trim(),
          thresholdMidText: body.thresholds.yellow.trim(),
          thresholdHighText: body.thresholds.red.trim(),
          zoneRules,
          note: body.note?.trim() ?? null,
          unitKind: existing.yellowAt !== null ? existing.unitKind : unitKind,
          unitLabel: existing.yellowAt !== null ? existing.unitLabel : unitLabel,
          direction: existing.direction !== null ? existing.direction : direction,
          manuallyEditedAt: now,
        })
        .where(eq(indicator.id, existing.id));

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.indicators.find((ind) => ind.code === normalizedCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', `Không tìm thấy chỉ số sau khi cập nhật`);
      }

      return {
        entityId: existing.id,
        before: { frequency: existing.frequency, thresholds: [existing.thresholdLowText, existing.thresholdMidText, existing.thresholdHighText] },
        after: { frequency: body.frequency, thresholds: [body.thresholds.green, body.thresholds.yellow, body.thresholds.red] },
        result: resItem,
      };
    },
    db
  );
}

export async function deleteIndicator(
  riskCode: string,
  itemCode: string,
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<void> {
  checkActorPermission(actor);
  const { cycleRow, profile, normalizedRiskCode } = await getActiveProfile(riskCode, cycleParam, db);
  const normalizedCode = normalizeCode(itemCode);

  const [existing] = await db
    .select()
    .from(indicator)
    .where(and(eq(indicator.profileId, profile.id), eq(indicator.code, normalizedCode), isNull(indicator.deletedAt)));

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy chỉ số ${itemCode}`);
  }

  // Ràng buộc: chỉ số đã có bản nộp (mọi trạng thái) (4.12 mục 5)
  const readings = await db
    .select({ periodKey: indicatorReading.periodKey })
    .from(indicatorReading)
    .where(eq(indicatorReading.indicatorId, existing.id));

  if (readings.length > 0) {
    throw new AppError('REFERENCED', 'Chỉ số đã có bản nộp số liệu, không thể xóa', {
      details: readings.map((r) => ({ kind: 'reading', periodKey: r.periodKey, code: r.periodKey })),
    });
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'delete_item',
      entity: 'indicator',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx.update(indicator).set({ deletedAt: now }).where(eq(indicator.id, existing.id));
      return {
        entityId: existing.id,
        before: { code: existing.code },
        result: undefined,
      };
    },
    db
  );
}

export interface SetIndicatorTargetsPayload {
  unitKind: 'percent' | 'count';
  unitLabel: string;
  direction: 'higher_is_worse' | 'lower_is_worse' | null;
  yellowAt: number | null;
  redAt: number | null;
  targetValue: number | null;
}

export async function setIndicatorTargets(
  riskCode: string,
  indicatorCode: string,
  body: SetIndicatorTargetsPayload,
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<IndicatorDto> {
  checkAdminOnly(actor);
  const { profile, cycleRow } = await getActiveProfile(riskCode, cycleParam, db);
  if (cycleRow.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể chỉnh sửa mục tiêu');
  }

  const normalizedRiskCode = profile.riskCode;
  const normalizedCode = normalizeCode(indicatorCode);

  return await withAudit(
    actor ?? null,
    {
      action: 'set_indicator_targets',
      entity: 'indicator',
      ip: meta?.ip,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(indicator)
        .where(
          and(
            eq(indicator.profileId, profile.id),
            eq(indicator.code, normalizedCode),
            isNull(indicator.deletedAt)
          )
        )
        .for('update');

      if (!existing) {
        throw new AppError('NOT_FOUND', `Không tìm thấy chỉ số ${indicatorCode}`);
      }

      const { unitKind, unitLabel, direction, yellowAt, redAt, targetValue } = body;

      if ((yellowAt !== null && redAt === null) || (yellowAt === null && redAt !== null)) {
        throw new AppError('VALIDATION', 'Ngưỡng vàng và ngưỡng đỏ phải cùng có hoặc cùng để trống', {
          fieldErrors: {
            yellowAt: 'Phải cùng có hoặc cùng để trống với ngưỡng đỏ',
            redAt: 'Phải cùng có hoặc cùng để trống với ngưỡng vàng',
          },
        });
      }

      if (yellowAt !== null && redAt !== null) {
        if (!direction) {
          throw new AppError('VALIDATION', 'Bắt buộc chọn chiều biến động khi đã đặt ngưỡng số', {
            fieldErrors: { direction: 'Bắt buộc chọn chiều biến động khi có ngưỡng số' },
          });
        }
        if (direction === 'higher_is_worse' && yellowAt >= redAt) {
          throw new AppError('VALIDATION', 'Khi càng cao càng xấu, ngưỡng vàng phải nhỏ hơn ngưỡng đỏ', {
            fieldErrors: { yellowAt: 'Ngưỡng vàng phải nhỏ hơn ngưỡng đỏ' },
          });
        }
        if (direction === 'lower_is_worse' && yellowAt <= redAt) {
          throw new AppError('VALIDATION', 'Khi càng thấp càng xấu, ngưỡng vàng phải lớn hơn ngưỡng đỏ', {
            fieldErrors: { yellowAt: 'Ngưỡng vàng phải lớn hơn ngưỡng đỏ' },
          });
        }
      }

      if (unitKind === 'percent') {
        if (yellowAt !== null && (yellowAt < 0 || yellowAt > 100)) {
          throw new AppError('VALIDATION', 'Ngưỡng vàng phải nằm trong khoảng từ 0 đến 100', {
            fieldErrors: { yellowAt: 'Ngưỡng vàng phải từ 0 đến 100' },
          });
        }
        if (redAt !== null && (redAt < 0 || redAt > 100)) {
          throw new AppError('VALIDATION', 'Ngưỡng đỏ phải nằm trong khoảng từ 0 đến 100', {
            fieldErrors: { redAt: 'Ngưỡng đỏ phải từ 0 đến 100' },
          });
        }
        if (targetValue !== null && (targetValue < 0 || targetValue > 100)) {
          throw new AppError('VALIDATION', 'Mục tiêu phải nằm trong khoảng từ 0 đến 100', {
            fieldErrors: { targetValue: 'Mục tiêu phải từ 0 đến 100' },
          });
        }
      }

      if (unitKind === 'count') {
        if (yellowAt !== null && (!Number.isInteger(yellowAt) || yellowAt < 0)) {
          throw new AppError('VALIDATION', 'Ngưỡng vàng phải là số nguyên ≥ 0', {
            fieldErrors: { yellowAt: 'Ngưỡng vàng phải là số nguyên ≥ 0' },
          });
        }
        if (redAt !== null && (!Number.isInteger(redAt) || redAt < 0)) {
          throw new AppError('VALIDATION', 'Ngưỡng đỏ phải là số nguyên ≥ 0', {
            fieldErrors: { redAt: 'Ngưỡng đỏ phải là số nguyên ≥ 0' },
          });
        }
        if (targetValue !== null && (!Number.isInteger(targetValue) || targetValue < 0)) {
          throw new AppError('VALIDATION', 'Mục tiêu phải là số nguyên ≥ 0', {
            fieldErrors: { targetValue: 'Mục tiêu phải là số nguyên ≥ 0' },
          });
        }
      }

      if (existing.kind === 'kri' && targetValue !== null) {
        throw new AppError('VALIDATION', 'Chỉ số KRI không nhận mục tiêu', {
          fieldErrors: { targetValue: 'Chỉ số KRI không nhận mục tiêu' },
        });
      }

      const before = {
        unitKind: existing.unitKind,
        unitLabel: existing.unitLabel,
        direction: existing.direction,
        yellowAt: existing.yellowAt !== null ? Number(existing.yellowAt) : null,
        redAt: existing.redAt !== null ? Number(existing.redAt) : null,
        targetValue: existing.targetValue !== null ? Number(existing.targetValue) : null,
      };

      const after = {
        unitKind,
        unitLabel: unitLabel.trim(),
        direction,
        yellowAt,
        redAt,
        targetValue,
      };

      const now = new Date();
      await tx
        .update(indicator)
        .set({
          unitKind,
          unitLabel: unitLabel.trim(),
          direction,
          yellowAt: yellowAt !== null ? String(yellowAt) : null,
          redAt: redAt !== null ? String(redAt) : null,
          targetValue: targetValue !== null ? String(targetValue) : null,
          manuallyEditedAt: now,
        })
        .where(eq(indicator.id, existing.id));

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resItem = detail.indicators.find((ind) => ind.code === normalizedCode);
      if (!resItem) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy chỉ số sau khi thiết lập');
      }

      return {
        entityId: existing.id,
        before,
        after,
        result: resItem,
      };
    },
    db
  );
}

