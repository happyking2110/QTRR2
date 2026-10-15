import { describe, it, expect } from 'vitest';
import { actionProgress, progressAsOf, TaskUpdateInput } from './progress';

describe('actionProgress - Tính tiến độ trung bình của kế hoạch hành động', () => {
  it('1. [100, 0] -> 50', () => {
    expect(actionProgress([{ progress: 100 }, { progress: 0 }])).toBe(50);
  });

  it('2. [100, 0, 0] -> 33.3 (làm tròn 1 chữ số)', () => {
    expect(
      actionProgress([{ progress: 100 }, { progress: 0 }, { progress: 0 }])
    ).toBe(33.3);
  });

  it('3. trọng số [{progress: 100, weight: 1}, {progress: 0, weight: 3}] -> 25', () => {
    expect(
      actionProgress([
        { progress: 100, weight: 1 },
        { progress: 0, weight: 3 },
      ])
    ).toBe(25);
  });

  it('4. mảng rỗng -> 0', () => {
    expect(actionProgress([])).toBe(0);
  });
});

describe('progressAsOf - Tính tiến độ của đầu việc đến kỳ as-of', () => {
  const updates: TaskUpdateInput[] = [
    {
      progress: 30,
      status: 'approved',
      reviewedAt: new Date('2026-10-15T10:00:00Z'),
      periodEndsOn: new Date('2026-10-31'),
    },
    {
      progress: 70,
      status: 'approved',
      reviewedAt: new Date('2026-11-15T10:00:00Z'),
      periodEndsOn: new Date('2026-11-30'),
    },
    {
      progress: 90,
      status: 'pending', // không phải approved
      reviewedAt: null,
      periodEndsOn: new Date('2026-11-30'),
    },
    {
      progress: 80,
      status: 'approved',
      reviewedAt: new Date('2026-11-10T10:00:00Z'), // reviewedAt cũ hơn
      periodEndsOn: new Date('2026-11-30'),
    },
    {
      progress: 100,
      status: 'approved',
      reviewedAt: new Date('2026-12-20T10:00:00Z'),
      periodEndsOn: new Date('2026-12-31'),
    },
  ];

  it('1. Chỉ nhận approved: bỏ qua bản pending dù tiến độ cao hơn', () => {
    const res = progressAsOf(updates, new Date('2026-11-30'));
    expect(res).toBe(70); // 70 (approved mới nhất), không phải 90 (pending)
  });

  it('2. Bỏ bản có periodEndsOn muộn hơn asOfEndsOn', () => {
    const res = progressAsOf(updates, new Date('2026-10-31'));
    expect(res).toBe(30);
  });

  it('3. Chọn reviewedAt mới nhất trong cùng điều kiện', () => {
    // Có 2 bản kỳ 11: 80 (review 10/11) và 70 (review 15/11)
    const res = progressAsOf(updates, new Date('2026-11-30'));
    expect(res).toBe(70);
  });

  it('4. Không có bản nào thỏa mãn -> 0', () => {
    const res = progressAsOf(updates, new Date('2026-09-30'));
    expect(res).toBe(0);
  });

  it('5. Không truyền asOfEndsOn -> lấy hết bản approved mới nhất', () => {
    const res = progressAsOf(updates);
    expect(res).toBe(100);
  });
});
