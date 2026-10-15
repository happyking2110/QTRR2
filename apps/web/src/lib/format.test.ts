import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatNumber, formatPercent } from './format';

describe('format utilities', () => {
  it('formatDate formats YYYY-MM-DD to dd/mm/yyyy without timezone shift', () => {
    expect(formatDate('2026-12-31')).toBe('31/12/2026');
    expect(formatDate('2026-01-05')).toBe('05/01/2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('formatNumber formats numbers with vi-VN comma decimal separator', () => {
    expect(formatNumber(42.5)).toBe('42,5');
    expect(formatNumber(100)).toBe('100');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
  });

  it('formatPercent formats numbers with % suffix and vi-VN comma', () => {
    expect(formatPercent(42.5)).toBe('42,5%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(100)).toBe('100%');
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
  });

  it('formatDateTime formats ISO datetime in Asia/Ho_Chi_Minh timezone', () => {
    const iso = '2026-10-12T08:00:00.000Z'; // 15:00 in Vietnam (UTC+7)
    const formatted = formatDateTime(iso);
    expect(formatted).toContain('12/10/2026');
    expect(formatted).toContain('15:00');
    expect(formatDateTime(null)).toBe('—');
  });
});
