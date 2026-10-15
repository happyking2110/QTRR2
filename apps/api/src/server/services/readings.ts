import { eq, and, desc, aliasedTable } from 'drizzle-orm';
import { defaultDb } from '../db/client';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import {
  indicator,
  indicatorReading,
  riskProfile,
  cycle,
  period,
  appUser,
  unit,
} from '../db/schema';

export type DbType = PostgresJsDatabase<typeof schema>;
import { AppError } from '../errors';
import { evaluateZone, evaluateNumericZone, type Zone, type ThresholdSet } from '../../lib/domain/thresholds';
import { getVietnamDateString } from '../auth/policy';
import { withAudit, writeAuditLog } from './audit';
import { getPersonRef, type PersonRefDto } from './users';
import type { Actor } from '../types';
import crypto from 'crypto';

export interface ReadingSubmissionDto {
  id: string;
  indicatorId: string;
  indicatorCode: string;
  periodKey: string;
  valueNum: number | null;
  valueText: string | null;
  zone: Zone;
  zoneSource: 'auto' | 'manual';
  zoneNote: string | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  submittedBy: PersonRefDto | null;
  submittedAt: string;
  reviewedBy: PersonRefDto | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface SubmitReadingPayload {
  periodKey: string;
  valueNum?: number | null;
  valueText?: string | null;
  zone?: Zone | null;
  zoneNote?: string | null;
  note?: string | null;
}

function toThresholdSet(raw: unknown): ThresholdSet {
  if (Array.isArray(raw)) {
    return { mode: 'auto', rules: raw as any };
  }
  return raw as ThresholdSet;
}

/**
 * Xem trước vùng của một giá trị trước khi nộp (server tính, cùng hàm với lúc nộp)
 */
export async function getZonePreview(
  indicatorId: string,
  value: number,
  db: DbType = defaultDb
): Promise<{ mode: 'auto' | 'manual'; zone: Zone | null }> {
  const [ind] = await db
    .select({
      id: indicator.id,
      unitKind: indicator.unitKind,
      direction: indicator.direction,
      yellowAt: indicator.yellowAt,
      redAt: indicator.redAt,
      zoneRules: indicator.zoneRules,
    })
    .from(indicator)
    .where(eq(indicator.id, indicatorId));

  if (!ind) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy chỉ số');
  }

  // 4.13 mục 5: Kiểm tra giá trị nộp
  if (ind.unitKind === 'percent') {
    if (value < 0 || value > 100) {
      throw new AppError('VALIDATION', 'Giá trị số phần trăm phải từ 0 đến 100', {
        fieldErrors: { valueNum: 'Giá trị phải từ 0 đến 100' },
      });
    }
  } else if (ind.unitKind === 'count') {
    if (!Number.isInteger(value) || value < 0) {
      throw new AppError('VALIDATION', 'Giá trị số lượng phải là số nguyên ≥ 0', {
        fieldErrors: { valueNum: 'Giá trị phải là số nguyên ≥ 0' },
      });
    }
  }

  const yellowAt = ind.yellowAt !== null ? Number(ind.yellowAt) : null;
  const redAt = ind.redAt !== null ? Number(ind.redAt) : null;
  const isNumericAuto = yellowAt !== null && redAt !== null && ind.direction !== null;

  if (isNumericAuto) {
    const zone = evaluateNumericZone(value, {
      direction: ind.direction,
      yellowAt,
      redAt,
    });
    return { mode: 'auto', zone };
  }

  if (ind.zoneRules) {
    const zone = evaluateZone(value, toThresholdSet(ind.zoneRules));
    return { mode: 'auto', zone };
  }

  return { mode: 'manual', zone: null };
}

/**
 * Nộp số liệu chỉ số cho một kỳ (tạo bản chờ duyệt)
 * Kiểm tra theo backend-design 5.1 và 4.11 (5, 17).
 */
export async function submitReading(
  indicatorId: string,
  payload: SubmitReadingPayload,
  actor: Actor | null,
  meta?: { today?: string; ip?: string },
  db: DbType = defaultDb
): Promise<ReadingSubmissionDto> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  return await withAudit(
    actor,
    {
      action: 'submit_reading',
      entity: 'indicator_reading',
      ip: meta?.ip,
    },
    async (tx) => {
      // 1. Tìm chỉ số
      const [ind] = await tx.select().from(indicator).where(eq(indicator.id, indicatorId));
      if (!ind) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy chỉ số');
      }

      // Lấy cycleId qua riskProfile
      const [prof] = await tx
        .select({ cycleId: riskProfile.cycleId })
        .from(riskProfile)
        .where(eq(riskProfile.id, ind.profileId));
      if (!prof) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy hồ sơ của chỉ số');
      }

      // Chu kỳ
      const [cyc] = await tx.select().from(cycle).where(eq(cycle.id, prof.cycleId));
      if (!cyc || cyc.status === 'archived') {
        throw new AppError('CYCLE_ARCHIVED', 'Chu kỳ đã lưu trữ không thể nộp số liệu');
      }

      // Kỳ (khóa chia sẻ FOR SHARE để tránh đóng kỳ khi đang nộp)
      const [p] = await tx
        .select()
        .from(period)
        .where(and(eq(period.cycleId, prof.cycleId), eq(period.key, payload.periodKey)))
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

      // Tần suất chỉ số khớp loại kỳ
      if (ind.periodKind !== p.kind) {
        throw new AppError('VALIDATION', 'Loại kỳ không khớp tần suất của chỉ số');
      }

      // 2. Quyền nộp theo mục
      if (actor.role === 'viewer') {
        throw new AppError('FORBIDDEN', 'Bạn không có quyền nộp số liệu');
      }
      if (actor.role === 'unit') {
        if (!ind.ownerUnitId || ind.ownerUnitId !== actor.unitId) {
          throw new AppError('FORBIDDEN', 'Bạn không có quyền nộp số liệu cho chỉ số này');
        }
      }

      // 3 & 4. Kiểm tra giá trị và vùng
      let finalZone: Zone;
      let finalZoneSource: 'auto' | 'manual';
      let finalZoneNote: string | null = null;
      const finalValueNum = payload.valueNum !== undefined ? payload.valueNum : null;
      const finalValueText = payload.valueText !== undefined ? payload.valueText : null;

      const yellowAt = ind.yellowAt !== null ? Number(ind.yellowAt) : null;
      const redAt = ind.redAt !== null ? Number(ind.redAt) : null;
      const isNumericAuto = yellowAt !== null && redAt !== null && ind.direction !== null;
      const isAuto = isNumericAuto || ind.zoneRules !== null;

      if (isAuto) {
        // Chỉ số tự động
        if (
          payload.valueNum === undefined ||
          payload.valueNum === null ||
          typeof payload.valueNum !== 'number'
        ) {
          throw new AppError('VALIDATION', 'Chỉ số tự động bắt buộc có giá trị số', {
            fieldErrors: { valueNum: 'Chỉ số tự động bắt buộc có giá trị số' },
          });
        }

        // Validate theo unitKind (4.13 mục 5)
        if (ind.unitKind === 'percent') {
          if (payload.valueNum < 0 || payload.valueNum > 100) {
            throw new AppError('VALIDATION', 'Giá trị số phần trăm phải từ 0 đến 100', {
              fieldErrors: { valueNum: 'Giá trị phải từ 0 đến 100' },
            });
          }
        } else if (ind.unitKind === 'count') {
          if (!Number.isInteger(payload.valueNum) || payload.valueNum < 0) {
            throw new AppError('VALIDATION', 'Giá trị số lượng phải là số nguyên ≥ 0', {
              fieldErrors: { valueNum: 'Giá trị phải là số nguyên ≥ 0' },
            });
          }
        }

        let evalZone: Zone | null = null;
        if (isNumericAuto) {
          evalZone = evaluateNumericZone(payload.valueNum, {
            direction: ind.direction,
            yellowAt,
            redAt,
          });
        } else if (ind.zoneRules) {
          evalZone = evaluateZone(payload.valueNum, toThresholdSet(ind.zoneRules));
        }

        if (!evalZone) {
          throw new AppError('VALIDATION', 'Không thể xác định vùng cho giá trị này', {
            fieldErrors: { valueNum: 'Không thể xác định vùng cho giá trị này' },
          });
        }
        finalZone = evalZone;
        finalZoneSource = 'auto';
        finalZoneNote = null; // Bỏ qua zone và zoneNote client gửi
      } else {
        // Chỉ số thủ công
        if (!payload.zone || !['green', 'yellow', 'red'].includes(payload.zone)) {
          throw new AppError('VALIDATION', 'Chỉ số thủ công bắt buộc chọn vùng');
        }
        const trimmed = (payload.zoneNote ?? '').trim();
        if (trimmed.length < 10) {
          throw new AppError('VALIDATION', 'Lý do chọn vùng tối thiểu 10 ký tự');
        }
        if (payload.valueNum !== undefined && payload.valueNum !== null) {
          if (ind.unitKind === 'percent') {
            if (payload.valueNum < 0 || payload.valueNum > 100) {
              throw new AppError('VALIDATION', 'Giá trị số phần trăm phải từ 0 đến 100', {
                fieldErrors: { valueNum: 'Giá trị phải từ 0 đến 100' },
              });
            }
          } else if (ind.unitKind === 'count') {
            if (!Number.isInteger(payload.valueNum) || payload.valueNum < 0) {
              throw new AppError('VALIDATION', 'Giá trị số lượng phải là số nguyên ≥ 0', {
                fieldErrors: { valueNum: 'Giá trị phải là số nguyên ≥ 0' },
              });
            }
          }
        }
        finalZone = payload.zone as Zone;
        finalZoneSource = 'manual';
        finalZoneNote = trimmed;
      }

      // 5. Lưu vào DB trong transaction
      const readingId = crypto.randomUUID();
      const now = new Date();

      await tx.insert(indicatorReading).values({
        id: readingId,
        indicatorId: ind.id,
        periodKey: p.key,
        valueNum: finalValueNum !== null ? String(finalValueNum) : null,
        valueText: finalValueText,
        zone: finalZone,
        zoneSource: finalZoneSource,
        zoneNote: finalZoneNote,
        note: payload.note ?? null,
        status: 'pending',
        submittedBy: actor.userId,
        submittedAt: now,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      });

      const submitterRef = await getPersonRef(actor.userId, tx);

      const result: ReadingSubmissionDto = {
        id: readingId,
        indicatorId: ind.id,
        indicatorCode: ind.code,
        periodKey: p.key,
        valueNum: finalValueNum,
        valueText: finalValueText,
        zone: finalZone,
        zoneSource: finalZoneSource,
        zoneNote: finalZoneNote,
        note: payload.note ?? null,
        status: 'pending',
        submittedBy: submitterRef,
        submittedAt: now.toISOString(),
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      };

      return {
        entityId: readingId,
        after: {
          id: readingId,
          indicatorId: ind.id,
          periodKey: p.key,
          valueNum: finalValueNum,
          valueText: finalValueText,
          zone: finalZone,
          zoneSource: finalZoneSource,
          zoneNote: finalZoneNote,
          note: payload.note ?? null,
          status: 'pending',
        },
        result,
      };
    },
    db
  );
}

/**
 * Lịch sử bản nộp số liệu của một chỉ số (mọi trạng thái), mới trước
 */
export async function getIndicatorReadings(
  indicatorId: string,
  filter: { period?: string },
  actor: Actor | null,
  db: DbType = defaultDb
): Promise<ReadingSubmissionDto[]> {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  }

  const [ind] = await db.select().from(indicator).where(eq(indicator.id, indicatorId));
  if (!ind) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy chỉ số');
  }

  if (actor.role === 'viewer') {
    throw new AppError('FORBIDDEN', 'Bạn không có quyền xem lịch sử bản nộp');
  }
  if (actor.role === 'unit') {
    if (!ind.ownerUnitId || ind.ownerUnitId !== actor.unitId) {
      throw new AppError('FORBIDDEN', 'Bạn không có quyền xem lịch sử bản nộp của chỉ số đơn vị khác');
    }
  }

  const submitter = aliasedTable(appUser, 'submitter');
  const submitterUnit = aliasedTable(unit, 'submitter_unit');
  const reviewer = aliasedTable(appUser, 'reviewer');
  const reviewerUnit = aliasedTable(unit, 'reviewer_unit');

  const rows = await db
    .select({
      id: indicatorReading.id,
      indicatorId: indicatorReading.indicatorId,
      indicatorCode: indicator.code,
      periodKey: indicatorReading.periodKey,
      valueNum: indicatorReading.valueNum,
      valueText: indicatorReading.valueText,
      zone: indicatorReading.zone,
      zoneSource: indicatorReading.zoneSource,
      zoneNote: indicatorReading.zoneNote,
      note: indicatorReading.note,
      status: indicatorReading.status,
      submittedAt: indicatorReading.submittedAt,
      submitterFullName: submitter.fullName,
      submitterUnitName: submitterUnit.name,
      reviewedAt: indicatorReading.reviewedAt,
      reviewNote: indicatorReading.reviewNote,
      reviewerFullName: reviewer.fullName,
      reviewerUnitName: reviewerUnit.name,
    })
    .from(indicatorReading)
    .innerJoin(indicator, eq(indicatorReading.indicatorId, indicator.id))
    .leftJoin(submitter, eq(indicatorReading.submittedBy, submitter.id))
    .leftJoin(submitterUnit, eq(submitter.unitId, submitterUnit.id))
    .leftJoin(reviewer, eq(indicatorReading.reviewedBy, reviewer.id))
    .leftJoin(reviewerUnit, eq(reviewer.unitId, reviewerUnit.id))
    .where(
      filter.period
        ? and(
            eq(indicatorReading.indicatorId, indicatorId),
            eq(indicatorReading.periodKey, filter.period)
          )
        : eq(indicatorReading.indicatorId, indicatorId)
    )
    .orderBy(desc(indicatorReading.submittedAt));

  return rows.map((r) => ({
    id: r.id,
    indicatorId: r.indicatorId,
    indicatorCode: r.indicatorCode,
    periodKey: r.periodKey,
    valueNum: r.valueNum !== null ? parseFloat(r.valueNum) : null,
    valueText: r.valueText ?? null,
    zone: r.zone as Zone,
    zoneSource: r.zoneSource as 'auto' | 'manual',
    zoneNote: r.zoneNote ?? null,
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
