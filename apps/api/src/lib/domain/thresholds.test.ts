import { describe, it, expect } from 'vitest';
import {
  parseThresholdSet,
  evaluateZone,
  inferIndicatorUnit,
  inferDirection,
  evaluateNumericZone,
  type ThresholdSet,
} from './thresholds';

describe('parseThresholdSet - 21 bộ ba ngưỡng thật', () => {
  const all21Cases: Array<{
    code: string;
    thresholds: [string, string, string];
    expectedMode: 'auto' | 'manual';
    reasonSubstring?: string;
  }> = [
    // HD11.R27
    {
      code: 'HD11.R27.KRI01',
      thresholds: ['≤ 5%', '> 5% - 10%', '> 10%'],
      expectedMode: 'auto',
    },
    {
      code: 'HD11.R27.KRI02',
      thresholds: ['≤ 5%', '> 5% - 10%', '> 10%'],
      expectedMode: 'auto',
    },
    {
      code: 'HD11.R27.KRI03',
      thresholds: ['0', '> 0% - 2%', '> 2%'],
      expectedMode: 'auto',
    },
    {
      code: 'HD11.R27.KCI01',
      thresholds: ['≥ 60%', '50% - <60%', '< 50%'],
      expectedMode: 'auto',
    },
    {
      code: 'HD11.R27.KCI02',
      thresholds: ['≥ 95%', '80% - <95%', '< 80%'],
      expectedMode: 'auto',
    },
    {
      code: 'HD11.R27.KCI03',
      thresholds: ['1', '50% – <100%', '<50%'],
      expectedMode: 'auto',
    },

    // CN02.R13
    {
      code: 'CN02.R13.KRI01',
      thresholds: [
        '≤5%',
        '>5% - 10%',
        '>10% hoặc tồn tại lỗ hổng mức Nghiêm trọng/Cao chưa được khắc phục quá thời hạn quy định',
      ],
      expectedMode: 'manual',
    },
    {
      code: 'CN02.R13.KRI02',
      thresholds: ['Không có sự cố', '-', 'Có 01 sự cố mức Lớn trở lên'],
      expectedMode: 'manual',
    },
    {
      code: 'CN02.R13.KCI01',
      thresholds: ['1', '90% - <100%', '<90%'],
      expectedMode: 'auto',
    },
    {
      code: 'CN02.R13.KCI02',
      thresholds: ['≥90%', '80% - <90%', '<80%'],
      expectedMode: 'auto',
    },
    {
      code: 'CN02.R13.KCI03',
      thresholds: ['≤5%', '>5% - 10%', '>10%'],
      expectedMode: 'auto',
    },
    {
      code: 'CN02.R13.KCI04',
      thresholds: ['≥95%', '90% - <95%', '<90%'],
      expectedMode: 'auto',
    },

    // CN03.R14
    {
      code: 'CN03.R14.KRI01',
      thresholds: [
        'Không phát sinh',
        'Phát sinh 01 vụ việc vi phạm hoặc có khiếu nại của khách hàng',
        'Phát sinh từ 02 vụ việc vi phạm hoặc có từ 02 khiếu nại của khách hàng trở lên',
      ],
      expectedMode: 'manual',
    },
    {
      code: 'CN03.R14.KCI01',
      thresholds: ['1', '90% – <100%', '<90%'],
      expectedMode: 'auto',
    },
    {
      code: 'CN03.R14.KCI02',
      thresholds: ['1', '90% – <100%', '<90%'],
      expectedMode: 'auto',
    },

    // TT07.R46
    {
      code: 'TT07.R46.KRI01',
      thresholds: [
        'Không phát sinh',
        'Phát sinh 01 vụ việc làm sai lệch/lộ lọt/mất dữ liệu thông tin nhưng chưa gây thiệt hại nghiêm trọng',
        'Phát sinh ≥02 vụ việc hoặc 01 vụ việc gây thiệt hại nghiêm trọng',
      ],
      expectedMode: 'manual',
    },
    {
      code: 'TT07.R46.KRI02',
      thresholds: ['0', '>0% - 5%', '>5%'],
      expectedMode: 'auto',
    },
    {
      code: 'TT07.R46.KRI03',
      thresholds: [
        'Không phát sinh',
        'Phát sinh 01 kiến nghị/khuyến nghị của cơ quan nhà nước có thẩm quyền',
        'Phát sinh ≥02 kiến nghị/khuyến nghị của cơ quan nhà nước có thẩm quyền hoặc bị xử phạt',
      ],
      expectedMode: 'manual',
    },
    {
      code: 'TT07.R46.KCI01',
      thresholds: ['1', '90% – <100%', '<90%'],
      expectedMode: 'auto',
    },
    {
      code: 'TT07.R46.KCI02',
      thresholds: ['1', '95% – <100%', '<95%'],
      expectedMode: 'auto',
    },
    {
      code: 'TT07.R46.KCI03',
      thresholds: ['1', '95% – <100%', '<95%'],
      expectedMode: 'auto',
    },
  ];

  it('correctly classifies all 21 indicator threshold triples (16 auto, 5 manual)', () => {
    let autoCount = 0;
    let manualCount = 0;

    for (const item of all21Cases) {
      const res = parseThresholdSet(item.thresholds);
      expect(res.mode, `Failed for ${item.code}`).toBe(item.expectedMode);
      if (res.mode === 'auto') autoCount++;
      if (res.mode === 'manual') manualCount++;
    }

    expect(autoCount).toBe(16);
    expect(manualCount).toBe(5);
  });
});

describe('evaluateZone - ca kiểm thử biên', () => {
  it('handles ≤ 5% / > 5% - 10% / > 10% correctly', () => {
    const set = parseThresholdSet(['≤ 5%', '> 5% - 10%', '> 10%']);
    expect(evaluateZone(5, set)).toBe('green');
    expect(evaluateZone(5.01, set)).toBe('yellow');
    expect(evaluateZone(10, set)).toBe('yellow');
    expect(evaluateZone(10.01, set)).toBe('red');
  });

  it('handles 0 / > 0% - 2% / > 2% correctly (point 0)', () => {
    const set = parseThresholdSet(['0', '> 0% - 2%', '> 2%']);
    expect(evaluateZone(0, set)).toBe('green');
    expect(evaluateZone(0.01, set)).toBe('yellow');
    expect(evaluateZone(2, set)).toBe('yellow');
    expect(evaluateZone(2.01, set)).toBe('red');
  });

  it('handles ≥ 60% / 50% - <60% / < 50% correctly', () => {
    const set = parseThresholdSet(['≥ 60%', '50% - <60%', '< 50%']);
    expect(evaluateZone(60, set)).toBe('green');
    expect(evaluateZone(59.99, set)).toBe('yellow');
    expect(evaluateZone(50, set)).toBe('yellow');
    expect(evaluateZone(49.99, set)).toBe('red');
  });

  it('handles 1 / 50% – <100% / <50% correctly (ceiling number 1 = 100%)', () => {
    const set = parseThresholdSet(['1', '50% – <100%', '<50%']);
    expect(evaluateZone(100, set)).toBe('green');
    expect(evaluateZone(99.99, set)).toBe('yellow');
    expect(evaluateZone(50, set)).toBe('yellow');
    expect(evaluateZone(49.99, set)).toBe('red');
  });

  it('returns null when evaluated on manual ThresholdSet', () => {
    const manualSet: ThresholdSet = {
      mode: 'manual',
      reason: 'Ngưỡng dạng chữ',
    };
    expect(evaluateZone(5, manualSet)).toBeNull();
  });

  it('marks simulated non-contiguous or overlapping thresholds as manual (dữ liệu giả lập)', () => {
    // Giả lập 1: Ba khoảng bị hở (gap): ≤ 5%, 10% - 20%, > 20% (hở đoạn 5 - 10)
    const gapSimulated = parseThresholdSet(['≤ 5%', '10% - 20%', '> 20%']);
    expect(gapSimulated.mode).toBe('manual');
    if (gapSimulated.mode === 'manual') {
      expect(gapSimulated.reason).toBeDefined();
    }

    // Giả lập 2: Ba khoảng bị chồng nhau (overlap): ≤ 10%, 8% - 15%, > 15% (chồng đoạn 8 - 10)
    const overlapSimulated = parseThresholdSet(['≤ 10%', '8% - 15%', '> 15%']);
    expect(overlapSimulated.mode).toBe('manual');
    if (overlapSimulated.mode === 'manual') {
      expect(overlapSimulated.reason).toBeDefined();
    }

    // F6 Giả lập 3: Liền nhau nhưng không phủ toàn dải 0 đến 100 (5-10 / >10-20 / >20-30) -> manual
    const notCoveringRange = parseThresholdSet(['5-10', '>10-20', '>20-30']);
    expect(notCoveringRange.mode).toBe('manual');
    if (notCoveringRange.mode === 'manual') {
      expect(notCoveringRange.reason).toContain('0 đến 100');
    }
  });
});

describe('inferIndicatorUnit & inferDirection (4C.0)', () => {
  it('correctly infers unitKind and unitLabel for all 21 indicator triples', () => {
    // 17 indicators with '%' in thresholds -> percent / '%'
    // 4 indicators without '%' in thresholds -> count / 'vụ việc'
    const cases: Array<{
      code: string;
      thresholds: [string, string, string];
      expectedUnitKind: 'percent' | 'count';
      expectedUnitLabel: string;
      expectedDirection: 'higher_is_worse' | 'lower_is_worse' | null;
    }> = [
      // HD11.R27
      {
        code: 'HD11.R27.KRI01',
        thresholds: ['≤ 5%', '> 5% - 10%', '> 10%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'higher_is_worse',
      },
      {
        code: 'HD11.R27.KRI02',
        thresholds: ['≤ 5%', '> 5% - 10%', '> 10%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'higher_is_worse',
      },
      {
        code: 'HD11.R27.KRI03',
        thresholds: ['0', '> 0% - 2%', '> 2%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'higher_is_worse',
      },
      {
        code: 'HD11.R27.KCI01',
        thresholds: ['≥ 60%', '50% - <60%', '< 50%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'lower_is_worse',
      },
      {
        code: 'HD11.R27.KCI02',
        thresholds: ['≥ 95%', '80% - <95%', '< 80%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'lower_is_worse',
      },
      {
        code: 'HD11.R27.KCI03',
        thresholds: ['1', '50% – <100%', '<50%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'lower_is_worse',
      },

      // CN02.R13
      {
        code: 'CN02.R13.KRI01',
        thresholds: [
          '≤5%',
          '>5% - 10%',
          '>10% hoặc tồn tại lỗ hổng mức Nghiêm trọng/Cao chưa được khắc phục quá thời hạn quy định',
        ],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'higher_is_worse',
      },
      {
        code: 'CN02.R13.KRI02',
        thresholds: ['Không có sự cố', '-', 'Có 01 sự cố mức Lớn trở lên'],
        expectedUnitKind: 'count',
        expectedUnitLabel: 'vụ việc',
        expectedDirection: null,
      },
      {
        code: 'CN02.R13.KCI01',
        thresholds: ['1', '90% - <100%', '<90%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'lower_is_worse',
      },
      {
        code: 'CN02.R13.KCI02',
        thresholds: ['≥90%', '80% - <90%', '<80%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'lower_is_worse',
      },
      {
        code: 'CN02.R13.KCI03',
        thresholds: ['≤5%', '>5% - 10%', '>10%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'higher_is_worse',
      },
      {
        code: 'CN02.R13.KCI04',
        thresholds: ['≥95%', '90% - <95%', '<90%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'lower_is_worse',
      },

      // CN03.R14
      {
        code: 'CN03.R14.KRI01',
        thresholds: [
          'Không phát sinh',
          'Phát sinh 01 vụ việc vi phạm hoặc có khiếu nại của khách hàng',
          'Phát sinh từ 02 vụ việc vi phạm hoặc có từ 02 khiếu nại của khách hàng trở lên',
        ],
        expectedUnitKind: 'count',
        expectedUnitLabel: 'vụ việc',
        expectedDirection: null,
      },
      {
        code: 'CN03.R14.KCI01',
        thresholds: ['1', '90% – <100%', '<90%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'lower_is_worse',
      },
      {
        code: 'CN03.R14.KCI02',
        thresholds: ['1', '90% – <100%', '<90%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'lower_is_worse',
      },

      // TT07.R46
      {
        code: 'TT07.R46.KRI01',
        thresholds: [
          'Không phát sinh',
          'Phát sinh 01 vụ việc làm sai lệch/lộ lọt/mất dữ liệu thông tin nhưng chưa gây thiệt hại nghiêm trọng',
          'Phát sinh ≥02 vụ việc hoặc 01 vụ việc gây thiệt hại nghiêm trọng',
        ],
        expectedUnitKind: 'count',
        expectedUnitLabel: 'vụ việc',
        expectedDirection: null,
      },
      {
        code: 'TT07.R46.KRI02',
        thresholds: ['0', '>0% - 5%', '>5%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'higher_is_worse',
      },
      {
        code: 'TT07.R46.KRI03',
        thresholds: [
          'Không phát sinh',
          'Phát sinh 01 kiến nghị/khuyến nghị của cơ quan nhà nước có thẩm quyền',
          'Phát sinh ≥02 kiến nghị/khuyến nghị của cơ quan nhà nước có thẩm quyền hoặc bị xử phạt',
        ],
        expectedUnitKind: 'count',
        expectedUnitLabel: 'vụ việc',
        expectedDirection: null,
      },
      {
        code: 'TT07.R46.KCI01',
        thresholds: ['1', '90% – <100%', '<90%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'lower_is_worse',
      },
      {
        code: 'TT07.R46.KCI02',
        thresholds: ['1', '95% – <100%', '<95%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'lower_is_worse',
      },
      {
        code: 'TT07.R46.KCI03',
        thresholds: ['1', '95% – <100%', '<95%'],
        expectedUnitKind: 'percent',
        expectedUnitLabel: '%',
        expectedDirection: 'lower_is_worse',
      },
    ];

    expect(cases).toHaveLength(21);

    let percentCount = 0;
    let countCount = 0;

    for (const c of cases) {
      const unit = inferIndicatorUnit(c.thresholds);
      expect(unit.unitKind, `${c.code} unitKind`).toBe(c.expectedUnitKind);
      expect(unit.unitLabel, `${c.code} unitLabel`).toBe(c.expectedUnitLabel);

      if (unit.unitKind === 'percent') percentCount++;
      if (unit.unitKind === 'count') countCount++;

      const dir = inferDirection(c.thresholds[0]);
      expect(dir, `${c.code} direction`).toBe(c.expectedDirection);
    }

    expect(percentCount).toBe(17);
    expect(countCount).toBe(4);
  });

  it('handles edge cases for inferIndicatorUnit and inferDirection', () => {
    // Edge cases for unit
    expect(inferIndicatorUnit([])).toEqual({ unitKind: 'count', unitLabel: 'vụ việc' });
    expect(inferIndicatorUnit([null, undefined, ''])).toEqual({ unitKind: 'count', unitLabel: 'vụ việc' });
    expect(inferIndicatorUnit(['> 10%'])).toEqual({ unitKind: 'percent', unitLabel: '%' });

    // Edge cases for direction
    expect(inferDirection('≤ 5%')).toBe('higher_is_worse');
    expect(inferDirection('<= 10%')).toBe('higher_is_worse');
    expect(inferDirection('< 2')).toBe('higher_is_worse');
    expect(inferDirection('0')).toBe('higher_is_worse');
    expect(inferDirection('0%')).toBe('higher_is_worse');

    expect(inferDirection('≥ 95%')).toBe('lower_is_worse');
    expect(inferDirection('>= 80%')).toBe('lower_is_worse');
    expect(inferDirection('> 50%')).toBe('lower_is_worse');
    expect(inferDirection('1')).toBe('lower_is_worse');
    expect(inferDirection('1%')).toBe('lower_is_worse');

    expect(inferDirection('Không phát sinh')).toBeNull();
    expect(inferDirection('Không có sự cố')).toBeNull();
    expect(inferDirection('-')).toBeNull();
    expect(inferDirection('')).toBeNull();
    expect(inferDirection(null)).toBeNull();
    expect(inferDirection(undefined)).toBeNull();
  });
});

describe('evaluateNumericZone (4C.1)', () => {
  it('handles higher_is_worse correctly including exact boundaries', () => {
    const config = {
      direction: 'higher_is_worse' as const,
      yellowAt: 1,
      redAt: 2,
    };

    expect(evaluateNumericZone(0, config)).toBe('green');
    expect(evaluateNumericZone(0.99, config)).toBe('green');
    // Chạm đúng ngưỡng là vào vùng xấu hơn
    expect(evaluateNumericZone(1, config)).toBe('yellow');
    expect(evaluateNumericZone(1.5, config)).toBe('yellow');
    expect(evaluateNumericZone(1.99, config)).toBe('yellow');
    expect(evaluateNumericZone(2, config)).toBe('red');
    expect(evaluateNumericZone(5, config)).toBe('red');
  });

  it('handles lower_is_worse correctly including exact boundaries', () => {
    const config = {
      direction: 'lower_is_worse' as const,
      yellowAt: 95,
      redAt: 80,
    };

    expect(evaluateNumericZone(100, config)).toBe('green');
    expect(evaluateNumericZone(95.01, config)).toBe('green');
    // Chạm đúng ngưỡng là vào vùng xấu hơn
    expect(evaluateNumericZone(95, config)).toBe('yellow');
    expect(evaluateNumericZone(90, config)).toBe('yellow');
    expect(evaluateNumericZone(80.01, config)).toBe('yellow');
    expect(evaluateNumericZone(80, config)).toBe('red');
    expect(evaluateNumericZone(50, config)).toBe('red');
    expect(evaluateNumericZone(0, config)).toBe('red');
  });

  it('returns null when any threshold or direction is missing', () => {
    expect(
      evaluateNumericZone(1, {
        direction: null,
        yellowAt: 1,
        redAt: 2,
      })
    ).toBeNull();

    expect(
      evaluateNumericZone(1, {
        direction: 'higher_is_worse',
        yellowAt: null,
        redAt: 2,
      })
    ).toBeNull();

    expect(
      evaluateNumericZone(1, {
        direction: 'higher_is_worse',
        yellowAt: 1,
        redAt: null,
      })
    ).toBeNull();

    expect(
      evaluateNumericZone(1, {
        direction: null,
        yellowAt: null,
        redAt: null,
      })
    ).toBeNull();
  });
});
