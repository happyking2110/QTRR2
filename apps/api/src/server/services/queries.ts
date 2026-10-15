import { db as defaultDb } from '../db/client';
import {
  cycle,
  period,
  riskProfile,
  cause,
  impact,
  control,
  actionPlan,
  actionTask,
  actionUpdate,
  indicator,
  indicatorReading,
  unit,
  unitAssignment,
  residualAssessment,
  appSetting,
  appUser,
} from '../db/schema';
import { AppError } from '../errors';
import { resolveActiveCycle } from './cycles';
import { currentReading, ReadingWithPeriod } from '../../lib/domain/readings';
import { progressAsOf, actionProgress } from '../../lib/domain/progress';
import { actionStatus, ActionStatus, StatusSettings } from '../../lib/domain/action-status';
import {
  levelScore,
  SCALE_IS_PROVISIONAL,
  IMPACT_LEVELS,
  LIKELIHOOD_LEVELS,
} from '../../lib/domain/scales';
import {
  computeSubmitPeriodKeys,
  computePendingSubmissions,
  type PendingRefDto,
} from '../auth/policy';
import type { Actor } from '../types';
import { eq, and, isNull, inArray, desc, asc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';

export type DbType = PostgresJsDatabase<typeof schema>;

export interface CycleSummaryDto {
  year: number;
  status: 'open' | 'archived';
}

export interface PeriodSummaryDto {
  key: string;
  kind: 'month' | 'quarter' | 'event';
  label: string;
  startsOn: string;
  endsOn: string;
  dueAt: string;
  closed: boolean;
  closedAt: string | null;
  closedByName: string | null;
  reopenReason: string | null;
}

export interface UnitSummaryDto {
  code: string;
  name: string;
  kind: 'department' | 'center' | 'group';
}

export interface RiskRatingDto {
  impactLabel: string;
  likelihoodLabel: string;
  levelLabel: string;
  impactScore: number;
  likelihoodScore: number;
  score: number;
}

export interface IndicatorZoneCountsDto {
  total: number;
  green: number;
  yellow: number;
  red: number;
  noData: number;
}

export interface ActionStatusCountsDto {
  total: number;
  completed: number;
  overdue: number;
  atRisk: number;
  inProgress: number;
  notStarted: number;
}

export interface CurrentReadingDto {
  periodKey: string;
  valueNum: number | null;
  valueText: string | null;
  zone: 'green' | 'yellow' | 'red';
  zoneSource: 'auto' | 'manual';
  reviewedAt: string;
}

export interface ActionTaskDto {
  id: string;
  name: string;
  unit: UnitSummaryDto | null;
  dueDate: string | null;
  weight: number;
  progress: number;
  sourceText: string | null;
  lastApprovedUpdateAt: string | null;
  submitPeriodKeys: string[];
  pendingSubmissions: PendingRefDto[];
}

export interface ActionPlanDto {
  code: string;
  description: string;
  responsibilityText: string;
  deliverable: string;
  dueText: string;
  dueDate: string | null;
  controlCodes: string[];
  status: ActionStatus;
  progress: number;
  tasks: ActionTaskDto[];
}

export interface ProfileSummaryDto {
  riskCode: string;
  hsrrCode: string;
  name: string;
  riskType: string;
  riskZone: string;
  riskGroup: string;
  owner: string;
  inherent: RiskRatingDto;
  residual: RiskRatingDto | null;
  kri: IndicatorZoneCountsDto;
  kci: IndicatorZoneCountsDto;
  actions: ActionStatusCountsDto;
  actionProgress: number | null;
}

export interface CauseDto {
  code: string;
  group: string;
  description: string;
  controlCodes: string[];
}

export interface ImpactDto {
  code: string;
  group: string;
  description: string;
  level: string;
}

export interface ControlDto {
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
  causeCodes: string[];
  actionCodes: string[];
  units: UnitSummaryDto[];
}

export interface IndicatorThresholdsDto {
  green: string;
  yellow: string;
  red: string;
}

export interface IndicatorDto {
  id: string;
  code: string;
  kind: 'kri' | 'kci';
  name: string;
  formula: string;
  frequency: string;
  periodKind: 'month' | 'quarter' | 'event';
  thresholds: IndicatorThresholdsDto;
  mode: 'auto' | 'manual';
  ownerUnit: UnitSummaryDto | null;
  note: string | null;
  current: CurrentReadingDto | null;
  submitPeriodKeys: string[];
  pendingSubmissions: PendingRefDto[];
  unitKind: 'percent' | 'count';
  unitLabel: string;
  direction: 'higher_is_worse' | 'lower_is_worse' | null;
  yellowAt: number | null;
  redAt: number | null;
  targetValue: number | null;
  targetProgress: number | null;
  dataSource: string | null;
}

export function extractDataSource(formula: string | null | undefined): string | null {
  if (!formula) return null;
  const idx = formula.indexOf('Nguồn dữ liệu:');
  if (idx === -1) return null;
  const ds = formula.slice(idx + 'Nguồn dữ liệu:'.length).trim();
  return ds.length > 0 ? ds : null;
}

export interface ResidualEntryDto {
  periodKey: string;
  rating: RiskRatingDto;
}

export interface ProfileDetailDto {
  profile: ProfileSummaryDto;
  period: PeriodSummaryDto | null;
  description: string;
  relatedActivity: string;
  preparedByUnit: string;
  causes: CauseDto[];
  impacts: ImpactDto[];
  controls: ControlDto[];
  actions: ActionPlanDto[];
  indicators: IndicatorDto[];
  residualHistory: ResidualEntryDto[];
}

export interface OverviewDto {
  cycle: CycleSummaryDto;
  period: PeriodSummaryDto | null;
  hasApprovedData: boolean;
  asOfDate: string | null;
  profileCount: number;
  kri: IndicatorZoneCountsDto;
  kci: IndicatorZoneCountsDto;
  actions: ActionStatusCountsDto;
  actionProgressAverage: number | null;
}

export interface ScaleLevelDto {
  score: number;
  label: string;
}

export interface HeatmapPointDto {
  riskCode: string;
  name: string;
  inherent: RiskRatingDto;
  residual: RiskRatingDto | null;
}

export interface HeatmapDto {
  scaleProvisional: boolean;
  impactLevels: ScaleLevelDto[];
  likelihoodLevels: ScaleLevelDto[];
  points: HeatmapPointDto[];
}

export interface ActionListItemDto {
  riskCode: string;
  riskName: string;
  action: ActionPlanDto;
}

export interface IndicatorListItemDto {
  riskCode: string;
  riskName: string;
  indicator: IndicatorDto;
}

export interface IndicatorHistoryItemDto {
  periodKey: string;
  valueNum: number | null;
  valueText: string | null;
  zone: 'green' | 'yellow' | 'red';
  zoneSource: 'auto' | 'manual';
  reviewedAt: string;
}

/**
 * Đọc cài đặt trạng thái từ bảng app_setting
 */
export async function getStatusSettings(db: DbType): Promise<StatusSettings> {
  const settingsRows = await db.select().from(appSetting);
  const settingsMap = new Map(settingsRows.map((s) => [s.key, s.value]));

  const getNum = (key: string, def: number): number => {
    const val = settingsMap.get(key);
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
  };
}

/**
 * Giải chu kỳ và kỳ báo cáo theo tham số query:
 * - Chu kỳ: nếu không truyền -> chu kỳ open có năm lớn nhất (hoặc chu kỳ năm lớn nhất). Nếu truyền mà không thấy -> 404 NOT_FOUND.
 * - Kỳ: nếu truyền mà không thấy -> 404 PERIOD_NOT_FOUND.
 *   Nếu không truyền:
 *     1. Kỳ gần nhất có số liệu đã duyệt
 *     2. Chưa có số liệu đã duyệt -> kỳ quý chứa ngày hiện tại (nếu tồn tại)
 *     3. Không có kỳ nào -> null
 */
export async function resolveCycleAndPeriod(
  options: { cycle?: number; period?: string },
  db: DbType = defaultDb
) {
  // 1. Giải chu kỳ
  const cycleRow = await resolveActiveCycle(options.cycle, db);

  // Lấy danh sách toàn bộ kỳ của chu kỳ kèm closedByName
  const allPeriodsRows = await db
    .select({
      period,
      closedByName: appUser.fullName,
    })
    .from(period)
    .leftJoin(appUser, eq(period.closedBy, appUser.id))
    .where(eq(period.cycleId, cycleRow.id));

  const allPeriods = allPeriodsRows.map((r) => ({
    ...r.period,
    closedByName: r.closedByName,
  }));

  const periodMap = new Map(allPeriods.map((p) => [p.key, p]));

  // 2. Giải kỳ
  let selectedPeriod: (typeof allPeriods)[0] | null = null;
  if (options.period !== undefined) {
    const p = periodMap.get(options.period);
    if (!p) {
      throw new AppError(
        'PERIOD_NOT_FOUND',
        `Không tìm thấy kỳ ${options.period} trong chu kỳ năm ${cycleRow.year}`
      );
    }
    selectedPeriod = p;
  } else {
    // 2.1 Tìm kỳ gần nhất có số liệu đã duyệt
    // Kiểm tra indicator_reading đã duyệt của chu kỳ này
    const approvedReadings = await db
      .select({
        periodKey: indicatorReading.periodKey,
        reviewedAt: indicatorReading.reviewedAt,
      })
      .from(indicatorReading)
      .innerJoin(indicator, eq(indicatorReading.indicatorId, indicator.id))
      .innerJoin(riskProfile, eq(indicator.profileId, riskProfile.id))
      .where(
        and(
          eq(riskProfile.cycleId, cycleRow.id),
          eq(indicatorReading.status, 'approved')
        )
      );

    // Kiểm tra action_update đã duyệt của chu kỳ này
    const approvedUpdates = await db
      .select({
        periodKey: actionUpdate.periodKey,
        reviewedAt: actionUpdate.reviewedAt,
      })
      .from(actionUpdate)
      .innerJoin(actionTask, eq(actionUpdate.taskId, actionTask.id))
      .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
      .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
      .where(
        and(
          eq(riskProfile.cycleId, cycleRow.id),
          eq(actionUpdate.status, 'approved')
        )
      );

    const periodKeysWithData = new Set<string>();
    for (const r of approvedReadings) periodKeysWithData.add(r.periodKey);
    for (const u of approvedUpdates) periodKeysWithData.add(u.periodKey);

    const periodsWithData = allPeriods.filter((p) => periodKeysWithData.has(p.key));

    if (periodsWithData.length > 0) {
      // Sắp xếp chọn kỳ có endsOn lớn nhất, nếu trùng thì kỳ ngắn hơn (startsOn lớn hơn) thắng
      periodsWithData.sort((a, b) => {
        const endsA = new Date(a.endsOn).getTime();
        const endsB = new Date(b.endsOn).getTime();
        if (endsA !== endsB) return endsB - endsA;
        return new Date(b.startsOn).getTime() - new Date(a.startsOn).getTime();
      });
      selectedPeriod = periodsWithData[0];
    } else {
      // 2.2 Chưa có số liệu: dùng kỳ quý chứa ngày hiện tại nếu tồn tại
      const now = new Date();
      const currentYear = now.getUTCFullYear();
      const currentMonth = now.getUTCMonth(); // 0 - 11
      const qNum = Math.floor(currentMonth / 3) + 1;
      const expectedQuarterKey = `${currentYear}-Q${qNum}`;

      const matchedQuarter = allPeriods.find(
        (p) => p.kind === 'quarter' && p.key === expectedQuarterKey
      );

      if (matchedQuarter) {
        selectedPeriod = matchedQuarter;
      } else {
        selectedPeriod = null;
      }
    }
  }

  const asOfEndsOn = selectedPeriod ? selectedPeriod.endsOn : null;

  return {
    cycle: cycleRow,
    selectedPeriod,
    asOfEndsOn,
    allPeriods,
  };
}

export function toPeriodSummaryDto(
  p: typeof period.$inferSelect,
  closedByName: string | null = null
): PeriodSummaryDto {
  return {
    key: p.key,
    kind: p.kind,
    label: p.label,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
    dueAt: p.dueAt.toISOString(),
    closed: !!p.closedAt,
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
    closedByName: p.closedAt ? (closedByName ?? null) : null,
    reopenReason: p.reopenReason ?? null,
  };
}

export function toCycleSummaryDto(c: typeof cycle.$inferSelect): CycleSummaryDto {
  return {
    year: c.year,
    status: c.status,
  };
}

// 1. GET /api/cycles
export async function getCycles(db: DbType = defaultDb): Promise<CycleSummaryDto[]> {
  const rows = await db
    .select()
    .from(cycle)
    .orderBy(desc(cycle.year));
  return rows.map(toCycleSummaryDto);
}

// 2. GET /api/cycles/{year}/periods
export async function getPeriodsByYear(
  year: number,
  db: DbType = defaultDb
): Promise<PeriodSummaryDto[]> {
  const [cycleRow] = await db
    .select()
    .from(cycle)
    .where(eq(cycle.year, year));

  if (!cycleRow) {
    throw new AppError('NOT_FOUND', `Không tìm thấy chu kỳ năm ${year}`);
  }

  const rows = await db
    .select({
      period,
      closedByName: appUser.fullName,
    })
    .from(period)
    .leftJoin(appUser, eq(period.closedBy, appUser.id))
    .where(eq(period.cycleId, cycleRow.id))
    .orderBy(asc(period.startsOn), asc(period.endsOn));

  return rows.map((r) => toPeriodSummaryDto(r.period, r.closedByName));
}

// 3. GET /api/units
export async function getUnits(db: DbType = defaultDb): Promise<UnitSummaryDto[]> {
  const rows = await db
    .select()
    .from(unit)
    .orderBy(asc(unit.code));
  return rows.map((u) => ({
    code: u.code,
    name: u.name,
    kind: u.kind,
  }));
}

/**
 * Tải toàn bộ dữ liệu nghiệp vụ của chu kỳ theo lô (batch loading)
 * để tránh N+1 và hỗ trợ tính toán asOf
 */
export async function loadCycleAggregatedData(
  cycleId: string,
  asOfEndsOn: string | null,
  db: DbType = defaultDb,
  actor: Actor | null = null,
  today: Date = new Date()
) {
  const settings = await getStatusSettings(db);

  // 1. Lấy thông tin chu kỳ
  const [cycleRow] = await db.select().from(cycle).where(eq(cycle.id, cycleId));
  if (!cycleRow) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy chu kỳ');
  }

  // 2. Lấy các kỳ của chu kỳ
  const allPeriods = await db.select().from(period).where(eq(period.cycleId, cycleId));
  const periodMap = new Map(allPeriods.map((p) => [p.key, p]));
  const policyPeriods = allPeriods.map((p) => ({
    key: p.key,
    kind: p.kind,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
    closedAt: p.closedAt,
  }));

  // Lấy danh sách người dùng để tra cứu submittedByName
  const allUsers = await db.select().from(appUser);
  const userMapById = new Map(allUsers.map((u) => [u.id, u.fullName]));

  // 3. Lấy các đơn vị
  const allUnits = await db.select().from(unit);
  const unitMapById = new Map(allUnits.map((u) => [u.id, u]));

  // 4. Lấy các hồ sơ chưa xóa của chu kỳ
  const profiles = await db
    .select()
    .from(riskProfile)
    .where(and(eq(riskProfile.cycleId, cycleId), isNull(riskProfile.deletedAt)))
    .orderBy(asc(riskProfile.riskCode));

  const profileIds = profiles.map((p) => p.id);
  if (profileIds.length === 0) {
    return {
      cycleRow,
      profiles: [],
      profileDetails: new Map(),
      settings,
      allApprovedReadingsCount: 0,
      allApprovedUpdatesCount: 0,
      maxReviewedAt: null as Date | null,
    };
  }

  // 5. Lấy causes, impacts, controls
  const causes = await db
    .select()
    .from(cause)
    .where(and(inArray(cause.profileId, profileIds), isNull(cause.deletedAt)))
    .orderBy(asc(cause.code));

  const impacts = await db
    .select()
    .from(impact)
    .where(and(inArray(impact.profileId, profileIds), isNull(impact.deletedAt)))
    .orderBy(asc(impact.code));

  const controls = await db
    .select()
    .from(control)
    .where(and(inArray(control.profileId, profileIds), isNull(control.deletedAt)))
    .orderBy(asc(control.code));

  const controlIds = controls.map((c) => c.id);

  // 6. Liên kết control_cause và action_control
  const controlCauses = controlIds.length > 0
    ? await db.select().from(schema.controlCause).where(inArray(schema.controlCause.controlId, controlIds))
    : [];

  // 7. Lấy action_plan và action_task
  const actions = await db
    .select()
    .from(actionPlan)
    .where(and(inArray(actionPlan.profileId, profileIds), isNull(actionPlan.deletedAt)))
    .orderBy(asc(actionPlan.code));

  const actionIds = actions.map((a) => a.id);

  const actionControls = actionIds.length > 0
    ? await db.select().from(schema.actionControl).where(inArray(schema.actionControl.actionId, actionIds))
    : [];

  const tasks = actionIds.length > 0
    ? await db
        .select()
        .from(actionTask)
        .where(and(inArray(actionTask.actionId, actionIds), isNull(actionTask.deletedAt)))
        .orderBy(asc(actionTask.sortOrder), asc(actionTask.id))
    : [];

  const taskIds = tasks.map((t) => t.id);

  // 8. Lấy action_update
  const taskUpdates = taskIds.length > 0
    ? await db
        .select()
        .from(actionUpdate)
        .where(inArray(actionUpdate.taskId, taskIds))
        .orderBy(desc(actionUpdate.reviewedAt))
    : [];

  // 9. Lấy unit_assignment cho controls
  const controlAssignments = controlIds.length > 0
    ? await db
        .select()
        .from(unitAssignment)
        .where(
          and(
            eq(unitAssignment.targetType, 'control'),
            inArray(unitAssignment.targetId, controlIds)
          )
        )
    : [];

  // 10. Lấy indicators và readings
  const indicators = await db
    .select()
    .from(indicator)
    .where(and(inArray(indicator.profileId, profileIds), isNull(indicator.deletedAt)))
    .orderBy(asc(indicator.code));

  const indicatorIds = indicators.map((i) => i.id);

  const readings = indicatorIds.length > 0
    ? await db
        .select()
        .from(indicatorReading)
        .where(inArray(indicatorReading.indicatorId, indicatorIds))
        .orderBy(desc(indicatorReading.reviewedAt))
    : [];

  // 11. Lấy residual_assessment
  const residuals = await db
    .select()
    .from(residualAssessment)
    .where(inArray(residualAssessment.profileId, profileIds));

  // TỔ CHỨC DỮ LIỆU VÀO CÁC BẢN ĐỒ (MAPS)
  const causeCodeById = new Map(causes.map((c) => [c.id, c.code]));
  const controlCodeById = new Map(controls.map((c) => [c.id, c.code]));
  const actionCodeById = new Map(actions.map((a) => [a.id, a.code]));

  // Liên kết cho cause: causeId -> set of controlCodes
  const causeControlCodes = new Map<string, Set<string>>();
  for (const cc of controlCauses) {
    const ctrlCode = controlCodeById.get(cc.controlId);
    if (ctrlCode) {
      if (!causeControlCodes.has(cc.causeId)) causeControlCodes.set(cc.causeId, new Set());
      causeControlCodes.get(cc.causeId)!.add(ctrlCode);
    }
  }

  // Liên kết cho control: controlId -> { causeCodes: Set, actionCodes: Set }
  const controlCauseCodes = new Map<string, Set<string>>();
  for (const cc of controlCauses) {
    const cCode = causeCodeById.get(cc.causeId);
    if (cCode) {
      if (!controlCauseCodes.has(cc.controlId)) controlCauseCodes.set(cc.controlId, new Set());
      controlCauseCodes.get(cc.controlId)!.add(cCode);
    }
  }

  const controlActionCodes = new Map<string, Set<string>>();
  for (const ac of actionControls) {
    const aCode = actionCodeById.get(ac.actionId);
    if (aCode) {
      if (!controlActionCodes.has(ac.controlId)) controlActionCodes.set(ac.controlId, new Set());
      controlActionCodes.get(ac.controlId)!.add(aCode);
    }
  }

  // Liên kết cho action: actionId -> controlCodes
  const actionControlCodes = new Map<string, Set<string>>();
  for (const ac of actionControls) {
    const ctrlCode = controlCodeById.get(ac.controlId);
    if (ctrlCode) {
      if (!actionControlCodes.has(ac.actionId)) actionControlCodes.set(ac.actionId, new Set());
      actionControlCodes.get(ac.actionId)!.add(ctrlCode);
    }
  }

  // Unit assignment cho control
  const controlUnitsMap = new Map<string, UnitSummaryDto[]>();
  for (const ca of controlAssignments) {
    const u = unitMapById.get(ca.unitId);
    if (u) {
      if (!controlUnitsMap.has(ca.targetId)) controlUnitsMap.set(ca.targetId, []);
      controlUnitsMap.get(ca.targetId)!.push({
        code: u.code,
        name: u.name,
        kind: u.kind,
      });
    }
  }

  // Map updates theo taskId
  const updatesByTaskId = new Map<string, typeof taskUpdates>();
  for (const u of taskUpdates) {
    if (!updatesByTaskId.has(u.taskId)) updatesByTaskId.set(u.taskId, []);
    updatesByTaskId.get(u.taskId)!.push(u);
  }

  // Map tasks theo actionId
  const tasksByActionId = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!tasksByActionId.has(t.actionId)) tasksByActionId.set(t.actionId, []);
    tasksByActionId.get(t.actionId)!.push(t);
  }

  // Map readings theo indicatorId
  const readingsByIndicatorId = new Map<string, typeof readings>();
  for (const r of readings) {
    if (!readingsByIndicatorId.has(r.indicatorId)) readingsByIndicatorId.set(r.indicatorId, []);
    readingsByIndicatorId.get(r.indicatorId)!.push(r);
  }

  // Map residuals theo profileId
  const residualsByProfileId = new Map<string, typeof residuals>();
  for (const res of residuals) {
    if (!residualsByProfileId.has(res.profileId)) residualsByProfileId.set(res.profileId, []);
    residualsByProfileId.get(res.profileId)!.push(res);
  }

  // Theo dõi các mốc reviewedAt để tính asOfDate và hasApprovedData
  let maxReviewedAtTime = 0;
  let approvedReadingsCount = 0;
  let approvedUpdatesCount = 0;

  // Bắt đầu tính toán cho từng profile
  const profileSummaryList: ProfileSummaryDto[] = [];
  const profileDetailMap = new Map<string, ProfileDetailDto>();

  for (const prof of profiles) {
    // 1. Inherent rating
    const impactScore = levelScore('impact', prof.inherentImpact);
    const likelihoodScore = levelScore('likelihood', prof.inherentLikelihood);
    const inherent: RiskRatingDto = {
      impactLabel: prof.inherentImpact,
      likelihoodLabel: prof.inherentLikelihood,
      levelLabel: prof.inherentLevel,
      impactScore,
      likelihoodScore,
      score: impactScore * likelihoodScore,
    };

    // 2. Residual rating (as-of)
    const profResiduals = residualsByProfileId.get(prof.id) || [];
    // Lọc các bản residual có periodEndsOn <= asOfEndsOn (nếu asOfEndsOn có)
    const validResiduals = profResiduals.filter((r) => {
      if (!asOfEndsOn) return true;
      const p = periodMap.get(r.periodKey);
      if (!p) return true;
      return new Date(p.endsOn).getTime() <= new Date(asOfEndsOn).getTime();
    });

    validResiduals.sort((a, b) => {
      const pA = periodMap.get(a.periodKey);
      const pB = periodMap.get(b.periodKey);
      const endsA = pA ? new Date(pA.endsOn).getTime() : 0;
      const endsB = pB ? new Date(pB.endsOn).getTime() : 0;
      if (endsA !== endsB) return endsB - endsA;
      return new Date(b.enteredAt).getTime() - new Date(a.enteredAt).getTime();
    });

    const latestResidual = validResiduals[0];
    const residual: RiskRatingDto | null = latestResidual
      ? (() => {
          const resImpactScore = levelScore('impact', latestResidual.impact);
          const resLikelihoodScore = levelScore('likelihood', latestResidual.likelihood);
          return {
            impactLabel: latestResidual.impact,
            likelihoodLabel: latestResidual.likelihood,
            levelLabel: latestResidual.level,
            impactScore: resImpactScore,
            likelihoodScore: resLikelihoodScore,
            score: resImpactScore * resLikelihoodScore,
          };
        })()
      : null;

    // 3. Causes
    const profCauses = causes.filter((c) => c.profileId === prof.id);
    const causeDtos: CauseDto[] = profCauses.map((c) => ({
      code: c.code,
      group: c.causeGroup,
      description: c.description,
      controlCodes: Array.from(causeControlCodes.get(c.id) || []).sort(),
    }));

    // 4. Impacts
    const profImpacts = impacts.filter((i) => i.profileId === prof.id);
    const impactDtos: ImpactDto[] = profImpacts.map((i) => ({
      code: i.code,
      group: i.impactGroup,
      description: i.description,
      level: i.level,
    }));

    // 5. Controls
    const profControls = controls.filter((c) => c.profileId === prof.id);
    const controlDtos: ControlDto[] = profControls.map((c) => ({
      code: c.code,
      description: c.description,
      ownerText: c.ownerText,
      frequency: c.frequency,
      objective: c.objective,
      method: c.method,
      designEff: c.designEff,
      operatingEff: c.operatingEff,
      overallEff: c.overallEff,
      needsSupplement: c.needsSupplement,
      causeCodes: Array.from(controlCauseCodes.get(c.id) || []).sort(),
      actionCodes: Array.from(controlActionCodes.get(c.id) || []).sort(),
      units: controlUnitsMap.get(c.id) || [],
    }));

    // 6. Action plans và tasks
    const profActions = actions.filter((a) => a.profileId === prof.id);
    const actionDtos: ActionPlanDto[] = [];

    const actionStatusCounts: ActionStatusCountsDto = {
      total: profActions.length,
      completed: 0,
      overdue: 0,
      atRisk: 0,
      inProgress: 0,
      notStarted: 0,
    };

    let totalActionProgressSum = 0;

    for (const act of profActions) {
      const actTasks = tasksByActionId.get(act.id) || [];
      const taskDtos: ActionTaskDto[] = [];
      let latestTaskDueDate: string | null = null;
      let lastApprovedActionUpdateAt: Date | null = null;

      const taskStatusInputs = [];

      for (const t of actTasks) {
        const rawUpdates = updatesByTaskId.get(t.id) || [];

        // Chuyển sang format cho progressAsOf
        const updateInputs = rawUpdates.map((u) => {
          const p = periodMap.get(u.periodKey);
          return {
            progress: u.progress,
            status: u.status,
            reviewedAt: u.reviewedAt,
            periodEndsOn: p ? p.endsOn : '9999-12-31',
          };
        });

        // Tính tiến độ của task as-of
        const currentTaskProgress = progressAsOf(updateInputs, asOfEndsOn);

        // Tìm update đã duyệt mới nhất của task (để lấy lastApprovedUpdateAt)
        const validTaskApproved = rawUpdates.filter((u) => {
          if (u.status !== 'approved') return false;
          if (asOfEndsOn) {
            const p = periodMap.get(u.periodKey);
            if (p && new Date(p.endsOn).getTime() > new Date(asOfEndsOn).getTime()) return false;
          }
          return true;
        });

        let taskLastApprovedAt: string | null = null;
        if (validTaskApproved.length > 0) {
          approvedUpdatesCount++;
          validTaskApproved.sort((a, b) => {
            const timeA = a.reviewedAt ? new Date(a.reviewedAt).getTime() : 0;
            const timeB = b.reviewedAt ? new Date(b.reviewedAt).getTime() : 0;
            return timeB - timeA;
          });
          const mostRecent = validTaskApproved[0];
          if (mostRecent.reviewedAt) {
            taskLastApprovedAt = mostRecent.reviewedAt.toISOString();
            const revTime = new Date(mostRecent.reviewedAt).getTime();
            if (revTime > maxReviewedAtTime) maxReviewedAtTime = revTime;

            if (
              !lastApprovedActionUpdateAt ||
              revTime > lastApprovedActionUpdateAt.getTime()
            ) {
              lastApprovedActionUpdateAt = new Date(mostRecent.reviewedAt);
            }
          }
        }

        const taskUnit = t.unitId ? unitMapById.get(t.unitId) : null;
        const taskUnitId = t.unitId ?? null;
        const rawTaskUpdates = updatesByTaskId.get(t.id) || [];
        const pendingTaskUpdates = rawTaskUpdates.filter((u) => u.status === 'pending');

        const taskSubmitPeriodKeys = computeSubmitPeriodKeys({
          actor,
          cycleStatus: cycleRow.status as 'open' | 'archived',
          targetKind: 'task',
          targetUnitId: taskUnitId,
          periods: policyPeriods,
          today,
        });

        const taskPendingSubmissions = computePendingSubmissions({
          actor,
          targetUnitId: taskUnitId,
          submissions: pendingTaskUpdates.map((u) => {
            const p = periodMap.get(u.periodKey);
            return {
              id: u.id,
              periodKey: u.periodKey,
              submittedAt: u.submittedAt,
              submittedBy: u.submittedBy,
              submittedByName: u.submittedBy ? (userMapById.get(u.submittedBy) ?? null) : null,
              periodClosed: !!p?.closedAt,
            };
          }),
        });

        if (t.dueDate) {
          if (!latestTaskDueDate || t.dueDate > latestTaskDueDate) {
            latestTaskDueDate = t.dueDate;
          }
        }

        taskDtos.push({
          id: t.id,
          name: t.name,
          unit: taskUnit
            ? { code: taskUnit.code, name: taskUnit.name, kind: taskUnit.kind }
            : null,
          dueDate: t.dueDate,
          weight: t.weight,
          progress: currentTaskProgress,
          sourceText: t.sourceText,
          lastApprovedUpdateAt: taskLastApprovedAt,
          submitPeriodKeys: taskSubmitPeriodKeys,
          pendingSubmissions: taskPendingSubmissions,
        });

        taskStatusInputs.push({
          progress: currentTaskProgress,
          dueDate: t.dueDate,
        });
      }

      // Tính progress của ActionPlan
      const actProgress = actionProgress(
        taskDtos.map((t) => ({ progress: t.progress, weight: t.weight }))
      );
      totalActionProgressSum += actProgress;

      // Tính status của ActionPlan
      const actStatus = actionStatus(
        {
          tasks: taskStatusInputs,
          lastApprovedUpdateAt: lastApprovedActionUpdateAt,
          baselineDate: cycleRow.createdAt,
        },
        settings,
        today
      );

      // Cộng vào bộ đếm status
      if (actStatus === 'completed') actionStatusCounts.completed++;
      else if (actStatus === 'overdue') actionStatusCounts.overdue++;
      else if (actStatus === 'at_risk') actionStatusCounts.atRisk++;
      else if (actStatus === 'in_progress') actionStatusCounts.inProgress++;
      else if (actStatus === 'not_started') actionStatusCounts.notStarted++;

      actionDtos.push({
        code: act.code,
        description: act.description,
        responsibilityText: act.responsibilityText,
        deliverable: act.deliverable,
        dueText: act.dueText,
        dueDate: latestTaskDueDate,
        controlCodes: Array.from(actionControlCodes.get(act.id) || []).sort(),
        status: actStatus,
        progress: actProgress,
        tasks: taskDtos,
      });
    }

    const profActionProgressAverage =
      profActions.length > 0
        ? Number((totalActionProgressSum / profActions.length).toFixed(1))
        : null;

    // 7. Indicators
    const profIndicators = indicators.filter((i) => i.profileId === prof.id);
    const indicatorDtos: IndicatorDto[] = [];

    const kriCounts: IndicatorZoneCountsDto = {
      total: 0,
      green: 0,
      yellow: 0,
      red: 0,
      noData: 0,
    };
    const kciCounts: IndicatorZoneCountsDto = {
      total: 0,
      green: 0,
      yellow: 0,
      red: 0,
      noData: 0,
    };

    for (const ind of profIndicators) {
      const indReadings = readingsByIndicatorId.get(ind.id) || [];

      // Chuẩn bị readings joined với period info
      const readingWithPeriods: (typeof indReadings[0] & {
        periodStartsOn: Date;
        periodEndsOn: Date;
      })[] = [];

      for (const r of indReadings) {
        const p = periodMap.get(r.periodKey);
        if (p) {
          readingWithPeriods.push({
            ...r,
            periodStartsOn: new Date(p.startsOn),
            periodEndsOn: new Date(p.endsOn),
          });
        }
      }

      // Xác định current reading as-of
      const cur = currentReading(readingWithPeriods, asOfEndsOn);

      let currentDto: CurrentReadingDto | null = null;
      if (cur) {
        approvedReadingsCount++;
        if (cur.reviewedAt) {
          const revTime = new Date(cur.reviewedAt).getTime();
          if (revTime > maxReviewedAtTime) maxReviewedAtTime = revTime;
        }

        currentDto = {
          periodKey: cur.periodKey,
          valueNum: cur.valueNum !== null ? parseFloat(cur.valueNum) : null,
          valueText: cur.valueText,
          zone: cur.zone as 'green' | 'yellow' | 'red',
          zoneSource: cur.zoneSource as 'auto' | 'manual',
          reviewedAt: cur.reviewedAt ? new Date(cur.reviewedAt).toISOString() : '',
        };
      }

      const counter = ind.kind === 'kri' ? kriCounts : kciCounts;
      counter.total++;
      if (!currentDto) {
        counter.noData++;
      } else {
        if (currentDto.zone === 'green') counter.green++;
        else if (currentDto.zone === 'yellow') counter.yellow++;
        else if (currentDto.zone === 'red') counter.red++;
      }

      const ownerU = ind.ownerUnitId ? unitMapById.get(ind.ownerUnitId) : null;
      const indicatorUnitId = ind.ownerUnitId ?? null;
      const pendingReadings = indReadings.filter((r) => r.status === 'pending');

      const indSubmitPeriodKeys = computeSubmitPeriodKeys({
        actor,
        cycleStatus: cycleRow.status as 'open' | 'archived',
        targetKind: 'indicator',
        indicatorPeriodKind: ind.periodKind,
        targetUnitId: indicatorUnitId,
        periods: policyPeriods,
        today,
      });

      const indPendingSubmissions = computePendingSubmissions({
        actor,
        targetUnitId: indicatorUnitId,
        submissions: pendingReadings.map((r) => {
          const p = periodMap.get(r.periodKey);
          return {
            id: r.id,
            periodKey: r.periodKey,
            submittedAt: r.submittedAt,
            submittedBy: r.submittedBy,
            submittedByName: r.submittedBy ? (userMapById.get(r.submittedBy) ?? null) : null,
            periodClosed: !!p?.closedAt,
          };
        }),
      });

      const yellowAt = ind.yellowAt !== null ? Number(ind.yellowAt) : null;
      const redAt = ind.redAt !== null ? Number(ind.redAt) : null;
      const targetValue = ind.targetValue !== null ? Number(ind.targetValue) : null;
      let targetProgress: number | null = null;
      if (ind.kind === 'kci' && targetValue !== null && targetValue > 0 && currentDto && currentDto.valueNum !== null) {
        targetProgress = Math.round((currentDto.valueNum / targetValue) * 100 * 10) / 10;
      }
      const dataSource = extractDataSource(ind.formula);
      const isNumericAuto = yellowAt !== null && redAt !== null && ind.direction !== null;
      const mode = isNumericAuto || ind.zoneRules ? 'auto' : 'manual';

      indicatorDtos.push({
        id: ind.id,
        code: ind.code,
        kind: ind.kind,
        name: ind.name,
        formula: ind.formula,
        frequency: ind.frequency,
        periodKind: ind.periodKind,
        thresholds: {
          green: ind.thresholdLowText,
          yellow: ind.thresholdMidText,
          red: ind.thresholdHighText,
        },
        mode,
        ownerUnit: ownerU
          ? { code: ownerU.code, name: ownerU.name, kind: ownerU.kind }
          : null,
        note: ind.note,
        current: currentDto,
        submitPeriodKeys: indSubmitPeriodKeys,
        pendingSubmissions: indPendingSubmissions,
        unitKind: ind.unitKind,
        unitLabel: ind.unitLabel,
        direction: ind.direction,
        yellowAt,
        redAt,
        targetValue,
        targetProgress,
        dataSource,
      });
    }

    // 8. Residual history (kỳ cũ trước)
    const residualHistoryDtos: ResidualEntryDto[] = [];
    const sortedProfResiduals = [...profResiduals].sort((a, b) => {
      const pA = periodMap.get(a.periodKey);
      const pB = periodMap.get(b.periodKey);
      const startA = pA ? new Date(pA.startsOn).getTime() : 0;
      const startB = pB ? new Date(pB.startsOn).getTime() : 0;
      return startA - startB;
    });

    for (const r of sortedProfResiduals) {
      const resImpactScore = levelScore('impact', r.impact);
      const resLikelihoodScore = levelScore('likelihood', r.likelihood);
      residualHistoryDtos.push({
        periodKey: r.periodKey,
        rating: {
          impactLabel: r.impact,
          likelihoodLabel: r.likelihood,
          levelLabel: r.level,
          impactScore: resImpactScore,
          likelihoodScore: resLikelihoodScore,
          score: resImpactScore * resLikelihoodScore,
        },
      });
    }

    const summaryDto: ProfileSummaryDto = {
      riskCode: prof.riskCode,
      hsrrCode: prof.hsrrCode,
      name: prof.name,
      riskType: prof.riskType,
      riskZone: prof.riskZone,
      riskGroup: prof.riskGroup,
      owner: prof.owner,
      inherent,
      residual,
      kri: kriCounts,
      kci: kciCounts,
      actions: actionStatusCounts,
      actionProgress: profActionProgressAverage,
    };

    profileSummaryList.push(summaryDto);

    profileDetailMap.set(prof.riskCode, {
      profile: summaryDto,
      period: null, // Sẽ điền sau
      description: prof.description,
      relatedActivity: prof.relatedActivity,
      preparedByUnit: prof.preparedByUnit,
      causes: causeDtos,
      impacts: impactDtos,
      controls: controlDtos,
      actions: actionDtos,
      indicators: indicatorDtos,
      residualHistory: residualHistoryDtos,
    });
  }

  const hasApprovedData = approvedReadingsCount > 0 || approvedUpdatesCount > 0;
  let asOfDateStr: string | null = null;
  if (hasApprovedData && maxReviewedAtTime > 0) {
    const maxDate = new Date(maxReviewedAtTime);
    asOfDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(maxDate);
  }

  return {
    cycleRow,
    profiles: profileSummaryList,
    profileDetails: profileDetailMap,
    settings,
    allApprovedReadingsCount: approvedReadingsCount,
    allApprovedUpdatesCount: approvedUpdatesCount,
    hasApprovedData,
    asOfDate: asOfDateStr,
  };
}

// 4. GET /api/profiles
export async function getProfiles(
  options: { cycle?: number; period?: string },
  db: DbType = defaultDb
): Promise<ProfileSummaryDto[]> {
  const resolved = await resolveCycleAndPeriod(options, db);
  const data = await loadCycleAggregatedData(resolved.cycle.id, resolved.asOfEndsOn, db);
  return data.profiles;
}

// 5. GET /api/profiles/{riskCode}
export async function getProfileDetail(
  riskCode: string,
  options: { cycle?: number; period?: string },
  db: DbType = defaultDb,
  actor: Actor | null = null,
  today: Date = new Date()
): Promise<ProfileDetailDto> {
  const resolved = await resolveCycleAndPeriod(options, db);
  const data = await loadCycleAggregatedData(resolved.cycle.id, resolved.asOfEndsOn, db, actor, today);

  // Exact matching case-sensitive according to contract regex ^[A-Z0-9]+\.[A-Z0-9]+$
  const detail = data.profileDetails.get(riskCode);
  if (!detail) {
    throw new AppError('NOT_FOUND', `Không tìm thấy hồ sơ rủi ro ${riskCode}`);
  }

  detail.period = resolved.selectedPeriod
    ? toPeriodSummaryDto(resolved.selectedPeriod, (resolved.selectedPeriod as any).closedByName)
    : null;
  return detail;
}

// 6. GET /api/overview
export async function getOverview(
  options: { cycle?: number; period?: string },
  db: DbType = defaultDb
): Promise<OverviewDto> {
  const resolved = await resolveCycleAndPeriod(options, db);
  const data = await loadCycleAggregatedData(resolved.cycle.id, resolved.asOfEndsOn, db);

  const kriTotal: IndicatorZoneCountsDto = { total: 0, green: 0, yellow: 0, red: 0, noData: 0 };
  const kciTotal: IndicatorZoneCountsDto = { total: 0, green: 0, yellow: 0, red: 0, noData: 0 };
  const actionsTotal: ActionStatusCountsDto = {
    total: 0,
    completed: 0,
    overdue: 0,
    atRisk: 0,
    inProgress: 0,
    notStarted: 0,
  };

  let allActionPlansCount = 0;
  let allActionProgressSum = 0;

  for (const prof of data.profiles) {
    kriTotal.total += prof.kri.total;
    kriTotal.green += prof.kri.green;
    kriTotal.yellow += prof.kri.yellow;
    kriTotal.red += prof.kri.red;
    kriTotal.noData += prof.kri.noData;

    kciTotal.total += prof.kci.total;
    kciTotal.green += prof.kci.green;
    kciTotal.yellow += prof.kci.yellow;
    kciTotal.red += prof.kci.red;
    kciTotal.noData += prof.kci.noData;

    actionsTotal.total += prof.actions.total;
    actionsTotal.completed += prof.actions.completed;
    actionsTotal.overdue += prof.actions.overdue;
    actionsTotal.atRisk += prof.actions.atRisk;
    actionsTotal.inProgress += prof.actions.inProgress;
    actionsTotal.notStarted += prof.actions.notStarted;

    const detail = data.profileDetails.get(prof.riskCode);
    if (detail) {
      for (const act of detail.actions) {
        allActionPlansCount++;
        allActionProgressSum += act.progress;
      }
    }
  }

  const actionProgressAverage =
    allActionPlansCount > 0
      ? Number((allActionProgressSum / allActionPlansCount).toFixed(1))
      : 0;

  return {
    cycle: toCycleSummaryDto(resolved.cycle),
    period: resolved.selectedPeriod
      ? toPeriodSummaryDto(resolved.selectedPeriod, (resolved.selectedPeriod as any).closedByName)
      : null,
    hasApprovedData: data.hasApprovedData ?? false,
    asOfDate: data.asOfDate ?? null,
    profileCount: data.profiles.length,
    kri: kriTotal,
    kci: kciTotal,
    actions: actionsTotal,
    actionProgressAverage,
  };
}

// 7. GET /api/heatmap
export async function getHeatmap(
  options: { cycle?: number; period?: string },
  db: DbType = defaultDb
): Promise<HeatmapDto> {
  const resolved = await resolveCycleAndPeriod(options, db);
  const data = await loadCycleAggregatedData(resolved.cycle.id, resolved.asOfEndsOn, db);

  const points: HeatmapPointDto[] = data.profiles.map((p) => ({
    riskCode: p.riskCode,
    name: p.name,
    inherent: p.inherent,
    residual: p.residual,
  }));

  return {
    scaleProvisional: SCALE_IS_PROVISIONAL,
    impactLevels: [...IMPACT_LEVELS],
    likelihoodLevels: [...LIKELIHOOD_LEVELS],
    points,
  };
}

export interface ActionFilterOptions {
  cycle?: number;
  period?: string;
  riskCode?: string;
  status?: ActionStatus;
  unit?: string;
  dueFrom?: string;
  dueTo?: string;
  q?: string;
}

// 8. GET /api/actions
export async function getActions(
  options: ActionFilterOptions,
  db: DbType = defaultDb,
  actor: Actor | null = null,
  today: Date = new Date()
): Promise<ActionListItemDto[]> {
  const resolved = await resolveCycleAndPeriod(options, db);
  const data = await loadCycleAggregatedData(resolved.cycle.id, resolved.asOfEndsOn, db, actor, today);

  const list: ActionListItemDto[] = [];

  for (const prof of data.profiles) {
    if (options.riskCode && prof.riskCode !== options.riskCode) continue;

    const detail = data.profileDetails.get(prof.riskCode);
    if (!detail) continue;

    for (const act of detail.actions) {
      // Bộ lọc status
      if (options.status && act.status !== options.status) continue;

      // Bộ lọc unit: có ít nhất 1 đầu việc thuộc đơn vị đó
      if (options.unit) {
        const hasUnit = act.tasks.some((t: ActionTaskDto) => t.unit?.code === options.unit);
        if (!hasUnit) continue;
      }

      // Bộ lọc dueFrom: KH không có hạn bị loại
      if (options.dueFrom) {
        if (!act.dueDate || act.dueDate < options.dueFrom) continue;
      }

      // Bộ lọc dueTo: KH không có hạn bị loại
      if (options.dueTo) {
        if (!act.dueDate || act.dueDate > options.dueTo) continue;
      }

      // Bộ lọc q: tìm theo mã hoặc từ khóa trong mô tả, không phân biệt hoa thường
      if (options.q) {
        const qLower = options.q.toLowerCase();
        const codeMatch = act.code.toLowerCase().includes(qLower);
        const descMatch = act.description.toLowerCase().includes(qLower);
        if (!codeMatch && !descMatch) continue;
      }

      list.push({
        riskCode: prof.riskCode,
        riskName: prof.name,
        action: act,
      });
    }
  }

  // Sắp xếp: hạn tăng dần, KH không có hạn xếp cuối
  list.sort((a, b) => {
    const dueA = a.action.dueDate;
    const dueB = b.action.dueDate;
    if (dueA && dueB) {
      if (dueA !== dueB) return dueA.localeCompare(dueB);
    } else if (dueA && !dueB) {
      return -1;
    } else if (!dueA && dueB) {
      return 1;
    }

    // Thứ cấp: riskCode asc, action.code asc
    if (a.riskCode !== b.riskCode) return a.riskCode.localeCompare(b.riskCode);
    return a.action.code.localeCompare(b.action.code);
  });

  return list;
}

export interface IndicatorFilterOptions {
  cycle?: number;
  period?: string;
  riskCode?: string;
  kind?: 'kri' | 'kci';
  zone?: 'green' | 'yellow' | 'red' | 'none';
  unit?: string;
}

// 9. GET /api/indicators
export async function getIndicators(
  options: IndicatorFilterOptions,
  db: DbType = defaultDb,
  actor: Actor | null = null,
  today: Date = new Date()
): Promise<IndicatorListItemDto[]> {
  const resolved = await resolveCycleAndPeriod(options, db);
  const data = await loadCycleAggregatedData(resolved.cycle.id, resolved.asOfEndsOn, db, actor, today);

  const list: IndicatorListItemDto[] = [];

  for (const prof of data.profiles) {
    if (options.riskCode && prof.riskCode !== options.riskCode) continue;

    const detail = data.profileDetails.get(prof.riskCode);
    if (!detail) continue;

    for (const ind of detail.indicators) {
      if (options.kind && ind.kind !== options.kind) continue;

      if (options.zone) {
        if (options.zone === 'none') {
          if (ind.current !== null) continue;
        } else {
          if (ind.current?.zone !== options.zone) continue;
        }
      }

      if (options.unit && ind.ownerUnit?.code !== options.unit) continue;

      list.push({
        riskCode: prof.riskCode,
        riskName: prof.name,
        indicator: ind,
      });
    }
  }

  // Sắp theo mã hồ sơ rồi mã chỉ số
  list.sort((a, b) => {
    if (a.riskCode !== b.riskCode) return a.riskCode.localeCompare(b.riskCode);
    return a.indicator.code.localeCompare(b.indicator.code);
  });

  return list;
}

// 10. GET /api/indicators/{id}/history
export async function getIndicatorHistory(
  indicatorId: string,
  db: DbType = defaultDb
): Promise<IndicatorHistoryItemDto[]> {
  // Kiểm tra chỉ số tồn tại và lấy cycleId
  const [ind] = await db
    .select({
      id: indicator.id,
      cycleId: riskProfile.cycleId,
    })
    .from(indicator)
    .innerJoin(riskProfile, eq(indicator.profileId, riskProfile.id))
    .where(and(eq(indicator.id, indicatorId), isNull(indicator.deletedAt)));

  if (!ind) {
    throw new AppError('NOT_FOUND', `Không tìm thấy chỉ số ${indicatorId}`);
  }

  // Lấy các bản ghi approved của chỉ số này
  const approvedReadings = await db
    .select({
      id: indicatorReading.id,
      periodKey: indicatorReading.periodKey,
      valueNum: indicatorReading.valueNum,
      valueText: indicatorReading.valueText,
      zone: indicatorReading.zone,
      zoneSource: indicatorReading.zoneSource,
      reviewedAt: indicatorReading.reviewedAt,
      startsOn: period.startsOn,
      endsOn: period.endsOn,
    })
    .from(indicatorReading)
    .innerJoin(
      period,
      and(
        eq(indicatorReading.periodKey, period.key),
        eq(period.cycleId, ind.cycleId)
      )
    )
    .where(
      and(
        eq(indicatorReading.indicatorId, indicatorId),
        eq(indicatorReading.status, 'approved')
      )
    );

  // Mỗi kỳ lấy bản đã duyệt mới nhất của kỳ đó
  const byPeriod = new Map<string, typeof approvedReadings[0]>();
  for (const r of approvedReadings) {
    const existing = byPeriod.get(r.periodKey);
    if (!existing) {
      byPeriod.set(r.periodKey, r);
    } else {
      const timeR = r.reviewedAt ? new Date(r.reviewedAt).getTime() : 0;
      const timeEx = existing.reviewedAt ? new Date(existing.reviewedAt).getTime() : 0;
      if (timeR > timeEx) {
        byPeriod.set(r.periodKey, r);
      }
    }
  }

  const items = Array.from(byPeriod.values());

  // Kỳ cũ trước: sắp theo startsOn asc, endsOn asc
  items.sort((a, b) => {
    const startA = new Date(a.startsOn).getTime();
    const startB = new Date(b.startsOn).getTime();
    if (startA !== startB) return startA - startB;
    return new Date(a.endsOn).getTime() - new Date(b.endsOn).getTime();
  });

  return items.map((item) => ({
    periodKey: item.periodKey,
    valueNum: item.valueNum !== null ? parseFloat(item.valueNum) : null,
    valueText: item.valueText,
    zone: item.zone as 'green' | 'yellow' | 'red',
    zoneSource: item.zoneSource as 'auto' | 'manual',
    reviewedAt: item.reviewedAt ? new Date(item.reviewedAt).toISOString() : '',
  }));
}
