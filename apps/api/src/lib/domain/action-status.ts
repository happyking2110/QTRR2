export type ActionStatus = 'completed' | 'overdue' | 'at_risk' | 'in_progress' | 'not_started';

export interface ActionTaskStatusInput {
  progress: number;
  dueDate: Date | string | null;
}

export interface StatusInput {
  tasks: ActionTaskStatusInput[];
  lastApprovedUpdateAt: Date | string | null;
  baselineDate: Date | string; // cycle.created_at, dùng khi chưa có cập nhật nào
}

export interface StatusSettings {
  slowDays: number; // Mặc định 60
  slowProgress: number; // Mặc định 70 (%)
  staleDays: number; // Mặc định 90
}

/**
 * Tính số ngày nguyên giữa hai mốc ngày UTC 00:00 (to - from)
 */
function diffInDays(from: Date, to: Date): number {
  const utcFrom = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const utcTo = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((utcTo - utcFrom) / (24 * 60 * 60 * 1000));
}

/**
 * Chuyển một ngày bất kỳ sang Date tại UTC 00:00
 */
function toUtcMidnight(d: Date | string): Date {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
}

/**
 * Xác định trạng thái của kế hoạch hành động theo thứ tự ưu tiên:
 * 1. completed: có ít nhất 1 đầu việc và mọi đầu việc có tiến độ 100. (Không có đầu việc -> not_started).
 * 2. overdue: có đầu việc dueDate < today mà tiến độ < 100.
 * 3. at_risk:
 *    (a) hạn KH (muộn nhất trong các đầu việc có hạn) cách today dưới slowDays ngày VÀ actionProgress < slowProgress
 *    (b) today - (lastApprovedUpdateAt ?? baselineDate) > staleDays ngày
 * 4. in_progress: actionProgress > 0
 * 5. not_started: còn lại (tiến độ = 0 hoặc không có đầu việc)
 */
export function actionStatus(
  input: StatusInput,
  settings: StatusSettings,
  today: Date
): ActionStatus {
  const { tasks, lastApprovedUpdateAt, baselineDate } = input;
  const { slowDays, slowProgress, staleDays } = settings;

  // Không có đầu việc nào -> not_started
  if (!tasks || tasks.length === 0) {
    return 'not_started';
  }

  // 1. completed: có ít nhất một đầu việc và mọi đầu việc có tiến độ 100
  const allCompleted = tasks.every((t) => t.progress === 100);
  if (allCompleted) {
    return 'completed';
  }

  const todayUtc = toUtcMidnight(today);

  // 2. overdue: có đầu việc dueDate < today mà tiến độ dưới 100
  // Đầu việc không có hạn không bao giờ overdue; đầu việc tiến độ 100 không bao giờ overdue;
  // Ngày hạn BẰNG today thì chưa quá hạn.
  const hasOverdue = tasks.some((t) => {
    if (t.progress >= 100 || !t.dueDate) return false;
    const dueUtc = toUtcMidnight(t.dueDate);
    return dueUtc.getTime() < todayUtc.getTime();
  });

  if (hasOverdue) {
    return 'overdue';
  }

  // Tiến độ trung bình của KH
  const totalProg = tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length;

  // 3. at_risk:
  // (a) Hạn KH (muộn nhất trong các đầu việc có hạn) cách today dưới slowDays ngày VÀ totalProg < slowProgress
  const tasksWithDue = tasks.filter((t) => t.dueDate !== null && t.dueDate !== undefined);
  let atRiskByDeadline = false;
  if (tasksWithDue.length > 0) {
    const dueTimes = tasksWithDue.map((t) => toUtcMidnight(t.dueDate!).getTime());
    const maxDueUtc = new Date(Math.max(...dueTimes));
    const daysUntilDue = diffInDays(todayUtc, maxDueUtc);
    // Còn DƯỚI slowDays ngày (daysUntilDue < slowDays) VÀ tiến độ < slowProgress
    if (daysUntilDue < slowDays && totalProg < slowProgress) {
      atRiskByDeadline = true;
    }
  }

  // (b) today - (lastApprovedUpdateAt ?? baselineDate) LỚN HƠN staleDays ngày
  const lastActiveDate = lastApprovedUpdateAt ? lastApprovedUpdateAt : baselineDate;
  const lastActiveUtc = toUtcMidnight(lastActiveDate);
  const daysSinceUpdate = diffInDays(lastActiveUtc, todayUtc);
  const atRiskByStale = daysSinceUpdate > staleDays;

  if (atRiskByDeadline || atRiskByStale) {
    return 'at_risk';
  }

  // 4. in_progress: tiến độ > 0
  if (totalProg > 0) {
    return 'in_progress';
  }

  // 5. not_started: còn lại (bằng 0)
  return 'not_started';
}
