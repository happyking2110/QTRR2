import { describe, it, expect } from 'vitest';
import {
  computeSubmitPeriodKeys,
  computePendingSubmissions,
  canApproveSubmission,
  getVietnamDateString,
  PeriodForPolicy,
  PendingSubmissionRaw,
} from './policy';
import { Actor } from '../types';

describe('policy.ts - Kế hoạch 3B.0 logic tính quyền theo mục', () => {
  const adminActor: Actor = { userId: 'u-admin-1', role: 'admin', unitId: null };
  const ban4Actor: Actor = { userId: 'u-ban4-1', role: 'ban4', unitId: 'unit-ban4' };
  const unitActor1: Actor = { userId: 'u-unit-1', role: 'unit', unitId: 'unit-tt1' };
  const unitActor2: Actor = { userId: 'u-unit-2', role: 'unit', unitId: 'unit-tt2' };
  const viewerActor: Actor = { userId: 'u-viewer-1', role: 'viewer', unitId: null };

  const fixedToday = new Date('2026-10-15T08:00:00Z'); // 2026-10-15 in VN

  const samplePeriods: PeriodForPolicy[] = [
    {
      key: '2026-09',
      kind: 'month',
      startsOn: '2026-09-01',
      endsOn: '2026-09-30',
      closedAt: null,
    },
    {
      key: '2026-10',
      kind: 'month',
      startsOn: '2026-10-01',
      endsOn: '2026-10-31',
      closedAt: null,
    },
    {
      key: '2026-11',
      kind: 'month',
      startsOn: '2026-11-01',
      endsOn: '2026-11-30',
      closedAt: null,
    },
    {
      key: '2026-Q3',
      kind: 'quarter',
      startsOn: '2026-07-01',
      endsOn: '2026-09-30',
      closedAt: new Date('2026-10-05T00:00:00Z'), // Kỳ đã khóa
    },
    {
      key: '2026-Q4',
      kind: 'quarter',
      startsOn: '2026-10-01',
      endsOn: '2026-12-31',
      closedAt: null,
    },
    {
      key: '2027-Q1',
      kind: 'quarter',
      startsOn: '2027-01-01',
      endsOn: '2027-03-31',
      closedAt: null, // Chưa bắt đầu
    },
    {
      key: '2026-E1',
      kind: 'event',
      startsOn: '2026-10-05',
      endsOn: '2026-10-20',
      closedAt: null,
    },
  ];

  describe('getVietnamDateString', () => {
    it('chuyển đổi chính xác sang YYYY-MM-DD theo giờ Asia/Ho_Chi_Minh', () => {
      // 17:00 UTC 2026-10-14 là 00:00 2026-10-15 ở Việt Nam
      const date1 = new Date('2026-10-14T17:00:00Z');
      expect(getVietnamDateString(date1)).toBe('2026-10-15');

      // 16:59 UTC 2026-10-14 là 23:59 2026-10-14 ở Việt Nam
      const date2 = new Date('2026-10-14T16:59:00Z');
      expect(getVietnamDateString(date2)).toBe('2026-10-14');
    });
  });

  describe('computeSubmitPeriodKeys', () => {
    it('admin thấy mọi kỳ mở đúng loại chỉ số (tháng) đã bắt đầu', () => {
      const keys = computeSubmitPeriodKeys({
        actor: adminActor,
        cycleStatus: 'open',
        targetKind: 'indicator',
        indicatorPeriodKind: 'month',
        targetUnitId: 'unit-tt1',
        periods: samplePeriods,
        today: fixedToday,
      });
      // 2026-09 và 2026-10 đã bắt đầu, 2026-11 chưa bắt đầu (startsOn 2026-11-01 > 2026-10-15)
      expect(keys).toEqual(['2026-09', '2026-10']);
    });

    it('ban4 thấy mọi kỳ mở đúng loại chỉ số và đầu việc (chỉ quý)', () => {
      const taskKeys = computeSubmitPeriodKeys({
        actor: ban4Actor,
        cycleStatus: 'open',
        targetKind: 'task',
        targetUnitId: null, // Chưa gán vẫn thấy vì là ban4
        periods: samplePeriods,
        today: fixedToday,
      });
      // 2026-Q3 đã khóa, 2027-Q1 chưa bắt đầu -> chỉ còn 2026-Q4
      expect(taskKeys).toEqual(['2026-Q4']);
    });

    it('unit chỉ thấy kỳ cho mục gán đúng đơn vị của mình', () => {
      const unitKeys = computeSubmitPeriodKeys({
        actor: unitActor1,
        cycleStatus: 'open',
        targetKind: 'indicator',
        indicatorPeriodKind: 'month',
        targetUnitId: 'unit-tt1',
        periods: samplePeriods,
        today: fixedToday,
      });
      expect(unitKeys).toEqual(['2026-09', '2026-10']);

      const otherUnitKeys = computeSubmitPeriodKeys({
        actor: unitActor1,
        cycleStatus: 'open',
        targetKind: 'indicator',
        indicatorPeriodKind: 'month',
        targetUnitId: 'unit-tt2', // Không phải của mình
        periods: samplePeriods,
        today: fixedToday,
      });
      expect(otherUnitKeys).toEqual([]);
    });

    it('mục chưa gán (targetUnitId null): unit không được nộp', () => {
      const unassignedKeys = computeSubmitPeriodKeys({
        actor: unitActor1,
        cycleStatus: 'open',
        targetKind: 'indicator',
        indicatorPeriodKind: 'month',
        targetUnitId: null,
        periods: samplePeriods,
        today: fixedToday,
      });
      expect(unassignedKeys).toEqual([]);
    });

    it('viewer luôn trả về rỗng trong mọi trường hợp', () => {
      const viewerKeys = computeSubmitPeriodKeys({
        actor: viewerActor,
        cycleStatus: 'open',
        targetKind: 'indicator',
        indicatorPeriodKind: 'month',
        targetUnitId: 'unit-tt1',
        periods: samplePeriods,
        today: fixedToday,
      });
      expect(viewerKeys).toEqual([]);
    });

    it('chu kỳ lưu trữ (archived) luôn trả về rỗng', () => {
      const archivedKeys = computeSubmitPeriodKeys({
        actor: adminActor,
        cycleStatus: 'archived',
        targetKind: 'indicator',
        indicatorPeriodKind: 'month',
        targetUnitId: 'unit-tt1',
        periods: samplePeriods,
        today: fixedToday,
      });
      expect(archivedKeys).toEqual([]);
    });

    it('kỳ theo đợt (event) chỉ nhận chỉ số theo đợt', () => {
      const eventKeys = computeSubmitPeriodKeys({
        actor: adminActor,
        cycleStatus: 'open',
        targetKind: 'indicator',
        indicatorPeriodKind: 'event',
        targetUnitId: 'unit-tt1',
        periods: samplePeriods,
        today: fixedToday,
      });
      expect(eventKeys).toEqual(['2026-E1']);
    });
  });

  describe('computePendingSubmissions', () => {
    const rawSubmissions: PendingSubmissionRaw[] = [
      {
        id: 'sub-1',
        periodKey: '2026-10',
        submittedAt: new Date('2026-10-10T10:00:00Z'),
        submittedBy: 'u-unit-1',
        submittedByName: 'Nguyễn Văn Unit 1',
        periodClosed: false,
      },
      {
        id: 'sub-2',
        periodKey: '2026-09',
        submittedAt: new Date('2026-10-09T10:00:00Z'),
        submittedBy: 'u-admin-1',
        submittedByName: 'Admin MBF',
        periodClosed: true, // Kỳ đã bị khóa
      },
    ];

    it('viewer nhận mảng rỗng', () => {
      const res = computePendingSubmissions({
        actor: viewerActor,
        targetUnitId: 'unit-tt1',
        submissions: rawSubmissions,
      });
      expect(res).toEqual([]);
    });

    it('unit không thấy bản nộp của đơn vị khác', () => {
      const res = computePendingSubmissions({
        actor: unitActor2,
        targetUnitId: 'unit-tt1',
        submissions: rawSubmissions,
      });
      expect(res).toEqual([]);
    });

    it('unit thấy bản nộp của đơn vị mình và canWithdraw đúng người nộp', () => {
      const res = computePendingSubmissions({
        actor: unitActor1,
        targetUnitId: 'unit-tt1',
        submissions: rawSubmissions,
      });
      expect(res).toHaveLength(2);
      expect(res[0].id).toBe('sub-1');
      expect(res[0].canWithdraw).toBe(true); // Là người nộp và kỳ chưa khóa
      expect(res[1].id).toBe('sub-2');
      expect(res[1].canWithdraw).toBe(false); // Không phải người nộp
    });

    it('canWithdraw là false khi kỳ đã bị khóa kể cả chính người nộp', () => {
      const res = computePendingSubmissions({
        actor: adminActor,
        targetUnitId: 'unit-tt1',
        submissions: rawSubmissions,
      });
      expect(res[1].id).toBe('sub-2');
      expect(res[1].submittedByName).toBe('Admin MBF');
      expect(res[1].canWithdraw).toBe(false); // Người nộp là adminActor nhưng kỳ đã khóa
    });
  });

  describe('canApproveSubmission', () => {
    it('chỉ admin mới có quyền duyệt', () => {
      expect(
        canApproveSubmission({
          actor: ban4Actor,
          submittedBy: 'u-unit-1',
          periodClosed: false,
          activeAdminCount: 2,
        })
      ).toBe(false);
    });

    it('không duyệt được khi kỳ đã khóa', () => {
      expect(
        canApproveSubmission({
          actor: adminActor,
          submittedBy: 'u-unit-1',
          periodClosed: true,
          activeAdminCount: 2,
        })
      ).toBe(false);
    });

    it('admin khác người nộp thì duyệt được', () => {
      expect(
        canApproveSubmission({
          actor: adminActor,
          submittedBy: 'u-unit-1',
          periodClosed: false,
          activeAdminCount: 2,
        })
      ).toBe(true);
    });

    it('tự duyệt bị từ chối nếu có >= 2 admin hoạt động', () => {
      expect(
        canApproveSubmission({
          actor: adminActor,
          submittedBy: adminActor.userId,
          periodClosed: false,
          activeAdminCount: 2,
        })
      ).toBe(false);
    });

    it('tự duyệt được phép nếu chỉ có duy nhất 1 admin hoạt động', () => {
      expect(
        canApproveSubmission({
          actor: adminActor,
          submittedBy: adminActor.userId,
          periodClosed: false,
          activeAdminCount: 1,
        })
      ).toBe(true);
    });
  });
});
