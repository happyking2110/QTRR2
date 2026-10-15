import { describe, it, expect } from 'vitest';
import { currentReading, ReadingWithPeriod } from './readings';

describe('currentReading', () => {
  it('returns null when readings array is empty', () => {
    expect(currentReading([])).toBeNull();
  });

  it('returns null when no readings are approved', () => {
    const readings: ReadingWithPeriod[] = [
      {
        id: '1',
        status: 'pending',
        periodStartsOn: new Date('2026-10-01'),
        periodEndsOn: new Date('2026-10-31'),
        reviewedAt: null,
      },
      {
        id: '2',
        status: 'rejected',
        periodStartsOn: new Date('2026-10-01'),
        periodEndsOn: new Date('2026-10-31'),
        reviewedAt: new Date('2026-11-02T10:00:00Z'),
      },
    ];
    expect(currentReading(readings)).toBeNull();
  });

  it('picks the reading with the latest periodEndsOn (e.g. 2026-Q4 beats 2026-10)', () => {
    const reading10: ReadingWithPeriod = {
      id: 'm10',
      periodKey: '2026-10',
      status: 'approved',
      periodStartsOn: new Date('2026-10-01'),
      periodEndsOn: new Date('2026-10-31'),
      reviewedAt: new Date('2026-11-05T08:00:00Z'),
    };
    const readingQ4: ReadingWithPeriod = {
      id: 'q4',
      periodKey: '2026-Q4',
      status: 'approved',
      periodStartsOn: new Date('2026-10-01'),
      periodEndsOn: new Date('2026-12-31'),
      reviewedAt: new Date('2026-11-01T08:00:00Z'), // reviewed earlier, but period ends later!
    };

    // Even if array order is reversed
    expect(currentReading([reading10, readingQ4])?.id).toBe('q4');
    expect(currentReading([readingQ4, reading10])?.id).toBe('q4');
  });

  it('when periodEndsOn is equal, shorter period (starting later) beats longer period (2026-12 beats 2026-Q4)', () => {
    const readingQ4: ReadingWithPeriod = {
      id: 'q4',
      periodKey: '2026-Q4',
      status: 'approved',
      periodStartsOn: new Date('2026-10-01'),
      periodEndsOn: new Date('2026-12-31'),
      reviewedAt: new Date('2027-01-05T08:00:00Z'),
    };
    const reading12: ReadingWithPeriod = {
      id: 'm12',
      periodKey: '2026-12',
      status: 'approved',
      periodStartsOn: new Date('2026-12-01'), // starts later -> shorter duration
      periodEndsOn: new Date('2026-12-31'),
      reviewedAt: new Date('2027-01-02T08:00:00Z'),
    };

    expect(currentReading([readingQ4, reading12])?.id).toBe('m12');
    expect(currentReading([reading12, readingQ4])?.id).toBe('m12');
  });

  it('within the same period, chooses the most recent reviewedAt', () => {
    const r1: ReadingWithPeriod = {
      id: 'r1',
      periodKey: '2026-Q4',
      status: 'approved',
      periodStartsOn: new Date('2026-10-01'),
      periodEndsOn: new Date('2026-12-31'),
      reviewedAt: new Date('2027-01-05T08:00:00Z'),
    };
    const r2: ReadingWithPeriod = {
      id: 'r2',
      periodKey: '2026-Q4',
      status: 'approved',
      periodStartsOn: new Date('2026-10-01'),
      periodEndsOn: new Date('2026-12-31'),
      reviewedAt: new Date('2027-01-10T12:00:00Z'), // later
    };

    expect(currentReading([r1, r2])?.id).toBe('r2');
    expect(currentReading([r2, r1])?.id).toBe('r2');
  });

  it('filters by asOfEndsOn correctly', () => {
    const reading10: ReadingWithPeriod = {
      id: 'm10',
      periodKey: '2026-10',
      status: 'approved',
      periodStartsOn: new Date('2026-10-01'),
      periodEndsOn: new Date('2026-10-31'),
      reviewedAt: new Date('2026-11-05T08:00:00Z'),
    };
    const readingQ4: ReadingWithPeriod = {
      id: 'q4',
      periodKey: '2026-Q4',
      status: 'approved',
      periodStartsOn: new Date('2026-10-01'),
      periodEndsOn: new Date('2026-12-31'),
      reviewedAt: new Date('2026-11-01T08:00:00Z'),
    };

    // When asOfEndsOn is 2026-10-31, 2026-Q4 (ends on 2026-12-31) must be ignored
    const res = currentReading([reading10, readingQ4], new Date('2026-10-31'));
    expect(res?.id).toBe('m10');

    // When asOfEndsOn is before 2026-10-01, returns null
    expect(currentReading([reading10, readingQ4], '2026-09-30')).toBeNull();
  });
});
