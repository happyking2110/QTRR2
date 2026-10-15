'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';

export interface TaskUpdateFormTask {
  id: string;
  name: string;
  actionCode?: string;
  unit?: components['schemas']['UnitSummary'] | null;
  progress: number;
  submitPeriodKeys: string[];
  pendingSubmissions?: components['schemas']['PendingRef'][];
}

export interface TaskUpdateFormProps {
  task: TaskUpdateFormTask;
  periods?: Array<{ key: string; label: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialPeriodKey?: string;
  initialProgress?: number;
  initialNote?: string;
}

export function TaskUpdateForm({
  task,
  periods = [],
  open,
  onOpenChange,
  onSuccess,
  initialPeriodKey,
  initialProgress,
  initialNote,
}: TaskUpdateFormProps) {
  const router = useRouter();

  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>(
    initialPeriodKey || task.submitPeriodKeys[0] || '',
  );
  const [progress, setProgress] = useState<number>(
    initialProgress !== undefined ? initialProgress : task.progress,
  );
  const [note, setNote] = useState<string>(initialNote || '');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Withdraw existing pending submission state
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [confirmWithdrawOpen, setConfirmWithdrawOpen] = useState(false);
  const [pendingToWithdrawId, setPendingToWithdrawId] = useState<string | null>(null);

  // Reset form when task or open state changes
  useEffect(() => {
    if (open) {
      setSelectedPeriodKey(initialPeriodKey || task.submitPeriodKeys[0] || '');
      setProgress(initialProgress !== undefined ? initialProgress : task.progress);
      setNote(initialNote || '');
      setGeneralError(null);
      setFieldErrors({});
      setSuccessMessage(null);
    }
  }, [open, task, initialPeriodKey, initialProgress, initialNote]);

  // Handle ESC key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isSubmitting, onOpenChange]);

  if (!open) return null;

  // Check if there is already a pending submission for the selected period
  const pendingForPeriod = task.pendingSubmissions?.find(
    (p) => p.periodKey === selectedPeriodKey,
  );

  const isDecreasedProgress = progress < task.progress;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};

    if (!selectedPeriodKey) {
      errors.periodKey = 'Vui lòng chọn kỳ báo cáo';
    }

    if (progress < 0 || progress > 100) {
      errors.progress = 'Tiến độ phải nằm trong khoảng từ 0 đến 100%';
    }

    if (isDecreasedProgress && !note.trim()) {
      errors.note = `Tiến độ thấp hơn bản đã duyệt (${task.progress}%), vui lòng ghi rõ lý do.`;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        periodKey: selectedPeriodKey,
        progress,
        note: note.trim() || null,
      };

      await apiSend('POST', `/api/tasks/${task.id}/updates`, payload);

      setSuccessMessage('Đã gửi, đang chờ duyệt');
      setTimeout(() => {
        onOpenChange(false);
        router.refresh();
        onSuccess?.();
      }, 800);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === 'PERIOD_CLOSED') {
          setGeneralError('Kỳ báo cáo đã đóng, không thể sửa đổi số liệu.');
        } else {
          setGeneralError(err.message);
        }
        if (err.fieldErrors) {
          setFieldErrors(err.fieldErrors);
        }
      } else {
        setGeneralError('Đã xảy ra lỗi khi gửi cập nhật tiến độ. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdrawPending = async () => {
    if (!pendingToWithdrawId) return;
    setIsWithdrawing(true);
    try {
      await apiSend('POST', `/api/task-updates/${pendingToWithdrawId}/withdraw`);
      setConfirmWithdrawOpen(false);
      setPendingToWithdrawId(null);
      router.refresh();
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Không thể rút lại bản nộp. Vui lòng thử lại.');
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  const getPeriodLabel = (key: string) => {
    const p = periods.find((item) => item.key === key);
    return p ? p.label : key;
  };

  const presets = [0, 25, 50, 75, 100];

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-update-title"
      >
        <div className="relative w-full max-w-lg bg-surface rounded-card border border-border shadow-modal p-6 my-8 space-y-5 animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-blue block">
                Cập nhật tiến độ đầu việc
              </span>
              <h3 id="task-update-title" className="text-base font-bold text-brand-navy mt-0.5">
                {task.name}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 rounded text-text-muted hover:text-text hover:bg-bg-tint transition"
              aria-label="Đóng hộp thoại"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Info block */}
            <div className="bg-bg-tint/60 rounded-control p-3 text-xs space-y-1.5 border border-border/70">
              {task.actionCode && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Kế hoạch hành động:</span>
                  <span className="font-mono font-semibold text-brand-navy">{task.actionCode}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-muted">Đơn vị phụ trách:</span>
                <span className="font-medium text-text">{task.unit ? task.unit.name : 'Chưa gán'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Tiến độ đã duyệt hiện tại:</span>
                <span className="font-semibold text-text tabular-nums">{task.progress}%</span>
              </div>
            </div>

            {/* Error alerts */}
            {generalError && (
              <div
                role="alert"
                className="p-3 rounded-control bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30 flex items-start gap-2 text-xs"
              >
                <AlertCircle className="w-4 h-4 text-state-bad-line shrink-0 mt-0.5" aria-hidden="true" />
                <span>{generalError}</span>
              </div>
            )}

            {/* Success alert */}
            {successMessage && (
              <div
                role="status"
                className="p-3 rounded-control bg-state-ok-bg text-state-ok-fg border border-state-ok-line/30 flex items-center gap-2 text-xs"
              >
                <CheckCircle2 className="w-4 h-4 text-state-ok-line shrink-0" aria-hidden="true" />
                <span className="font-semibold">{successMessage}</span>
              </div>
            )}

            {/* Warning if pending submission exists for this period */}
            {pendingForPeriod && (
              <div
                role="alert"
                className="p-3 rounded-control bg-state-warn-bg text-state-warn-fg border border-state-warn-line/30 space-y-2 text-xs"
              >
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-state-warn-line shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <span className="font-semibold block">Đang có một bản chờ duyệt cho kỳ này.</span>
                    <span className="text-[11px] opacity-90">
                      Nộp bản mới sẽ không thay thế bản đó cho tới khi được duyệt.
                    </span>
                  </div>
                </div>
                {pendingForPeriod.canWithdraw && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingToWithdrawId(pendingForPeriod.id);
                        setConfirmWithdrawOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface border border-state-warn-line text-state-warn-fg hover:bg-state-warn-bg/80 text-[11px] font-semibold transition"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                      <span>Rút bản cũ</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Period select */}
            <div>
              <label htmlFor="periodKey" className="block text-xs font-semibold text-text mb-1">
                Kỳ báo cáo <span className="text-brand-red">*</span>
              </label>
              <select
                id="periodKey"
                value={selectedPeriodKey}
                onChange={(e) => setSelectedPeriodKey(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 rounded-control border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand-bright transition',
                  fieldErrors.periodKey ? 'border-brand-red' : 'border-border',
                )}
                aria-describedby={fieldErrors.periodKey ? 'periodKey-error' : undefined}
              >
                {task.submitPeriodKeys.map((key) => (
                  <option key={key} value={key}>
                    {getPeriodLabel(key)} ({key})
                  </option>
                ))}
              </select>
              {fieldErrors.periodKey && (
                <p id="periodKey-error" className="mt-1 text-xs text-brand-red">
                  {fieldErrors.periodKey}
                </p>
              )}
            </div>

            {/* Progress input: Slider + Number + Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="progress-input" className="block text-xs font-semibold text-text">
                  Tiến độ hoàn thành (%) <span className="text-brand-red">*</span>
                </label>
                <span className="text-sm font-bold font-mono text-brand-navy tabular-nums">
                  {progress}%
                </span>
              </div>

              {/* Slider */}
              <input
                id="progress-slider"
                type="range"
                min="0"
                max="100"
                step="5"
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full h-2 bg-bg-tint rounded-lg appearance-none cursor-pointer accent-brand-blue"
                aria-label="Thanh kéo điều chỉnh tiến độ"
              />

              {/* Number input and Presets */}
              <div className="flex items-center gap-2 pt-1">
                <div className="relative w-28">
                  <input
                    id="progress-input"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={progress}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!isNaN(val)) {
                        setProgress(Math.max(0, Math.min(100, val)));
                      }
                    }}
                    className={cn(
                      'w-full px-3 py-1.5 pr-7 rounded-control border bg-surface text-sm text-text tabular-nums font-mono focus:outline-none focus:ring-2 focus:ring-brand-bright transition',
                      fieldErrors.progress ? 'border-brand-red' : 'border-border',
                    )}
                    aria-describedby={fieldErrors.progress ? 'progress-error' : undefined}
                  />
                  <span className="absolute right-2.5 top-2 text-xs font-bold text-text-muted">%</span>
                </div>

                {/* Preset chips */}
                <div className="flex items-center gap-1 flex-1 justify-end">
                  {presets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProgress(p)}
                      className={cn(
                        'px-2 py-1 text-xs font-medium rounded border transition',
                        progress === p
                          ? 'bg-brand-blue text-white border-brand-blue'
                          : 'bg-surface text-text-muted border-border hover:bg-bg-tint hover:text-text',
                      )}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              {fieldErrors.progress && (
                <p id="progress-error" className="mt-1 text-xs text-brand-red">
                  {fieldErrors.progress}
                </p>
              )}
            </div>

            {/* Note input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="task-note" className="block text-xs font-semibold text-text">
                  Ghi chú {isDecreasedProgress && <span className="text-brand-red">*</span>}
                </label>
                {isDecreasedProgress && (
                  <span className="text-[11px] text-state-warn-fg font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-state-warn-line" aria-hidden="true" />
                    <span>Giải thích lý do giảm tiến độ</span>
                  </span>
                )}
              </div>

              <textarea
                id="task-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isDecreasedProgress
                    ? `Tiến độ thấp hơn bản đã duyệt (${task.progress}%), vui lòng ghi rõ lý do...`
                    : 'Ghi chú, số hiệu văn bản hoặc đường dẫn nội bộ làm bằng chứng...'
                }
                className={cn(
                  'w-full px-3 py-2 rounded-control border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand-bright transition',
                  fieldErrors.note ? 'border-brand-red' : 'border-border',
                )}
                aria-describedby={fieldErrors.note ? 'task-note-error' : 'task-note-desc'}
              />

              {fieldErrors.note ? (
                <p id="task-note-error" className="mt-1 text-xs text-brand-red">
                  {fieldErrors.note}
                </p>
              ) : (
                <p id="task-note-desc" className="mt-1 text-[11px] text-text-muted">
                  {isDecreasedProgress
                    ? `Tiến độ thấp hơn bản đã duyệt (${task.progress}%), vui lòng ghi rõ lý do.`
                    : 'Có thể ghi số hiệu văn bản hoặc đường dẫn nội bộ làm bằng chứng trong ghi chú.'}
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-control text-sm font-medium border border-border bg-surface text-text hover:bg-bg-tint transition disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting || task.submitPeriodKeys.length === 0}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-control text-sm font-medium bg-brand-blue text-white hover:bg-brand-blue/90 transition shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Đang gửi...</span>
                  </>
                ) : (
                  <span>Nộp để duyệt</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ConfirmDialog for withdrawing old submission */}
      <ConfirmDialog
        open={confirmWithdrawOpen}
        onOpenChange={setConfirmWithdrawOpen}
        title="Xác nhận rút lại bản nộp"
        description="Bạn có chắc chắn muốn rút lại bản cập nhật tiến độ đang chờ duyệt này không? Bản nộp sẽ chuyển sang trạng thái đã rút."
        confirmText="Rút lại"
        variant="danger"
        isSubmitting={isWithdrawing}
        onConfirm={handleWithdrawPending}
      />
    </>
  );
}
