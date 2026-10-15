import { describe, it, expect } from 'vitest';
import { normalizeCode, splitCodes } from './codes';

describe('normalizeCode', () => {
  it('removes all whitespace from codes', () => {
    expect(normalizeCode('TT07. R46.NN01')).toBe('TT07.R46.NN01');
    expect(normalizeCode(' HD11 . R27 . KS01 ')).toBe('HD11.R27.KS01');
  });

  it('strips MBF_ prefix only when it is at the beginning of the string', () => {
    expect(normalizeCode('MBF_CN03.R14.KH01')).toBe('CN03.R14.KH01');
    expect(normalizeCode('MBF_HD11.R27')).toBe('HD11.R27');
    expect(normalizeCode('  MBF_HD11.R27  ')).toBe('HD11.R27');
  });

  it('does NOT remove MBF_ if it is not at the beginning of the string (e.g. hsrrCode)', () => {
    // Proves normalizeCode does not alter HSRRTY_MBF_2026_HD11.R27 other than stripping spaces
    expect(normalizeCode('HSRRTY_MBF_2026_HD11.R27')).toBe('HSRRTY_MBF_2026_HD11.R27');
    expect(normalizeCode(' HSRRTY_MBF_2026_HD11.R27 ')).toBe('HSRRTY_MBF_2026_HD11.R27');
  });
});

describe('splitCodes', () => {
  it('splits codes separated by newlines, commas, or semicolons and normalizes each code', () => {
    expect(splitCodes('HD11.R27.KS01\nHD11.R27.KS02')).toEqual([
      'HD11.R27.KS01',
      'HD11.R27.KS02',
    ]);
    expect(splitCodes('HD11.R27.KH01\nHD11.R27.KH02')).toEqual([
      'HD11.R27.KH01',
      'HD11.R27.KH02',
    ]);
    expect(splitCodes('HD11.R27.KS01, HD11.R27.KS02; MBF_HD11.R27.KS03')).toEqual([
      'HD11.R27.KS01',
      'HD11.R27.KS02',
      'HD11.R27.KS03',
    ]);
  });

  it('returns empty array for empty, dash, null, or undefined values', () => {
    expect(splitCodes('-')).toEqual([]);
    expect(splitCodes('')).toEqual([]);
    expect(splitCodes('   ')).toEqual([]);
    expect(splitCodes(null)).toEqual([]);
    expect(splitCodes(undefined)).toEqual([]);
  });

  it('filters out empty segments and dashes within multiple codes', () => {
    expect(splitCodes('HD11.R27.KS01\n-\nHD11.R27.KS02')).toEqual([
      'HD11.R27.KS01',
      'HD11.R27.KS02',
    ]);
  });
});
