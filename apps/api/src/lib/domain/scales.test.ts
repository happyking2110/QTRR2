import { describe, it, expect } from 'vitest';
import { levelScore, heatmapCell } from './scales';

describe('levelScore', () => {
  it('correctly maps all 5 impact labels to scores 1-5', () => {
    expect(levelScore('impact', 'Không đáng kể')).toBe(1);
    expect(levelScore('impact', 'Nhỏ')).toBe(2);
    expect(levelScore('impact', 'Trung bình')).toBe(3);
    expect(levelScore('impact', 'Lớn')).toBe(4);
    expect(levelScore('impact', 'Nghiêm trọng')).toBe(5);
  });

  it('correctly maps all 5 likelihood labels to scores 1-5', () => {
    expect(levelScore('likelihood', 'Hiếm khi')).toBe(1);
    expect(levelScore('likelihood', 'Ít khả năng')).toBe(2);
    expect(levelScore('likelihood', 'Có thể xảy ra')).toBe(3);
    expect(levelScore('likelihood', 'Nhiều khả năng xảy ra')).toBe(4);
    expect(levelScore('likelihood', 'Gần như chắc chắn')).toBe(5);
  });

  it('handles surrounding whitespace gracefully', () => {
    expect(levelScore('impact', '  Nghiêm trọng  ')).toBe(5);
    expect(levelScore('likelihood', ' Nhiều khả năng xảy ra \n')).toBe(4);
  });

  it('throws an error containing axis and label when encountering an unknown label', () => {
    expect(() => levelScore('impact', 'Không xác định')).toThrowError(/Không xác định/);
    expect(() => levelScore('impact', 'Không xác định')).toThrowError(/impact/);
    expect(() => levelScore('likelihood', 'Cực kỳ hiếm')).toThrowError(/Cực kỳ hiếm/);
    expect(() => levelScore('likelihood', 'Cực kỳ hiếm')).toThrowError(/likelihood/);
  });

  it('throws an error containing axis and label for prototype properties like constructor, toString, __proto__', () => {
    for (const prop of ['constructor', 'toString', '__proto__']) {
      expect(() => levelScore('impact', prop)).toThrowError(new RegExp(prop));
      expect(() => levelScore('impact', prop)).toThrowError(/impact/);
      expect(() => levelScore('likelihood', prop)).toThrowError(new RegExp(prop));
      expect(() => levelScore('likelihood', prop)).toThrowError(/likelihood/);
    }
  });
});

describe('heatmapCell', () => {
  it('calculates heatmap coordinates { impact, likelihood } from labels', () => {
    expect(heatmapCell('Nghiêm trọng', 'Nhiều khả năng xảy ra')).toEqual({
      impact: 5,
      likelihood: 4,
    });
    expect(heatmapCell('Lớn', 'Có thể xảy ra')).toEqual({
      impact: 4,
      likelihood: 3,
    });
  });
});
