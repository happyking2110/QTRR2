import { db as defaultDb } from '../db/client';
import {
  riskProfile,
  cause,
  impact,
  control,
  actionPlan,
  actionTask,
  actionUpdate,
  indicator,
  indicatorReading,
  residualAssessment,
} from '../db/schema';
import { withAudit } from './audit';
import { eq, and, isNull, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { AppError } from '../errors';
import type { Actor } from '../types';
import { levelScore } from '../../lib/domain/scales';
import { normalizeCode } from '../../lib/domain/codes';
import { resolveActiveCycle } from './cycles';
import { getProfiles, type ProfileSummaryDto } from './queries';

export type DbType = PostgresJsDatabase<typeof schema>;

export interface RatingInputPayload {
  impactLabel: string;
  likelihoodLabel: string;
  levelLabel: string;
}

export interface CreateProfilePayload {
  riskCode: string;
  hsrrCode: string;
  name: string;
  riskType: string;
  riskZone: string;
  riskGroup: string;
  owner: string;
  relatedActivity: string;
  preparedByUnit: string;
  description: string;
  inherent: RatingInputPayload;
}

export interface UpdateProfilePayload {
  hsrrCode: string;
  name: string;
  riskType: string;
  riskZone: string;
  riskGroup: string;
  owner: string;
  relatedActivity: string;
  preparedByUnit: string;
  description: string;
  inherent: RatingInputPayload;
}

function validateInherentRating(inherent: RatingInputPayload): {
  impactScore: number;
  likelihoodScore: number;
  impactLabel: string;
  likelihoodLabel: string;
  levelLabel: string;
} {
  let impactScore: number;
  try {
    impactScore = levelScore('impact', inherent.impactLabel);
  } catch {
    throw new AppError('VALIDATION', `Nhãn ảnh hưởng "${inherent.impactLabel}" không thuộc thang đo`, {
      fieldErrors: { 'inherent.impactLabel': 'Nhãn không thuộc thang đo' },
    });
  }

  let likelihoodScore: number;
  try {
    likelihoodScore = levelScore('likelihood', inherent.likelihoodLabel);
  } catch {
    throw new AppError('VALIDATION', `Nhãn khả năng "${inherent.likelihoodLabel}" không thuộc thang đo`, {
      fieldErrors: { 'inherent.likelihoodLabel': 'Nhãn không thuộc thang đo' },
    });
  }

  const trimmedLevel = inherent.levelLabel?.trim() ?? '';
  if (trimmedLevel.length < 1 || trimmedLevel.length > 50) {
    throw new AppError('VALIDATION', 'Nhãn mức rủi ro phải từ 1 đến 50 ký tự', {
      fieldErrors: { 'inherent.levelLabel': 'Nhãn mức rủi ro phải từ 1 đến 50 ký tự' },
    });
  }

  return {
    impactScore,
    likelihoodScore,
    impactLabel: inherent.impactLabel.trim(),
    likelihoodLabel: inherent.likelihoodLabel.trim(),
    levelLabel: trimmedLevel,
  };
}

export async function createProfile(
  body: CreateProfilePayload,
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ProfileSummaryDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin' && actor.role !== 'ban4') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên hoặc Ban 4 mới có quyền tạo hồ sơ rủi ro');
  }

  const cycleRow = await resolveActiveCycle(cycleParam, db);
  if (cycleRow.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể sửa đổi');
  }

  const normalizedRiskCode = normalizeCode(body.riskCode);
  if (!/^[A-Z0-9]+\.[A-Z0-9]+$/.test(normalizedRiskCode)) {
    throw new AppError('VALIDATION', 'Mã rủi ro không đúng định dạng', {
      fieldErrors: { riskCode: 'Định dạng mã rủi ro không hợp lệ (ví dụ: HD11.R27)' },
    });
  }

  const inherentValid = validateInherentRating(body.inherent);

  // Kiểm tra trùng mã (kể cả đã xóa mềm per 4.12 mục 3)
  const [existing] = await db
    .select({ id: riskProfile.id, riskCode: riskProfile.riskCode })
    .from(riskProfile)
    .where(and(eq(riskProfile.cycleId, cycleRow.id), eq(riskProfile.riskCode, normalizedRiskCode)));

  if (existing) {
    throw new AppError('CONFLICT', `Mã hồ sơ ${normalizedRiskCode} đã tồn tại trong chu kỳ`);
  }

  return await withAudit(
    actor,
    {
      action: 'create_profile',
      entity: 'risk_profile',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      const [inserted] = await tx
        .insert(riskProfile)
        .values({
          cycleId: cycleRow.id,
          riskCode: normalizedRiskCode,
          hsrrCode: body.hsrrCode.trim(),
          name: body.name.trim(),
          riskType: body.riskType.trim(),
          riskZone: body.riskZone.trim(),
          riskGroup: body.riskGroup.trim(),
          owner: body.owner.trim(),
          relatedActivity: body.relatedActivity.trim(),
          preparedByUnit: body.preparedByUnit.trim(),
          description: body.description.trim(),
          inherentImpact: inherentValid.impactLabel,
          inherentLikelihood: inherentValid.likelihoodLabel,
          inherentLevel: inherentValid.levelLabel,
          manuallyEditedAt: now,
        })
        .returning();

      const summaryDto: ProfileSummaryDto = {
        riskCode: inserted.riskCode,
        hsrrCode: inserted.hsrrCode,
        name: inserted.name,
        riskType: inserted.riskType,
        riskZone: inserted.riskZone,
        riskGroup: inserted.riskGroup,
        owner: inserted.owner,
        inherent: {
          impactLabel: inserted.inherentImpact,
          likelihoodLabel: inserted.inherentLikelihood,
          levelLabel: inserted.inherentLevel,
          impactScore: inherentValid.impactScore,
          likelihoodScore: inherentValid.likelihoodScore,
          score: inherentValid.impactScore * inherentValid.likelihoodScore,
        },
        residual: null,
        kri: { total: 0, green: 0, yellow: 0, red: 0, noData: 0 },
        kci: { total: 0, green: 0, yellow: 0, red: 0, noData: 0 },
        actions: { total: 0, completed: 0, overdue: 0, atRisk: 0, inProgress: 0, notStarted: 0 },
        actionProgress: null,
      };

      return {
        entityId: inserted.id,
        after: {
          riskCode: inserted.riskCode,
          hsrrCode: inserted.hsrrCode,
          name: inserted.name,
          manuallyEditedAt: now.toISOString(),
        },
        result: summaryDto,
      };
    },
    db
  );
}

export async function updateProfile(
  riskCode: string,
  body: UpdateProfilePayload,
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ProfileSummaryDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin' && actor.role !== 'ban4') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên hoặc Ban 4 mới có quyền sửa hồ sơ rủi ro');
  }

  const cycleRow = await resolveActiveCycle(cycleParam, db);
  if (cycleRow.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể sửa đổi');
  }

  const normalizedRiskCode = normalizeCode(riskCode);
  const inherentValid = validateInherentRating(body.inherent);

  const [existing] = await db
    .select()
    .from(riskProfile)
    .where(
      and(
        eq(riskProfile.cycleId, cycleRow.id),
        eq(riskProfile.riskCode, normalizedRiskCode),
        isNull(riskProfile.deletedAt)
      )
    );

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy hồ sơ rủi ro ${riskCode}`);
  }

  const before = {
    hsrrCode: existing.hsrrCode,
    name: existing.name,
    riskType: existing.riskType,
    riskZone: existing.riskZone,
    riskGroup: existing.riskGroup,
    owner: existing.owner,
    relatedActivity: existing.relatedActivity,
    preparedByUnit: existing.preparedByUnit,
    description: existing.description,
    inherentImpact: existing.inherentImpact,
    inherentLikelihood: existing.inherentLikelihood,
    inherentLevel: existing.inherentLevel,
    manuallyEditedAt: existing.manuallyEditedAt?.toISOString() ?? null,
  };

  return await withAudit(
    actor,
    {
      action: 'update_profile',
      entity: 'risk_profile',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();
      await tx
        .update(riskProfile)
        .set({
          hsrrCode: body.hsrrCode.trim(),
          name: body.name.trim(),
          riskType: body.riskType.trim(),
          riskZone: body.riskZone.trim(),
          riskGroup: body.riskGroup.trim(),
          owner: body.owner.trim(),
          relatedActivity: body.relatedActivity.trim(),
          preparedByUnit: body.preparedByUnit.trim(),
          description: body.description.trim(),
          inherentImpact: inherentValid.impactLabel,
          inherentLikelihood: inherentValid.likelihoodLabel,
          inherentLevel: inherentValid.levelLabel,
          manuallyEditedAt: now,
        })
        .where(eq(riskProfile.id, existing.id));

      const updatedProfiles = await getProfiles({ cycle: cycleRow.year }, tx);
      const updatedSummary = updatedProfiles.find((p) => p.riskCode === normalizedRiskCode);
      if (!updatedSummary) {
        throw new AppError('NOT_FOUND', `Không tìm thấy hồ sơ ${riskCode} sau khi cập nhật`);
      }

      return {
        entityId: existing.id,
        before,
        after: {
          hsrrCode: body.hsrrCode.trim(),
          name: body.name.trim(),
          manuallyEditedAt: now.toISOString(),
        },
        result: updatedSummary,
      };
    },
    db
  );
}

export async function deleteProfile(
  riskCode: string,
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<void> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin' && actor.role !== 'ban4') {
    throw new AppError('FORBIDDEN', 'Chỉ quản trị viên hoặc Ban 4 mới có quyền xóa hồ sơ rủi ro');
  }

  const cycleRow = await resolveActiveCycle(cycleParam, db);
  if (cycleRow.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể sửa đổi');
  }

  const normalizedRiskCode = normalizeCode(riskCode);

  const [existing] = await db
    .select()
    .from(riskProfile)
    .where(
      and(
        eq(riskProfile.cycleId, cycleRow.id),
        eq(riskProfile.riskCode, normalizedRiskCode),
        isNull(riskProfile.deletedAt)
      )
    );

  if (!existing) {
    throw new AppError('NOT_FOUND', `Không tìm thấy hồ sơ rủi ro ${riskCode}`);
  }

  // Kiểm tra ràng buộc tham chiếu (4.12 mục 5):
  // 1. Chỉ số có bản nộp (mọi trạng thái)
  const readings = await db
    .select({ code: indicator.code, periodKey: indicatorReading.periodKey })
    .from(indicatorReading)
    .innerJoin(indicator, eq(indicatorReading.indicatorId, indicator.id))
    .where(eq(indicator.profileId, existing.id));

  // 2. Kế hoạch hành động có đầu việc đã có bản cập nhật (mọi trạng thái)
  const updates = await db
    .select({ periodKey: actionUpdate.periodKey })
    .from(actionUpdate)
    .innerJoin(actionTask, eq(actionUpdate.taskId, actionTask.id))
    .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
    .where(eq(actionPlan.profileId, existing.id));

  // 3. Đã có mức rủi ro còn lại
  const residuals = await db
    .select({ periodKey: residualAssessment.periodKey })
    .from(residualAssessment)
    .where(eq(residualAssessment.profileId, existing.id));

  if (readings.length > 0 || updates.length > 0 || residuals.length > 0) {
    const details = [
      ...readings.map((r) => ({ kind: 'reading', code: r.code, periodKey: r.periodKey })),
      ...updates.map((u) => ({ kind: 'task_update', code: u.periodKey, periodKey: u.periodKey })),
      ...residuals.map((ra) => ({ kind: 'residual', code: ra.periodKey, periodKey: ra.periodKey })),
    ];
    throw new AppError('REFERENCED', 'Hồ sơ đã có số liệu nộp, bản cập nhật hoặc mức rủi ro còn lại, không thể xóa', {
      details,
    });
  }

  return await withAudit(
    actor,
    {
      action: 'delete_profile',
      entity: 'risk_profile',
      ip: meta?.ip,
    },
    async (tx) => {
      const now = new Date();

      // Xóa mềm hồ sơ
      await tx.update(riskProfile).set({ deletedAt: now }).where(eq(riskProfile.id, existing.id));

      // Xóa mềm nguyên nhân
      await tx
        .update(cause)
        .set({ deletedAt: now })
        .where(and(eq(cause.profileId, existing.id), isNull(cause.deletedAt)));

      // Xóa mềm ảnh hưởng
      await tx
        .update(impact)
        .set({ deletedAt: now })
        .where(and(eq(impact.profileId, existing.id), isNull(impact.deletedAt)));

      // Xóa mềm kiểm soát
      await tx
        .update(control)
        .set({ deletedAt: now })
        .where(and(eq(control.profileId, existing.id), isNull(control.deletedAt)));

      // Xóa mềm kế hoạch hành động và đầu việc
      const actionPlans = await tx
        .select({ id: actionPlan.id })
        .from(actionPlan)
        .where(eq(actionPlan.profileId, existing.id));

      const actionPlanIds = actionPlans.map((a) => a.id);
      if (actionPlanIds.length > 0) {
        await tx
          .update(actionTask)
          .set({ deletedAt: now })
          .where(and(inArray(actionTask.actionId, actionPlanIds), isNull(actionTask.deletedAt)));

        await tx
          .update(actionPlan)
          .set({ deletedAt: now })
          .where(and(inArray(actionPlan.id, actionPlanIds), isNull(actionPlan.deletedAt)));
      }

      // Xóa mềm chỉ số
      await tx
        .update(indicator)
        .set({ deletedAt: now })
        .where(and(eq(indicator.profileId, existing.id), isNull(indicator.deletedAt)));

      return {
        entityId: existing.id,
        before: {
          riskCode: existing.riskCode,
          name: existing.name,
          hsrrCode: existing.hsrrCode,
        },
        result: undefined,
      };
    },
    db
  );
}
