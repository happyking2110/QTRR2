'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ZoneBadge } from '@/components/domain/ZoneBadge';
import { ApprovalBadge } from '@/components/domain/ApprovalBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDateTime } from '@/lib/format';

type ReadingSubmission = components['schemas']['ReadingSubmission'];

export interface ReadingsHistoryDrawerProps {
  indicator: {
    id: string;
    code: string;
    name: string;
    kind: 'kri' | 'kci';
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

export function ReadingsHistoryDrawer({
  indicator,
  open,
  onOpenChange,
  onSuccess,
}: ReadingsHistoryDrawerProps) {
  const router = useRouter();
  const [readings, setReadings] = useState<ReadingSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Withdraw state
  const [withdrawTargetId, setWithdrawTargetId] = useState<string | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fetchReadings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiSend<ReadingSubmission[]>(
        'GET',
        `/api/indicators/${indicator.id}/readings`,
      );
      setReadings(data || []);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Không thể tải lịch sử số liệu');
      }
    } finally {
      setIsLoading(false);
    }
  }, [indicator.id]);

  useEffect(() => {
    if (open) {
      fetchReadings();
    }
  }, [open, fetchReadings]);

  // Escape key handler
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

  const handleWithdrawClick = (id: string) => {
    setWithdrawTargetId(id);
    setConfirmOpen(true);
  };

  const handleConfirmWithdraw = async () => {
    if (!withdrawTargetId) return;
    setIsWithdrawing(true);
    try {
      await apiSend('POST', `/api/readings/${withdrawTargetId}/withdraw`);
      setConfirmOpen(false);
      setWithdrawTargetId(null);
      await fetchReadings();
      router.refresh();
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Không thể rút lại bản nộp');
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Helper check if an item can be withdrawn
  const canWithdrawItem = (item: ReadingSubmission) => {
    if (item.status !== 'pending') return false;
    const pendingRef = indicator.pendingSubmissions?.find((p) => p.id === item.id);
    return pendingRef ? pendingRef.canWithdraw : false;
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm animate-in fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="readings-drawer-title"
      >
        <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
          <div className="w-screen max-w-xl bg-surface shadow-2xl border-l border-border flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-bg-tint text-brand-blue border border-border">
                    {indicator.code}
                  </span>
                  <span className="text-xs uppercase font-bold text-text-muted">
                    LỊCH SỬ NỘP SỐ LIỆU
                  </span>
                </div>
                <h2
                  id="readings-drawer-title"
                  className="text-base font-bold text-text mt-1.5 leading-snug"
                >
                  {indicator.name}
                </h2>
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
                  <span className="text-xs">Đang tải lịch sử số liệu...</span>
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

              {!isLoading && !error && readings.length === 0 && (
                <div className="py-12 text-center text-text-muted text-sm">
                  Chưa có lịch sử nộp số liệu nào cho chỉ số này.
                </div>
              )}

              {!isLoading && readings.length > 0 && (
                <div className="space-y-3">
                  {readings.map((r) => {
                    const canWithdraw = canWithdrawItem(r);
                    return (
                      <div
                        key={r.id}
                        className="p-4 rounded-card border border-border bg-surface hover:border-border/80 transition space-y-3 shadow-xs"
                      >
                        {/* Top row: Period & Status */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-brand-navy">
                              {r.periodKey}
                            </span>
                            <ZoneBadge kind={indicator.kind} zone={r.zone} />
                          </div>
                          <ApprovalBadge status={r.status} />
                        </div>

                        {/* Value details */}
                        <div className="text-sm">
                          <span className="text-text-muted">Giá trị: </span>
                          <span className="font-semibold text-text tabular-nums">
                            {r.valueNum !== null && r.valueNum !== undefined
                              ? `${r.valueNum}%`
                              : r.valueText || '—'}
                          </span>
                        </div>

                        {/* Notes */}
                        {r.zoneNote && (
                          <div className="text-xs text-text-muted bg-bg-tint/60 p-2.5 rounded-control border border-border/60">
                            <span className="font-semibold text-text">Lý do chọn vùng: </span>
                            <span>{r.zoneNote}</span>
                          </div>
                        )}

                        {r.note && (
                          <div className="text-xs text-text-muted">
                            <span className="font-semibold text-text">Ghi chú: </span>
                            <span>{r.note}</span>
                          </div>
                        )}

                        {/* Rejection note */}
                        {r.status === 'rejected' && r.reviewNote && (
                          <div className="text-xs bg-state-bad-bg/60 text-state-bad-fg p-2.5 rounded-control border border-state-bad-line/30">
                            <span className="font-semibold">Lý do từ chối: </span>
                            <span>{r.reviewNote}</span>
                          </div>
                        )}

                        {/* Submitter & Reviewer Meta */}
                        <div className="pt-2 border-t border-border/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
                          <div>
                            <span>Nộp bởi: </span>
                            <span className="font-medium text-text">
                              {r.submittedBy?.fullName || 'Hệ thống'}
                            </span>
                            {r.submittedBy?.unitName && (
                              <span> ({r.submittedBy.unitName})</span>
                            )}
                            <span> lúc {formatDateTime(r.submittedAt)}</span>
                          </div>

                          {canWithdraw && (
                            <button
                              type="button"
                              onClick={() => handleWithdrawClick(r.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border text-text hover:bg-bg-tint font-semibold text-xs transition"
                            >
                              <RotateCcw className="w-3 h-3 text-text-muted" aria-hidden="true" />
                              <span>Rút lại</span>
                            </button>
                          )}
                        </div>

                        {/* Review info */}
                        {r.reviewedBy && (
                          <div className="text-[11px] text-text-muted">
                            <span>Duyệt bởi: </span>
                            <span className="font-medium text-text">{r.reviewedBy.fullName}</span>
                            {r.reviewedAt && (
                              <span> lúc {formatDateTime(r.reviewedAt)}</span>
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
        description="Bạn có chắc chắn muốn rút lại bản nộp này không? Trạng thái sẽ chuyển thành Đã rút."
        confirmText="Rút lại"
        variant="danger"
        isSubmitting={isWithdrawing}
        onConfirm={handleConfirmWithdraw}
      />
    </>
  );
}
