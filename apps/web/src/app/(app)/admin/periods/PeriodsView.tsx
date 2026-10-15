'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { components } from '@/lib/api/schema';
import { PageHero } from '@/components/ui/PageHero';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiSend, ApiClientError } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import {
  Lock,
  Unlock,
  Plus,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  X,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type PeriodSummary = components['schemas']['PeriodSummary'];
type CycleSummary = components['schemas']['CycleSummary'];

export interface PeriodsViewProps {
  periods: PeriodSummary[];
  cycles: CycleSummary[];
  selectedYear: number;
}

export interface PendingConflictItem {
  kind: 'reading' | 'task_update';
  id: string;
}

export function PeriodsView({
  periods,
  cycles,
  selectedYear,
}: PeriodsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Create event period dialog state
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [eventLabel, setEventLabel] = useState('');
  const [eventStartsOn, setEventStartsOn] = useState('');
  const [eventEndsOn, setEventEndsOn] = useState('');
  const [eventError, setEventError] = useState<string | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

  // Ensure periods state
  const [isEnsuring, setIsEnsuring] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Close period state
  const [periodToClose, setPeriodToClose] = useState<PeriodSummary | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [closePendingConflict, setClosePendingConflict] = useState<{
    periodKey: string;
    details: PendingConflictItem[];
    message: string;
  } | null>(null);

  // Reopen period state
  const [periodToReopen, setPeriodToReopen] = useState<PeriodSummary | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [isReopening, setIsReopening] = useState(false);

  const handleYearChange = (year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('cycle', String(year));
    router.push(`${pathname}?${params.toString()}`);
  };

  // Ensure missing periods
  const handleEnsurePeriods = async () => {
    setIsEnsuring(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiSend('POST', `/api/cycles/${selectedYear}/periods/ensure`);
      setActionSuccess('Đã tạo thành công các kỳ tháng và quý còn thiếu cho chu kỳ.');
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setActionError(err.message);
      } else {
        setActionError('Đã xảy ra lỗi khi tạo kỳ còn thiếu.');
      }
    } finally {
      setIsEnsuring(false);
    }
  };

  // Create event period
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventLabel.trim()) {
      setEventError('Vui lòng nhập nhãn kỳ đợt.');
      return;
    }
    if (!eventStartsOn || !eventEndsOn) {
      setEventError('Vui lòng nhập ngày bắt đầu và kết thúc.');
      return;
    }
    if (eventStartsOn > eventEndsOn) {
      setEventError('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
      return;
    }

    setIsCreatingEvent(true);
    setEventError(null);
    try {
      await apiSend('POST', `/api/cycles/${selectedYear}/periods/events`, {
        label: eventLabel.trim(),
        startsOn: eventStartsOn,
        endsOn: eventEndsOn,
      });
      setCreateEventOpen(false);
      setEventLabel('');
      setEventStartsOn('');
      setEventEndsOn('');
      setActionSuccess('Đã tạo thành công kỳ đợt mới.');
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setEventError(err.message);
      } else {
        setEventError('Đã xảy ra lỗi khi tạo kỳ đợt.');
      }
    } finally {
      setIsCreatingEvent(false);
    }
  };

  // Close period
  const handleConfirmClosePeriod = async () => {
    if (!periodToClose) return;
    setIsClosing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiSend('POST', `/api/cycles/${selectedYear}/periods/${periodToClose.key}/close`);
      setPeriodToClose(null);
      setActionSuccess(`Đã khóa thành công kỳ ${periodToClose.label}.`);
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === 'INVALID_STATE' && Array.isArray(err.details)) {
          // Conflict: pending submissions exist
          setClosePendingConflict({
            periodKey: periodToClose.key,
            details: err.details as PendingConflictItem[],
            message: err.message,
          });
          setPeriodToClose(null);
        } else {
          setActionError(err.message);
          setPeriodToClose(null);
        }
      } else {
        setActionError('Đã xảy ra lỗi khi khóa kỳ.');
        setPeriodToClose(null);
      }
    } finally {
      setIsClosing(false);
    }
  };

  // Reopen period
  const handleConfirmReopenPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodToReopen) return;
    const trimmed = reopenReason.trim();
    if (!trimmed) {
      setReopenError('Bắt buộc phải nhập lý do mở lại kỳ.');
      return;
    }

    setIsReopening(true);
    setReopenError(null);
    try {
      await apiSend('POST', `/api/cycles/${selectedYear}/periods/${periodToReopen.key}/reopen`, {
        reason: trimmed,
      });
      setPeriodToReopen(null);
      setReopenReason('');
      setActionSuccess(`Đã mở lại thành công kỳ ${periodToReopen.label}.`);
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setReopenError(err.message);
      } else {
        setReopenError('Đã xảy ra lỗi khi mở lại kỳ.');
      }
    } finally {
      setIsReopening(false);
    }
  };

  const getKindBadge = (kind: PeriodSummary['kind']) => {
    switch (kind) {
      case 'month':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">Hàng tháng</span>;
      case 'quarter':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700">Hàng quý</span>;
      case 'event':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700">Theo đợt</span>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        title="Quản trị kỳ báo cáo"
        description={`Danh sách các kỳ báo cáo năm ${selectedYear}, quản lý khóa và mở lại kỳ số liệu`}
      />

      {/* Alert banners */}
      {actionSuccess && (
        <div
          role="status"
          className="p-3 rounded-control bg-state-ok-bg text-state-ok-fg border border-state-ok-line/30 flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-state-ok-line shrink-0" aria-hidden="true" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-text-muted hover:text-text p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="p-3 rounded-control bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30 flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-state-bad-line shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-text-muted hover:text-text p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-surface border border-border">
        {/* Cycle Switcher */}
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="cycle-select" className="font-semibold text-text">
            Chu kỳ:
          </label>
          <select
            id="cycle-select"
            value={selectedYear}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            className="px-3 py-1.5 rounded-control border border-border bg-surface text-text text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-bright transition"
          >
            {cycles.map((c) => (
              <option key={c.year} value={c.year}>
                Năm {c.year} {c.status === 'open' ? '(Đang mở)' : '(Đã lưu trữ)'}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isEnsuring}
            onClick={handleEnsurePeriods}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control border border-border bg-surface hover:bg-bg-tint text-text text-xs font-semibold transition disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isEnsuring && 'animate-spin')} aria-hidden="true" />
            <span>{isEnsuring ? 'Đang tạo...' : 'Tạo các kỳ còn thiếu'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEventError(null);
              setCreateEventOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-semibold transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tạo kỳ đợt</span>
          </button>
        </div>
      </div>

      {/* Periods Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-subtle">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
            <tr>
              <th scope="col" className="px-3 py-3 font-semibold">Khóa kỳ</th>
              <th scope="col" className="px-3 py-3 font-semibold">Nhãn kỳ</th>
              <th scope="col" className="px-3 py-3 font-semibold">Loại</th>
              <th scope="col" className="px-3 py-3 font-semibold">Bắt đầu</th>
              <th scope="col" className="px-3 py-3 font-semibold">Kết thúc</th>
              <th scope="col" className="px-3 py-3 font-semibold">Hạn nhập</th>
              <th scope="col" className="px-3 py-3 font-semibold">Trạng thái</th>
              <th scope="col" className="px-3 py-3 font-semibold">Người khóa</th>
              <th scope="col" className="px-3 py-3 font-semibold">Lý do mở lại</th>
              <th scope="col" className="px-3 py-3 font-semibold text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {periods.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-text-muted">
                  Chưa có kỳ nào được tạo cho chu kỳ năm {selectedYear}. Bấm &quot;Tạo các kỳ còn thiếu&quot; để bắt đầu.
                </td>
              </tr>
            ) : (
              periods.map((p) => (
                <tr key={p.key} className="hover:bg-bg-tint/30 transition">
                  <td className="px-3 py-3 font-mono font-semibold text-text">{p.key}</td>
                  <td className="px-3 py-3 font-medium text-text">{p.label}</td>
                  <td className="px-3 py-3">{getKindBadge(p.kind)}</td>
                  <td className="px-3 py-3 tabular-nums text-text-muted">{formatDate(p.startsOn)}</td>
                  <td className="px-3 py-3 tabular-nums text-text-muted">{formatDate(p.endsOn)}</td>
                  <td className="px-3 py-3 tabular-nums text-text-muted">
                    {p.dueAt ? formatDate(p.dueAt) : '—'}
                  </td>
                  <td className="px-3 py-3">
                    {p.closed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-300">
                        <Lock className="w-3 h-3 text-slate-500" aria-hidden="true" />
                        <span>Đã khóa</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-state-ok-bg text-state-ok-fg border border-state-ok-line/30">
                        <Unlock className="w-3 h-3 text-state-ok-line" aria-hidden="true" />
                        <span>Mở</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-text-muted text-[11px]">{p.closedByName || '—'}</td>
                  <td className="px-3 py-3 text-text-muted text-[11px] max-w-[180px] truncate" title={p.reopenReason || ''}>
                    {p.reopenReason || '—'}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {p.closed ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReopenReason('');
                          setReopenError(null);
                          setPeriodToReopen(p);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-border bg-surface text-text hover:bg-bg-tint transition shadow-2xs"
                      >
                        <Unlock className="w-3 h-3 text-brand-blue" aria-hidden="true" />
                        <span>Mở lại</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPeriodToClose(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border border-state-bad-line/30 bg-surface text-state-bad-fg hover:bg-state-bad-bg transition shadow-2xs"
                      >
                        <Lock className="w-3 h-3 text-state-bad-line" aria-hidden="true" />
                        <span>Khóa kỳ</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Event Period Dialog */}
      {createEventOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-event-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-xl bg-surface border border-border shadow-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
              <h3 id="create-event-title" className="text-sm font-bold text-text">
                Tạo kỳ báo cáo theo đợt
              </h3>
              <button
                type="button"
                onClick={() => setCreateEventOpen(false)}
                className="text-text-muted hover:text-text p-1 rounded hover:bg-bg-tint"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {eventError && (
              <div
                role="alert"
                className="p-3 rounded-control bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30 flex items-start gap-2 text-xs"
              >
                <AlertCircle className="w-4 h-4 text-state-bad-line shrink-0 mt-0.5" aria-hidden="true" />
                <span>{eventError}</span>
              </div>
            )}

            <form onSubmit={handleCreateEvent} className="space-y-3">
              <div>
                <label htmlFor="event-label" className="block text-xs font-semibold text-text mb-1">
                  Nhãn kỳ đợt <span className="text-brand-red">*</span>
                </label>
                <input
                  id="event-label"
                  type="text"
                  required
                  value={eventLabel}
                  onChange={(e) => setEventLabel(e.target.value)}
                  placeholder="Ví dụ: Đợt đánh giá ATTT quý 3/2026..."
                  className="w-full px-3 py-2 rounded-control border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand-bright transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="event-starts-on" className="block text-xs font-semibold text-text mb-1">
                    Ngày bắt đầu <span className="text-brand-red">*</span>
                  </label>
                  <input
                    id="event-starts-on"
                    type="date"
                    required
                    value={eventStartsOn}
                    onChange={(e) => setEventStartsOn(e.target.value)}
                    className="w-full px-3 py-2 rounded-control border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand-bright transition"
                  />
                </div>

                <div>
                  <label htmlFor="event-ends-on" className="block text-xs font-semibold text-text mb-1">
                    Ngày kết thúc <span className="text-brand-red">*</span>
                  </label>
                  <input
                    id="event-ends-on"
                    type="date"
                    required
                    value={eventEndsOn}
                    onChange={(e) => setEventEndsOn(e.target.value)}
                    className="w-full px-3 py-2 rounded-control border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand-bright transition"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  disabled={isCreatingEvent}
                  onClick={() => setCreateEventOpen(false)}
                  className="px-3 py-1.5 rounded-control text-xs font-medium border border-border bg-surface text-text hover:bg-bg-tint transition disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isCreatingEvent}
                  className="px-4 py-1.5 rounded-control text-xs font-semibold bg-brand-blue text-white hover:bg-brand-blue/90 transition shadow-xs disabled:opacity-50"
                >
                  {isCreatingEvent ? 'Đang tạo...' : 'Tạo kỳ đợt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Close Period Dialog */}
      <ConfirmDialog
        open={!!periodToClose}
        onOpenChange={(open) => !open && setPeriodToClose(null)}
        title={`Khóa kỳ ${periodToClose?.label || ''}`}
        description="Khi khóa kỳ, người dùng các đơn vị sẽ không thể nộp thêm số liệu hoặc cập nhật tiến độ cho kỳ này nữa. Bạn có chắc chắn muốn khóa?"
        confirmText="Khóa kỳ này"
        variant="danger"
        isSubmitting={isClosing}
        onConfirm={handleConfirmClosePeriod}
      />

      {/* Pending Conflict Dialog (when closing fails with INVALID_STATE) */}
      {closePendingConflict && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="conflict-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg rounded-xl bg-surface border border-state-bad-line/50 shadow-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center gap-2 text-state-bad-fg">
                <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
                <h3 id="conflict-dialog-title" className="text-sm font-bold">
                  Không thể khóa kỳ báo cáo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setClosePendingConflict(null)}
                className="text-text-muted hover:text-text p-1 rounded hover:bg-bg-tint"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-text">
              <p>
                Kỳ <span className="font-semibold font-mono">{closePendingConflict.periodKey}</span> vẫn còn{' '}
                <span className="font-bold text-state-bad-fg">
                  {closePendingConflict.details.length} bản ghi đang chờ duyệt
                </span>
                . Bạn phải phê duyệt hoặc từ chối toàn bộ các bản ghi này trước khi có thể khóa kỳ.
              </p>

              <div className="p-3 rounded-control bg-bg-tint/60 border border-border space-y-2">
                <span className="font-semibold block text-[11px] uppercase tracking-wider text-text-muted">
                  Danh sách các mục cần xử lý:
                </span>
                <ul className="list-disc list-inside space-y-1 font-mono text-[11px] max-h-40 overflow-y-auto">
                  {closePendingConflict.details.map((item, idx) => (
                    <li key={`${item.id}-${idx}`}>
                      [{item.kind === 'reading' ? 'Chỉ số' : 'Đầu việc'}] ID: {item.id}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <Link
                href={`/approvals?period=${closePendingConflict.periodKey}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs font-semibold bg-brand-blue text-white hover:bg-brand-blue/90 transition shadow-xs"
              >
                <span>Tới trang Chờ duyệt để xử lý</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => setClosePendingConflict(null)}
                className="px-3 py-1.5 rounded-control text-xs font-medium border border-border bg-surface text-text hover:bg-bg-tint transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Period Dialog (Reason Required) */}
      {periodToReopen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reopen-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-xl bg-surface border border-border shadow-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
              <div>
                <h3 id="reopen-dialog-title" className="text-sm font-bold text-text">
                  Mở lại kỳ báo cáo
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Kỳ: <span className="font-semibold text-text">{periodToReopen.label}</span> ({periodToReopen.key})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPeriodToReopen(null)}
                className="text-text-muted hover:text-text p-1 rounded hover:bg-bg-tint"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {reopenError && (
              <div
                role="alert"
                className="p-3 rounded-control bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30 flex items-start gap-2 text-xs"
              >
                <AlertCircle className="w-4 h-4 text-state-bad-line shrink-0 mt-0.5" aria-hidden="true" />
                <span>{reopenError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmReopenPeriod} className="space-y-3">
              <div>
                <label htmlFor="reopen-reason" className="block text-xs font-semibold text-text mb-1">
                  Lý do mở lại kỳ <span className="text-brand-red">*</span>
                </label>
                <textarea
                  id="reopen-reason"
                  rows={3}
                  required
                  value={reopenReason}
                  onChange={(e) => {
                    setReopenReason(e.target.value);
                    if (reopenError) setReopenError(null);
                  }}
                  placeholder="Nhập lý do cần mở lại kỳ để cập nhật bổ sung số liệu..."
                  className="w-full px-3 py-2 rounded-control border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand-bright transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  disabled={isReopening}
                  onClick={() => setPeriodToReopen(null)}
                  className="px-3 py-1.5 rounded-control text-xs font-medium border border-border bg-surface text-text hover:bg-bg-tint transition disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isReopening || !reopenReason.trim()}
                  className="px-4 py-1.5 rounded-control text-xs font-semibold bg-brand-blue text-white hover:bg-brand-blue/90 transition shadow-xs disabled:opacity-50"
                >
                  {isReopening ? 'Đang mở lại...' : 'Xác nhận mở lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
