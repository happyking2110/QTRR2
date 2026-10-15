import { eq, and, desc, asc, count, aliasedTable } from 'drizzle-orm';
import { defaultDb } from '../db/client';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import {
  indicatorReading,
  actionUpdate,
  indicator,
  actionTask,
  actionPlan,
  riskProfile,
  cycle,
  period,
  appUser,
  unit,
} from '../db/schema';
import { AppError } from '../errors';
import { canApproveSubmission } from '../auth/policy';
import { withAudit, writeAuditLog, type DbTransaction } from './audit';
import { getPersonRef } from './users';
import { resolveActiveCycle } from './cycles';
import { currentReading } from '../../lib/domain/readings';
import type { Actor } from '../types';
import type { ReadingSubmissionDto } from './readings';
import type { TaskUpdateSubmissionDto } from './tasks';
import type { CurrentReadingDto } from './queries';

export type DbType = PostgresJsDatabase<typeof schema> | DbTransaction;

export interface ReadingApprovalItemDto {
  kind: 'reading';
  riskCode: string;
  targetName: string;
  submission: ReadingSubmissionDto;
  current: CurrentReadingDto | null;
  canApprove: boolean;
}

export interface TaskUpdateApprovalItemDto {
  kind: 'task_update';
  riskCode: string;
  targetName: string;
  submission: TaskUpdateSubmissionDto;
  currentProgress: number | null;
  canApprove: boolean;
}

export type ApprovalItemDto = ReadingApprovalItemDto | TaskUpdateApprovalItemDto;

export interface BulkApproveItem {
  kind: 'reading' | 'task_update';
  id: string;
}

async function getActiveAdminCount(db: DbType): Promise<number> {
  const [res] = await db
    .select({ total: count() })
    .from(appUser)
    .where(and(eq(appUser.role, 'admin'), eq(appUser.isActive, true)));
  return Number(res.total);
}

/**
 * Người nộp rút lại bản số liệu chỉ số đang chờ duyệt
 */
export async function withdrawReading(
  id: string,
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ReadingSubmissionDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  return await withAudit(
    actor,
    {
      action: 'withdraw_submission',
      entity: 'indicator_reading',
      ip: meta?.ip,
    },
    async (tx) => {
      // Khóa dòng bản nộp FOR UPDATE
      const [readingRow] = await tx
        .select()
        .from(indicatorReading)
        .where(eq(indicatorReading.id, id))
        .for('update');

      if (!readingRow) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy bản nộp');
      }

      // Khóa dòng period FOR SHARE
      const [info] = await tx
        .select({
          code: indicator.code,
          cycleStatus: cycle.status,
          periodClosedAt: period.closedAt,
        })
        .from(indicator)
        .innerJoin(riskProfile, eq(indicator.profileId, riskProfile.id))
        .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
        .innerJoin(
          period,
          and(eq(period.cycleId, cycle.id), eq(period.key, readingRow.periodKey))
        )
        .where(eq(indicator.id, readingRow.indicatorId))
        .for('share', { of: period });

      if (info?.cycleStatus === 'archived') {
        throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể rút lại');
      }

      if (info?.periodClosedAt !== null) {
        throw new AppError('PERIOD_CLOSED', 'Kỳ đã bị khóa không thể rút lại');
      }

      if (readingRow.status !== 'pending') {
        throw new AppError('INVALID_STATE', 'Chỉ có thể rút lại bản nộp đang chờ duyệt');
      }

      if (readingRow.submittedBy !== actor.userId) {
        throw new AppError('FORBIDDEN', 'Chỉ người nộp mới có quyền rút lại bản nộp');
      }

      await tx
        .update(indicatorReading)
        .set({ status: 'withdrawn' })
        .where(eq(indicatorReading.id, id));

      const submitterRef = await getPersonRef(readingRow.submittedBy, tx);

      const result: ReadingSubmissionDto = {
        id: readingRow.id,
        indicatorId: readingRow.indicatorId,
        indicatorCode: info.code,
        periodKey: readingRow.periodKey,
        valueNum: readingRow.valueNum !== null ? parseFloat(readingRow.valueNum) : null,
        valueText: readingRow.valueText,
        zone: readingRow.zone as any,
        zoneSource: readingRow.zoneSource as any,
        zoneNote: readingRow.zoneNote,
        note: readingRow.note,
        status: 'withdrawn',
        submittedBy: submitterRef,
        submittedAt: readingRow.submittedAt.toISOString(),
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      };

      return {
        entityId: id,
        before: { status: readingRow.status },
        after: { id, status: 'withdrawn' },
        result,
      };
    },
    db
  );
}

/**
 * Duyệt bản số liệu chỉ số đang chờ
 */
export async function approveReading(
  id: string,
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ReadingSubmissionDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền duyệt bản nộp');
  }

  return await withAudit(
    actor,
    {
      action: 'approve_submission',
      entity: 'indicator_reading',
      ip: meta?.ip,
    },
    async (tx) => {
      // Khóa dòng bản nộp FOR UPDATE
      const [readingRow] = await tx
        .select()
        .from(indicatorReading)
        .where(eq(indicatorReading.id, id))
        .for('update');

      if (!readingRow) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy bản nộp');
      }

      // Khóa dòng period FOR SHARE
      const [info] = await tx
        .select({
          code: indicator.code,
          cycleStatus: cycle.status,
          periodClosedAt: period.closedAt,
        })
        .from(indicator)
        .innerJoin(riskProfile, eq(indicator.profileId, riskProfile.id))
        .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
        .innerJoin(
          period,
          and(eq(period.cycleId, cycle.id), eq(period.key, readingRow.periodKey))
        )
        .where(eq(indicator.id, readingRow.indicatorId))
        .for('share', { of: period });

      if (info?.cycleStatus === 'archived') {
        throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể duyệt');
      }

      if (info?.periodClosedAt !== null) {
        throw new AppError('PERIOD_CLOSED', 'Kỳ đã bị khóa không thể duyệt');
      }

      if (readingRow.status !== 'pending') {
        throw new AppError('INVALID_STATE', 'Chỉ có thể duyệt bản nộp đang chờ duyệt');
      }

      // Tự duyệt
      const activeAdmins = await getActiveAdminCount(tx);
      const isSelf = readingRow.submittedBy === actor.userId;
      if (isSelf && activeAdmins >= 2) {
        throw new AppError('SELF_APPROVAL', 'Người duyệt không được trùng người nộp');
      }

      const isSelfApproved = isSelf && activeAdmins === 1;
      const now = new Date();

      await tx
        .update(indicatorReading)
        .set({
          status: 'approved',
          reviewedBy: actor.userId,
          reviewedAt: now,
          reviewNote: null,
        })
        .where(eq(indicatorReading.id, id));

      const submitterRef = await getPersonRef(readingRow.submittedBy, tx);
      const reviewerRef = await getPersonRef(actor.userId, tx);

      const result: ReadingSubmissionDto = {
        id: readingRow.id,
        indicatorId: readingRow.indicatorId,
        indicatorCode: info.code,
        periodKey: readingRow.periodKey,
        valueNum: readingRow.valueNum !== null ? parseFloat(readingRow.valueNum) : null,
        valueText: readingRow.valueText,
        zone: readingRow.zone as any,
        zoneSource: readingRow.zoneSource as any,
        zoneNote: readingRow.zoneNote,
        note: readingRow.note,
        status: 'approved',
        submittedBy: submitterRef,
        submittedAt: readingRow.submittedAt.toISOString(),
        reviewedBy: reviewerRef,
        reviewedAt: now.toISOString(),
        reviewNote: null,
      };

      return {
        entityId: id,
        before: { status: readingRow.status },
        after: {
          id,
          status: 'approved',
          selfApproved: isSelfApproved,
        },
        result,
      };
    },
    db
  );
}

/**
 * Từ chối bản số liệu chỉ số đang chờ, bắt buộc lý do
 */
export async function rejectReading(
  id: string,
  reason: string,
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ReadingSubmissionDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền từ chối bản nộp');
  }

  const trimmedReason = (reason ?? '').trim();
  if (trimmedReason.length < 5 || trimmedReason.length > 500) {
    throw new AppError('VALIDATION', 'Lý do từ chối phải từ 5 đến 500 ký tự');
  }

  return await withAudit(
    actor,
    {
      action: 'reject_submission',
      entity: 'indicator_reading',
      ip: meta?.ip,
    },
    async (tx) => {
      // Khóa dòng bản nộp FOR UPDATE
      const [readingRow] = await tx
        .select()
        .from(indicatorReading)
        .where(eq(indicatorReading.id, id))
        .for('update');

      if (!readingRow) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy bản nộp');
      }

      // Khóa dòng period FOR SHARE
      const [info] = await tx
        .select({
          code: indicator.code,
          cycleStatus: cycle.status,
          periodClosedAt: period.closedAt,
        })
        .from(indicator)
        .innerJoin(riskProfile, eq(indicator.profileId, riskProfile.id))
        .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
        .innerJoin(
          period,
          and(eq(period.cycleId, cycle.id), eq(period.key, readingRow.periodKey))
        )
        .where(eq(indicator.id, readingRow.indicatorId))
        .for('share', { of: period });

      if (info?.cycleStatus === 'archived') {
        throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể từ chối');
      }

      if (info?.periodClosedAt !== null) {
        throw new AppError('PERIOD_CLOSED', 'Kỳ đã bị khóa không thể từ chối');
      }

      if (readingRow.status !== 'pending') {
        throw new AppError('INVALID_STATE', 'Chỉ có thể từ chối bản nộp đang chờ duyệt');
      }

      const now = new Date();

      await tx
        .update(indicatorReading)
        .set({
          status: 'rejected',
          reviewedBy: actor.userId,
          reviewedAt: now,
          reviewNote: trimmedReason,
        })
        .where(eq(indicatorReading.id, id));

      const submitterRef = await getPersonRef(readingRow.submittedBy, tx);
      const reviewerRef = await getPersonRef(actor.userId, tx);

      const result: ReadingSubmissionDto = {
        id: readingRow.id,
        indicatorId: readingRow.indicatorId,
        indicatorCode: info.code,
        periodKey: readingRow.periodKey,
        valueNum: readingRow.valueNum !== null ? parseFloat(readingRow.valueNum) : null,
        valueText: readingRow.valueText,
        zone: readingRow.zone as any,
        zoneSource: readingRow.zoneSource as any,
        zoneNote: readingRow.zoneNote,
        note: readingRow.note,
        status: 'rejected',
        submittedBy: submitterRef,
        submittedAt: readingRow.submittedAt.toISOString(),
        reviewedBy: reviewerRef,
        reviewedAt: now.toISOString(),
        reviewNote: trimmedReason,
      };

      return {
        entityId: id,
        before: { status: readingRow.status },
        after: {
          id,
          status: 'rejected',
          reason: trimmedReason,
        },
        result,
      };
    },
    db
  );
}

/**
 * Người nộp rút lại bản tiến độ đầu việc đang chờ duyệt
 */
export async function withdrawTaskUpdate(
  id: string,
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<TaskUpdateSubmissionDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  return await withAudit(
    actor,
    {
      action: 'withdraw_submission',
      entity: 'action_update',
      ip: meta?.ip,
    },
    async (tx) => {
      // Khóa dòng bản cập nhật FOR UPDATE
      const [updateRow] = await tx
        .select()
        .from(actionUpdate)
        .where(eq(actionUpdate.id, id))
        .for('update');

      if (!updateRow) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy bản cập nhật');
      }

      // Khóa dòng period FOR SHARE
      const [info] = await tx
        .select({
          taskName: actionTask.name,
          actionCode: actionPlan.code,
          cycleStatus: cycle.status,
          periodClosedAt: period.closedAt,
        })
        .from(actionTask)
        .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
        .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
        .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
        .innerJoin(
          period,
          and(eq(period.cycleId, cycle.id), eq(period.key, updateRow.periodKey))
        )
        .where(eq(actionTask.id, updateRow.taskId))
        .for('share', { of: period });

      if (info?.cycleStatus === 'archived') {
        throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể rút lại');
      }

      if (info?.periodClosedAt !== null) {
        throw new AppError('PERIOD_CLOSED', 'Kỳ đã bị khóa không thể rút lại');
      }

      if (updateRow.status !== 'pending') {
        throw new AppError('INVALID_STATE', 'Chỉ có thể rút lại bản cập nhật đang chờ duyệt');
      }

      if (updateRow.submittedBy !== actor.userId) {
        throw new AppError('FORBIDDEN', 'Chỉ người nộp mới có quyền rút lại bản cập nhật');
      }

      await tx
        .update(actionUpdate)
        .set({ status: 'withdrawn' })
        .where(eq(actionUpdate.id, id));

      const submitterRef = await getPersonRef(updateRow.submittedBy, tx);

      const result: TaskUpdateSubmissionDto = {
        id: updateRow.id,
        taskId: updateRow.taskId,
        actionCode: info.actionCode,
        taskName: info.taskName,
        periodKey: updateRow.periodKey,
        progress: updateRow.progress,
        note: updateRow.note,
        status: 'withdrawn',
        submittedBy: submitterRef,
        submittedAt: updateRow.submittedAt.toISOString(),
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      };

      return {
        entityId: id,
        before: { status: updateRow.status },
        after: { id, status: 'withdrawn' },
        result,
      };
    },
    db
  );
}

/**
 * Duyệt bản tiến độ đầu việc đang chờ
 */
export async function approveTaskUpdate(
  id: string,
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<TaskUpdateSubmissionDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền duyệt bản cập nhật');
  }

  return await withAudit(
    actor,
    {
      action: 'approve_submission',
      entity: 'action_update',
      ip: meta?.ip,
    },
    async (tx) => {
      // Khóa dòng bản cập nhật FOR UPDATE
      const [updateRow] = await tx
        .select()
        .from(actionUpdate)
        .where(eq(actionUpdate.id, id))
        .for('update');

      if (!updateRow) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy bản cập nhật');
      }

      // Khóa dòng period FOR SHARE
      const [info] = await tx
        .select({
          taskName: actionTask.name,
          actionCode: actionPlan.code,
          cycleStatus: cycle.status,
          periodClosedAt: period.closedAt,
        })
        .from(actionTask)
        .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
        .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
        .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
        .innerJoin(
          period,
          and(eq(period.cycleId, cycle.id), eq(period.key, updateRow.periodKey))
        )
        .where(eq(actionTask.id, updateRow.taskId))
        .for('share', { of: period });

      if (info?.cycleStatus === 'archived') {
        throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể duyệt');
      }

      if (info?.periodClosedAt !== null) {
        throw new AppError('PERIOD_CLOSED', 'Kỳ đã bị khóa không thể duyệt');
      }

      if (updateRow.status !== 'pending') {
        throw new AppError('INVALID_STATE', 'Chỉ có thể duyệt bản cập nhật đang chờ duyệt');
      }

      // Tự duyệt
      const activeAdmins = await getActiveAdminCount(tx);
      const isSelf = updateRow.submittedBy === actor.userId;
      if (isSelf && activeAdmins >= 2) {
        throw new AppError('SELF_APPROVAL', 'Người duyệt không được trùng người nộp');
      }

      const isSelfApproved = isSelf && activeAdmins === 1;
      const now = new Date();

      await tx
        .update(actionUpdate)
        .set({
          status: 'approved',
          reviewedBy: actor.userId,
          reviewedAt: now,
          reviewNote: null,
        })
        .where(eq(actionUpdate.id, id));

      const submitterRef = await getPersonRef(updateRow.submittedBy, tx);
      const reviewerRef = await getPersonRef(actor.userId, tx);

      const result: TaskUpdateSubmissionDto = {
        id: updateRow.id,
        taskId: updateRow.taskId,
        actionCode: info.actionCode,
        taskName: info.taskName,
        periodKey: updateRow.periodKey,
        progress: updateRow.progress,
        note: updateRow.note,
        status: 'approved',
        submittedBy: submitterRef,
        submittedAt: updateRow.submittedAt.toISOString(),
        reviewedBy: reviewerRef,
        reviewedAt: now.toISOString(),
        reviewNote: null,
      };

      return {
        entityId: id,
        before: { status: updateRow.status },
        after: {
          id,
          status: 'approved',
          selfApproved: isSelfApproved,
        },
        result,
      };
    },
    db
  );
}

/**
 * Từ chối bản tiến độ đầu việc đang chờ, bắt buộc lý do
 */
export async function rejectTaskUpdate(
  id: string,
  reason: string,
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<TaskUpdateSubmissionDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền từ chối bản cập nhật');
  }

  const trimmedReason = (reason ?? '').trim();
  if (trimmedReason.length < 5 || trimmedReason.length > 500) {
    throw new AppError('VALIDATION', 'Lý do từ chối phải từ 5 đến 500 ký tự');
  }

  return await withAudit(
    actor,
    {
      action: 'reject_submission',
      entity: 'action_update',
      ip: meta?.ip,
    },
    async (tx) => {
      // Khóa dòng bản cập nhật FOR UPDATE
      const [updateRow] = await tx
        .select()
        .from(actionUpdate)
        .where(eq(actionUpdate.id, id))
        .for('update');

      if (!updateRow) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy bản cập nhật');
      }

      // Khóa dòng period FOR SHARE
      const [info] = await tx
        .select({
          taskName: actionTask.name,
          actionCode: actionPlan.code,
          cycleStatus: cycle.status,
          periodClosedAt: period.closedAt,
        })
        .from(actionTask)
        .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
        .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
        .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
        .innerJoin(
          period,
          and(eq(period.cycleId, cycle.id), eq(period.key, updateRow.periodKey))
        )
        .where(eq(actionTask.id, updateRow.taskId))
        .for('share', { of: period });

      if (info?.cycleStatus === 'archived') {
        throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể từ chối');
      }

      if (info?.periodClosedAt !== null) {
        throw new AppError('PERIOD_CLOSED', 'Kỳ đã bị khóa không thể từ chối');
      }

      if (updateRow.status !== 'pending') {
        throw new AppError('INVALID_STATE', 'Chỉ có thể từ chối bản cập nhật đang chờ duyệt');
      }

      const now = new Date();

      await tx
        .update(actionUpdate)
        .set({
          status: 'rejected',
          reviewedBy: actor.userId,
          reviewedAt: now,
          reviewNote: trimmedReason,
        })
        .where(eq(actionUpdate.id, id));

      const submitterRef = await getPersonRef(updateRow.submittedBy, tx);
      const reviewerRef = await getPersonRef(actor.userId, tx);

      const result: TaskUpdateSubmissionDto = {
        id: updateRow.id,
        taskId: updateRow.taskId,
        actionCode: info.actionCode,
        taskName: info.taskName,
        periodKey: updateRow.periodKey,
        progress: updateRow.progress,
        note: updateRow.note,
        status: 'rejected',
        submittedBy: submitterRef,
        submittedAt: updateRow.submittedAt.toISOString(),
        reviewedBy: reviewerRef,
        reviewedAt: now.toISOString(),
        reviewNote: trimmedReason,
      };

      return {
        entityId: id,
        before: { status: updateRow.status },
        after: {
          id,
          status: 'rejected',
          reason: trimmedReason,
        },
        result,
      };
    },
    db
  );
}

/**
 * Duyệt nhiều bản trong một transaction (tối đa 100 mục)
 */
export async function bulkApprove(
  items: { kind: 'reading' | 'task_update'; id: string }[],
  actor: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<{ approved: number }> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền duyệt hàng loạt');
  }

  if (!items || items.length === 0 || items.length > 100) {
    throw new AppError('VALIDATION', 'Số lượng mục duyệt từ 1 đến 100');
  }

  // Kiểm tra trùng lặp
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) {
      throw new AppError('VALIDATION', 'Danh sách mục duyệt chứa mục trùng lặp');
    }
    seen.add(key);
  }

  return await db.transaction(async (tx) => {
    for (const item of items) {
      if (item.kind === 'reading') {
        try {
          await approveReading(item.id, actor, meta, tx);
        } catch (err: any) {
          throw new AppError(
            err.code || 'VALIDATION',
            err.message || 'Lỗi duyệt bản số liệu',
            { details: [{ kind: item.kind, id: item.id, code: err.code || 'VALIDATION', message: err.message }] }
          );
        }
      } else if (item.kind === 'task_update') {
        try {
          await approveTaskUpdate(item.id, actor, meta, tx);
        } catch (err: any) {
          throw new AppError(
            err.code || 'VALIDATION',
            err.message || 'Lỗi duyệt bản cập nhật tiến độ',
            { details: [{ kind: item.kind, id: item.id, code: err.code || 'VALIDATION', message: err.message }] }
          );
        }
      }
    }

    await writeAuditLog(
      {
        userId: actor.userId,
        action: 'bulk_approve',
        entity: 'approvals',
        entityId: items[0].id,
        after: { count: items.length, items },
        ip: meta?.ip,
      },
      tx
    );

    return { approved: items.length };
  });
}

/**
 * Hàng chờ duyệt (chỉ bản pending)
 * Sắp theo thời gian nộp, cũ trước (submittedAt asc)
 */
export async function getApprovals(
  query: {
    cycle?: number;
    kind?: 'reading' | 'task_update';
    period?: string;
    riskCode?: string;
  },
  actor: Actor | null,
  db: DbType = defaultDb
): Promise<ApprovalItemDto[]> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role === 'viewer') {
    throw new AppError('FORBIDDEN', 'Bạn không có quyền xem hàng chờ duyệt');
  }

  const activeCycle = await resolveActiveCycle(query.cycle, db as any);
  const activeAdmins = await getActiveAdminCount(db);
  const results: { item: ApprovalItemDto; submittedAt: Date }[] = [];

  const includeReading = !query.kind || query.kind === 'reading';
  const includeTaskUpdate = !query.kind || query.kind === 'task_update';

  // 1. Reading items
  if (includeReading) {
    const submitter = aliasedTable(appUser, 'submitter');
    const submitterUnit = aliasedTable(unit, 'submitter_unit');

    const rConditions = [
      eq(indicatorReading.status, 'pending'),
      eq(cycle.id, activeCycle.id),
    ];
    if (query.period) {
      rConditions.push(eq(indicatorReading.periodKey, query.period));
    }
    if (query.riskCode) {
      rConditions.push(eq(riskProfile.riskCode, query.riskCode));
    }
    if (actor.role === 'unit') {
      if (actor.unitId) {
        rConditions.push(eq(indicator.ownerUnitId, actor.unitId));
      } else {
        rConditions.push(eq(indicator.ownerUnitId, '00000000-0000-0000-0000-000000000000'));
      }
    }

    let rQuery = db
      .select({
        id: indicatorReading.id,
        indicatorId: indicatorReading.indicatorId,
        indicatorCode: indicator.code,
        indicatorName: indicator.name,
        periodKey: indicatorReading.periodKey,
        valueNum: indicatorReading.valueNum,
        valueText: indicatorReading.valueText,
        zone: indicatorReading.zone,
        zoneSource: indicatorReading.zoneSource,
        zoneNote: indicatorReading.zoneNote,
        note: indicatorReading.note,
        status: indicatorReading.status,
        submittedAt: indicatorReading.submittedAt,
        submitterId: submitter.id,
        submitterFullName: submitter.fullName,
        submitterUnitName: submitterUnit.name,
        closedAt: period.closedAt,
        riskCode: riskProfile.riskCode,
        ownerUnitId: indicator.ownerUnitId,
      })
      .from(indicatorReading)
      .innerJoin(indicator, eq(indicatorReading.indicatorId, indicator.id))
      .innerJoin(riskProfile, eq(indicator.profileId, riskProfile.id))
      .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
      .innerJoin(
        period,
        and(eq(period.cycleId, cycle.id), eq(period.key, indicatorReading.periodKey))
      )
      .leftJoin(submitter, eq(indicatorReading.submittedBy, submitter.id))
      .leftJoin(submitterUnit, eq(submitter.unitId, submitterUnit.id))
      .where(and(...rConditions));

    const rows = await rQuery;

    for (const r of rows) {
      // Current approved reading for indicator according to domain logic
      const approvedReadings = await db
        .select({
          id: indicatorReading.id,
          periodKey: indicatorReading.periodKey,
          valueNum: indicatorReading.valueNum,
          valueText: indicatorReading.valueText,
          zone: indicatorReading.zone,
          zoneSource: indicatorReading.zoneSource,
          reviewedAt: indicatorReading.reviewedAt,
          status: indicatorReading.status,
          periodStartsOn: period.startsOn,
          periodEndsOn: period.endsOn,
        })
        .from(indicatorReading)
        .innerJoin(indicator, eq(indicatorReading.indicatorId, indicator.id))
        .innerJoin(riskProfile, eq(indicator.profileId, riskProfile.id))
        .innerJoin(
          period,
          and(
            eq(period.cycleId, riskProfile.cycleId),
            eq(period.key, indicatorReading.periodKey)
          )
        )
        .where(
          and(
            eq(indicatorReading.indicatorId, r.indicatorId),
            eq(indicatorReading.status, 'approved')
          )
        );

      const latestApproved = currentReading(approvedReadings);

      const canApprove = canApproveSubmission({
        actor,
        submittedBy: r.submitterId,
        periodClosed: r.closedAt !== null,
        activeAdminCount: activeAdmins,
      });

      const currentDto: CurrentReadingDto | null = latestApproved
        ? {
            periodKey: latestApproved.periodKey,
            valueNum: latestApproved.valueNum !== null ? parseFloat(latestApproved.valueNum) : null,
            valueText: latestApproved.valueText ?? null,
            zone: latestApproved.zone as any,
            zoneSource: latestApproved.zoneSource as any,
            reviewedAt: latestApproved.reviewedAt ? latestApproved.reviewedAt.toISOString() : '',
          }
        : null;

      const item: ReadingApprovalItemDto = {
        kind: 'reading',
        riskCode: r.riskCode,
        targetName: r.indicatorName,
        submission: {
          id: r.id,
          indicatorId: r.indicatorId,
          indicatorCode: r.indicatorCode,
          periodKey: r.periodKey,
          valueNum: r.valueNum !== null ? parseFloat(r.valueNum) : null,
          valueText: r.valueText ?? null,
          zone: r.zone as any,
          zoneSource: r.zoneSource as any,
          zoneNote: r.zoneNote ?? null,
          note: r.note ?? null,
          status: 'pending',
          submittedBy: r.submitterFullName
            ? { fullName: r.submitterFullName, unitName: r.submitterUnitName ?? null }
            : null,
          submittedAt: r.submittedAt.toISOString(),
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: null,
        },
        current: currentDto,
        canApprove,
      };

      results.push({ item, submittedAt: r.submittedAt });
    }
  }

  // 2. Task update items
  if (includeTaskUpdate) {
    const submitter = aliasedTable(appUser, 'submitter_task');
    const submitterUnit = aliasedTable(unit, 'submitter_task_unit');

    const tConditions = [
      eq(actionUpdate.status, 'pending'),
      eq(cycle.id, activeCycle.id),
    ];
    if (query.period) {
      tConditions.push(eq(actionUpdate.periodKey, query.period));
    }
    if (query.riskCode) {
      tConditions.push(eq(riskProfile.riskCode, query.riskCode));
    }
    if (actor.role === 'unit') {
      if (actor.unitId) {
        tConditions.push(eq(actionTask.unitId, actor.unitId));
      } else {
        tConditions.push(eq(actionTask.unitId, '00000000-0000-0000-0000-000000000000'));
      }
    }

    let tQuery = db
      .select({
        id: actionUpdate.id,
        taskId: actionUpdate.taskId,
        taskName: actionTask.name,
        actionCode: actionPlan.code,
        actionPlanDescription: actionPlan.description,
        periodKey: actionUpdate.periodKey,
        progress: actionUpdate.progress,
        note: actionUpdate.note,
        status: actionUpdate.status,
        submittedAt: actionUpdate.submittedAt,
        submitterId: submitter.id,
        submitterFullName: submitter.fullName,
        submitterUnitName: submitterUnit.name,
        closedAt: period.closedAt,
        riskCode: riskProfile.riskCode,
        unitId: actionTask.unitId,
      })
      .from(actionUpdate)
      .innerJoin(actionTask, eq(actionUpdate.taskId, actionTask.id))
      .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
      .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
      .innerJoin(cycle, eq(riskProfile.cycleId, cycle.id))
      .innerJoin(
        period,
        and(eq(period.cycleId, cycle.id), eq(period.key, actionUpdate.periodKey))
      )
      .leftJoin(submitter, eq(actionUpdate.submittedBy, submitter.id))
      .leftJoin(submitterUnit, eq(submitter.unitId, submitterUnit.id))
      .where(and(...tConditions));

    const rows = await tQuery;

    for (const r of rows) {

      // Latest approved task update
      const [latestApproved] = await db
        .select({
          progress: actionUpdate.progress,
        })
        .from(actionUpdate)
        .where(
          and(
            eq(actionUpdate.taskId, r.taskId),
            eq(actionUpdate.status, 'approved')
          )
        )
        .orderBy(desc(actionUpdate.reviewedAt))
        .limit(1);

      const canApprove = canApproveSubmission({
        actor,
        submittedBy: r.submitterId,
        periodClosed: r.closedAt !== null,
        activeAdminCount: activeAdmins,
      });

      const item: TaskUpdateApprovalItemDto = {
        kind: 'task_update',
        riskCode: r.riskCode,
        targetName: r.actionPlanDescription,
        submission: {
          id: r.id,
          taskId: r.taskId,
          actionCode: r.actionCode,
          taskName: r.taskName,
          periodKey: r.periodKey,
          progress: r.progress,
          note: r.note ?? null,
          status: 'pending',
          submittedBy: r.submitterFullName
            ? { fullName: r.submitterFullName, unitName: r.submitterUnitName ?? null }
            : null,
          submittedAt: r.submittedAt.toISOString(),
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: null,
        },
        currentProgress: latestApproved ? latestApproved.progress : null,
        canApprove,
      };

      results.push({ item, submittedAt: r.submittedAt });
    }
  }

  // Sắp theo thời gian nộp, cũ trước (submittedAt asc)
  results.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

  return results.map((r) => r.item);
}
