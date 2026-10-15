import { Actor } from '../types';

export type Ability =
  | 'users.manage'
  | 'units.manage'
  | 'assignments.control'
  | 'assignments.indicator'
  | 'assignments.task'
  | 'assignments.read'
  | 'data.read';

export function can(actor: Actor | null, ability: Ability, _target?: unknown): boolean {
  if (!actor) {
    return false;
  }

  const { role } = actor;

  switch (ability) {
    case 'users.manage':
    case 'units.manage':
    case 'assignments.control':
    case 'assignments.indicator':
      return role === 'admin';

    case 'assignments.task':
    case 'assignments.read':
      return role === 'admin' || role === 'ban4';

    case 'data.read':
      return role === 'admin' || role === 'ban4' || role === 'unit' || role === 'viewer';

    default:
      return false;
  }
}

/**
 * Lấy chuỗi YYYY-MM-DD theo múi giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7)
 */
export function getVietnamDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export interface PeriodForPolicy {
  key: string;
  kind: 'month' | 'quarter' | 'event';
  startsOn: string; // YYYY-MM-DD
  endsOn: string; // YYYY-MM-DD
  closedAt: Date | string | null;
}

export interface ComputeSubmitPeriodKeysOptions {
  actor: Actor | null;
  cycleStatus: 'open' | 'archived';
  targetKind: 'indicator' | 'task';
  indicatorPeriodKind?: 'month' | 'quarter' | 'event';
  targetUnitId: string | null;
  periods: PeriodForPolicy[];
  today?: Date;
}

/**
 * Tính danh sách các kỳ nộp được cho người dùng hiện tại (backend-design 4.11 mục 2).
 */
export function computeSubmitPeriodKeys(options: ComputeSubmitPeriodKeysOptions): string[] {
  const { actor, cycleStatus, targetKind, indicatorPeriodKind, targetUnitId, periods, today } = options;
  if (!actor || actor.role === 'viewer' || cycleStatus !== 'open') {
    return [];
  }
  if (actor.role === 'unit') {
    if (!targetUnitId || actor.unitId !== targetUnitId) {
      return [];
    }
  }

  const todayStr = getVietnamDateString(today ?? new Date());

  const matched = periods.filter((p) => {
    // 1. Kỳ chưa khóa
    if (p.closedAt) return false;
    // 2. startsOn <= todayStr (giờ Việt Nam, không nộp cho kỳ chưa bắt đầu)
    if (p.startsOn > todayStr) return false;
    // 3. Loại kỳ khớp
    if (targetKind === 'indicator') {
      if (p.kind !== indicatorPeriodKind) return false;
    } else {
      // Đầu việc chỉ dùng kỳ quý
      if (p.kind !== 'quarter') return false;
    }
    return true;
  });

  // Sắp xếp theo endsOn, trùng thì startsOn
  matched.sort((a, b) => {
    if (a.endsOn !== b.endsOn) return a.endsOn.localeCompare(b.endsOn);
    return a.startsOn.localeCompare(b.startsOn);
  });

  return matched.map((p) => p.key);
}

export interface PendingSubmissionRaw {
  id: string;
  periodKey: string;
  submittedAt: Date | string;
  submittedBy: string | null;
  submittedByName: string | null;
  periodClosed: boolean;
}

export interface PendingRefDto {
  id: string;
  periodKey: string;
  submittedAt: string;
  submittedByName: string | null;
  canWithdraw: boolean;
}

export interface ComputePendingSubmissionsOptions {
  actor: Actor | null;
  targetUnitId: string | null;
  submissions: PendingSubmissionRaw[];
}

/**
 * Tính danh sách bản nộp chờ duyệt hiển thị cho người dùng hiện tại (backend-design 4.11 mục 3).
 */
export function computePendingSubmissions(options: ComputePendingSubmissionsOptions): PendingRefDto[] {
  const { actor, targetUnitId, submissions } = options;
  if (!actor || actor.role === 'viewer') {
    return [];
  }
  if (actor.role === 'unit') {
    if (!targetUnitId || actor.unitId !== targetUnitId) {
      return [];
    }
  }

  return submissions.map((s) => ({
    id: s.id,
    periodKey: s.periodKey,
    submittedAt: s.submittedAt instanceof Date ? s.submittedAt.toISOString() : new Date(s.submittedAt).toISOString(),
    submittedByName: s.submittedByName ?? null,
    canWithdraw: !!actor && actor.userId === s.submittedBy && !s.periodClosed,
  }));
}

export interface CanApproveSubmissionOptions {
  actor: Actor | null;
  submittedBy: string | null;
  periodClosed: boolean;
  activeAdminCount: number;
}

/**
 * Kiểm tra xem admin có quyền duyệt bản nộp này hay không (backend-design 4.11 mục 4, 3.4.1).
 */
export function canApproveSubmission(options: CanApproveSubmissionOptions): boolean {
  const { actor, submittedBy, periodClosed, activeAdminCount } = options;
  if (!actor || actor.role !== 'admin') {
    return false;
  }
  if (periodClosed) {
    return false;
  }
  if (submittedBy && actor.userId === submittedBy) {
    return activeAdminCount === 1;
  }
  return true;
}
