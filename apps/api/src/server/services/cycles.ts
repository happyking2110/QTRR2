import { eq, and, isNull, desc, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db as defaultDb } from '../db/client';
import * as schema from '../db/schema';
import {
  cycle,
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
  period,
  unitAssignment,
} from '../db/schema';
import { readWorkbook, type ParsedProfile } from '../../lib/import/read-workbook';
import { validate, type ImportIssue } from '../../lib/import/validate';
import { parseThresholdSet, inferIndicatorUnit, inferDirection } from '../../lib/domain/thresholds';
import { withAudit } from './audit';
import { ensurePeriods } from './periods';
import type { Actor } from '../types';
import { AppError } from '../errors';

export type { Actor };

function checkActorPermission(actor?: Actor | null): void {
  if (actor !== undefined && actor !== null) {
    if (actor.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này');
    }
  }
}

/**
 * Lấy chu kỳ theo năm (nếu chỉ định) hoặc chu kỳ đang mở có năm lớn nhất.
 * Dùng chung cho mọi service (truy vấn và gán) theo S2 / CycleParam OpenAPI.
 */
export async function resolveActiveCycle(
  cycleYear?: number,
  db: PostgresJsDatabase<typeof schema> = defaultDb
): Promise<typeof cycle.$inferSelect> {
  if (cycleYear !== undefined) {
    const [found] = await db
      .select()
      .from(cycle)
      .where(eq(cycle.year, cycleYear))
      .limit(1);
    if (!found) {
      throw new AppError('NOT_FOUND', `Không tìm thấy chu kỳ năm ${cycleYear}`);
    }
    return found;
  }

  const [openCycle] = await db
    .select()
    .from(cycle)
    .where(eq(cycle.status, 'open'))
    .orderBy(desc(cycle.year))
    .limit(1);

  if (openCycle) {
    return openCycle;
  }

  // Fallback nếu không có chu kỳ nào đang mở
  const [anyCycle] = await db
    .select()
    .from(cycle)
    .orderBy(desc(cycle.year))
    .limit(1);

  if (!anyCycle) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy chu kỳ hoạt động');
  }

  return anyCycle;
}

export interface ImportCycleParams {
  year: number;
  file: Parameters<typeof readWorkbook>[0];
  actor: Actor | null;
}

export interface ImportCycleCountsDto {
  profiles: number;
  causes: number;
  impacts: number;
  controls: number;
  actions: number;
  tasksCreated: number;
  kri: number;
  kci: number;
  periodsCreated: number;
}

export interface ImportCycleReport {
  year: number;
  counts: ImportCycleCountsDto;
  issues: ImportIssue[];

  // Thuộc tính tương thích ngược cho các service / test cũ
  cycleId: string;
  profilesCount: number;
  causesCount: number;
  impactsCount: number;
  controlsCount: number;
  actionsCount: number;
  actionTasksCount: number;
  kriCount: number;
  kciCount: number;
  autoIndicatorsCount: number;
  manualIndicatorsCount: number;
  warnings: ImportIssue[];
}

/**
 * Chuyển tần suất trong Excel thành period_kind theo backend-design 7.1.1
 */
function mapPeriodKind(freq: string, indicatorCode: string): 'month' | 'quarter' | 'event' {
  const trimmed = freq.trim();
  if (trimmed === 'Tháng') return 'month';
  if (trimmed === 'Quý' || trimmed === 'Hàng quý') return 'quarter';
  if (trimmed === 'Theo đợt diễn tập') return 'event';
  throw new AppError(
    'IMPORT_INVALID',
    `Chỉ số ${indicatorCode} có tần suất không hợp lệ: "${freq}" (chỉ chấp nhận Tháng, Quý, Hàng quý, Theo đợt diễn tập)`
  );
}

/**
 * Import chu kỳ quản lý rủi ro từ file Excel BM06 trong một transaction duy nhất có nhật ký audit_log
 * Theo backend-design 7.1 và 4.12 mục 2
 */
export async function importCycle(
  params: ImportCycleParams,
  db: PostgresJsDatabase<typeof schema> = defaultDb
): Promise<ImportCycleReport> {
  const { year, file, actor } = params;

  // 1. Đọc file Excel thành danh sách ParsedProfile
  let profiles: ParsedProfile[];
  try {
    profiles = await readWorkbook(file);
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('IMPORT_INVALID:')) {
      throw new AppError('IMPORT_INVALID', msg.replace(/^IMPORT_INVALID:\s*/, ''));
    }
    throw err;
  }

  // 2. Kiểm tra tính toàn vẹn và hợp lệ
  const issues = validate(profiles);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings: ImportIssue[] = issues.filter((i) => i.level === 'warning');

  if (errors.length > 0) {
    const errorDetails = errors
      .map((e) => `[${e.profileCode || ''}${e.itemCode ? ` / ${e.itemCode}` : ''}] ${e.message}`)
      .join('; ');
    throw new AppError('IMPORT_INVALID', errorDetails, { details: errors });
  }

  // 3. Thực thi ghi dữ liệu trong transaction có audit_log
  return await withAudit(
    actor,
    { action: 'import_cycle', entity: 'cycle' },
    async (tx) => {
      // 3.1 Tạo hoặc lấy chu kỳ theo năm
      const existingCycles = await tx.select().from(cycle).where(eq(cycle.year, year));
      let cycleRecord = existingCycles[0];

      if (cycleRecord) {
        if (cycleRecord.status === 'archived') {
          throw new AppError(
            'CYCLE_ARCHIVED',
            `Chu kỳ năm ${year} đã lưu trữ (archived), không thể import`
          );
        }
      } else {
        const [newCycle] = await tx
          .insert(cycle)
          .values({ year, status: 'open' })
          .returning();
        cycleRecord = newCycle;
      }

      const cycleId = cycleRecord.id;

      let totalCauses = 0;
      let totalImpacts = 0;
      let totalControls = 0;
      let totalActions = 0;
      let totalActionTasks = 0;
      let totalActionTasksCreated = 0;
      let totalKri = 0;
      let totalKci = 0;
      let autoIndicators = 0;
      let manualIndicators = 0;

      // 3.2 Lặp qua từng hồ sơ
      for (const p of profiles) {
        let profileId: string;

        const [existingProf] = await tx
          .select()
          .from(riskProfile)
          .where(and(eq(riskProfile.cycleId, cycleId), eq(riskProfile.riskCode, p.riskCode)));

        if (existingProf) {
          profileId = existingProf.id;
          if (existingProf.deletedAt !== null) {
            warnings.push({
              level: 'warning',
              code: 'SKIPPED_DELETED',
              message: `Bỏ qua hồ sơ đã xóa mềm: ${p.riskCode}`,
              ref: p.riskCode,
              profileCode: p.riskCode,
            });
          } else if (existingProf.manuallyEditedAt !== null) {
            warnings.push({
              level: 'warning',
              code: 'SKIPPED_EDITED',
              message: `Bỏ qua hồ sơ đã sửa tay: ${p.riskCode}`,
              ref: p.riskCode,
              profileCode: p.riskCode,
            });
          } else {
            await tx
              .update(riskProfile)
              .set({
                hsrrCode: p.hsrrCode,
                name: p.name,
                riskType: p.riskType,
                riskZone: p.riskZone,
                riskGroup: p.riskGroup,
                owner: p.owner,
                relatedActivity: p.relatedActivity,
                preparedByUnit: p.preparedByUnit,
                description: p.description,
                inherentImpact: p.inherent.impact,
                inherentLikelihood: p.inherent.likelihood,
                inherentLevel: p.inherent.level,
              })
              .where(eq(riskProfile.id, existingProf.id));
          }
        } else {
          const [newProf] = await tx
            .insert(riskProfile)
            .values({
              cycleId,
              riskCode: p.riskCode,
              hsrrCode: p.hsrrCode,
              name: p.name,
              riskType: p.riskType,
              riskZone: p.riskZone,
              riskGroup: p.riskGroup,
              owner: p.owner,
              relatedActivity: p.relatedActivity,
              preparedByUnit: p.preparedByUnit,
              description: p.description,
              inherentImpact: p.inherent.impact,
              inherentLikelihood: p.inherent.likelihood,
              inherentLevel: p.inherent.level,
            })
            .returning();
          profileId = newProf.id;
        }

        // --- CAUSES ---
        const causeMap = new Map<string, string>();
        const causeIsEdited = new Map<string, boolean>();
        const uneditedCauseIds: string[] = [];

        for (const c of p.causes) {
          const [existingCause] = await tx
            .select()
            .from(cause)
            .where(and(eq(cause.profileId, profileId), eq(cause.code, c.code)));

          if (existingCause) {
            causeMap.set(c.code, existingCause.id);
            if (existingCause.deletedAt !== null) {
              causeIsEdited.set(c.code, true);
              warnings.push({
                level: 'warning',
                code: 'SKIPPED_DELETED',
                message: `Bỏ qua nguyên nhân đã xóa mềm: ${c.code}`,
                ref: c.code,
                profileCode: p.riskCode,
                itemCode: c.code,
              });
            } else if (existingCause.manuallyEditedAt !== null) {
              causeIsEdited.set(c.code, true);
              totalCauses++;
              warnings.push({
                level: 'warning',
                code: 'SKIPPED_EDITED',
                message: `Bỏ qua nguyên nhân đã sửa tay: ${c.code}`,
                ref: c.code,
                profileCode: p.riskCode,
                itemCode: c.code,
              });
            } else {
              causeIsEdited.set(c.code, false);
              uneditedCauseIds.push(existingCause.id);
              totalCauses++;
              await tx
                .update(cause)
                .set({
                  causeGroup: c.group,
                  description: c.description,
                })
                .where(eq(cause.id, existingCause.id));
            }
          } else {
            const [newCause] = await tx
              .insert(cause)
              .values({
                profileId,
                code: c.code,
                causeGroup: c.group,
                description: c.description,
              })
              .returning();
            causeMap.set(c.code, newCause.id);
            causeIsEdited.set(c.code, false);
            uneditedCauseIds.push(newCause.id);
            totalCauses++;
          }
        }

        // --- IMPACTS ---
        for (const imp of p.impacts) {
          const [existingImp] = await tx
            .select()
            .from(impact)
            .where(and(eq(impact.profileId, profileId), eq(impact.code, imp.code)));

          if (existingImp) {
            if (existingImp.deletedAt !== null) {
              warnings.push({
                level: 'warning',
                code: 'SKIPPED_DELETED',
                message: `Bỏ qua ảnh hưởng đã xóa mềm: ${imp.code}`,
                ref: imp.code,
                profileCode: p.riskCode,
                itemCode: imp.code,
              });
            } else if (existingImp.manuallyEditedAt !== null) {
              totalImpacts++;
              warnings.push({
                level: 'warning',
                code: 'SKIPPED_EDITED',
                message: `Bỏ qua ảnh hưởng đã sửa tay: ${imp.code}`,
                ref: imp.code,
                profileCode: p.riskCode,
                itemCode: imp.code,
              });
            } else {
              totalImpacts++;
              await tx
                .update(impact)
                .set({
                  impactGroup: imp.group,
                  description: imp.description,
                  level: imp.level,
                })
                .where(eq(impact.id, existingImp.id));
            }
          } else {
            await tx.insert(impact).values({
              profileId,
              code: imp.code,
              impactGroup: imp.group,
              description: imp.description,
              level: imp.level,
            });
            totalImpacts++;
          }
        }

        // --- CONTROLS ---
        const controlMap = new Map<string, string>();
        const controlIsEdited = new Map<string, boolean>();
        const uneditedControlIds: string[] = [];

        for (const ctrl of p.controls) {
          const [existingCtrl] = await tx
            .select()
            .from(control)
            .where(and(eq(control.profileId, profileId), eq(control.code, ctrl.code)));

          if (existingCtrl) {
            controlMap.set(ctrl.code, existingCtrl.id);
            if (existingCtrl.deletedAt !== null) {
              controlIsEdited.set(ctrl.code, true);
              warnings.push({
                level: 'warning',
                code: 'SKIPPED_DELETED',
                message: `Bỏ qua kiểm soát đã xóa mềm: ${ctrl.code}`,
                ref: ctrl.code,
                profileCode: p.riskCode,
                itemCode: ctrl.code,
              });
            } else if (existingCtrl.manuallyEditedAt !== null) {
              controlIsEdited.set(ctrl.code, true);
              totalControls++;
              warnings.push({
                level: 'warning',
                code: 'SKIPPED_EDITED',
                message: `Bỏ qua kiểm soát đã sửa tay: ${ctrl.code}`,
                ref: ctrl.code,
                profileCode: p.riskCode,
                itemCode: ctrl.code,
              });
            } else {
              controlIsEdited.set(ctrl.code, false);
              uneditedControlIds.push(existingCtrl.id);
              totalControls++;
              await tx
                .update(control)
                .set({
                  description: ctrl.description,
                  ownerText: ctrl.ownerText,
                  frequency: ctrl.frequency,
                  objective: ctrl.objective,
                  method: ctrl.method,
                  designEff: ctrl.designEff,
                  operatingEff: ctrl.operatingEff,
                  overallEff: ctrl.overallEff,
                  needsSupplement: ctrl.needsSupplement,
                })
                .where(eq(control.id, existingCtrl.id));
            }
          } else {
            const [newCtrl] = await tx
              .insert(control)
              .values({
                profileId,
                code: ctrl.code,
                description: ctrl.description,
                ownerText: ctrl.ownerText,
                frequency: ctrl.frequency,
                objective: ctrl.objective,
                method: ctrl.method,
                designEff: ctrl.designEff,
                operatingEff: ctrl.operatingEff,
                overallEff: ctrl.overallEff,
                needsSupplement: ctrl.needsSupplement,
              })
              .returning();
            controlMap.set(ctrl.code, newCtrl.id);
            controlIsEdited.set(ctrl.code, false);
            uneditedControlIds.push(newCtrl.id);
            totalControls++;
          }
        }

        // --- ACTION PLANS ---
        const actionMap = new Map<string, string>();
        const actionIsEdited = new Map<string, boolean>();
        const uneditedActionIds: string[] = [];

        for (const act of p.actions) {
          const [existingAct] = await tx
            .select()
            .from(actionPlan)
            .where(and(eq(actionPlan.profileId, profileId), eq(actionPlan.code, act.code)));

          if (existingAct) {
            actionMap.set(act.code, existingAct.id);
            if (existingAct.deletedAt !== null) {
              actionIsEdited.set(act.code, true);
              warnings.push({
                level: 'warning',
                code: 'SKIPPED_DELETED',
                message: `Bỏ qua kế hoạch hành động đã xóa mềm: ${act.code}`,
                ref: act.code,
                profileCode: p.riskCode,
                itemCode: act.code,
              });
            } else if (existingAct.manuallyEditedAt !== null) {
              actionIsEdited.set(act.code, true);
              totalActions++;
              warnings.push({
                level: 'warning',
                code: 'SKIPPED_EDITED',
                message: `Bỏ qua kế hoạch hành động đã sửa tay: ${act.code}`,
                ref: act.code,
                profileCode: p.riskCode,
                itemCode: act.code,
              });
            } else {
              actionIsEdited.set(act.code, false);
              uneditedActionIds.push(existingAct.id);
              totalActions++;
              await tx
                .update(actionPlan)
                .set({
                  description: act.description,
                  responsibilityText: act.responsibilityText,
                  deliverable: act.deliverable,
                  dueText: act.dueText,
                })
                .where(eq(actionPlan.id, existingAct.id));
            }
          } else {
            const [newAct] = await tx
              .insert(actionPlan)
              .values({
                profileId,
                code: act.code,
                description: act.description,
                responsibilityText: act.responsibilityText,
                deliverable: act.deliverable,
                dueText: act.dueText,
              })
              .returning();
            actionMap.set(act.code, newAct.id);
            actionIsEdited.set(act.code, false);
            uneditedActionIds.push(newAct.id);
            totalActions++;
          }
        }

        // --- LIÊN KẾT control_cause (chỉ thay khi cả hai đầu chưa sửa tay) ---
        if (uneditedCauseIds.length > 0) {
          for (const ctrl of p.controls) {
            if (controlIsEdited.get(ctrl.code)) continue;
            const ctrlId = controlMap.get(ctrl.code);
            if (ctrlId) {
              await tx
                .delete(controlCause)
                .where(
                  and(
                    eq(controlCause.controlId, ctrlId),
                    inArray(controlCause.causeId, uneditedCauseIds)
                  )
                );
            }
          }
        }

        const ctrlCausePairs = new Set<string>();
        for (const ctrl of p.controls) {
          for (const causeCode of ctrl.causeCodes) {
            if (causeMap.has(causeCode)) {
              ctrlCausePairs.add(`${ctrl.code}|${causeCode}`);
            }
          }
        }
        for (const cause of p.causes) {
          for (const ctrlCode of cause.controlCodes) {
            if (controlMap.has(ctrlCode)) {
              ctrlCausePairs.add(`${ctrlCode}|${cause.code}`);
            }
          }
        }

        for (const pair of ctrlCausePairs) {
          const [ctrlCode, causeCode] = pair.split('|');
          if (!controlIsEdited.get(ctrlCode) && !causeIsEdited.get(causeCode)) {
            const controlId = controlMap.get(ctrlCode)!;
            const causeId = causeMap.get(causeCode)!;
            await tx
              .insert(controlCause)
              .values({ controlId, causeId })
              .onConflictDoNothing();
          }
        }

        // --- LIÊN KẾT action_control (chỉ thay khi cả hai đầu chưa sửa tay) ---
        if (uneditedControlIds.length > 0) {
          for (const act of p.actions) {
            if (actionIsEdited.get(act.code)) continue;
            const actId = actionMap.get(act.code);
            if (actId) {
              await tx
                .delete(actionControl)
                .where(
                  and(
                    eq(actionControl.actionId, actId),
                    inArray(actionControl.controlId, uneditedControlIds)
                  )
                );
            }
          }
        }

        const actionControlPairs = new Set<string>();
        for (const act of p.actions) {
          for (const ctrlCode of act.controlCodes) {
            if (controlMap.has(ctrlCode)) {
              actionControlPairs.add(`${act.code}|${ctrlCode}`);
            }
          }
        }
        for (const ctrl of p.controls) {
          for (const actCode of ctrl.actionCodes) {
            if (actionMap.has(actCode)) {
              actionControlPairs.add(`${actCode}|${ctrl.code}`);
            }
          }
        }

        for (const pair of actionControlPairs) {
          const [actCode, ctrlCode] = pair.split('|');
          if (!actionIsEdited.get(actCode) && !controlIsEdited.get(ctrlCode)) {
            const actionId = actionMap.get(actCode)!;
            const controlId = controlMap.get(ctrlCode)!;
            await tx
              .insert(actionControl)
              .values({ actionId, controlId })
              .onConflictDoNothing();
          }
        }

        // --- TẠO ACTION_TASK MẶC ĐỊNH (cho KH chưa có đầu việc nào) ---
        for (const act of p.actions) {
          const actionId = actionMap.get(act.code);
          if (!actionId) continue;

          const existingActiveTasks = await tx
            .select()
            .from(actionTask)
            .where(and(eq(actionTask.actionId, actionId), isNull(actionTask.deletedAt)));

          if (existingActiveTasks.length === 0) {
            // Kiểm tra xem đã từng có task nào (kể cả xóa mềm) chưa
            const allTasks = await tx
              .select()
              .from(actionTask)
              .where(eq(actionTask.actionId, actionId));

            if (allTasks.length === 0) {
              const yyyyMmDd = act.dueDate ? act.dueDate.toISOString().split('T')[0] : null;
              await tx.insert(actionTask).values({
                actionId,
                name: 'Toàn bộ kế hoạch',
                unitId: null,
                dueDate: yyyyMmDd,
                weight: 1,
                sourceText: `Trách nhiệm: ${act.responsibilityText}\nĐầu ra: ${act.deliverable}\nHạn hoàn thành: ${act.dueText}`,
                sortOrder: 0,
              });
              totalActionTasks++;
              totalActionTasksCreated++;
            }
          } else {
            totalActionTasks += existingActiveTasks.length;
          }
        }

        // --- INDICATORS ---
        for (const ind of p.indicators) {
          const [existingInd] = await tx
            .select()
            .from(indicator)
            .where(and(eq(indicator.profileId, profileId), eq(indicator.code, ind.code)));

          if (existingInd) {
            if (existingInd.deletedAt !== null) {
              warnings.push({
                level: 'warning',
                code: 'SKIPPED_DELETED',
                message: `Bỏ qua chỉ số đã xóa mềm: ${ind.code}`,
                ref: ind.code,
                profileCode: p.riskCode,
                itemCode: ind.code,
              });
              continue;
            } else if (existingInd.manuallyEditedAt !== null) {
              warnings.push({
                level: 'warning',
                code: 'SKIPPED_EDITED',
                message: `Bỏ qua chỉ số đã sửa tay: ${ind.code}`,
                ref: ind.code,
                profileCode: p.riskCode,
                itemCode: ind.code,
              });
              if (ind.kind === 'kri') totalKri++; else totalKci++;
              if (existingInd.zoneRules) autoIndicators++; else manualIndicators++;
              continue;
            }
          }

          const pKind = mapPeriodKind(ind.frequency, ind.code);
          const thresholdSet = parseThresholdSet(ind.thresholds);
          const zoneRules = thresholdSet.mode === 'auto' ? thresholdSet.rules : null;
          const { unitKind, unitLabel } = inferIndicatorUnit(ind.thresholds);
          const direction = inferDirection(ind.thresholds[0]);

          if (thresholdSet.mode === 'auto') {
            autoIndicators++;
          } else {
            manualIndicators++;
          }

          if (ind.kind === 'kri') {
            totalKri++;
          } else {
            totalKci++;
          }

          if (existingInd) {
            await tx
              .update(indicator)
              .set({
                kind: ind.kind,
                name: ind.name,
                formula: ind.formula,
                frequency: ind.frequency.trim(),
                periodKind: pKind,
                thresholdLowText: ind.thresholds[0],
                thresholdMidText: ind.thresholds[1],
                thresholdHighText: ind.thresholds[2],
                zoneRules: zoneRules as unknown as Record<string, unknown>,
                note: ind.note,
                unitKind,
                unitLabel,
                direction,
              })
              .where(eq(indicator.id, existingInd.id));
          } else {
            await tx
              .insert(indicator)
              .values({
                profileId,
                code: ind.code,
                kind: ind.kind,
                name: ind.name,
                formula: ind.formula,
                frequency: ind.frequency.trim(),
                periodKind: pKind,
                thresholdLowText: ind.thresholds[0],
                thresholdMidText: ind.thresholds[1],
                thresholdHighText: ind.thresholds[2],
                zoneRules: zoneRules as unknown as Record<string, unknown>,
                note: ind.note,
                unitKind,
                unitLabel,
                direction,
                yellowAt: null,
                redAt: null,
                targetValue: null,
              });
          }
        }
      }

      // 3.3 importCycle không tự tạo kỳ theo S2 và PRD mục 5 bước 4
      const periodsCreated = 0;

      const report: ImportCycleReport = {
        year,
        counts: {
          profiles: profiles.length,
          causes: totalCauses,
          impacts: totalImpacts,
          controls: totalControls,
          actions: totalActions,
          tasksCreated: totalActionTasksCreated,
          kri: totalKri,
          kci: totalKci,
          periodsCreated,
        },
        issues: warnings,

        cycleId,
        profilesCount: profiles.length,
        causesCount: totalCauses,
        impactsCount: totalImpacts,
        controlsCount: totalControls,
        actionsCount: totalActions,
        actionTasksCount: totalActionTasks,
        kriCount: totalKri,
        kciCount: totalKci,
        autoIndicatorsCount: autoIndicators,
        manualIndicatorsCount: manualIndicators,
        warnings,
      };

      return {
        entityId: cycleId,
        before: null,
        after: {
          year,
          profilesCount: profiles.length,
          totalCauses,
          totalImpacts,
          totalControls,
          totalActions,
          totalActionTasks,
          totalKri,
          totalKci,
          autoIndicators,
          manualIndicators,
          periodsCreated,
        },
        result: report,
      };
    },
    db
  );
}

/**
 * Nhân bản chu kỳ sang năm mới (backend-design 7.3 và 4.12 mục 11)
 */
export async function cloneCycle(
  fromYear: number,
  toYear: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: PostgresJsDatabase<typeof schema> = defaultDb
): Promise<ImportCycleReport> {
  checkActorPermission(actor);

  const [fromCycle] = await db.select().from(cycle).where(eq(cycle.year, fromYear));
  if (!fromCycle) {
    throw new AppError('NOT_FOUND', `Không tìm thấy chu kỳ năm ${fromYear}`);
  }

  const [destCycle] = await db.select().from(cycle).where(eq(cycle.year, toYear));
  if (destCycle) {
    throw new AppError('CONFLICT', `Chu kỳ năm ${toYear} đã tồn tại`);
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'clone_cycle',
      entity: 'cycle',
      ip: meta?.ip,
    },
    async (tx) => {
      const [toCycle] = await tx
        .insert(cycle)
        .values({ year: toYear, status: 'open' })
        .returning();

      // 1. Copy profiles
      const fromProfiles = await tx
        .select()
        .from(riskProfile)
        .where(and(eq(riskProfile.cycleId, fromCycle.id), isNull(riskProfile.deletedAt)));

      const profileMap = new Map<string, string>();
      for (const p of fromProfiles) {
        const [ins] = await tx
          .insert(riskProfile)
          .values({
            cycleId: toCycle.id,
            riskCode: p.riskCode,
            hsrrCode: p.hsrrCode,
            name: p.name,
            riskType: p.riskType,
            riskZone: p.riskZone,
            riskGroup: p.riskGroup,
            owner: p.owner,
            relatedActivity: p.relatedActivity,
            preparedByUnit: p.preparedByUnit,
            description: p.description,
            inherentImpact: p.inherentImpact,
            inherentLikelihood: p.inherentLikelihood,
            inherentLevel: p.inherentLevel,
            manuallyEditedAt: null,
            deletedAt: null,
          })
          .returning();
        profileMap.set(p.id, ins.id);
      }

      const oldProfileIds = Array.from(profileMap.keys());
      if (oldProfileIds.length === 0) {
        await ensurePeriods(toYear, actor ?? null, undefined, tx);
        const emptyReport: ImportCycleReport = {
          year: toYear,
          counts: {
            profiles: 0,
            causes: 0,
            impacts: 0,
            controls: 0,
            actions: 0,
            tasksCreated: 0,
            kri: 0,
            kci: 0,
            periodsCreated: 16,
          },
          issues: [],
          cycleId: toCycle.id,
          profilesCount: 0,
          causesCount: 0,
          impactsCount: 0,
          controlsCount: 0,
          actionsCount: 0,
          actionTasksCount: 0,
          kriCount: 0,
          kciCount: 0,
          autoIndicatorsCount: 0,
          manualIndicatorsCount: 0,
          warnings: [],
        };
        return {
          entityId: toCycle.id,
          before: null,
          after: {
            year: toYear,
            fromYear,
            counts: emptyReport.counts,
          },
          result: emptyReport,
        };
      }

      // 2. Causes
      const fromCauses = await tx
        .select()
        .from(cause)
        .where(and(inArray(cause.profileId, oldProfileIds), isNull(cause.deletedAt)));
      const causeMap = new Map<string, string>();
      for (const c of fromCauses) {
        const [ins] = await tx
          .insert(cause)
          .values({
            profileId: profileMap.get(c.profileId)!,
            code: c.code,
            causeGroup: c.causeGroup,
            description: c.description,
            manuallyEditedAt: null,
            deletedAt: null,
          })
          .returning();
        causeMap.set(c.id, ins.id);
      }

      // 3. Impacts
      const fromImpacts = await tx
        .select()
        .from(impact)
        .where(and(inArray(impact.profileId, oldProfileIds), isNull(impact.deletedAt)));
      for (const imp of fromImpacts) {
        await tx.insert(impact).values({
          profileId: profileMap.get(imp.profileId)!,
          code: imp.code,
          impactGroup: imp.impactGroup,
          description: imp.description,
          level: imp.level,
          manuallyEditedAt: null,
          deletedAt: null,
        });
      }

      // 4. Controls
      const fromControls = await tx
        .select()
        .from(control)
        .where(and(inArray(control.profileId, oldProfileIds), isNull(control.deletedAt)));
      const controlMap = new Map<string, string>();
      for (const ctrl of fromControls) {
        const [ins] = await tx
          .insert(control)
          .values({
            profileId: profileMap.get(ctrl.profileId)!,
            code: ctrl.code,
            description: ctrl.description,
            ownerText: ctrl.ownerText,
            frequency: ctrl.frequency,
            objective: ctrl.objective,
            method: ctrl.method,
            designEff: ctrl.designEff,
            operatingEff: ctrl.operatingEff,
            overallEff: ctrl.overallEff,
            needsSupplement: ctrl.needsSupplement,
            manuallyEditedAt: null,
            deletedAt: null,
          })
          .returning();
        controlMap.set(ctrl.id, ins.id);
      }

      // 5. Actions
      const fromActions = await tx
        .select()
        .from(actionPlan)
        .where(and(inArray(actionPlan.profileId, oldProfileIds), isNull(actionPlan.deletedAt)));
      const actionMap = new Map<string, string>();
      for (const act of fromActions) {
        const [ins] = await tx
          .insert(actionPlan)
          .values({
            profileId: profileMap.get(act.profileId)!,
            code: act.code,
            description: act.description,
            responsibilityText: act.responsibilityText,
            deliverable: act.deliverable,
            dueText: act.dueText,
            manuallyEditedAt: null,
            deletedAt: null,
          })
          .returning();
        actionMap.set(act.id, ins.id);
      }

      // 6. Indicators
      const fromIndicators = await tx
        .select()
        .from(indicator)
        .where(and(inArray(indicator.profileId, oldProfileIds), isNull(indicator.deletedAt)));
      let kriCount = 0;
      let kciCount = 0;
      for (const ind of fromIndicators) {
        if (ind.kind === 'kri') kriCount++; else kciCount++;
        await tx.insert(indicator).values({
          profileId: profileMap.get(ind.profileId)!,
          code: ind.code,
          kind: ind.kind,
          name: ind.name,
          formula: ind.formula,
          frequency: ind.frequency,
          periodKind: ind.periodKind,
          thresholdLowText: ind.thresholdLowText,
          thresholdMidText: ind.thresholdMidText,
          thresholdHighText: ind.thresholdHighText,
          zoneRules: ind.zoneRules,
          note: ind.note,
          ownerUnitId: ind.ownerUnitId,
          unitKind: ind.unitKind,
          unitLabel: ind.unitLabel,
          direction: ind.direction,
          yellowAt: ind.yellowAt,
          redAt: ind.redAt,
          targetValue: ind.targetValue,
          manuallyEditedAt: null,
          deletedAt: null,
        });
      }

      // 7. Links control_cause
      const oldControlIds = Array.from(controlMap.keys());
      if (oldControlIds.length > 0) {
        const fromControlCauses = await tx
          .select()
          .from(controlCause)
          .where(inArray(controlCause.controlId, oldControlIds));

        for (const cc of fromControlCauses) {
          const newCtrlId = controlMap.get(cc.controlId);
          const newCauseId = causeMap.get(cc.causeId);
          if (newCtrlId && newCauseId) {
            await tx
              .insert(controlCause)
              .values({ controlId: newCtrlId, causeId: newCauseId })
              .onConflictDoNothing();
          }
        }
      }

      // 8. Links action_control
      const oldActionIds = Array.from(actionMap.keys());
      if (oldActionIds.length > 0) {
        const fromActionControls = await tx
          .select()
          .from(actionControl)
          .where(inArray(actionControl.actionId, oldActionIds));

        for (const ac of fromActionControls) {
          const newActionId = actionMap.get(ac.actionId);
          const newControlId = controlMap.get(ac.controlId);
          if (newActionId && newControlId) {
            await tx
              .insert(actionControl)
              .values({ actionId: newActionId, controlId: newControlId })
              .onConflictDoNothing();
          }
        }
      }

      // 9. Unit assignments for controls
      if (oldControlIds.length > 0) {
        const fromAssignments = await tx
          .select()
          .from(unitAssignment)
          .where(
            and(
              eq(unitAssignment.targetType, 'control'),
              inArray(unitAssignment.targetId, oldControlIds)
            )
          );

        for (const assign of fromAssignments) {
          const newCtrlId = controlMap.get(assign.targetId);
          if (newCtrlId) {
            await tx.insert(unitAssignment).values({
              targetType: 'control',
              targetId: newCtrlId,
              unitId: assign.unitId,
            });
          }
        }
      }

      // 10. Action Tasks
      let clonedTasksCount = 0;
      if (oldActionIds.length > 0) {
        const fromTasks = await tx
          .select()
          .from(actionTask)
          .where(and(inArray(actionTask.actionId, oldActionIds), isNull(actionTask.deletedAt)));

        for (const t of fromTasks) {
          const newActId = actionMap.get(t.actionId);
          if (newActId) {
            await tx.insert(actionTask).values({
              actionId: newActId,
              name: t.name,
              unitId: t.unitId,
              dueDate: t.dueDate,
              weight: t.weight,
              sourceText: t.sourceText,
              sortOrder: t.sortOrder,
              deletedAt: null,
            });
            clonedTasksCount++;
          }
        }
      }

      // 11. Ensure periods (12 tháng + 4 quý = 16 kỳ)
      await ensurePeriods(toYear, actor ?? null, undefined, tx);

      const report: ImportCycleReport = {
        year: toYear,
        counts: {
          profiles: fromProfiles.length,
          causes: fromCauses.length,
          impacts: fromImpacts.length,
          controls: fromControls.length,
          actions: fromActions.length,
          tasksCreated: clonedTasksCount,
          kri: kriCount,
          kci: kciCount,
          periodsCreated: 16,
        },
        issues: [],
        cycleId: toCycle.id,
        profilesCount: fromProfiles.length,
        causesCount: fromCauses.length,
        impactsCount: fromImpacts.length,
        controlsCount: fromControls.length,
        actionsCount: fromActions.length,
        actionTasksCount: clonedTasksCount,
        kriCount,
        kciCount,
        autoIndicatorsCount: 0,
        manualIndicatorsCount: 0,
        warnings: [],
      };

      return {
        entityId: toCycle.id,
        before: null,
        after: {
          year: toYear,
          fromYear,
          counts: report.counts,
        },
        result: report,
      };
    },
    db
  );
}

/**
 * Lưu trữ chu kỳ chuyển sang chỉ đọc (backend-design 4.12 mục 11)
 */
export async function archiveCycle(
  year: number,
  actor?: Actor | null,
  meta?: { ip?: string },
  db: PostgresJsDatabase<typeof schema> = defaultDb
): Promise<{ year: number; status: 'archived' }> {
  checkActorPermission(actor);

  const [targetCycle] = await db.select().from(cycle).where(eq(cycle.year, year));
  if (!targetCycle) {
    throw new AppError('NOT_FOUND', `Không tìm thấy chu kỳ năm ${year}`);
  }

  // Kiểm tra còn bản pending không
  const [indPending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(indicatorReading)
    .innerJoin(indicator, eq(indicatorReading.indicatorId, indicator.id))
    .innerJoin(riskProfile, eq(indicator.profileId, riskProfile.id))
    .where(and(eq(riskProfile.cycleId, targetCycle.id), eq(indicatorReading.status, 'pending')));

  const [actPending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(actionUpdate)
    .innerJoin(actionTask, eq(actionUpdate.taskId, actionTask.id))
    .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
    .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
    .where(and(eq(riskProfile.cycleId, targetCycle.id), eq(actionUpdate.status, 'pending')));

  const totalPending = (indPending?.count ?? 0) + (actPending?.count ?? 0);
  if (totalPending > 0) {
    throw new AppError('INVALID_STATE', `Chu kỳ năm ${year} còn bản nộp chờ duyệt, không thể lưu trữ`, {
      details: { pendingCount: totalPending },
    });
  }

  return await withAudit(
    actor ?? null,
    {
      action: 'archive_cycle',
      entity: 'cycle',
      ip: meta?.ip,
    },
    async (tx) => {
      await tx
        .update(cycle)
        .set({ status: 'archived' })
        .where(eq(cycle.id, targetCycle.id));

      return {
        entityId: targetCycle.id,
        before: { status: targetCycle.status },
        after: { status: 'archived' },
        result: { year, status: 'archived' as const },
      };
    },
    db
  );
}
