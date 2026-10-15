export type Zone = 'green' | 'yellow' | 'red';
export type IndicatorUnitKind = 'percent' | 'count';
export type IndicatorDirection = 'higher_is_worse' | 'lower_is_worse';

export function inferIndicatorUnit(texts: (string | null | undefined)[]): {
  unitKind: IndicatorUnitKind;
  unitLabel: string;
} {
  const hasPercent = texts.some((t) => typeof t === 'string' && t.includes('%'));
  if (hasPercent) {
    return { unitKind: 'percent', unitLabel: '%' };
  }
  return { unitKind: 'count', unitLabel: 'vụ việc' };
}

export function inferDirection(greenText: string | null | undefined): IndicatorDirection | null {
  if (!greenText) return null;
  const s = greenText.trim().replace(/[–—]/g, '-');
  if (s.startsWith('≤') || s.startsWith('<=') || s.startsWith('<')) {
    return 'higher_is_worse';
  }
  if (s.startsWith('≥') || s.startsWith('>=') || s.startsWith('>')) {
    return 'lower_is_worse';
  }
  if (/^0%?$/.test(s)) {
    return 'higher_is_worse';
  }
  if (/^1%?$/.test(s)) {
    return 'lower_is_worse';
  }
  return null;
}

export function evaluateNumericZone(
  value: number,
  config: {
    direction: IndicatorDirection | null;
    yellowAt: number | null;
    redAt: number | null;
  }
): Zone | null {
  const { direction, yellowAt, redAt } = config;
  if (yellowAt === null || redAt === null || !direction) {
    return null;
  }
  if (direction === 'higher_is_worse') {
    if (value >= redAt) return 'red';
    if (value >= yellowAt) return 'yellow';
    return 'green';
  }
  if (direction === 'lower_is_worse') {
    if (value <= redAt) return 'red';
    if (value <= yellowAt) return 'yellow';
    return 'green';
  }
  return null;
}

export interface ZoneRule {
  zone: Zone;
  lo: number | null;
  loInclusive: boolean;
  hi: number | null;
  hiInclusive: boolean;
}

export type ThresholdSet =
  | { mode: 'auto'; rules: ZoneRule[] }
  | { mode: 'manual'; reason: string };

interface RawRange {
  lo: number | null;
  loInclusive: boolean;
  hi: number | null;
  hiInclusive: boolean;
}

/**
 * Phân tích 1 chuỗi ngưỡng đơn lẻ thành một khoảng giá trị RawRange.
 */
function parseSingleThreshold(text: string, hasPercent: boolean): RawRange | null {
  const s = text.trim().replace(/\s+/g, '').replace(/[–—]/g, '-');

  // Điều kiện phụ "hoặc" hoặc ký tự rỗng/gạch ngang
  if (/hoặc/i.test(s) || s === '-' || s === '') {
    return null;
  }

  // 1. Số trần: 0 hoặc 1
  if (/^0%?$/.test(s)) {
    return { lo: 0, loInclusive: true, hi: 0, hiInclusive: true };
  }
  if (/^1%?$/.test(s)) {
    const val = hasPercent ? 100 : 1;
    return { lo: val, loInclusive: true, hi: val, hiInclusive: true };
  }

  // 2. Một chiều: <=, <, >=, >
  const leMatch = /^(?:≤|<=)(\d+(?:\.\d+)?)(?:%)?$/.exec(s);
  if (leMatch) {
    return {
      lo: null,
      loInclusive: false,
      hi: parseFloat(leMatch[1]),
      hiInclusive: true,
    };
  }

  const ltMatch = /^<(\d+(?:\.\d+)?)(?:%)?$/.exec(s);
  if (ltMatch) {
    return {
      lo: null,
      loInclusive: false,
      hi: parseFloat(ltMatch[1]),
      hiInclusive: false,
    };
  }

  const geMatch = /^(?:≥|>=)(\d+(?:\.\d+)?)(?:%)?$/.exec(s);
  if (geMatch) {
    return {
      lo: parseFloat(geMatch[1]),
      loInclusive: true,
      hi: null,
      hiInclusive: false,
    };
  }

  const gtMatch = /^>(\d+(?:\.\d+)?)(?:%)?$/.exec(s);
  if (gtMatch) {
    return {
      lo: parseFloat(gtMatch[1]),
      loInclusive: false,
      hi: null,
      hiInclusive: false,
    };
  }

  // 3. Khoảng: a - b (ví dụ: >5%-10%, 50%-<60%, 80%-<95%)
  const rangeMatch = /^([>]?)(\d+(?:\.\d+)?)(?:%)?-([<]?)(\d+(?:\.\d+)?)(?:%)?$/.exec(s);
  if (rangeMatch) {
    const loVal = parseFloat(rangeMatch[2]);
    const hiVal = parseFloat(rangeMatch[4]);
    const loInc = rangeMatch[1] !== '>';
    const hiInc = rangeMatch[3] !== '<';
    return {
      lo: loVal,
      loInclusive: loInc,
      hi: hiVal,
      hiInclusive: hiInc,
    };
  }

  return null;
}

/**
 * Kiểm tra xem 2 khoảng liền kề A (thấp hơn) và B (cao hơn) có tiếp giáp hợp lệ không:
 * Điểm nối A.hi phải bằng B.lo, và đúng một trong hai đầu là inclusive (không chồng, không hở).
 */
function isContiguousAscending(a: RawRange, b: RawRange): boolean {
  if (a.hi === null || b.lo === null) return false;
  if (a.hi !== b.lo) return false;
  // Đúng 1 đầu đóng, 1 đầu mở tại điểm tiếp giáp
  return a.hiInclusive !== b.loInclusive;
}

/**
 * Phân tích bộ ba chuỗi ngưỡng (Thấp, Trung bình, Cao) tương ứng (Xanh, Vàng, Đỏ).
 */
export function parseThresholdSet(texts: [string, string, string]): ThresholdSet {
  const hasPercent = texts.some((t) => t.includes('%'));

  const g = parseSingleThreshold(texts[0], hasPercent);
  const y = parseSingleThreshold(texts[1], hasPercent);
  const r = parseSingleThreshold(texts[2], hasPercent);

  if (!g || !y || !r) {
    return {
      mode: 'manual',
      reason: 'Ngưỡng dạng chữ hoặc có điều kiện bổ sung không thể tự động chấm',
    };
  }

  // Dạng 1: Tăng dần (green thấp -> yellow giữa -> red cao, ví dụ KRI thông thường)
  const isAscending = isContiguousAscending(g, y) && isContiguousAscending(y, r);

  // Dạng 2: Giảm dần (green cao -> yellow giữa -> red thấp, ví dụ KCI thông thường)
  const isDescending = isContiguousAscending(r, y) && isContiguousAscending(y, g);

  if (!isAscending && !isDescending) {
    return {
      mode: 'manual',
      reason: 'Ba khoảng ngưỡng không liền nhau hoặc bị chồng lấn',
    };
  }

  // Quy tắc 5: Ba khoảng sau khi sắp xếp phải liền nhau, không chồng và phủ từ 0 đến 100
  const [first, , third] = isAscending ? [g, y, r] : [r, y, g];
  const coversZero = first.lo === null || (first.lo === 0 && first.loInclusive);
  const coversHundred = third.hi === null || (third.hi >= 100 && third.hiInclusive);

  if (!coversZero || !coversHundred) {
    return {
      mode: 'manual',
      reason: 'Ba khoảng ngưỡng không phủ toàn bộ dải từ 0 đến 100',
    };
  }

  const rules: ZoneRule[] = [
    { zone: 'green', ...g },
    { zone: 'yellow', ...y },
    { zone: 'red', ...r },
  ];

  return {
    mode: 'auto',
    rules,
  };
}

/**
 * Đánh giá vùng (green, yellow, red) của một giá trị dựa trên bộ ngưỡng đã phân tích.
 * Trả về null nếu bộ ngưỡng ở chế độ manual hoặc giá trị không thuộc khoảng nào.
 */
export function evaluateZone(value: number, set: ThresholdSet): Zone | null {
  if (set.mode === 'manual') {
    return null;
  }

  for (const rule of set.rules) {
    const loOk =
      rule.lo === null
        ? true
        : rule.loInclusive
          ? value >= rule.lo
          : value > rule.lo;

    const hiOk =
      rule.hi === null
        ? true
        : rule.hiInclusive
          ? value <= rule.hi
          : value < rule.hi;

    if (loOk && hiOk) {
      return rule.zone;
    }
  }

  return null;
}
