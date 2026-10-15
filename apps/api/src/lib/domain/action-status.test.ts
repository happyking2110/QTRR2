import { describe, it, expect } from 'vitest';
import { actionStatus, StatusSettings, StatusInput } from './action-status';

describe('actionStatus - Xác định trạng thái của kế hoạch hành động', () => {
  const defaultSettings: StatusSettings = {
    slowDays: 60,
    slowProgress: 70,
    staleDays: 90,
  };

  const today = new Date('2026-10-12T00:00:00Z');
  const baseline = new Date('2026-08-01T00:00:00Z'); // cách today 72 ngày

  it('1. completed: mọi đầu việc 100', () => {
    const input: StatusInput = {
      tasks: [
        { progress: 100, dueDate: new Date('2026-10-01') },
        { progress: 100, dueDate: new Date('2026-12-31') },
      ],
      lastApprovedUpdateAt: new Date('2026-10-10'),
      baselineDate: baseline,
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('completed');
  });

  it('2. không có đầu việc nào -> not_started', () => {
    const input: StatusInput = {
      tasks: [],
      lastApprovedUpdateAt: null,
      baselineDate: baseline,
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('not_started');
  });

  it('3. overdue: có đầu việc dueDate < today mà tiến độ < 100', () => {
    const input: StatusInput = {
      tasks: [
        { progress: 100, dueDate: new Date('2026-10-01') }, // đã xong
        { progress: 80, dueDate: new Date('2026-10-11') }, // hạn hôm qua, chưa xong
      ],
      lastApprovedUpdateAt: new Date('2026-10-10'),
      baselineDate: baseline,
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('overdue');
  });

  it('4. ngày hạn BẰNG today thì chưa quá hạn', () => {
    const input: StatusInput = {
      tasks: [
        { progress: 50, dueDate: new Date('2026-10-12') }, // đúng hôm nay
      ],
      lastApprovedUpdateAt: new Date('2026-10-10'),
      baselineDate: baseline,
    };
    // today 12/10, dueDate 12/10 -> daysUntilDue = 0 < 60 và prog = 50 < 70 -> at_risk, không phải overdue!
    expect(actionStatus(input, defaultSettings, today)).toBe('at_risk');
  });

  it('5. đầu việc không có hạn thì không bao giờ overdue', () => {
    const input: StatusInput = {
      tasks: [
        { progress: 50, dueDate: null },
      ],
      lastApprovedUpdateAt: new Date('2026-10-10'), // mới cập nhật 2 ngày trước
      baselineDate: baseline,
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('in_progress');
  });

  it('6. at_risk (a): còn 59 ngày tới hạn và tiến độ 69.9% -> có', () => {
    // today = 12/10/2026. Hạn = 10/12/2026 (cách 59 ngày).
    const due59Days = new Date('2026-12-10T00:00:00Z');
    const input: StatusInput = {
      tasks: [{ progress: 69.9, dueDate: due59Days }],
      lastApprovedUpdateAt: new Date('2026-10-01'),
      baselineDate: baseline,
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('at_risk');
  });

  it('7. at_risk (a): còn 60 ngày tới hạn -> KHÔNG at_risk (chỉ in_progress)', () => {
    // today = 12/10/2026. Hạn = 11/12/2026 (cách 60 ngày).
    const due60Days = new Date('2026-12-11T00:00:00Z');
    const input: StatusInput = {
      tasks: [{ progress: 69.9, dueDate: due60Days }],
      lastApprovedUpdateAt: new Date('2026-10-01'),
      baselineDate: baseline,
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('in_progress');
  });

  it('8. at_risk (a): tiến độ đúng 70% -> KHÔNG at_risk (chỉ in_progress)', () => {
    const due59Days = new Date('2026-12-10T00:00:00Z');
    const input: StatusInput = {
      tasks: [{ progress: 70, dueDate: due59Days }],
      lastApprovedUpdateAt: new Date('2026-10-01'),
      baselineDate: baseline,
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('in_progress');
  });

  it('9. at_risk (b): lần duyệt cuối cách today 91 ngày -> có at_risk', () => {
    // today = 12/10/2026. Lần duyệt cuối = 13/07/2026 (cách 91 ngày).
    const approved91DaysAgo = new Date('2026-07-13T00:00:00Z');
    const farDue = new Date('2027-12-31');
    const input: StatusInput = {
      tasks: [{ progress: 80, dueDate: farDue }],
      lastApprovedUpdateAt: approved91DaysAgo,
      baselineDate: baseline,
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('at_risk');
  });

  it('10. at_risk (b): lần duyệt cuối cách today 90 ngày -> KHÔNG at_risk', () => {
    // today = 12/10/2026. Lần duyệt cuối = 14/07/2026 (cách 90 ngày).
    const approved90DaysAgo = new Date('2026-07-14T00:00:00Z');
    const farDue = new Date('2027-12-31');
    const input: StatusInput = {
      tasks: [{ progress: 80, dueDate: farDue }],
      lastApprovedUpdateAt: approved90DaysAgo,
      baselineDate: baseline,
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('in_progress');
  });

  it('11. at_risk (b): chưa có lần duyệt nào -> lấy baselineDate (cách 91 ngày -> at_risk)', () => {
    const baseline91Days = new Date('2026-07-13T00:00:00Z');
    const farDue = new Date('2027-12-31');
    const input: StatusInput = {
      tasks: [{ progress: 0, dueDate: farDue }],
      lastApprovedUpdateAt: null,
      baselineDate: baseline91Days,
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('at_risk');
  });

  it('12. in_progress: tiến độ > 0 nhưng không quá hạn và không at_risk', () => {
    const farDue = new Date('2027-12-31');
    const input: StatusInput = {
      tasks: [{ progress: 50, dueDate: farDue }],
      lastApprovedUpdateAt: new Date('2026-10-01'),
      baselineDate: baseline,
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('in_progress');
  });

  it('13. not_started: tiến độ = 0 và không at_risk', () => {
    const farDue = new Date('2027-12-31');
    const input: StatusInput = {
      tasks: [{ progress: 0, dueDate: farDue }],
      lastApprovedUpdateAt: null,
      baselineDate: new Date('2026-10-01'), // mới tạo 11 ngày trước
    };
    expect(actionStatus(input, defaultSettings, today)).toBe('not_started');
  });

  it('14. thứ tự ưu tiên: completed > overdue > at_risk > in_progress > not_started', () => {
    // Cả overdue và at_risk: overdue thắng
    const inputOverdueAndAtRisk: StatusInput = {
      tasks: [
        { progress: 50, dueDate: new Date('2026-10-01') }, // quá hạn
      ],
      lastApprovedUpdateAt: new Date('2026-05-01'), // quá 90 ngày (at_risk)
      baselineDate: baseline,
    };
    expect(actionStatus(inputOverdueAndAtRisk, defaultSettings, today)).toBe('overdue');

    // Mọi đầu việc 100: completed thắng dù quá hạn trong quá khứ
    const inputCompletedPastDue: StatusInput = {
      tasks: [
        { progress: 100, dueDate: new Date('2026-10-01') },
      ],
      lastApprovedUpdateAt: new Date('2026-10-05'),
      baselineDate: baseline,
    };
    expect(actionStatus(inputCompletedPastDue, defaultSettings, today)).toBe('completed');
  });
});
