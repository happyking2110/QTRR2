import { describe, it, expect } from 'vitest';
import type { components } from './schema';

describe('Plan 4C OpenAPI v0.6.0 TypeScript Schema Types (W1)', () => {
  it('conforms to Indicator schema with 4C extensions', () => {
    type Indicator = components['schemas']['Indicator'];

    const mockKri: Indicator = {
      id: 'ind-01',
      code: 'CN03.R14.KRI01',
      name: 'Số vụ lộ lọt dữ liệu',
      kind: 'kri',
      frequency: 'Tháng',
      mode: 'auto',
      thresholds: {
        green: '0 vụ',
        yellow: '1 vụ',
        red: '≥ 2 vụ',
      },
      currentValue: '1 vụ việc',
      currentZone: 'yellow',
      unitKind: 'count',
      unitLabel: 'vụ việc',
      direction: 'higher_is_worse',
      yellowAt: 1,
      redAt: 2,
      targetValue: null,
      targetProgress: null,
      dataSource: 'Hệ thống DLP và SOC',
      submitPeriodKeys: ['2026-M09'],
    };

    expect(mockKri.unitKind).toBe('count');
    expect(mockKri.direction).toBe('higher_is_worse');
    expect(mockKri.yellowAt).toBe(1);
    expect(mockKri.redAt).toBe(2);
    expect(mockKri.dataSource).toBe('Hệ thống DLP và SOC');
  });

  it('conforms to Indicator schema for KCI with target progress', () => {
    type Indicator = components['schemas']['Indicator'];

    const mockKci: Indicator = {
      id: 'ind-02',
      code: 'HD11.R27.KCI02',
      name: 'Tỷ lệ hệ thống diễn tập DR đạt yêu cầu',
      kind: 'kci',
      frequency: 'Theo đợt diễn tập',
      mode: 'auto',
      thresholds: {
        green: '≥ 95%',
        yellow: '80% - < 95%',
        red: '< 80%',
      },
      currentValue: '92%',
      currentZone: 'yellow',
      unitKind: 'percent',
      unitLabel: '%',
      direction: 'lower_is_worse',
      yellowAt: 95,
      redAt: 80,
      targetValue: 100,
      targetProgress: 92,
      dataSource: null,
      submitPeriodKeys: [],
    };

    expect(mockKci.targetValue).toBe(100);
    expect(mockKci.targetProgress).toBe(92);
  });

  it('conforms to RiskRating schema with score', () => {
    type RiskRating = components['schemas']['RiskRating'];

    const rating: RiskRating = {
      levelLabel: 'Rất cao',
      likelihoodScore: 4,
      impactScore: 5,
      score: 20,
    };

    expect(rating.score).toBe(20);
  });

  it('conforms to IndicatorTargetsInput schema for PUT .../targets', () => {
    type IndicatorTargetsInput = components['schemas']['IndicatorTargetsInput'];

    const kriTargets: IndicatorTargetsInput = {
      unitKind: 'count',
      unitLabel: 'vụ việc',
      direction: 'higher_is_worse',
      yellowAt: 1,
      redAt: 2,
      targetValue: null,
    };

    const kciTargets: IndicatorTargetsInput = {
      unitKind: 'percent',
      unitLabel: '%',
      direction: 'lower_is_worse',
      yellowAt: 95,
      redAt: 80,
      targetValue: 100,
    };

    expect(kriTargets.unitKind).toBe('count');
    expect(kciTargets.targetValue).toBe(100);
  });
});
