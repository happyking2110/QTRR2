'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { components } from '@/lib/api/schema';
import { PageHero } from '@/components/ui/PageHero';
import { ZoneBadge } from '@/components/domain/ZoneBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ReadingForm, type ReadingFormIndicator } from '@/components/domain/ReadingForm';
import { TaskUpdateForm, type TaskUpdateFormTask } from '@/components/domain/TaskUpdateForm';
import { apiSend, ApiClientError } from '@/lib/api/client';
import { formatDate, formatPercent } from '@/lib/format';
import {
  AlertCircle,
  Check,
  X,
  FileCheck2,
  ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ApprovalItem = components['schemas']['ApprovalItem'];
type ReadingApprovalItem = components['schemas']['ReadingApprovalItem'];
type TaskUpdateApprovalItem = components['schemas']['TaskUpdateApprovalItem'];
type PeriodSummary = components['schemas']['PeriodSummary'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type CurrentUser = components['schemas']['CurrentUser'];

export interface BulkApproveErrorDetail {
  kind: 'reading' | 'task_update';
  id: string;
  code?: string;
  message: string;
}

export interface ApprovalsViewProps {
  items: ApprovalItem[];
  periods: PeriodSummary[];
  profiles: ProfileSummary[];
  filters: {
    period?: string;
    riskCode?: string;
  };
  currentUser: CurrentUser;
}

const ZONE_NAMES: Record<string, string> = {
  green: 'Xanh',
  yellow: 'Vàng',
  red: 'Đỏ',
};

export default function ApprovalsView({
  items,
  periods,
  profiles,
  filters,
  currentUser,
}: ApprovalsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<'reading' | 'task_update'>('reading');

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk approve modal state
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [bulkErrorDetails, setBulkErrorDetails] = useState<BulkApproveErrorDetail[] | null>(null);
  const [bulkGeneralError, setBulkGeneralError] = useState<string | null>(null);

  // Single approve state
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Single reject modal state
  const [rejectItem, setRejectItem] = useState<{
    kind: 'reading' | 'task_update';
    id: string;
    targetName: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);

  // Resubmit modal states (for unit role)
  const [resubmitIndicator, setResubmitIndicator] = useState<ReadingFormIndicator | null>(null);
  const [resubmitTask, setResubmitTask] = useState<TaskUpdateFormTask | null>(null);

  const readingItems = items.filter(
    (it): it is ReadingApprovalItem => it.kind === 'reading',
  );
  const taskItems = items.filter(
    (it): it is TaskUpdateApprovalItem => it.kind === 'task_update',
  );

  const currentTabItems = activeTab === 'reading' ? readingItems : taskItems;

  const updateFilters = (newFilters: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(newFilters)) {
      if (val && val.trim() !== '') {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleTabChange = (tab: 'reading' | 'task_update') => {
    setActiveTab(tab);
    setSelectedIds(new Set());
    setBulkErrorDetails(null);
    setBulkGeneralError(null);
    setActionError(null);
  };

  // Toggle selection
  const handleToggleSelect = (id: string, canApprove: boolean) => {
    if (!canApprove) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Select all in current tab
  const selectableItems = currentTabItems.filter((it) => it.canApprove);
  const isAllSelected =
    selectableItems.length > 0 &&
    selectableItems.every((it) => selectedIds.has(it.submission.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      selectableItems.forEach((it) => next.add(it.submission.id));
      setSelectedIds(next);
    }
  };

  // Single Approve
  const handleSingleApprove = async (kind: 'reading' | 'task_update', id: string) => {
    setApprovingId(id);
    setActionError(null);
    try {
      const endpoint =
        kind === 'reading'
          ? `/api/readings/${id}/approve`
          : `/api/task-updates/${id}/approve`;
      await apiSend('POST', endpoint);
      // Remove from selected if present
      const next = new Set(selectedIds);
      next.delete(id);
      setSelectedIds(next);
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setActionError(err.message);
      } else {
        setActionError('Đã xảy ra lỗi khi duyệt bản ghi. Vui lòng thử lại.');
      }
    } finally {
      setApprovingId(null);
    }
  };

  // Single Reject
  const handleConfirmReject = async () => {
    if (!rejectItem) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < 5 || trimmed.length > 500) {
      setRejectError('Lý do từ chối phải từ 5 đến 500 ký tự.');
      return;
    }

    setIsRejecting(true);
    setRejectError(null);
    try {
      const endpoint =
        rejectItem.kind === 'reading'
          ? `/api/readings/${rejectItem.id}/reject`
          : `/api/task-updates/${rejectItem.id}/reject`;
      await apiSend('POST', endpoint, { reason: trimmed });
      const next = new Set(selectedIds);
      next.delete(rejectItem.id);
      setSelectedIds(next);
      setRejectItem(null);
      setRejectReason('');
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setRejectError(err.message);
      } else {
        setRejectError('Đã xảy ra lỗi khi từ chối bản ghi. Vui lòng thử lại.');
      }
    } finally {
      setIsRejecting(false);
    }
  };

  // Bulk Approve
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkApproving(true);
    setBulkErrorDetails(null);
    setBulkGeneralError(null);

    const payload = {
      items: Array.from(selectedIds).map((id) => ({
        kind: activeTab,
        id,
      })),
    };

    try {
      await apiSend('POST', '/api/approvals/bulk-approve', payload);
      setBulkConfirmOpen(false);
      setSelectedIds(new Set());
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setBulkGeneralError(err.message);
        if (Array.isArray(err.details)) {
          setBulkErrorDetails(err.details as BulkApproveErrorDetail[]);
        }
      } else {
        setBulkGeneralError('Đã xảy ra lỗi khi duyệt hàng loạt. Vui lòng thử lại.');
      }
    } finally {
      setIsBulkApproving(false);
    }
  };

  const isAdmin = currentUser.role === 'admin';
  const isViewer = currentUser.role === 'viewer';

  return (
    <div className="space-y-6 max-w-full min-w-0">
      {/* Hero Header */}
      <PageHero
        title="Hàng chờ duyệt"
        description="Phê duyệt số liệu chỉ số KRI/KCI và tiến độ kế hoạch hành động nộp từ các đơn vị"
      />

      {/* Action alert if any */}
      {actionError && (
        <div
          role="alert"
          className="p-3 rounded-control bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30 flex items-start gap-2 text-xs"
        >
          <AlertCircle className="w-4 h-4 text-state-bad-line shrink-0 mt-0.5" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Bulk approve error details banner */}
      {bulkGeneralError && (
        <div
          role="alert"
          className="p-4 rounded-control bg-state-bad-bg text-state-bad-fg border border-state-bad-line/40 space-y-2 text-xs"
        >
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertCircle className="w-4 h-4 text-state-bad-line shrink-0" aria-hidden="true" />
            <span>Lỗi duyệt hàng loạt: {bulkGeneralError}</span>
          </div>
          {bulkErrorDetails && bulkErrorDetails.length > 0 && (
            <div className="pt-2 border-t border-state-bad-line/20 space-y-1">
              <span className="font-semibold block text-[11px] uppercase tracking-wider text-state-bad-fg/80">
                Danh sách mục không hợp lệ ({bulkErrorDetails.length}):
              </span>
              <ul className="list-disc list-inside space-y-1 text-xs pl-1">
                {bulkErrorDetails.map((det, idx) => (
                  <li key={`${det.id}-${idx}`}>
                    <span className="font-mono font-medium">
                      [{det.kind === 'reading' ? 'Chỉ số' : 'Đầu việc'}] {det.code || det.id}
                    </span>
                    : <span className="opacity-95">{det.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Filter and Tabs Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        {/* Tabs */}
        <div className="flex items-center gap-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'reading'}
            onClick={() => handleTabChange('reading')}
            className={cn(
              'px-4 py-2 rounded-control text-sm font-semibold transition inline-flex items-center gap-2',
              activeTab === 'reading'
                ? 'bg-brand-blue text-white shadow-sm'
                : 'bg-surface text-text-muted hover:text-text hover:bg-bg-tint border border-border',
            )}
          >
            <FileCheck2 className="w-4 h-4" aria-hidden="true" />
            <span>Số liệu chỉ số</span>
            <span
              className={cn(
                'px-1.5 py-0.2 rounded-full text-xs font-mono font-bold',
                activeTab === 'reading'
                  ? 'bg-white/20 text-white'
                  : 'bg-bg-tint text-text-muted',
              )}
            >
              {readingItems.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'task_update'}
            onClick={() => handleTabChange('task_update')}
            className={cn(
              'px-4 py-2 rounded-control text-sm font-semibold transition inline-flex items-center gap-2',
              activeTab === 'task_update'
                ? 'bg-brand-blue text-white shadow-sm'
                : 'bg-surface text-text-muted hover:text-text hover:bg-bg-tint border border-border',
            )}
          >
            <ListChecks className="w-4 h-4" aria-hidden="true" />
            <span>Tiến độ đầu việc</span>
            <span
              className={cn(
                'px-1.5 py-0.2 rounded-full text-xs font-mono font-bold',
                activeTab === 'task_update'
                  ? 'bg-white/20 text-white'
                  : 'bg-bg-tint text-text-muted',
              )}
            >
              {taskItems.length}
            </span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 max-w-full min-w-0">
          {/* Period Filter */}
          <div className="flex items-center gap-1.5 text-xs max-w-full">
            <label htmlFor="period-filter" className="text-text-muted font-medium shrink-0">
              Kỳ:
            </label>
            <select
              id="period-filter"
              value={filters.period || ''}
              onChange={(e) => updateFilters({ period: e.target.value || undefined })}
              className="px-2.5 py-1.5 rounded-control border border-border bg-surface text-text text-xs focus:outline-none focus:ring-2 focus:ring-brand-bright transition max-w-[140px] sm:max-w-xs truncate"
            >
              <option value="">Tất cả các kỳ</option>
              {periods
                .filter((p) => p.kind !== 'month' && !p.label.startsWith('Tháng'))
                .map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label} ({p.key})
                  </option>
                ))}
            </select>
          </div>

          {/* Profile Filter */}
          <div className="flex items-center gap-1.5 text-xs max-w-full min-w-0">
            <label htmlFor="profile-filter" className="text-text-muted font-medium shrink-0">
              Hồ sơ:
            </label>
            <select
              id="profile-filter"
              value={filters.riskCode || ''}
              onChange={(e) => updateFilters({ riskCode: e.target.value || undefined })}
              className="px-2.5 py-1.5 rounded-control border border-border bg-surface text-text text-xs focus:outline-none focus:ring-2 focus:ring-brand-bright transition max-w-[170px] sm:max-w-xs truncate"
            >
              <option value="">Tất cả hồ sơ</option>
              {profiles.map((p) => (
                <option key={p.riskCode} value={p.riskCode}>
                  {p.riskCode} - {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Bulk action toolbar (if admin and items exist) */}
      {isAdmin && selectableItems.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-control bg-bg-tint/60 border border-border">
          <div className="flex items-center gap-3 text-xs text-text">
            <label className="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded text-brand-blue focus:ring-brand-bright border-border"
                aria-label="Chọn tất cả các mục hợp lệ để duyệt"
              />
              <span>
                Chọn tất cả ({selectableItems.length} mục có thể duyệt)
              </span>
            </label>
            {selectedIds.size > 0 && (
              <span className="font-semibold text-brand-blue font-mono">
                Đã chọn: {selectedIds.size}
              </span>
            )}
          </div>

          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setBulkConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-control bg-state-ok-line text-white hover:bg-state-ok-line/90 transition shadow-xs"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Duyệt các mục đã chọn ({selectedIds.size})</span>
            </button>
          )}
        </div>
      )}

      {/* Main Table / Empty State */}
      {currentTabItems.length === 0 ? (
        <EmptyState
          title="Không có bản nào đang chờ duyệt"
          description="Hiện tại không có bản nộp nào cần phê duyệt trong danh mục này."
        />
      ) : activeTab === 'reading' ? (
        /* Reading Approvals Table */
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-subtle max-w-full min-w-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
              <tr>
                {isAdmin && (
                  <th scope="col" className="px-3 py-3 w-10 text-center">
                    <span className="sr-only">Chọn</span>
                  </th>
                )}
                <th scope="col" className="px-3 py-3 font-semibold">Đối tượng (Chỉ số)</th>
                <th scope="col" className="px-3 py-3 font-semibold">Hồ sơ</th>
                <th scope="col" className="px-3 py-3 font-semibold">Kỳ</th>
                <th scope="col" className="px-3 py-3 font-semibold">Người nộp</th>
                <th scope="col" className="px-3 py-3 font-semibold">Thời gian</th>
                <th scope="col" className="px-3 py-3 font-semibold">Giá trị mới so với hiện hành</th>
                <th scope="col" className="px-3 py-3 font-semibold">Ghi chú</th>
                <th scope="col" className="px-3 py-3 font-semibold">Lý do chọn vùng</th>
                {!isViewer && (
                  <th scope="col" className="px-3 py-3 font-semibold text-right">Thao tác</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {readingItems.map((item) => {
                const sub = item.submission;
                const isSelected = selectedIds.has(sub.id);
                const disabledTooltip = !item.canApprove
                  ? 'Bạn không thể duyệt bản của chính mình'
                  : undefined;

                // Format comparison
                const newValueDisplay =
                  sub.valueNum !== null
                    ? `${formatPercent(sub.valueNum)}`
                    : sub.valueText || '—';

                const cur = item.current;
                const currentDisplay = cur
                  ? `${cur.valueNum !== null ? formatPercent(cur.valueNum) : cur.valueText || '—'} (${ZONE_NAMES[cur.zone] || cur.zone}, ${cur.periodKey})`
                  : 'Chưa có bản duyệt trước';

                return (
                  <tr
                    key={sub.id}
                    className={cn(
                      'hover:bg-bg-tint/30 transition',
                      isSelected && 'bg-brand-blue/5',
                    )}
                  >
                    {isAdmin && (
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!item.canApprove}
                          title={disabledTooltip}
                          onChange={() => handleToggleSelect(sub.id, item.canApprove)}
                          className="w-4 h-4 rounded text-brand-blue focus:ring-brand-bright border-border disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={`Chọn chỉ số ${sub.indicatorCode}`}
                        />
                      </td>
                    )}
                    <td className="px-3 py-3 font-medium text-text">
                      <div className="font-semibold text-brand-navy">{sub.indicatorCode}</div>
                      <div className="text-[11px] text-text-muted line-clamp-2" title={item.targetName}>
                        {item.targetName}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono font-medium text-text">
                      <Link
                        href={`/profiles/${item.riskCode}`}
                        className="text-brand-blue hover:underline"
                      >
                        {item.riskCode}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-mono text-text">{sub.periodKey}</td>
                    <td className="px-3 py-3 text-text-muted">
                      {sub.submittedBy?.fullName || 'Hệ thống'}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-text-muted text-[11px]">
                      {formatDate(sub.submittedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold text-text">
                          <span className="tabular-nums font-mono">{newValueDisplay}</span>
                          <ZoneBadge
                            kind={sub.indicatorCode.includes('KCI') ? 'kci' : 'kri'}
                            zone={sub.zone}
                          />
                        </div>
                        <div className="text-[10px] text-text-muted">
                          so với: <span className="italic">{currentDisplay}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-text-muted text-[11px] max-w-[160px] truncate" title={sub.note || ''}>
                      {sub.note || '—'}
                    </td>
                    <td className="px-3 py-3 text-text-muted text-[11px] max-w-[160px] truncate" title={sub.zoneNote || ''}>
                      {sub.zoneSource === 'manual' ? sub.zoneNote || '—' : '— (tự động)'}
                    </td>
                    {!isViewer && (
                      <td className="px-3 py-3 text-right">
                        {isAdmin ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={!item.canApprove || approvingId === sub.id}
                              title={disabledTooltip}
                              onClick={() => handleSingleApprove('reading', sub.id)}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-state-ok-line text-white hover:bg-state-ok-line/90 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
                            >
                              Duyệt
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setRejectItem({
                                  kind: 'reading',
                                  id: sub.id,
                                  targetName: sub.indicatorCode,
                                })
                              }
                              className="px-2 py-1 text-xs font-medium rounded border border-state-bad-line/40 text-state-bad-fg hover:bg-state-bad-bg transition"
                            >
                              Từ chối
                            </button>
                          </div>
                        ) : (
                          <span className="text-text-muted text-[11px]">Chỉ đọc</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Task Updates Approvals Table */
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-subtle max-w-full min-w-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
              <tr>
                {isAdmin && (
                  <th scope="col" className="px-3 py-3 w-10 text-center">
                    <span className="sr-only">Chọn</span>
                  </th>
                )}
                <th scope="col" className="px-3 py-3 font-semibold">Đầu việc</th>
                <th scope="col" className="px-3 py-3 font-semibold">Hồ sơ</th>
                <th scope="col" className="px-3 py-3 font-semibold">Kỳ</th>
                <th scope="col" className="px-3 py-3 font-semibold">Người nộp</th>
                <th scope="col" className="px-3 py-3 font-semibold">Thời gian</th>
                <th scope="col" className="px-3 py-3 font-semibold">Tiến độ mới so với hiện hành</th>
                <th scope="col" className="px-3 py-3 font-semibold">Ghi chú</th>
                {!isViewer && (
                  <th scope="col" className="px-3 py-3 font-semibold text-right">Thao tác</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {taskItems.map((item) => {
                const sub = item.submission;
                const isSelected = selectedIds.has(sub.id);
                const disabledTooltip = !item.canApprove
                  ? 'Bạn không thể duyệt bản của chính mình'
                  : undefined;

                const curProgress = item.currentProgress;
                const currentDisplay =
                  curProgress !== null ? `${curProgress}%` : 'Chưa có bản duyệt trước (0%)';

                return (
                  <tr
                    key={sub.id}
                    className={cn(
                      'hover:bg-bg-tint/30 transition',
                      isSelected && 'bg-brand-blue/5',
                    )}
                  >
                    {isAdmin && (
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!item.canApprove}
                          title={disabledTooltip}
                          onChange={() => handleToggleSelect(sub.id, item.canApprove)}
                          className="w-4 h-4 rounded text-brand-blue focus:ring-brand-bright border-border disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={`Chọn đầu việc ${sub.taskName}`}
                        />
                      </td>
                    )}
                    <td className="px-3 py-3 font-medium text-text">
                      <div className="font-semibold text-brand-navy">{sub.taskName}</div>
                      <div className="text-[11px] text-text-muted">
                        Kế hoạch: <span className="font-mono">{sub.actionCode}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono font-medium text-text">
                      <Link
                        href={`/profiles/${item.riskCode}`}
                        className="text-brand-blue hover:underline"
                      >
                        {item.riskCode}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-mono text-text">{sub.periodKey}</td>
                    <td className="px-3 py-3 text-text-muted">
                      {sub.submittedBy?.fullName || 'Hệ thống'}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-text-muted text-[11px]">
                      {formatDate(sub.submittedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <div className="font-bold font-mono text-text tabular-nums">
                          {formatPercent(sub.progress)}
                        </div>
                        <div className="text-[10px] text-text-muted">
                          so với: <span className="italic">{currentDisplay}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-text-muted text-[11px] max-w-[200px] truncate" title={sub.note || ''}>
                      {sub.note || '—'}
                    </td>
                    {!isViewer && (
                      <td className="px-3 py-3 text-right">
                        {isAdmin ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={!item.canApprove || approvingId === sub.id}
                              title={disabledTooltip}
                              onClick={() => handleSingleApprove('task_update', sub.id)}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-state-ok-line text-white hover:bg-state-ok-line/90 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
                            >
                              Duyệt
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setRejectItem({
                                  kind: 'task_update',
                                  id: sub.id,
                                  targetName: sub.taskName,
                                })
                              }
                              className="px-2 py-1 text-xs font-medium rounded border border-state-bad-line/40 text-state-bad-fg hover:bg-state-bad-bg transition"
                            >
                              Từ chối
                            </button>
                          </div>
                        ) : (
                          <span className="text-text-muted text-[11px]">Chỉ đọc</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Approve Confirmation Dialog */}
      <ConfirmDialog
        open={bulkConfirmOpen}
        onOpenChange={setBulkConfirmOpen}
        title="Xác nhận duyệt hàng loạt"
        description={`Bạn có chắc chắn muốn duyệt đồng thời ${selectedIds.size} bản ghi đã chọn không? Thao tác này sẽ áp dụng các số liệu mới vào hệ thống.`}
        confirmText={`Duyệt ${selectedIds.size} mục`}
        isSubmitting={isBulkApproving}
        onConfirm={handleBulkApprove}
      />

      {/* Single Reject Dialog (5 to 500 characters) */}
      {rejectItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-xl bg-surface border border-border shadow-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
              <div>
                <h3 id="reject-dialog-title" className="text-sm font-bold text-text">
                  Từ chối bản nộp
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Đối tượng: <span className="font-semibold text-text">{rejectItem.targetName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectItem(null)}
                className="text-text-muted hover:text-text p-1 rounded hover:bg-bg-tint"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {rejectError && (
              <div
                role="alert"
                className="p-3 rounded-control bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30 flex items-start gap-2 text-xs"
              >
                <AlertCircle className="w-4 h-4 text-state-bad-line shrink-0 mt-0.5" aria-hidden="true" />
                <span>{rejectError}</span>
              </div>
            )}

            <div>
              <label htmlFor="reject-reason" className="block text-xs font-semibold text-text mb-1">
                Lý do từ chối <span className="text-brand-red">*</span>
              </label>
              <textarea
                id="reject-reason"
                rows={4}
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (rejectError) setRejectError(null);
                }}
                placeholder="Nhập lý do từ chối (từ 5 đến 500 ký tự)..."
                className="w-full px-3 py-2 rounded-control border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand-bright transition"
              />
              <div className="flex justify-between items-center mt-1 text-[11px]">
                <span className={cn(
                  rejectReason.trim().length < 5 ? 'text-text-muted' : 'text-state-ok-line'
                )}>
                  {rejectReason.trim().length < 5
                    ? 'Tối thiểu 5 ký tự'
                    : 'Độ dài hợp lệ'}
                </span>
                <span className={cn(
                  'font-mono',
                  rejectReason.length > 500 ? 'text-brand-red font-bold' : 'text-text-muted'
                )}>
                  {rejectReason.length}/500
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={isRejecting}
                onClick={() => setRejectItem(null)}
                className="px-3 py-1.5 rounded-control text-xs font-medium border border-border bg-surface text-text hover:bg-bg-tint transition disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isRejecting || rejectReason.trim().length < 5 || rejectReason.length > 500}
                onClick={handleConfirmReject}
                className="px-3 py-1.5 rounded-control text-xs font-semibold bg-brand-red text-white hover:bg-brand-red/90 transition shadow-xs disabled:opacity-50"
              >
                {isRejecting ? 'Đang từ chối...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resubmit ReadingForm modal (if opened by unit) */}
      {resubmitIndicator && (
        <ReadingForm
          indicator={resubmitIndicator}
          open={!!resubmitIndicator}
          onOpenChange={(open) => !open && setResubmitIndicator(null)}
          onSuccess={() => {
            setResubmitIndicator(null);
            router.refresh();
          }}
        />
      )}

      {/* Resubmit TaskUpdateForm modal (if opened by unit) */}
      {resubmitTask && (
        <TaskUpdateForm
          task={resubmitTask}
          open={!!resubmitTask}
          onOpenChange={(open) => !open && setResubmitTask(null)}
          onSuccess={() => {
            setResubmitTask(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
