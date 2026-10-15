import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { db } from '../db/client';
import { cycle, riskProfile, control, indicator, unit } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import {
  listAssignments,
  assignControlUnits,
  setIndicatorOwner,
} from './assignments';
import { AppError } from '../errors';

describe('S2: Chu kỳ mặc định của thao tác gán đơn vị khi có chu kỳ năm lớn hơn bị archived', () => {
  const meta = { actor: null, ip: '127.0.0.1' };

  const openYear = 2090;
  const archivedYear = 2099;

  beforeAll(async () => {
    // Tạo chu kỳ đang mở có năm lớn nhất (2090, open)
    const [openCycle] = await db
      .insert(cycle)
      .values({ year: openYear, status: 'open' })
      .onConflictDoUpdate({
        target: cycle.year,
        set: { status: 'open' },
      })
      .returning();

    // Tạo chu kỳ năm lớn hơn nhưng đã lưu trữ (2099, archived)
    await db
      .insert(cycle)
      .values({ year: archivedYear, status: 'archived' })
      .onConflictDoUpdate({
        target: cycle.year,
        set: { status: 'archived' },
      });

    // Tạo profile và control, indicator trên chu kỳ đang mở 2090
    const [pOpen] = await db
      .insert(riskProfile)
      .values({
        cycleId: openCycle.id,
        riskCode: 'TEST.S2',
        hsrrCode: 'HSRR.TEST.S2',
        name: 'Hồ sơ test S2',
        riskType: 'Chiến lược',
        riskZone: 'Vùng 1',
        riskGroup: 'Nhóm 1',
        owner: 'Ban 3',
        relatedActivity: 'Hoạt động SXKD',
        preparedByUnit: 'Ban 3',
        description: 'Mô tả rủi ro kiểm thử',
        inherentImpact: 'Lớn',
        inherentLikelihood: 'Có thể xảy ra',
        inherentLevel: 'Cao',
      })
      .onConflictDoUpdate({
        target: [riskProfile.cycleId, riskProfile.riskCode],
        set: { name: 'Hồ sơ test S2', deletedAt: null },
      })
      .returning();

    await db
      .insert(control)
      .values({
        profileId: pOpen.id,
        code: 'TEST.S2.KS01',
        name: 'Kiểm soát test S2',
        description: 'Mô tả',
        ownerText: 'Ban 3',
        frequency: 'Tháng',
        objective: 'Mục tiêu',
        method: 'Thủ công',
        designEff: 'Hiệu quả',
        operatingEff: 'Hiệu quả',
        overallEff: 'Hiệu quả',
      })
      .onConflictDoNothing();

    await db
      .insert(indicator)
      .values({
        profileId: pOpen.id,
        code: 'TEST.S2.KRI01',
        name: 'Chỉ số test S2',
        kind: 'kri',
        formula: 'A/B',
        frequency: 'Tháng',
        periodKind: 'month',
        thresholdLowText: '<10',
        thresholdMidText: '10-20',
        thresholdHighText: '>20',
        zoneRules: {},
      })
      .onConflictDoNothing();

    await db
      .insert(unit)
      .values({
        code: 'TEST_U1',
        name: 'Đơn vị test U1',
        kind: 'department',
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    // Dọn dẹp chu kỳ 2090, 2099 và TEST.S2
    await db.delete(cycle).where(eq(cycle.year, archivedYear));
    await db.delete(cycle).where(eq(cycle.year, openYear));
  });

  it('1. listAssignments không truyền cycle phải dùng chu kỳ đang mở (2090), không bị 404 do chọn 2099', async () => {
    const res = await listAssignments('TEST.S2');
    expect(res).toBeDefined();
    expect(res.riskCode).toBe('TEST.S2');
  });

  it('2. assignControlUnits không truyền cycle phải dùng chu kỳ đang mở (2026), không bị 409 CYCLE_ARCHIVED do chọn 2099', async () => {
    const res = await assignControlUnits('TEST.S2', 'TEST.S2.KS01', ['TEST_U1'], meta);
    expect(res).toBeDefined();
    expect(res.map((u) => u.code)).toContain('TEST_U1');
  });

  it('3. setIndicatorOwner không truyền cycle phải dùng chu kỳ đang mở (2026), không bị 409 CYCLE_ARCHIVED do chọn 2099', async () => {
    const res = await setIndicatorOwner('TEST.S2', 'TEST.S2.KRI01', 'TEST_U1', meta);
    expect(res).toBeDefined();
    expect(res.ownerUnit?.code).toBe('TEST_U1');
  });

  it('4. assignControlUnits truyền cycle=2099 (archived) phải trả 409 CYCLE_ARCHIVED', async () => {
    await expect(
      assignControlUnits('TEST.S2', 'TEST.S2.KS01', ['TEST_U1'], meta, 2099)
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'CYCLE_ARCHIVED',
      })
    );
  });

  it('5. setIndicatorOwner truyền cycle=2099 (archived) phải trả 409 CYCLE_ARCHIVED', async () => {
    await expect(
      setIndicatorOwner('TEST.S2', 'TEST.S2.KRI01', 'TEST_U1', meta, 2099)
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'CYCLE_ARCHIVED',
      })
    );
  });
});
