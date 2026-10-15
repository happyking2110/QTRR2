'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ZoneBadge } from '@/components/domain/ZoneBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';

type Zone = components['schemas']['Zone'];

export interface ReadingFormIndicator {
  id: string;
  code: string;
  name: string;
  kind: 'kri' | 'kci';
  mode: 'auto' | 'manual';
  formula?: string;
  frequency?: string;
  thresholds: {
    green: string;
    yellow: string;
    red: string;
  };
  unitKind?: 'percent' | 'count';
  unitLabel?: string | null;
  submitPeriodKeys: string[];
  pendingSubmissions?: Array<{
    id: string;
    periodKey: string;
    submittedAt: string;
    submittedByName: string | null;
    canWithdraw: boolean;
  }>;
}

export interface ReadingFormProps {
  indicator: ReadingFormIndicator;
  periods?: Array<{ key: string; label: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialPeriodKey?: string;
  initialValueNum?: number | null;
  initialValueText?: string | null;
  initialZone?: Zone | null;
  initialZoneNote?: string | null;
  initialNote?: string | null;
}

export function ReadingForm({
  indicator,
  periods = [],
  open,
  onOpenChange,
  onSuccess,
  initialPeriodKey,
  initialValueNum,
  initialValueText,
  initialZone,
  initialZoneNote,
  initialNote,
}: ReadingFormProps) {
  const router = useRouter();

  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>(
    initialPeriodKey || indicator.submitPeriodKeys[0] || '',
  );
  const [valueNum, setValueNum] = useState<string>(
    initialValueNum !== undefined && initialValueNum !== null ? String(initialValueNum) : '',
  );
  const [valueText, setValueText] = useState<string>(initialValueText || '');
  const [selectedZone, setSelectedZone] = useState<Zone | null>(initialZone || null);
  const [zoneNote, setZoneNote] = useState<string>(initialZoneNote || '');
  const [note, setNote] = useState<string>(initialNote || '');

  // Preview state (auto mode)
  const [previewZone, setPreviewZone] = useState<Zone | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Withdraw state
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [confirmWithdrawOpen, setConfirmWithdrawOpen] = useState(false);
  const [pendingToWithdrawId, setPendingToWithdrawId] = useState<string | null>(null);

  // Reset form when opened with initial values
  useEffect(() => {
    if (open) {
      setSelectedPeriodKey(initialPeriodKey || indicator.submitPeriodKeys[0] || '');
      setValueNum(initialValueNum !== undefined && initialValueNum !== null ? String(initialValueNum) : '');
      setValueText(initialValueText || '');
      setSelectedZone(initialZone || null);
      setZoneNote(initialZoneNote || '');
      setNote(initialNote || '');
      setGeneralError(null);
      setFieldErrors({});
      setSuccessMessage(null);
      setPreviewZone(null);
      setPreviewError(null);
    }
  }, [open, indicator, initialPeriodKey, initialValueNum, initialValueText, initialZone, initialZoneNote, initialNote]);

  // Escape key handler
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

  // Debounce zone preview for auto mode (300ms)
  useEffect(() => {
    if (indicator.mode !== 'auto' || !valueNum.trim()) {
      setPreviewZone(null);
      setPreviewError(null);
      setIsPreviewLoading(false);
      return;
    }

    const num = Number(valueNum);
    if (indicator.unitKind === 'count') {
      if (isNaN(num) || !Number.isInteger(num) || num < 0) {
        setPreviewZone(null);
        setPreviewError('Giá trị phải là số nguyên không âm');
        setIsPreviewLoading(false);
        return;
      }
    } else {
      if (isNaN(num) || num < 0 || num > 100) {
        setPreviewZone(null);
        setPreviewError('Giá trị phải từ 0 đến 100%');
        setIsPreviewLoading(false);
        return;
      }
    }

    setPreviewError(null);
    setIsPreviewLoading(true);

    const timer = setTimeout(async () => {
      try {
        const preview = await apiSend<{ mode: string; zone: Zone | null }>(
          'GET',
          `/api/indicators/${indicator.id}/zone-preview?value=${encodeURIComponent(num)}`,
        );
        setPreviewZone(preview.zone);
      } catch (err: unknown) {
        if (err instanceof ApiClientError) {
          setPreviewError(err.message);
        } else {
          setPreviewError('Không thể xem trước vùng');
        }
      } finally {
        setIsPreviewLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [valueNum, indicator.id, indicator.mode, indicator.unitKind]);

  // Check if there is an existing pending submission for the selected period
  const existingPending = indicator.pendingSubmissions?.find(
    (p) => p.periodKey === selectedPeriodKey,
  );

  const handleWithdrawOld = async () => {
    if (!existingPending) return;
    setPendingToWithdrawId(existingPending.id);
    setConfirmWithdrawOpen(true);
  };

  const handleConfirmWithdraw = async () => {
    if (!pendingToWithdrawId) return;
    setIsWithdrawing(true);
    try {
      await apiSend('POST', `/api/readings/${pendingToWithdrawId}/withdraw`);
      setConfirmWithdrawOpen(false);
      setPendingToWithdrawId(null);
      router.refresh();
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Không thể rút lại bản nộp');
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};

    if (!selectedPeriodKey) {
      errors.periodKey = 'Vui lòng chọn kỳ báo cáo';
    }

    if (indicator.mode === 'auto') {
      if (!valueNum.trim()) {
        errors.valueNum = 'Trường dữ liệu này là bắt buộc';
      } else {
        const num = Number(valueNum);
        if (isNaN(num)) {
          errors.valueNum = 'Kiểu dữ liệu không đúng';
        } else if (indicator.unitKind === 'count') {
          if (!Number.isInteger(num) || num < 0) {
            errors.valueNum = 'Giá trị phải là số nguyên không âm';
          }
        } else if (num < 0 || num > 100) {
          errors.valueNum = 'Giá trị phải từ 0 đến 100%';
        }
      }
    } else {
      if (!selectedZone) {
        errors.zone = 'Vui lòng chọn vùng đánh giá (Xanh, Vàng hoặc Đỏ)';
      }
      if (!zoneNote.trim()) {
        errors.zoneNote = 'Trường dữ liệu này là bắt buộc';
      } else if (zoneNote.trim().length < 10) {
        errors.zoneNote = 'Lý do chọn vùng bắt buộc tối thiểu 10 ký tự';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        periodKey: selectedPeriodKey,
        valueNum: indicator.mode === 'auto' ? Number(valueNum) : null,
        valueText: indicator.mode === 'manual' ? (valueText.trim() || null) : null,
        zone: indicator.mode === 'manual' ? selectedZone : undefined,
        zoneNote: indicator.mode === 'manual' ? zoneNote.trim() : undefined,
        note: note.trim() || null,
      };

      await apiSend('POST', `/api/indicators/${indicator.id}/readings`, payload);

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
        setGeneralError('Đã xảy ra lỗi khi gửi số liệu. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPeriodLabel = (key: string) => {
    const p = periods.find((item) => item.key === key);
    return p ? p.label : key;
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reading-form-title"
      >
        <div className="w-full max-w-xl rounded-card bg-surface p-6 shadow-2xl border border-border space-y-5 my-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-bg-tint text-brand-blue border border-border">
                  {indicator.code}
                </span>
                <span className="text-xs uppercase font-bold text-text-muted">
                  {indicator.kind.toUpperCase()} ·{' '}
                  {indicator.mode === 'auto' ? 'Tự động tính' : 'Thủ công'}
                </span>
              </div>
              <h2
                id="reading-form-title"
                className="text-lg font-bold text-text mt-1.5 leading-snug"
              >
                Nhập số liệu chỉ số: {indicator.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 rounded text-text-muted hover:text-text hover:bg-bg-tint transition"
              aria-label="Đóng form nhập số liệu"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Thông tin ngưỡng & công thức */}
            <div className="bg-bg-tint/60 rounded-control p-3 text-xs space-y-2 border border-border/70">
              {indicator.formula && (
                <div>
                  <span className="font-semibold text-text">Công thức đo lường:</span>{' '}
                  <span className="text-text-muted">{indicator.formula}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <div className="p-2 rounded bg-state-ok-bg/70 border border-state-ok-line/30 text-state-ok-fg">
                  <span className="font-bold block">Xanh:</span>
                  <span className="text-[11px]">{indicator.thresholds.green}</span>
                </div>
                <div className="p-2 rounded bg-state-warn-bg/70 border border-state-warn-line/30 text-state-warn-fg">
                  <span className="font-bold block">Vàng:</span>
                  <span className="text-[11px]">{indicator.thresholds.yellow}</span>
                </div>
                <div className="p-2 rounded bg-state-bad-bg/70 border border-state-bad-line/30 text-state-bad-fg">
                  <span className="font-bold block">Đỏ:</span>
                  <span className="text-[11px]">{indicator.thresholds.red}</span>
                </div>
              </div>
            </div>

            {/* Thông báo thành công */}
            {successMessage && (
              <div
                role="status"
                className="p-3 rounded-control bg-state-ok-bg text-state-ok-fg border border-state-ok-line/30 flex items-center gap-2 text-sm font-medium animate-in fade-in"
              >
                <CheckCircle2 className="w-4 h-4 text-state-ok-line shrink-0" aria-hidden="true" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Dải thông báo lỗi chung */}
            {generalError && (
              <div
                role="alert"
                className="p-3 rounded-control bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30 flex items-start gap-2 text-sm leading-relaxed animate-in fade-in"
              >
                <AlertCircle className="w-4 h-4 text-state-bad-line shrink-0 mt-0.5" aria-hidden="true" />
                <span>{generalError}</span>
              </div>
            )}

            {/* Cảnh báo bản chờ duyệt hiện tại */}
            {existingPending && (
              <div
                role="alert"
                className="p-3 rounded-control bg-state-warn-bg text-state-warn-fg border border-state-warn-line/40 flex items-start justify-between gap-3 text-xs leading-relaxed"
              >
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-state-warn-line shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <span className="font-semibold block">Đang có một bản chờ duyệt cho kỳ này</span>
                    <span>Nộp bản mới sẽ không thay thế bản đó cho tới khi được duyệt.</span>
                  </div>
                </div>
                {existingPending.canWithdraw && (
                  <button
                    type="button"
                    onClick={handleWithdrawOld}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-state-warn-line bg-surface text-state-warn-fg hover:bg-state-warn-bg text-xs font-semibold shrink-0 transition"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    <span>Rút bản cũ</span>
                  </button>
                )}
              </div>
            )}

            {/* 1. Chọn kỳ báo cáo */}
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
                  fieldErrors.periodKey ? 'border-brand-red ring-1 ring-brand-red' : 'border-border',
                )}
                aria-describedby={fieldErrors.periodKey ? 'periodKey-error' : undefined}
              >
                {indicator.submitPeriodKeys.map((key) => (
                  <option key={key} value={key}>
                    {getPeriodLabel(key)} ({key})
                  </option>
                ))}
              </select>
              {fieldErrors.periodKey && (
                <p id="periodKey-error" className="text-xs text-brand-red mt-1 font-medium">
                  {fieldErrors.periodKey}
                </p>
              )}
            </div>

            {/* 2. CHẾ ĐỘ TỰ ĐỘNG (auto): Ô nhập số + Xem trước vùng */}
            {indicator.mode === 'auto' ? (
              <div className="space-y-2">
                <label htmlFor="valueNum" className="block text-xs font-semibold text-text mb-1">
                  Giá trị đo lường ({indicator.unitLabel || (indicator.unitKind === 'count' ? 'vụ việc' : '%')}){' '}
                  <span className="text-brand-red">*</span>
                </label>
                <div className="relative">
                  <input
                    id="valueNum"
                    type="number"
                    step={indicator.unitKind === 'count' ? '1' : 'any'}
                    min="0"
                    max={indicator.unitKind === 'count' ? undefined : '100'}
                    placeholder={
                      indicator.unitKind === 'count'
                        ? 'Nhập số nguyên (ví dụ: 1)'
                        : 'Nhập giá trị (ví dụ: 7.5)'
                    }
                    value={valueNum}
                    onChange={(e) => setValueNum(e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 pr-12 rounded-control border bg-surface text-sm text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-bright transition',
                      fieldErrors.valueNum ? 'border-brand-red ring-1 ring-brand-red' : 'border-border',
                    )}
                    aria-describedby={
                      fieldErrors.valueNum
                        ? 'valueNum-error'
                        : previewZone
                        ? 'zone-preview-desc'
                        : undefined
                    }
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-text-muted">
                    {indicator.unitLabel || (indicator.unitKind === 'count' ? 'vụ việc' : '%')}
                  </span>
                </div>
                {fieldErrors.valueNum && (
                  <p id="valueNum-error" className="text-xs text-brand-red mt-1 font-medium">
                    {fieldErrors.valueNum}
                  </p>
                )}

                {/* Vùng xem trước kết quả từ API */}
                <div
                  id="zone-preview-desc"
                  className="rounded-control border border-border/80 bg-bg-tint/40 p-2.5 flex items-center justify-between text-xs"
                >
                  <span className="text-text-muted font-medium">Xem trước vùng đánh giá:</span>
                  <div className="flex items-center gap-2">
                    {isPreviewLoading && (
                      <span className="inline-flex items-center gap-1 text-text-muted">
                        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                        <span>Đang tính...</span>
                      </span>
                    )}
                    {previewError && (
                      <span className="text-brand-red font-medium">{previewError}</span>
                    )}
                    {!isPreviewLoading && !previewError && previewZone && (
                      <div className="flex items-center gap-1.5 animate-in fade-in">
                        <ZoneBadge kind={indicator.kind} zone={previewZone} />
                        <span className="text-[11px] text-text-muted">(tính từ máy chủ)</span>
                      </div>
                    )}
                    {!isPreviewLoading && !previewError && !previewZone && (
                      <span className="text-text-muted italic">Nhập số để xem trước vùng</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* 3. CHẾ ĐỘ THỦ CÔNG (manual): Chọn nút vùng + Mô tả giá trị + Lý do chọn vùng */
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1.5">
                    Chọn vùng đánh giá <span className="text-brand-red">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedZone('green')}
                      className={cn(
                        'p-2.5 rounded-control text-left border transition focus:outline-none focus:ring-2 focus:ring-brand-bright',
                        selectedZone === 'green'
                          ? 'border-state-ok-line bg-state-ok-bg ring-2 ring-state-ok-line'
                          : 'border-border bg-surface hover:bg-bg-tint',
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-state-ok-line" aria-hidden="true" />
                        <span className="font-bold text-xs text-state-ok-fg">Vùng Xanh</span>
                      </div>
                      <span className="text-[11px] text-text-muted block line-clamp-2">
                        {indicator.thresholds.green}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedZone('yellow')}
                      className={cn(
                        'p-2.5 rounded-control text-left border transition focus:outline-none focus:ring-2 focus:ring-brand-bright',
                        selectedZone === 'yellow'
                          ? 'border-state-warn-line bg-state-warn-bg ring-2 ring-state-warn-line'
                          : 'border-border bg-surface hover:bg-bg-tint',
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-state-warn-line" aria-hidden="true" />
                        <span className="font-bold text-xs text-state-warn-fg">Vùng Vàng</span>
                      </div>
                      <span className="text-[11px] text-text-muted block line-clamp-2">
                        {indicator.thresholds.yellow}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedZone('red')}
                      className={cn(
                        'p-2.5 rounded-control text-left border transition focus:outline-none focus:ring-2 focus:ring-brand-bright',
                        selectedZone === 'red'
                          ? 'border-state-bad-line bg-state-bad-bg ring-2 ring-state-bad-line'
                          : 'border-border bg-surface hover:bg-bg-tint',
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-state-bad-line" aria-hidden="true" />
                        <span className="font-bold text-xs text-state-bad-fg">Vùng Đỏ</span>
                      </div>
                      <span className="text-[11px] text-text-muted block line-clamp-2">
                        {indicator.thresholds.red}
                      </span>
                    </button>
                  </div>
                  {fieldErrors.zone && (
                    <p className="text-xs text-brand-red mt-1 font-medium">{fieldErrors.zone}</p>
                  )}
                </div>

                {/* Mô tả giá trị */}
                <div>
                  <label htmlFor="valueText" className="block text-xs font-semibold text-text mb-1">
                    Mô tả giá trị (tùy chọn)
                  </label>
                  <input
                    id="valueText"
                    type="text"
                    placeholder="Ví dụ: Phát sinh 01 vụ việc trong kỳ"
                    value={valueText}
                    onChange={(e) => setValueText(e.target.value)}
                    className="w-full px-3 py-2 rounded-control border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand-bright transition"
                  />
                </div>

                {/* Lý do chọn vùng */}
                <div>
                  <label htmlFor="zoneNote" className="block text-xs font-semibold text-text mb-1">
                    Lý do chọn vùng <span className="text-brand-red">*</span>
                  </label>
                  <textarea
                    id="zoneNote"
                    rows={2}
                    placeholder="Giải trình căn cứ chọn mức đánh giá (tối thiểu 10 ký tự)"
                    value={zoneNote}
                    onChange={(e) => setZoneNote(e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 rounded-control border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand-bright transition',
                      fieldErrors.zoneNote ? 'border-brand-red ring-1 ring-brand-red' : 'border-border',
                    )}
                    aria-describedby={fieldErrors.zoneNote ? 'zoneNote-error' : undefined}
                  />
                  {fieldErrors.zoneNote && (
                    <p id="zoneNote-error" className="text-xs text-brand-red mt-1 font-medium">
                      {fieldErrors.zoneNote}
                    </p>
                  )}
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Tối thiểu 10 ký tự ({zoneNote.trim().length}/10)
                  </p>
                </div>
              </div>
            )}

            {/* 4. Ghi chú chung tùy chọn */}
            <div>
              <label htmlFor="note" className="block text-xs font-semibold text-text mb-1">
                Ghi chú thêm (tùy chọn)
              </label>
              <textarea
                id="note"
                rows={2}
                placeholder="Ghi chú thêm về bối cảnh hoặc số liệu nếu có"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 rounded-control border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand-bright transition"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 rounded-control text-sm font-medium border border-border bg-surface text-text hover:bg-bg-tint transition disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
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

      {/* Confirmation Dialog to withdraw previous pending submission */}
      <ConfirmDialog
        open={confirmWithdrawOpen}
        onOpenChange={setConfirmWithdrawOpen}
        title="Xác nhận rút lại bản nộp"
        description="Bạn có chắc chắn muốn rút lại bản nộp đang chờ duyệt của kỳ này không? Bản nộp sẽ chuyển sang trạng thái đã rút."
        confirmText="Rút lại"
        variant="danger"
        isSubmitting={isWithdrawing}
        onConfirm={handleConfirmWithdraw}
      />
    </>
  );
}
