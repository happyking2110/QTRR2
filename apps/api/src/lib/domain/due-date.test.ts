import { describe, it, expect } from 'vitest';
import { parseDue } from './due-date';

describe('parseDue', () => {
  it('parses Date object and returns 00:00 UTC Date with formatted dueText', () => {
    const inputDate = new Date(Date.UTC(2026, 11, 31)); // 2026-12-31
    const result = parseDue(inputDate);
    expect(result.dueDate?.toISOString().slice(0, 10)).toBe('2026-12-31');
    expect(result.dueDate?.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    expect(result.dueText).toBe('31/12/2026');
  });

  it('parses single date string with spaces', () => {
    const result = parseDue(' 31/12/2026 ');
    expect(result.dueDate?.toISOString().slice(0, 10)).toBe('2026-12-31');
    expect(result.dueText).toBe(' 31/12/2026 ');
  });

  it('parses multiple dates separated by semicolon/newline and picks latest date', () => {
    const result = parseDue(' 31/12/2026;\n31/03/2027');
    expect(result.dueDate?.toISOString().slice(0, 10)).toBe('2027-03-31');
    expect(result.dueText).toBe(' 31/12/2026;\n31/03/2027');
  });

  it('parses mixed dates and quarters (e.g. Quý I/2027)', () => {
    const input = '- Ban 4: 31/12/2026.\n- TT1, TT2, TT3: Quý I/2027';
    const result = parseDue(input);
    expect(result.dueDate?.toISOString().slice(0, 10)).toBe('2027-03-31');
    expect(result.dueText).toBe(input);
  });

  it('parses complex string with dates and descriptive text', () => {
    const input =
      '- MOP/RCA: 31/12/2026; \n- Kế hoạch diễn tập: 31/12/2026;\n- Tổ chức diễn tập, báo cáo kết quả: theo kế hoạch đã phê duyệt.';
    const result = parseDue(input);
    expect(result.dueDate?.toISOString().slice(0, 10)).toBe('2026-12-31');
    expect(result.dueText).toBe(input);
  });

  it('handles Quý II, Quý III, Quý IV correctly (end of quarter)', () => {
    expect(parseDue('Quý II/2026').dueDate?.toISOString().slice(0, 10)).toBe('2026-06-30');
    expect(parseDue('Quý III/2026').dueDate?.toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(parseDue('Quý IV/2026').dueDate?.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('returns null dueDate for null, empty or strings without any date', () => {
    expect(parseDue(null)).toEqual({ dueDate: null, dueText: '' });
    expect(parseDue('')).toEqual({ dueDate: null, dueText: '' });
    expect(parseDue('theo kế hoạch đã phê duyệt')).toEqual({
      dueDate: null,
      dueText: 'theo kế hoạch đã phê duyệt',
    });
  });
});
