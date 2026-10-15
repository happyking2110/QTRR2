import { eq, and, desc, aliasedTable, isNull, sql, gt } from 'drizzle-orm';
import { normalizeCode } from '../../lib/domain/codes';
import { getProfileDetail, type ActionTaskDto } from './queries';
import { resolveActiveCycle } from './cycles';
import { defaultDb } from '../db/client';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import {
  actionTask,
  actionPlan,
  riskProfile,
  cycle,
  period,
  actionUpdate,
  appUser,
  unit,
} from '../db/schema';
import { AppError } from '../errors';
import { getVietnamDateString } from '../auth/policy';
import { withAudit, writeAuditLog } from './audit';
import { getPersonRef, type PersonRefDto } from './users';
import type { Actor } from '../types';
import crypto from 'crypto';

export type DbType = PostgresJsDatabase<typeof schema>;

export interface TaskUpdateSubmissionDto {
  id: string;
  taskId: string;
  actionCode: string;
  taskName: string;
  periodKey: string;
  progress: number;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  submittedBy: PersonRefDto | null;
  submittedAt: string;
  reviewedBy: PersonRefDto | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface SubmitTaskUpdatePayload {
  periodKey: string;
  progress: number;
  note?: string | null;
}

/**
 * Nộp cập nhật tiến độ đầu việc cho một kỳ quý (tạo bản chờ duyệt)
 * Kiểm tra theo backend-design 5.2 và 4.11 mục 6.
 */
export async function submitTaskUpdate(
  taskId: string,
  payload: SubmitTaskUpdatePayload,
  actor: Actor | null,
  meta?: { today?: string; ip?: string },
  db: DbType = defaultDb
): Promise<TaskUpdateSubmissionDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  return await withAudit(
    actor,
    {
      action: 'submit_task_update',
      entity: 'action_update',
      ip: meta?.ip,
    },
    async (tx) => {
      // 1. Tìm đầu việc, kế hoạch hành động và chu kỳ
      const [t] = await tx
        .select({
          id: actionTask.id,
          name: actionTask.name,
          unitId: actionTask.unitId,
          actionId: actionTask.actionId,
          actionCode: actionPlan.code,
          profileId: actionPlan.profileId,
          cycleId: riskProfile.cycleId,
        })
        .from(actionTask)
        .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
        .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
        .where(eq(actionTask.id, taskId));

      if (!t) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy đầu việc');
      }

      // 2. Chu kỳ
      const [cyc] = await tx.select().from(cycle).where(eq(cycle.id, t.cycleId));
      if (!cyc || cyc.status === 'archived') {
        throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể nộp tiến độ');
      }

      // 3. Kỳ (khóa chia sẻ FOR SHARE để tránh đóng kỳ khi đang nộp)
      const [p] = await tx
        .select()
        .from(period)
        .where(and(eq(period.cycleId, t.cycleId), eq(period.key, payload.periodKey)))
        .for('share');

      if (!p) {
        throw new AppError('PERIOD_NOT_FOUND', 'Kỳ không tồn tại trong chu kỳ');
      }
      if (p.closedAt !== null) {
        throw new AppError('PERIOD_CLOSED', 'Kỳ đã bị khóa');
      }

      // starts_on <= hôm nay
      const todayStr = meta?.today || getVietnamDateString(new Date());
      if (p.startsOn > todayStr) {
        throw new AppError('VALIDATION', 'Kỳ chưa bắt đầu');
      }

      // Đầu việc chỉ dùng kỳ quý
      if (p.kind !== 'quarter') {
        throw new AppError('VALIDATION', 'Đầu việc chỉ nộp cho kỳ quý');
      }

      // 4. Quyền nộp theo mục
      if (actor.role === 'viewer') {
        throw new AppError('FORBIDDEN', 'Bạn không có quyền nộp tiến độ đầu việc');
      }
      if (actor.role === 'unit') {
        if (!t.unitId || t.unitId !== actor.unitId) {
          throw new AppError('FORBIDDEN', 'Bạn không có quyền nộp tiến độ cho đầu việc này');
        }
      }

      // 5. Kiểm tra giá trị progress
      if (
        payload.progress === undefined ||
        payload.progress === null ||
        typeof payload.progress !== 'number' ||
        !Number.isInteger(payload.progress) ||
        payload.progress < 0 ||
        payload.progress > 100
      ) {
        throw new AppError('VALIDATION', 'Tiến độ phải là số nguyên từ 0 đến 100');
      }

      // 6. So sánh với bản duyệt mới nhất của đầu việc (mọi kỳ)
      const [latestApproved] = await tx
        .select({
          progress: actionUpdate.progress,
        })
        .from(actionUpdate)
        .where(
          and(
            eq(actionUpdate.taskId, t.id),
            eq(actionUpdate.status, 'approved')
          )
        )
        .orderBy(desc(actionUpdate.reviewedAt))
        .limit(1);

      if (latestApproved && payload.progress < latestApproved.progress) {
        const noteTrimmed = (payload.note ?? '').trim();
        if (noteTrimmed.length === 0) {
          throw new AppError(
            'VALIDATION',
            'Tiến độ giảm so với bản đã duyệt mới nhất bắt buộc phải có giải trình trong ghi chú'
          );
        }
      }

      // 7. Lưu bản ghi action_update trong transaction
      const updateId = crypto.randomUUID();
      const now = new Date();
      const noteVal = payload.note ? payload.note.trim() : null;

      await tx.insert(actionUpdate).values({
        id: updateId,
        taskId: t.id,
        periodKey: p.key,
        progress: payload.progress,
        note: noteVal,
        status: 'pending',
        submittedBy: actor.userId,
        submittedAt: now,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      });

      const submitterRef = await getPersonRef(actor.userId, tx);

      const result: TaskUpdateSubmissionDto = {
        id: updateId,
        taskId: t.id,
        actionCode: t.actionCode,
        taskName: t.name,
        periodKey: p.key,
        progress: payload.progress,
        note: noteVal,
        status: 'pending',
        submittedBy: submitterRef,
        submittedAt: now.toISOString(),
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      };

      return {
        entityId: updateId,
        after: {
          id: updateId,
          taskId: t.id,
          periodKey: p.key,
          progress: payload.progress,
          note: noteVal,
          status: 'pending',
        },
        result,
      };
    },
    db
  );
}

/**
 * Lịch sử bản cập nhật tiến độ của một đầu việc (mọi trạng thái), mới trước
 */
export async function getTaskUpdates(
  taskId: string,
  actor: Actor | null,
  db: DbType = defaultDb
): Promise<TaskUpdateSubmissionDto[]> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  const [t] = await db
    .select({
      id: actionTask.id,
      name: actionTask.name,
      unitId: actionTask.unitId,
      actionCode: actionPlan.code,
    })
    .from(actionTask)
    .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
    .where(eq(actionTask.id, taskId));

  if (!t) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy đầu việc');
  }

  if (actor.role === 'viewer') {
    throw new AppError('FORBIDDEN', 'Bạn không có quyền xem lịch sử bản cập nhật');
  }
  if (actor.role === 'unit') {
    if (!t.unitId || t.unitId !== actor.unitId) {
      throw new AppError('FORBIDDEN', 'Bạn không có quyền xem lịch sử bản cập nhật của đầu việc đơn vị khác');
    }
  }

  const submitter = aliasedTable(appUser, 'submitter');
  const submitterUnit = aliasedTable(unit, 'submitter_unit');
  const reviewer = aliasedTable(appUser, 'reviewer');
  const reviewerUnit = aliasedTable(unit, 'reviewer_unit');

  const rows = await db
    .select({
      id: actionUpdate.id,
      taskId: actionUpdate.taskId,
      periodKey: actionUpdate.periodKey,
      progress: actionUpdate.progress,
      note: actionUpdate.note,
      status: actionUpdate.status,
      submittedAt: actionUpdate.submittedAt,
      submitterFullName: submitter.fullName,
      submitterUnitName: submitterUnit.name,
      reviewedAt: actionUpdate.reviewedAt,
      reviewNote: actionUpdate.reviewNote,
      reviewerFullName: reviewer.fullName,
      reviewerUnitName: reviewerUnit.name,
    })
    .from(actionUpdate)
    .leftJoin(submitter, eq(actionUpdate.submittedBy, submitter.id))
    .leftJoin(submitterUnit, eq(submitter.unitId, submitterUnit.id))
    .leftJoin(reviewer, eq(actionUpdate.reviewedBy, reviewer.id))
    .leftJoin(reviewerUnit, eq(reviewer.unitId, reviewerUnit.id))
    .where(eq(actionUpdate.taskId, t.id))
    .orderBy(desc(actionUpdate.submittedAt));

  return rows.map((r) => ({
    id: r.id,
    taskId: t.id,
    actionCode: t.actionCode,
    taskName: t.name,
    periodKey: r.periodKey,
    progress: r.progress,
    note: r.note ?? null,
    status: r.status as any,
    submittedBy: r.submitterFullName
      ? { fullName: r.submitterFullName, unitName: r.submitterUnitName ?? null }
      : null,
    submittedAt: r.submittedAt.toISOString(),
    reviewedBy: r.reviewerFullName
      ? { fullName: r.reviewerFullName, unitName: r.reviewerUnitName ?? null }
      : null,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewNote: r.reviewNote ?? null,
  }));
}

function checkActorPermission(actor?: Actor | null): void {
  if (actor !== undefined && actor !== null) {
    if (actor.role !== 'admin' && actor.role !== 'ban4') {
      throw new AppError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này');
    }
  }
}

export interface TaskInputPayload {
  name: string;
  unitCode: string | null;
  dueDate: string | null;
}

export interface SplitTaskPayload {
  parts: TaskInputPayload[];
}

export async function createTask(
  riskCode: string,
  actionCode: string,
  body: TaskInputPayload,
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ActionTaskDto> {
  checkActorPermission(actor);
  const cycleRow = await resolveActiveCycle(cycleParam, db);
  if (cycleRow.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể thay đổi dữ liệu');
  }

  const normalizedRiskCode = normalizeCode(riskCode);
  const normalizedActionCode = normalizeCode(actionCode);

  if (!normalizedActionCode.startsWith(`${normalizedRiskCode}.KH`)) {
    throw new AppError('VALIDATION', `Mã kế hoạch phải bắt đầu bằng "${normalizedRiskCode}.KH"`, {
      fieldErrors: { code: `Mã kế hoạch phải bắt đầu bằng "${normalizedRiskCode}.KH"` },
    });
  }

  const [profile] = await db
    .select()
    .from(riskProfile)
    .where(and(eq(riskProfile.cycleId, cycleRow.id), eq(riskProfile.riskCode, normalizedRiskCode), isNull(riskProfile.deletedAt)));

  if (!profile) {
    throw new AppError('NOT_FOUND', `Không tìm thấy hồ sơ rủi ro ${riskCode}`);
  }

  const [act] = await db
    .select()
    .from(actionPlan)
    .where(and(eq(actionPlan.profileId, profile.id), eq(actionPlan.code, normalizedActionCode), isNull(actionPlan.deletedAt)));

  if (!act) {
    throw new AppError('NOT_FOUND', `Không tìm thấy kế hoạch hành động ${actionCode}`);
  }

  let unitId: string | null = null;
  if (body.unitCode !== null && body.unitCode !== undefined) {
    const trimmedUnit = body.unitCode.trim();
    if (trimmedUnit.length > 0) {
      const [unitRow] = await db.select().from(unit).where(eq(unit.code, trimmedUnit));
      if (!unitRow) {
        throw new AppError('VALIDATION', `Đơn vị "${body.unitCode}" không tồn tại`, {
          fieldErrors: { unitCode: 'Đơn vị không tồn tại' },
        });
      }
      unitId = unitRow.id;
    }
  }

  const [maxOrderRow] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${actionTask.sortOrder}), 0)::int` })
    .from(actionTask)
    .where(and(eq(actionTask.actionId, act.id), isNull(actionTask.deletedAt)));

  const sortOrder = (maxOrderRow?.maxOrder ?? 0) + 1;

  return await withAudit(
    actor ?? null,
    {
      action: 'create_task',
      entity: 'action_task',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      const [inserted] = await tx
        .insert(actionTask)
        .values({
          actionId: act.id,
          name: body.name.trim(),
          unitId,
          dueDate: body.dueDate ?? null,
          weight: 1,
          sortOrder,
          sourceText: null,
        })
        .returning();

      await tx
        .update(actionPlan)
        .set({ manuallyEditedAt: now })
        .where(eq(actionPlan.id, act.id));

      const detail = await getProfileDetail(normalizedRiskCode, { cycle: cycleRow.year }, tx, actor);
      const resAction = detail.actions.find((a) => a.code === normalizedActionCode);
      const resTask = resAction?.tasks.find((t) => t.id === inserted.id);

      if (!resTask) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy đầu việc vừa tạo');
      }

      return {
        entityId: inserted.id,
        after: { name: body.name.trim(), actionCode: normalizedActionCode, dueDate: body.dueDate },
        result: resTask,
      };
    },
    db
  );
}

export async function updateTask(
  taskId: string,
  body: TaskInputPayload,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ActionTaskDto> {
  checkActorPermission(actor);

  const [row] = await db
    .select({
      task: actionTask,
      action: actionPlan,
      profile: riskProfile,
      cycle: cycle,
    })
    .from(actionTask)
    .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
    .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
    .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
    .where(and(eq(actionTask.id, taskId), isNull(actionTask.deletedAt)));

  if (!row) {
    throw new AppError('NOT_FOUND', `Không tìm thấy đầu việc`);
  }

  if (row.cycle.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể thay đổi dữ liệu');
  }

  let unitId: string | null = null;
  if (body.unitCode !== null && body.unitCode !== undefined) {
    const trimmedUnit = body.unitCode.trim();
    if (trimmedUnit.length > 0) {
      const [unitRow] = await db.select().from(unit).where(eq(unit.code, trimmedUnit));
      if (!unitRow) {
        throw new AppError('VALIDATION', `Đơn vị "${body.unitCode}" không tồn tại`, {
          fieldErrors: { unitCode: 'Đơn vị không tồn tại' },
        });
      }
      unitId = unitRow.id;
    }
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'update_task',
      entity: 'action_task',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx
        .update(actionTask)
        .set({
          name: body.name.trim(),
          unitId,
          dueDate: body.dueDate ?? null,
        })
        .where(eq(actionTask.id, taskId));

      await tx
        .update(actionPlan)
        .set({ manuallyEditedAt: now })
        .where(eq(actionPlan.id, row.action.id));

      const detail = await getProfileDetail(row.profile.riskCode, { cycle: row.cycle.year }, tx, actor);
      const resAction = detail.actions.find((a) => a.code === row.action.code);
      const resTask = resAction?.tasks.find((t) => t.id === taskId);

      if (!resTask) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy đầu việc sau khi sửa');
      }

      return {
        entityId: taskId,
        before: { name: row.task.name, dueDate: row.task.dueDate, unitId: row.task.unitId },
        after: { name: body.name.trim(), dueDate: body.dueDate, unitId },
        result: resTask,
      };
    },
    db
  );
}

export async function deleteTask(
  taskId: string,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<void> {
  checkActorPermission(actor);

  const [row] = await db
    .select({
      task: actionTask,
      action: actionPlan,
      profile: riskProfile,
      cycle: cycle,
    })
    .from(actionTask)
    .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
    .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
    .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
    .where(and(eq(actionTask.id, taskId), isNull(actionTask.deletedAt)));

  if (!row) {
    throw new AppError('NOT_FOUND', `Không tìm thấy đầu việc`);
  }

  if (row.cycle.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể thay đổi dữ liệu');
  }

  const [taskCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(actionTask)
    .where(and(eq(actionTask.actionId, row.action.id), isNull(actionTask.deletedAt)));

  if ((taskCountRow?.count ?? 0) <= 1) {
    throw new AppError('INVALID_STATE', 'Không thể xóa đầu việc cuối cùng của kế hoạch hành động');
  }

  const updates = await db
    .select({ periodKey: actionUpdate.periodKey })
    .from(actionUpdate)
    .where(eq(actionUpdate.taskId, taskId));

  if (updates.length > 0) {
    throw new AppError('REFERENCED', 'Đầu việc đã có bản cập nhật tiến độ, không thể xóa', {
      details: updates.map((u) => ({ kind: 'task_update', periodKey: u.periodKey, code: u.periodKey })),
    });
  }

  await withAudit(
    actor ?? null,
    {
      action: 'delete_task',
      entity: 'action_task',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx
        .update(actionTask)
        .set({ deletedAt: now })
        .where(eq(actionTask.id, taskId));

      await tx
        .update(actionPlan)
        .set({ manuallyEditedAt: now })
        .where(eq(actionPlan.id, row.action.id));

      return {
        entityId: taskId,
        before: { name: row.task.name, actionCode: row.action.code },
        result: undefined,
      };
    },
    db
  );
}

export async function splitTask(
  taskId: string,
  body: SplitTaskPayload,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ActionTaskDto[]> {
  checkActorPermission(actor);

  if (!body.parts || body.parts.length < 2 || body.parts.length > 20) {
    throw new AppError('VALIDATION', 'Số lượng phần tách phải từ 2 đến 20', {
      fieldErrors: { parts: 'Số lượng phần tách phải từ 2 đến 20' },
    });
  }

  const [row] = await db
    .select({
      task: actionTask,
      action: actionPlan,
      profile: riskProfile,
      cycle: cycle,
    })
    .from(actionTask)
    .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
    .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
    .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
    .where(and(eq(actionTask.id, taskId), isNull(actionTask.deletedAt)));

  if (!row) {
    throw new AppError('NOT_FOUND', `Không tìm thấy đầu việc`);
  }

  if (row.cycle.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể thay đổi dữ liệu');
  }

  const updates = await db
    .select({ periodKey: actionUpdate.periodKey })
    .from(actionUpdate)
    .where(eq(actionUpdate.taskId, taskId));

  if (updates.length > 0) {
    throw new AppError('REFERENCED', 'Đầu việc đã có bản cập nhật tiến độ, không thể tách', {
      details: updates.map((u) => ({ kind: 'task_update', periodKey: u.periodKey, code: u.periodKey })),
    });
  }

  const resolvedUnitIds: (string | null)[] = [];
  for (let i = 0; i < body.parts.length; i++) {
    const p = body.parts[i];
    let uid: string | null = null;
    if (p.unitCode !== null && p.unitCode !== undefined) {
      const trimmed = p.unitCode.trim();
      if (trimmed.length > 0) {
        const [uRow] = await db.select().from(unit).where(eq(unit.code, trimmed));
        if (!uRow) {
          throw new AppError('VALIDATION', `Đơn vị "${p.unitCode}" ở phần ${i + 1} không tồn tại`, {
            fieldErrors: { [`parts.${i}.unitCode`]: 'Đơn vị không tồn tại' },
          });
        }
        uid = uRow.id;
      }
    }
    resolvedUnitIds.push(uid);
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'split_task',
      entity: 'action_task',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx
        .update(actionTask)
        .set({ deletedAt: now })
        .where(eq(actionTask.id, taskId));

      await tx
        .update(actionTask)
        .set({ sortOrder: sql`${actionTask.sortOrder} + ${body.parts.length - 1}` })
        .where(
          and(
            eq(actionTask.actionId, row.action.id),
            isNull(actionTask.deletedAt),
            gt(actionTask.sortOrder, row.task.sortOrder)
          )
        );

      const sourceText = row.task.sourceText || row.task.name;
      const createdIds: string[] = [];

      for (let i = 0; i < body.parts.length; i++) {
        const p = body.parts[i];
        const [ins] = await tx
          .insert(actionTask)
          .values({
            actionId: row.action.id,
            name: p.name.trim(),
            unitId: resolvedUnitIds[i],
            dueDate: p.dueDate ?? null,
            weight: 1,
            sortOrder: row.task.sortOrder + i,
            sourceText,
          })
          .returning();
        createdIds.push(ins.id);
      }

      await tx
        .update(actionPlan)
        .set({ manuallyEditedAt: now })
        .where(eq(actionPlan.id, row.action.id));

      const detail = await getProfileDetail(row.profile.riskCode, { cycle: row.cycle.year }, tx, actor);
      const resAction = detail.actions.find((a) => a.code === row.action.code);
      const idSet = new Set(createdIds);
      const resultTasks = resAction?.tasks.filter((t) => idSet.has(t.id)) ?? [];

      return {
        entityId: taskId,
        before: { name: row.task.name, id: taskId },
        after: { splitCount: body.parts.length, createdIds },
        result: resultTasks,
      };
    },
    db
  );
}
