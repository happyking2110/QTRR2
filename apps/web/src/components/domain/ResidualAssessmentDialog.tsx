'use client';

import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type ResidualEntry = components['schemas']['ResidualEntry'];
export type PeriodSummary = components['schemas']['PeriodSummary'];
export type Heatmap = components['schemas']['Heatmap'];
export type ScaleLevel = components['schemas']['ScaleLevel'];

export interface ResidualAssessmentDialogProps {
  riskCode: string;
  cycleYear: number;
  residualHistory: ResidualEntry[];
  open: boolean;
  onClose: () => void;
  onSuccess: (entry: ResidualEntry) => void;
}

const DEFAULT_LEVELS: ScaleLevel[] = [
  { score: 1, label: 'Rất thấp' },
  { score: 2, label: 'Thấp' },
  { score: 3, label: 'Trung bình' },
  { score: 4, label: 'Cao' },
  { score: 5, label: 'Rất cao' },
];

export function ResidualAssessmentDialog({
  riskCode,
  cycleYear,
  residualHistory,
  open,
  onClose,
  onSuccess,
}: ResidualAssessmentDialogProps) {
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [likelihoodLevels, setLikelihoodLevels] = useState<ScaleLevel[]>(DEFAULT_LEVELS);
  const [impactLevels, setImpactLevels] = useState<ScaleLevel[]>(DEFAULT_LEVELS);
  const [loadingData, setLoadingData] = useState(false);

  // Form state
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>('');
  const [likelihoodLabel, setLikelihoodLabel] = useState<string>('Trung bình');
  const [impactLabel, setImpactLabel] = useState<string>('Trung bình');
  const [levelLabel, setLevelLabel] = useState<string>('Trung bình');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Load quarter periods and heatmap scales on open
  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    setLoadingData(true);
    setError(null);

    Promise.all([
      apiSend<PeriodSummary[]>('GET', `/api/cycles/${cycleYear}/periods`).catch(() => []),
      apiSend<Heatmap>('GET', `/api/heatmap?cycle=${cycleYear}`).catch(() => null),
    ])
      .then(([periodList, heatmapData]) => {
        if (!isMounted) return;

        // Filter unclosed quarter periods
        const quarterPeriods = (periodList || []).filter(
          (p) => p.kind === 'quarter' && !p.closed,
        );
        setPeriods(quarterPeriods);

        if (quarterPeriods.length > 0) {
          setSelectedPeriodKey((prev) => prev || quarterPeriods[0].key);
        }

        if (heatmapData) {
          if (heatmapData.likelihoodLevels?.length) {
            setLikelihoodLevels(heatmapData.likelihoodLevels);
          }
          if (heatmapData.impactLevels?.length) {
            setImpactLevels(heatmapData.impactLevels);
          }
        }
      })
      .finally(() => {
        if (isMounted) setLoadingData(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, cycleYear]);

  if (!open) return null;

  // Check if selected period already has residual rating
  const existingResidual = residualHistory.find((r) => r.periodKey === selectedPeriodKey);
  const selectedPeriod = periods.find((p) => p.key === selectedPeriodKey);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const errs: Record<string, string> = {};
    if (!selectedPeriodKey) {
      errs.periodKey = 'Vui lòng chọn kỳ quý đánh giá';
    }
    if (!likelihoodLabel.trim()) {
      errs.likelihoodLabel = 'Vui lòng chọn mức khả năng';
    }
    if (!impactLabel.trim()) {
      errs.impactLabel = 'Vui lòng chọn mức tác động';
    }
    if (!levelLabel.trim()) {
      errs.levelLabel = 'Vui lòng nhập mức rủi ro còn lại';
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const cycleQuery = cycleYear ? `?cycle=${cycleYear}` : '';
      const res = await apiSend<ResidualEntry>(
        'PUT',
        `/api/profiles/${encodeURIComponent(riskCode)}/residual/${encodeURIComponent(selectedPeriodKey)}${cycleQuery}`,
        {
          impactLabel: impactLabel.trim(),
          likelihoodLabel: likelihoodLabel.trim(),
          levelLabel: levelLabel.trim(),
        },
      );

      onSuccess(res);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.fieldErrors) {
          setFieldErrors(err.fieldErrors);
        }
      } else {
        setError('Không thể lưu mức rủi ro còn lại');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="residual-dialog-title"
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
            <div>
              <h3 id="residual-dialog-title" className="text-base font-bold text-slate-900">
                Nhập mức rủi ro còn lại
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hồ sơ: <span className="font-mono font-medium">{riskCode}</span> • Chu kỳ {cycleYear}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="residual-dialog-close"
              aria-label="Đóng"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
            {error && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800"
              >
                {error}
              </div>
            )}

            {/* Notice for provisional scale */}
            <div className="rounded-lg bg-blue-50/70 border border-blue-200 p-3 text-xs text-blue-800">
              <span className="font-semibold">Lưu ý:</span> Mức rủi ro do Ban 4 tự đánh giá, không
              tự tính toán. Thang 5 mức tạm thời.
            </div>

            {/* Period select */}
            <div>
              <label
                htmlFor="residual-period"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Kỳ quý đánh giá <span className="text-rose-500">*</span>
              </label>
              {loadingData ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Đang tải danh sách kỳ quý...</span>
                </div>
              ) : periods.length === 0 ? (
                <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
                  Không có kỳ quý nào đang mở trong chu kỳ {cycleYear}.
                </div>
              ) : (
                <select
                  id="residual-period"
                  value={selectedPeriodKey}
                  onChange={(e) => setSelectedPeriodKey(e.target.value)}
                  aria-describedby={fieldErrors.periodKey ? 'err-period' : undefined}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
                >
                  {periods.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label} ({p.key})
                    </option>
                  ))}
                </select>
              )}
              {fieldErrors.periodKey && (
                <p id="err-period" role="alert" className="text-xs text-rose-600 mt-1">
                  {fieldErrors.periodKey}
                </p>
              )}
            </div>

            {/* Overwrite Warning */}
            {existingResidual && selectedPeriod && (
              <div
                role="alert"
                className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex items-start gap-2"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-semibold">Cảnh báo ghi đè:</span> Kỳ{' '}
                  <span className="font-medium">{selectedPeriod.label}</span> đã có mức đánh giá:
                  <div className="mt-1 font-mono text-[11px] bg-amber-100/70 px-2 py-1 rounded inline-block">
                    Khả năng: {existingResidual.rating.likelihoodScore} × Tác động:{' '}
                    {existingResidual.rating.impactScore} ({existingResidual.rating.levelLabel})
                  </div>
                  <div className="mt-1 text-[11px]">
                    Lưu bản ghi mới sẽ ghi đè đánh giá này.
                  </div>
                </div>
              </div>
            )}

            {/* Khả năng & Ảnh hưởng */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="residual-likelihood"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Khả năng xảy ra <span className="text-rose-500">*</span>
                </label>
                <select
                  id="residual-likelihood"
                  value={likelihoodLabel}
                  onChange={(e) => setLikelihoodLabel(e.target.value)}
                  aria-describedby={fieldErrors.likelihoodLabel ? 'err-likelihood' : undefined}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
                >
                  {likelihoodLevels.map((lvl) => (
                    <option key={lvl.label} value={lvl.label}>
                      {lvl.score} - {lvl.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.likelihoodLabel && (
                  <p id="err-likelihood" role="alert" className="text-xs text-rose-600 mt-1">
                    {fieldErrors.likelihoodLabel}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="residual-impact"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Mức độ ảnh hưởng <span className="text-rose-500">*</span>
                </label>
                <select
                  id="residual-impact"
                  value={impactLabel}
                  onChange={(e) => setImpactLabel(e.target.value)}
                  aria-describedby={fieldErrors.impactLabel ? 'err-impact' : undefined}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
                >
                  {impactLevels.map((lvl) => (
                    <option key={lvl.label} value={lvl.label}>
                      {lvl.score} - {lvl.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.impactLabel && (
                  <p id="err-impact" role="alert" className="text-xs text-rose-600 mt-1">
                    {fieldErrors.impactLabel}
                  </p>
                )}
              </div>
            </div>

            {/* Mức rủi ro (Ban 4 tự đánh giá) */}
            <div>
              <label
                htmlFor="residual-level"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Mức rủi ro đánh giá <span className="text-rose-500">*</span>
              </label>
              <input
                id="residual-level"
                type="text"
                list="residual-level-suggestions"
                placeholder="vd: Cao, Trung bình, Thấp..."
                value={levelLabel}
                onChange={(e) => setLevelLabel(e.target.value)}
                aria-describedby={fieldErrors.levelLabel ? 'err-level' : 'desc-level'}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <datalist id="residual-level-suggestions">
                <option value="Rất cao" />
                <option value="Cao" />
                <option value="Trung bình" />
                <option value="Thấp" />
                <option value="Rất thấp" />
              </datalist>
              <p id="desc-level" className="text-[11px] text-slate-500 mt-1">
                Nhập mức đánh giá tổng thể (ví dụ: &quot;Cao&quot;, &quot;Trung bình&quot;, v.v.)
              </p>
              {fieldErrors.levelLabel && (
                <p id="err-level" role="alert" className="text-xs text-rose-600 mt-1">
                  {fieldErrors.levelLabel}
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting || periods.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <span>Lưu đánh giá</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
