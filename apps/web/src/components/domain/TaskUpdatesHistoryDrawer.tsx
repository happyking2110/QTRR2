'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ProgressBar } from '@/components/domain/ProgressBar';
import { ApprovalBadge } from '@/components/domain/ApprovalBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDateTime } from '@/lib/format';

type TaskUpdateSubmission = components['schemas']['TaskUpdateSubmission'];

export interface TaskUpdatesHistoryDrawerProps {
  task: {
    id: string;
    name: string;
    actionCode?: string;
    pendingSubmissions?: Array<{
      id: string;
      periodKey: string;
      canWithdraw: boolean;
    }>;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function TaskUpdatesHistoryDrawer({
  task,
  open,
  onOpenChange,
  onSuccess,
}: TaskUpdatesHistoryDrawerProps) {
  const router = useRouter();
  const [updates, setUpdates] = useState<TaskUpdateSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Withdraw state
  const [withdrawTargetId, setWithdrawTargetId] = useState<string | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fetchUpdates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiSend<TaskUpdateSubmission[]>(
        'GET',
        `/api/tasks/${task.id}/updates`,
      );
      setUpdates(data || []);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Không thể tải lịch sử cập nhật tiến độ.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [task.id]);

  useEffect(() => {
    if (open) {
      fetchUpdates();
    }
  }, [open, fetchUpdates]);

  // Handle ESC key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isWithdrawing) {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isWithdrawing, onOpenChange]);

  const handleWithdrawClick = (submissionId: string) => {
    setWithdrawTargetId(submissionId);
    setConfirmOpen(true);
  };

  const handleConfirmWithdraw = async () => {
    if (!withdrawTargetId) return;
    setIsWithdrawing(true);
    try {
      await apiSend('POST', `/api/task-updates/${withdrawTargetId}/withdraw`);
      setConfirmOpen(false);
      setWithdrawTargetId(null);
      await fetchUpdates();
      router.refresh();
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        alert(err.message);
      } else {
        alert('Không thể rút lại bản nộp. Vui lòng thử lại.');
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (!open) return null;

  const canWithdrawItem = (item: TaskUpdateSubmission) => {
    if (item.status !== 'pending') return false;
    const matchedPending = task.pendingSubmissions?.find((p) => p.id === item.id);
    return matchedPending ? matchedPending.canWithdraw : true;
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-history-title"
      >
        <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
          <div className="w-screen max-w-md bg-surface shadow-drawer flex flex-col border-l border-border animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-start justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-blue block">
                  Lịch sử cập nhật tiến độ
                </span>
                <h3 id="task-history-title" className="text-base font-bold text-brand-navy mt-0.5">
                  {task.name}
                </h3>
                {task.actionCode && (
                  <p className="text-xs text-text-muted mt-0.5 font-mono">
                    Kế hoạch: {task.actionCode}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="p-1 rounded text-text-muted hover:text-text hover:bg-bg-tint transition"
                aria-label="Đóng ngăn lịch sử"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {isLoading && (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-text-muted">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-blue" aria-hidden="true" />
                  <span className="text-xs">Đang tải lịch sử cập nhật...</span>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-control bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30 flex items-start gap-2 text-sm"
                >
                  <AlertCircle className="w-4 h-4 text-state-bad-line shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {!isLoading && !error && updates.length === 0 && (
                <div className="py-12 text-center text-text-muted text-sm">
                  Chưa có lịch sử cập nhật tiến độ nào cho đầu việc này.
                </div>
              )}

              {!isLoading && updates.length > 0 && (
                <div className="space-y-3">
                  {updates.map((u) => {
                    const canWithdraw = canWithdrawItem(u);
                    return (
                      <div
                        key={u.id}
                        className="p-4 rounded-card border border-border bg-surface hover:border-border/80 transition space-y-3 shadow-xs"
                      >
                        {/* Top row: Period & Status */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-sm text-brand-navy">
                            {u.periodKey}
                          </span>
                          <ApprovalBadge status={u.status} />
                        </div>

                        {/* Progress */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-text-muted">Tiến độ báo cáo:</span>
                            <span className="font-bold font-mono text-text tabular-nums">
                              {u.progress}%
                            </span>
                          </div>
                          <ProgressBar value={u.progress} showLabel={false} />
                        </div>

                        {/* Note */}
                        {u.note && (
                          <div className="text-xs text-text-muted bg-bg-tint/60 p-2.5 rounded-control border border-border/60">
                            <span className="font-semibold text-text">Ghi chú: </span>
                            <span>{u.note}</span>
                          </div>
                        )}

                        {/* Rejection note */}
                        {u.status === 'rejected' && u.reviewNote && (
                          <div className="text-xs bg-state-bad-bg/60 text-state-bad-fg p-2.5 rounded-control border border-state-bad-line/30">
                            <span className="font-semibold">Lý do từ chối: </span>
                            <span>{u.reviewNote}</span>
                          </div>
                        )}

                        {/* Submitter & Reviewer Meta */}
                        <div className="pt-2 border-t border-border/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
                          <div>
                            <span>Nộp bởi: </span>
                            <span className="font-medium text-text">
                              {u.submittedBy?.fullName || 'Hệ thống'}
                            </span>
                            {u.submittedBy?.unitName && (
                              <span> ({u.submittedBy.unitName})</span>
                            )}
                            <span> lúc {formatDateTime(u.submittedAt)}</span>
                          </div>

                          {canWithdraw && (
                            <button
                              type="button"
                              onClick={() => handleWithdrawClick(u.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border text-text hover:bg-bg-tint font-semibold text-xs transition"
                            >
                              <RotateCcw className="w-3 h-3 text-text-muted" aria-hidden="true" />
                              <span>Rút lại</span>
                            </button>
                          )}
                        </div>

                        {/* Review info */}
                        {u.reviewedBy && (
                          <div className="text-[11px] text-text-muted">
                            <span>Duyệt bởi: </span>
                            <span className="font-medium text-text">{u.reviewedBy.fullName}</span>
                            {u.reviewedAt && (
                              <span> lúc {formatDateTime(u.reviewedAt)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Xác nhận rút lại bản nộp"
        description="Bạn có chắc chắn muốn rút lại bản cập nhật tiến độ này không? Bản nộp sẽ chuyển sang trạng thái đã rút và không thể khôi phục."
        confirmText="Rút lại"
        variant="danger"
        isSubmitting={isWithdrawing}
        onConfirm={handleConfirmWithdraw}
      />
    </>
  );
}
