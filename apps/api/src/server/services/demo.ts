import { db as defaultDb } from '../db/client';
import {
  cycle,
  period,
  riskProfile,
  indicator,
  indicatorReading,
  actionPlan,
  actionTask,
  actionUpdate,
  residualAssessment,
  auditLog,
} from '../db/schema';
import { withAudit } from './audit';
import { AppError } from '../errors';
import { evaluateZone, ZoneRule, Zone } from '../../lib/domain/thresholds';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';

export interface DemoIds {
  periods: string[];
  indicatorReadings: string[];
  actionUpdates: string[];
  residualAssessments: string[];
}

export interface DemoRecordsSummary {
  periods: number;
  indicatorReadings: number;
  actionUpdates: number;
  residualAssessments: number;
}

/**
 * Thu thập tất cả các ID demo đang có hiệu lực trong hệ thống (từ audit_log: seed_demo - clear_demo)
 */
async function getActiveDemoIds(db: PostgresJsDatabase<typeof schema>): Promise<DemoIds> {
  const seedLogs = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, 'seed_demo'));

  const clearLogs = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, 'clear_demo'));

  const seeded = {
    periods: new Set<string>(),
    indicatorReadings: new Set<string>(),
    actionUpdates: new Set<string>(),
    residualAssessments: new Set<string>(),
  };

  for (const log of seedLogs) {
    const after = log.after as any;
    if (after) {
      if (Array.isArray(after.periods)) after.periods.forEach((id: string) => seeded.periods.add(id));
      if (Array.isArray(after.indicatorReadings))
        after.indicatorReadings.forEach((id: string) => seeded.indicatorReadings.add(id));
      if (Array.isArray(after.actionUpdates))
        after.actionUpdates.forEach((id: string) => seeded.actionUpdates.add(id));
      if (Array.isArray(after.residualAssessments))
        after.residualAssessments.forEach((id: string) => seeded.residualAssessments.add(id));
    }
  }

  const cleared = {
    periods: new Set<string>(),
    indicatorReadings: new Set<string>(),
    actionUpdates: new Set<string>(),
    residualAssessments: new Set<string>(),
  };

  for (const log of clearLogs) {
    const after = log.after as any;
    if (after?.deletedIds) {
      if (Array.isArray(after.deletedIds.periods))
        after.deletedIds.periods.forEach((id: string) => cleared.periods.add(id));
      if (Array.isArray(after.deletedIds.indicatorReadings))
        after.deletedIds.indicatorReadings.forEach((id: string) => cleared.indicatorReadings.add(id));
      if (Array.isArray(after.deletedIds.actionUpdates))
        after.deletedIds.actionUpdates.forEach((id: string) => cleared.actionUpdates.add(id));
      if (Array.isArray(after.deletedIds.residualAssessments))
        after.deletedIds.residualAssessments.forEach((id: string) => cleared.residualAssessments.add(id));
    }
  }

  // Active = seeded - cleared
  return {
    periods: Array.from(seeded.periods).filter((id) => !cleared.periods.has(id)),
    indicatorReadings: Array.from(seeded.indicatorReadings).filter((id) => !cleared.indicatorReadings.has(id)),
    actionUpdates: Array.from(seeded.actionUpdates).filter((id) => !cleared.actionUpdates.has(id)),
    residualAssessments: Array.from(seeded.residualAssessments).filter((id) => !cleared.residualAssessments.has(id)),
  };
}

/**
 * Tìm một số giá trị thoả mãn zone mong muốn theo rules của chỉ số
 */
function findValueForZone(zone: Zone, rules: ZoneRule[]): number {
  const rule = rules.find((r) => r.zone === zone);
  if (!rule) {
    throw new Error(`Không tìm thấy quy tắc cho vùng ${zone}`);
  }

  let candidate: number;
  if (rule.lo !== null && rule.hi !== null) {
    candidate = Number(((rule.lo + rule.hi) / 2).toFixed(1));
  } else if (rule.lo !== null) {
    candidate = rule.loInclusive ? rule.lo : rule.lo + 1;
  } else if (rule.hi !== null) {
    candidate = rule.hiInclusive ? rule.hi : rule.hi - 1;
  } else {
    candidate = 50;
  }

  const evaluated = evaluateZone(candidate, { mode: 'auto', rules });
  if (evaluated !== zone) {
    throw new Error(`Giá trị ${candidate} không khớp vùng ${zone} (kết quả: ${evaluated})`);
  }
  return candidate;
}

/**
 * Xóa dữ liệu demo theo danh sách ID đã lưu trong audit_log
 */
export async function clearDemoData(
  db: PostgresJsDatabase<typeof schema> = defaultDb
): Promise<{ deleted: DemoRecordsSummary }> {
  const active = await getActiveDemoIds(db);

  return await withAudit(
    null,
    { action: 'clear_demo', entity: 'demo_data' },
    async (tx) => {
      let deletedReadings = 0;
      let deletedUpdates = 0;
      let deletedResiduals = 0;
      let deletedPeriods = 0;

      if (active.indicatorReadings.length > 0) {
        const res = await tx
          .delete(indicatorReading)
          .where(inArray(indicatorReading.id, active.indicatorReadings))
          .returning();
        deletedReadings = res.length;
      }

      if (active.actionUpdates.length > 0) {
        const res = await tx
          .delete(actionUpdate)
          .where(inArray(actionUpdate.id, active.actionUpdates))
          .returning();
        deletedUpdates = res.length;
      }

      if (active.residualAssessments.length > 0) {
        const res = await tx
          .delete(residualAssessment)
          .where(inArray(residualAssessment.id, active.residualAssessments))
          .returning();
        deletedResiduals = res.length;
      }

      if (active.periods.length > 0) {
        const res = await tx
          .delete(period)
          .where(inArray(period.id, active.periods))
          .returning();
        deletedPeriods = res.length;
      }

      const summary: DemoRecordsSummary = {
        periods: deletedPeriods,
        indicatorReadings: deletedReadings,
        actionUpdates: deletedUpdates,
        residualAssessments: deletedResiduals,
      };

      return {
        entityId: 'demo_clear',
        after: {
          deletedCounts: summary,
          deletedIds: active,
        },
        result: { deleted: summary },
      };
    },
    db
  );
}

/**
 * Tạo bộ dữ liệu demo đầy đủ cho kế hoạch 2
 */
export async function seedDemoData(
  targetCycleId?: string,
  db: PostgresJsDatabase<typeof schema> = defaultDb
): Promise<{ inserted: DemoRecordsSummary }> {
  // Rào chắn 1: Kiểm tra biến môi trường
  if (process.env.ALLOW_DEMO_DATA !== '1') {
    throw new AppError(
      'FORBIDDEN',
      'Chỉ được phép tạo dữ liệu demo khi biến môi trường ALLOW_DEMO_DATA=1'
    );
  }

  // Rào chắn 2: Kiểm tra dữ liệu thật
  const activeDemo = await getActiveDemoIds(db);
  const activeReadingSet = new Set(activeDemo.indicatorReadings);
  const activeUpdateSet = new Set(activeDemo.actionUpdates);
  const activeResidualSet = new Set(activeDemo.residualAssessments);

  const allReadings = await db.select({ id: indicatorReading.id }).from(indicatorReading);
  const nonDemoReadings = allReadings.filter((r) => !activeReadingSet.has(r.id));
  if (nonDemoReadings.length > 0) {
    throw new AppError(
      'CONFLICT',
      'Đã có dữ liệu thật (không thuộc tập demo) trong bảng indicator_reading, từ chối ghi dữ liệu demo'
    );
  }

  const allUpdates = await db.select({ id: actionUpdate.id }).from(actionUpdate);
  const nonDemoUpdates = allUpdates.filter((u) => !activeUpdateSet.has(u.id));
  if (nonDemoUpdates.length > 0) {
    throw new AppError(
      'CONFLICT',
      'Đã có dữ liệu thật (không thuộc tập demo) trong bảng action_update, từ chối ghi dữ liệu demo'
    );
  }

  const allResiduals = await db.select({ id: residualAssessment.id }).from(residualAssessment);
  const nonDemoResiduals = allResiduals.filter((r) => !activeResidualSet.has(r.id));
  if (nonDemoResiduals.length > 0) {
    throw new AppError(
      'CONFLICT',
      'Đã có dữ liệu thật (không thuộc tập demo) trong bảng residual_assessment, từ chối ghi dữ liệu demo'
    );
  }

  // Rào chắn 3: Nếu demo đã tồn tại, dọn dẹp trước để tránh nhân đôi
  if (
    activeDemo.periods.length > 0 ||
    activeDemo.indicatorReadings.length > 0 ||
    activeDemo.actionUpdates.length > 0 ||
    activeDemo.residualAssessments.length > 0
  ) {
    await clearDemoData(db);
  }

  // Lấy cycleId
  let cycleId = targetCycleId;
  if (!cycleId) {
    const [c] = await db.select().from(cycle).where(eq(cycle.status, 'open')).limit(1);
    if (!c) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy chu kỳ đang mở để tạo dữ liệu demo');
    }
    cycleId = c.id;
  }

  const [cycleRow] = await db.select().from(cycle).where(eq(cycle.id, cycleId));
  const year = cycleRow?.year ?? 2026;

  // 1. Thêm hai kỳ quá khứ chỉ cho demo: 2026-Q3 và 2026-09
  const demoPeriodDefs = [
    {
      cycleId,
      key: `${year}-09`,
      kind: 'month' as const,
      label: `Tháng 09/${year}`,
      startsOn: `${year}-09-01`,
      endsOn: `${year}-09-30`,
      dueAt: new Date(Date.UTC(year, 9, 10, 16, 59, 59)),
    },
    {
      cycleId,
      key: `${year}-Q3`,
      kind: 'quarter' as const,
      label: `Quý 3/${year}`,
      startsOn: `${year}-07-01`,
      endsOn: `${year}-09-30`,
      dueAt: new Date(Date.UTC(year, 9, 10, 16, 59, 59)),
    },
  ];

  const existingDemoPeriods = await db
    .select({ id: period.id, key: period.key })
    .from(period)
    .where(
      and(
        eq(period.cycleId, cycleId),
        inArray(
          period.key,
          demoPeriodDefs.map((d) => d.key)
        )
      )
    );
  const existingPeriodKeySet = new Set(existingDemoPeriods.map((p) => p.key));
  const periodsToInsert = demoPeriodDefs.filter((d) => !existingPeriodKeySet.has(d.key));

  let periodIds: string[] = [];
  if (periodsToInsert.length > 0) {
    const createdPeriods = await db
      .insert(period)
      .values(periodsToInsert)
      .returning();
    periodIds = createdPeriods.map((p) => p.id);
  }

  // 2. Chuẩn bị số liệu indicator_reading
  const allIndicators = await db
    .select({
      id: indicator.id,
      code: indicator.code,
      kind: indicator.kind,
      periodKind: indicator.periodKind,
      zoneRules: indicator.zoneRules,
    })
    .from(indicator)
    .innerJoin(riskProfile, eq(indicator.profileId, riskProfile.id))
    .where(eq(riskProfile.cycleId, cycleId));

  const quarterIndicators = allIndicators.filter((i) => i.periodKind === 'quarter');
  const manualQuarter = quarterIndicators.filter((i) => i.zoneRules === null);
  const autoQuarter = quarterIndicators.filter((i) => i.zoneRules !== null);

  // Chọn 10 chỉ số quý cho 2026-Q4:
  // - 2 manual: 1 red, 1 yellow
  // - 8 auto: 1 red, 2 yellow, 5 green
  // Tổng cộng: đúng 2 đỏ, 3 vàng, 5 xanh
  const selectedManual1 = manualQuarter[0]; // yellow
  const selectedManual2 = manualQuarter[1]; // red

  const selectedAutoRed = autoQuarter[0];
  const selectedAutoYellow1 = autoQuarter[1];
  const selectedAutoYellow2 = autoQuarter[2];
  const selectedAutoGreen = autoQuarter.slice(3, 8); // 5 green

  const readingRowsToInsert: (typeof indicatorReading.$inferInsert)[] = [];

  // Q4:
  // 1. Manual Yellow
  readingRowsToInsert.push({
    indicatorId: selectedManual1.id,
    periodKey: `${year}-Q4`,
    valueText: 'Phát sinh 01 vụ việc trong quý',
    zone: 'yellow',
    zoneSource: 'manual',
    note: 'DỮ LIỆU DEMO - Số liệu thủ công quý 4',
    status: 'approved',
    reviewedAt: new Date(Date.UTC(year + 1, 0, 5, 8, 0, 0)),
  });

  // 2. Manual Red
  readingRowsToInsert.push({
    indicatorId: selectedManual2.id,
    periodKey: `${year}-Q4`,
    valueText: 'Phát sinh 02 sự cố cấp 2',
    zone: 'red',
    zoneSource: 'manual',
    note: 'DỮ LIỆU DEMO - Số liệu thủ công quý 4',
    status: 'approved',
    reviewedAt: new Date(Date.UTC(year + 1, 0, 5, 8, 0, 0)),
  });

  // 3. Auto Red (1)
  const redVal = findValueForZone('red', selectedAutoRed.zoneRules as ZoneRule[]);
  readingRowsToInsert.push({
    indicatorId: selectedAutoRed.id,
    periodKey: `${year}-Q4`,
    valueNum: redVal.toString(),
    zone: 'red',
    zoneSource: 'auto',
    note: 'DỮ LIỆU DEMO - Số liệu tự động quý 4',
    status: 'approved',
    reviewedAt: new Date(Date.UTC(year + 1, 0, 5, 8, 0, 0)),
  });

  // 4 & 5. Auto Yellow (2)
  const yVal1 = findValueForZone('yellow', selectedAutoYellow1.zoneRules as ZoneRule[]);
  readingRowsToInsert.push({
    indicatorId: selectedAutoYellow1.id,
    periodKey: `${year}-Q4`,
    valueNum: yVal1.toString(),
    zone: 'yellow',
    zoneSource: 'auto',
    note: 'DỮ LIỆU DEMO - Số liệu tự động quý 4',
    status: 'approved',
    reviewedAt: new Date(Date.UTC(year + 1, 0, 5, 8, 0, 0)),
  });

  const yVal2 = findValueForZone('yellow', selectedAutoYellow2.zoneRules as ZoneRule[]);
  readingRowsToInsert.push({
    indicatorId: selectedAutoYellow2.id,
    periodKey: `${year}-Q4`,
    valueNum: yVal2.toString(),
    zone: 'yellow',
    zoneSource: 'auto',
    note: 'DỮ LIỆU DEMO - Số liệu tự động quý 4',
    status: 'approved',
    reviewedAt: new Date(Date.UTC(year + 1, 0, 5, 8, 0, 0)),
  });

  // 6-10. Auto Green (5)
  for (const ind of selectedAutoGreen) {
    const gVal = findValueForZone('green', ind.zoneRules as ZoneRule[]);
    readingRowsToInsert.push({
      indicatorId: ind.id,
      periodKey: `${year}-Q4`,
      valueNum: gVal.toString(),
      zone: 'green',
      zoneSource: 'auto',
      note: 'DỮ LIỆU DEMO - Số liệu tự động quý 4',
      status: 'approved',
      reviewedAt: new Date(Date.UTC(year + 1, 0, 5, 8, 0, 0)),
    });
  }

  // Q3: ít nhất 6 chỉ số quý (lấy 6 chỉ số trong 10 chỉ số trên để tạo xu hướng)
  const q3Indicators = [
    selectedManual1,
    selectedAutoRed,
    selectedAutoYellow1,
    ...selectedAutoGreen.slice(0, 3),
  ];
  for (const ind of q3Indicators) {
    if (ind.zoneRules) {
      const gVal = findValueForZone('green', ind.zoneRules as ZoneRule[]);
      readingRowsToInsert.push({
        indicatorId: ind.id,
        periodKey: `${year}-Q3`,
        valueNum: gVal.toString(),
        zone: 'green',
        zoneSource: 'auto',
        note: 'DỮ LIỆU DEMO - Số liệu quý 3',
        status: 'approved',
        reviewedAt: new Date(Date.UTC(year, 9, 5, 8, 0, 0)),
      });
    } else {
      readingRowsToInsert.push({
        indicatorId: ind.id,
        periodKey: `${year}-Q3`,
        valueText: 'Hoạt động bình thường trong quý 3',
        zone: 'green',
        zoneSource: 'manual',
        note: 'DỮ LIỆU DEMO - Số liệu quý 3',
        status: 'approved',
        reviewedAt: new Date(Date.UTC(year, 9, 5, 8, 0, 0)),
      });
    }
  }

  // 2 KRI tháng của HD11.R27 trong 2026-10 và 2026-09
  const hd11MonthlyKris = allIndicators.filter(
    (i) => i.code.startsWith('HD11.R27.KRI') && i.periodKind === 'month'
  );

  for (const ind of hd11MonthlyKris) {
    if (ind.zoneRules) {
      // 2026-09: green
      const gVal = findValueForZone('green', ind.zoneRules as ZoneRule[]);
      readingRowsToInsert.push({
        indicatorId: ind.id,
        periodKey: `${year}-09`,
        valueNum: gVal.toString(),
        zone: 'green',
        zoneSource: 'auto',
        note: 'DỮ LIỆU DEMO - Số liệu tháng 9',
        status: 'approved',
        reviewedAt: new Date(Date.UTC(year, 9, 5, 8, 0, 0)),
      });

      // 2026-10: yellow
      const yVal = findValueForZone('yellow', ind.zoneRules as ZoneRule[]);
      readingRowsToInsert.push({
        indicatorId: ind.id,
        periodKey: `${year}-10`,
        valueNum: yVal.toString(),
        zone: 'yellow',
        zoneSource: 'auto',
        note: 'DỮ LIỆU DEMO - Số liệu tháng 10',
        status: 'approved',
        reviewedAt: new Date(Date.UTC(year, 10, 5, 8, 0, 0)),
      });
    }
  }

  // 3. Chuẩn bị actionUpdate cho 2026-Q4
  // Cho ít nhất 6 trong 10 đầu việc mặc định, tiến độ khác nhau (có 1 đầu việc 100 để một KH completed)
  const allTasks = await db
    .select({
      taskId: actionTask.id,
      actionId: actionTask.actionId,
      actionCode: actionPlan.code,
    })
    .from(actionTask)
    .innerJoin(actionPlan, eq(actionTask.actionId, actionPlan.id))
    .innerJoin(riskProfile, eq(actionPlan.profileId, riskProfile.id))
    .where(and(eq(riskProfile.cycleId, cycleId), isNull(actionTask.deletedAt)));

  const actionUpdatesToInsert: (typeof actionUpdate.$inferInsert)[] = [];
  const taskProgresses = [100, 75, 50, 40, 20, 10]; // 6 tasks

  for (let idx = 0; idx < taskProgresses.length && idx < allTasks.length; idx++) {
    actionUpdatesToInsert.push({
      taskId: allTasks[idx].taskId,
      periodKey: `${year}-Q4`,
      progress: taskProgresses[idx],
      note: `DỮ LIỆU DEMO - Cập nhật tiến độ đầu việc (${taskProgresses[idx]}%)`,
      status: 'approved',
      reviewedAt: new Date(Date.UTC(year + 1, 0, 5, 8, 0, 0)),
    });
  }

  // 4. Chuẩn bị residualAssessment cho 2026-Q3 và 2026-Q4 của ít nhất 2 hồ sơ
  const profiles = await db
    .select({ id: riskProfile.id, riskCode: riskProfile.riskCode })
    .from(riskProfile)
    .where(eq(riskProfile.cycleId, cycleId))
    .limit(2);

  const residualToInsert: (typeof residualAssessment.$inferInsert)[] = [];
  for (const prof of profiles) {
    // Q3
    residualToInsert.push({
      profileId: prof.id,
      periodKey: `${year}-Q3`,
      impact: 'Nhỏ',
      likelihood: 'Ít khả năng',
      level: 'Trung bình',
      enteredAt: new Date(Date.UTC(year, 9, 5, 8, 0, 0)),
    });
    // Q4
    residualToInsert.push({
      profileId: prof.id,
      periodKey: `${year}-Q4`,
      impact: 'Nhỏ',
      likelihood: 'Ít khả năng',
      level: 'Trung bình',
      enteredAt: new Date(Date.UTC(year + 1, 0, 5, 8, 0, 0)),
    });
  }

  // 5. Thực hiện ghi tất cả vào cơ sở dữ liệu qua withAudit
  return await withAudit(
    null,
    { action: 'seed_demo', entity: 'demo_data' },
    async (tx) => {
      const insertedReadings = await tx
        .insert(indicatorReading)
        .values(readingRowsToInsert)
        .returning();

      const insertedUpdates = await tx
        .insert(actionUpdate)
        .values(actionUpdatesToInsert)
        .returning();

      const insertedResiduals = await tx
        .insert(residualAssessment)
        .values(residualToInsert)
        .returning();

      const demoIds: DemoIds = {
        periods: periodIds,
        indicatorReadings: insertedReadings.map((r) => r.id),
        actionUpdates: insertedUpdates.map((u) => u.id),
        residualAssessments: insertedResiduals.map((r) => r.id),
      };

      const summary: DemoRecordsSummary = {
        periods: demoIds.periods.length,
        indicatorReadings: demoIds.indicatorReadings.length,
        actionUpdates: demoIds.actionUpdates.length,
        residualAssessments: demoIds.residualAssessments.length,
      };

      return {
        entityId: cycleId!,
        after: demoIds,
        result: { inserted: summary },
      };
    },
    db
  );
}
