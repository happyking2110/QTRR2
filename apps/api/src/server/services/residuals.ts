import { db as defaultDb } from '../db/client';
import {
  cycle,
  period,
  riskProfile,
  residualAssessment,
} from '../db/schema';
import { withAudit } from './audit';
import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { AppError } from '../errors';
import type { Actor } from '../types';
import { levelScore } from '../../lib/domain/scales';
import { resolveActiveCycle } from './cycles';
import type { ResidualEntryDto } from './queries';

export type DbType = PostgresJsDatabase<typeof schema>;

export interface SetResidualPayload {
  impactLabel: string;
  likelihoodLabel: string;
  levelLabel: string;
}

export async function setResidual(
  riskCode: string,
  periodKey: string,
  body: SetResidualPayload,
  cycleParam?: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: DbType = defaultDb
): Promise<ResidualEntryDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  if (actor.role !== 'admin' && actor.role !== 'ban4') {
    throw new AppError(
      'FORBIDDEN',
      'Chỉ quản trị viên hoặc Ban 4 mới có quyền cập nhật rủi ro còn lại'
    );
  }

  const quarterKeyPattern = /^[0-9]{4}-Q[1-4]$/;
  if (!quarterKeyPattern.test(periodKey)) {
    throw new AppError('VALIDATION', 'Khóa kỳ phải có định dạng quý YYYY-Qx (ví dụ 2026-Q4)');
  }

  let impactScore: number;
  let likelihoodScore: number;

  try {
    impactScore = levelScore('impact', body.impactLabel);
  } catch {
    throw new AppError('VALIDATION', `Nhãn ảnh hưởng "${body.impactLabel}" không thuộc thang đo`);
  }

  try {
    likelihoodScore = levelScore('likelihood', body.likelihoodLabel);
  } catch {
    throw new AppError(
      'VALIDATION',
      `Nhãn khả năng "${body.likelihoodLabel}" không thuộc thang đo`
    );
  }

  const trimmedLevel = body.levelLabel?.trim() ?? '';
  if (trimmedLevel.length < 1 || trimmedLevel.length > 50) {
    throw new AppError('VALIDATION', 'Nhãn mức rủi ro phải từ 1 đến 50 ký tự');
  }

  const cycleRow = await resolveActiveCycle(cycleParam, db);
  if (cycleRow.status === 'archived') {
    throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể sửa đổi');
  }

  const [periodRow] = await db
    .select()
    .from(period)
    .where(and(eq(period.cycleId, cycleRow.id), eq(period.key, periodKey)));

  if (!periodRow) {
    throw new AppError('PERIOD_NOT_FOUND', `Không tìm thấy kỳ ${periodKey} trong chu kỳ`);
  }

  if (periodRow.closedAt !== null) {
    throw new AppError('PERIOD_CLOSED', 'Kỳ đã bị khóa không thể cập nhật rủi ro còn lại');
  }

  const [profileRow] = await db
    .select()
    .from(riskProfile)
    .where(and(eq(riskProfile.cycleId, cycleRow.id), eq(riskProfile.riskCode, riskCode)));

  if (!profileRow) {
    throw new AppError('NOT_FOUND', `Không tìm thấy hồ sơ rủi ro ${riskCode}`);
  }

  const [existing] = await db
    .select()
    .from(residualAssessment)
    .where(
      and(
        eq(residualAssessment.profileId, profileRow.id),
        eq(residualAssessment.periodKey, periodKey)
      )
    );

  const before = existing
    ? {
        impact: existing.impact,
        likelihood: existing.likelihood,
        level: existing.level,
      }
    : null;

  const after = {
    impact: body.impactLabel.trim(),
    likelihood: body.likelihoodLabel.trim(),
    level: trimmedLevel,
  };

  const resultDto: ResidualEntryDto = {
    periodKey,
    rating: {
      impactLabel: after.impact,
      likelihoodLabel: after.likelihood,
      levelLabel: after.level,
      impactScore,
      likelihoodScore,
      score: impactScore * likelihoodScore,
    },
  };

  return await withAudit(
    actor,
    {
      action: 'set_residual',
      entity: 'residual_assessment',
    },
    async (tx) => {
      await tx
        .insert(residualAssessment)
        .values({
          profileId: profileRow.id,
          periodKey,
          impact: after.impact,
          likelihood: after.likelihood,
          level: after.level,
          enteredBy: actor.userId,
          enteredAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [residualAssessment.profileId, residualAssessment.periodKey],
          set: {
            impact: after.impact,
            likelihood: after.likelihood,
            level: after.level,
            enteredBy: actor.userId,
            enteredAt: new Date(),
          },
        });

      return {
        entityId: profileRow.id,
        before,
        after,
        result: resultDto,
      };
    },
    db
  );
}
