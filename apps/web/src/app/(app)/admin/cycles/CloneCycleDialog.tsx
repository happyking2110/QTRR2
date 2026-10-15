'use client';

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Copy, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type ImportCycleReport = components['schemas']['ImportCycleReport'];
type CycleSummary = components['schemas']['CycleSummary'];

export interface CloneCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceYear?: number;
  availableCycles?: CycleSummary[];
  onSuccess?: () => void;
}

export function CloneCycleDialog({
  open,
  onOpenChange,
  sourceYear,
  availableCycles = [],
  onSuccess,
}: CloneCycleDialogProps) {
  const defaultSource = sourceYear ?? (availableCycles.length > 0 ? availableCycles[0].year : 2026);
  const [fromYear, setFromYear] = useState<number>(defaultSource);
  const [targetYear, setTargetYear] = useState<number>(defaultSource + 1);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<ImportCycleReport | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Sync state if defaultSource changes when dialog opens
  React.useEffect(() => {
    if (open) {
      const src = sourceYear ?? (availableCycles.length > 0 ? availableCycles[0].year : 2026);
      setFromYear(src);
      setTargetYear(src + 1);
      setReport(null);
      setGeneralError(null);
    }
  }, [open, sourceYear, availableCycles]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setReport(null);
      setGeneralError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromYear || !targetYear) return;

    if (fromYear === targetYear) {
      setGeneralError('Năm chu kỳ mới phải khác năm chu kỳ nguồn.');
      return;
    }

    setIsLoading(true);
    setGeneralError(null);
    setReport(null);

    try {
      const res = await apiSend<ImportCycleReport>('POST', `/api/cycles/${targetYear}/clone`, {
        fromYear: Number(fromYear),
      });

      setReport(res);
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409 || err.code === 'CONFLICT') {
          setGeneralError(`Chu kỳ năm ${targetYear} đã tồn tại trong hệ thống.`);
        } else {
          setGeneralError(err.message || 'Không thể nhân bản chu kỳ.');
        }
      } else {
        setGeneralError((err as Error)?.message || 'Không thể nhân bản chu kỳ.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface p-6 shadow-2xl transition-all animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
          <div className="flex items-start justify-between pb-3 border-b border-border shrink-0">
            <div>
              <Dialog.Title className="text-base font-bold text-text flex items-center gap-2">
                <Copy className="w-4 h-4 text-brand-blue" aria-hidden="true" />
                <span>Nhân bản chu kỳ</span>
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-text-muted">
                Tạo chu kỳ năm mới bằng cách sao chép hồ sơ, mục con, liên kết và gán đơn vị từ chu kỳ cũ.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-control p-1 text-text-muted hover:text-text transition-colors"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
            {report ? (
              <div className="space-y-4">
                <div className="rounded-control border border-state-ok-line/40 bg-state-ok-bg p-4 flex items-start gap-3 text-state-ok-fg">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="font-bold text-sm">Nhân bản thành công sang chu kỳ {report.year}!</h3>
                    <p className="text-xs mt-0.5 text-state-ok-fg/90">
                      Cấu trúc dữ liệu đã được sao chép và các kỳ báo cáo đã được khởi tạo.
                    </p>
                  </div>
                </div>

                {/* Báo cáo số đếm */}
                <div className="rounded-control border border-border bg-bg-tint/30 p-4 space-y-3">
                  <h4 className="font-bold text-text uppercase tracking-wider text-[11px]">
                    Kết quả nhân bản
                  </h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Số hồ sơ</span>
                      <strong className="text-text text-base font-bold">{report.counts.profiles}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Nguyên nhân</span>
                      <strong className="text-text text-base font-bold">{report.counts.causes}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Kiểm soát</span>
                      <strong className="text-text text-base font-bold">{report.counts.controls}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Kế hoạch</span>
                      <strong className="text-text text-base font-bold">{report.counts.actions}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Đầu việc đã tạo</span>
                      <strong className="text-text text-base font-bold">{report.counts.tasksCreated}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Chỉ số KRI</span>
                      <strong className="text-text text-base font-bold">{report.counts.kri}</strong>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <form id="clone-cycle-form" onSubmit={handleSubmit} className="space-y-4">
                {generalError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3 text-xs text-state-bad-fg"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">Lỗi nhân bản chu kỳ</p>
                      <p className="mt-0.5">{generalError}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="fromYear" className="block font-semibold text-text mb-1">
                    Chu kỳ nguồn <span className="text-state-bad-fg">*</span>
                  </label>
                  {availableCycles.length > 0 ? (
                    <select
                      id="fromYear"
                      value={fromYear}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setFromYear(val);
                        setTargetYear(val + 1);
                      }}
                      className="w-full rounded-control border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
                    >
                      {availableCycles.map((c) => (
                        <option key={c.year} value={c.year}>
                          Chu kỳ {c.year} ({c.status === 'open' ? 'Đang mở' : 'Đã lưu trữ'})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="fromYear"
                      type="number"
                      min={2000}
                      max={2100}
                      required
                      value={fromYear}
                      onChange={(e) => setFromYear(parseInt(e.target.value, 10) || 2026)}
                      className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
                    />
                  )}
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    Chọn chu kỳ chứa dữ liệu gốc cần sao chép.
                  </p>
                </div>

                <div>
                  <label htmlFor="targetYear" className="block font-semibold text-text mb-1">
                    Năm chu kỳ mới <span className="text-state-bad-fg">*</span>
                  </label>
                  <input
                    id="targetYear"
                    type="number"
                    min={2000}
                    max={2100}
                    required
                    value={targetYear}
                    onChange={(e) => setTargetYear(parseInt(e.target.value, 10) || 2027)}
                    className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
                  />
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    Năm của chu kỳ mới sẽ được tạo (ví dụ: {fromYear + 1}).
                  </p>
                </div>
              </form>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border shrink-0">
            {report ? (
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="rounded-control bg-brand-blue px-4 py-2 font-semibold text-white hover:bg-brand-navy transition-colors"
              >
                Đóng
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleOpenChange(false)}
                  className="rounded-control border border-border bg-surface px-4 py-2 font-medium text-text hover:bg-bg-tint transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  form="clone-cycle-form"
                  disabled={isLoading}
                  className="rounded-control bg-brand-blue px-4 py-2 font-semibold text-white hover:bg-brand-navy transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Đang nhân bản...' : 'Bắt đầu nhân bản'}
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
