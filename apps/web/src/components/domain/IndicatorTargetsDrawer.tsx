'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RecordDrawer } from '@/components/data/RecordDrawer';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { AlertTriangle, Info } from 'lucide-react';

type Indicator = components['schemas']['Indicator'];
type IndicatorTargetsInput = components['schemas']['IndicatorTargetsInput'];

export interface IndicatorTargetsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskCode: string;
  indicator: Indicator | null;
  cycle?: number;
  onSuccess?: () => void;
}

export function IndicatorTargetsDrawer({
  open,
  onOpenChange,
  riskCode,
  indicator,
  cycle,
  onSuccess,
}: IndicatorTargetsDrawerProps) {
  const router = useRouter();

  const [unitKind, setUnitKind] = useState<'percent' | 'count'>('percent');
  const [unitLabel, setUnitLabel] = useState<string>('%');
  const [direction, setDirection] = useState<'higher_is_worse' | 'lower_is_worse' | null>('higher_is_worse');
  const [yellowAt, setYellowAt] = useState<string>('');
  const [redAt, setRedAt] = useState<string>('');
  const [targetValue, setTargetValue] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    if (indicator) {
      setUnitKind(indicator.unitKind || 'percent');
      setUnitLabel(indicator.unitLabel || (indicator.unitKind === 'count' ? 'vụ việc' : '%'));
      setDirection(indicator.direction ?? 'higher_is_worse');
      setYellowAt(indicator.yellowAt !== null && indicator.yellowAt !== undefined ? String(indicator.yellowAt) : '');
      setRedAt(indicator.redAt !== null && indicator.redAt !== undefined ? String(indicator.redAt) : '');
      setTargetValue(indicator.targetValue !== null && indicator.targetValue !== undefined ? String(indicator.targetValue) : '');
      setFieldErrors({});
      setGeneralError(null);
    }
  }, [indicator]);

  if (!indicator) return null;

  const isKci = indicator.kind === 'kci';

  const handleUnitKindChange = (kind: 'percent' | 'count') => {
    setUnitKind(kind);
    if (kind === 'percent' && (!unitLabel || unitLabel === 'vụ việc' || unitLabel === 'sự cố')) {
      setUnitLabel('%');
    } else if (kind === 'count' && (!unitLabel || unitLabel === '%')) {
      setUnitLabel('vụ việc');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFieldErrors({});
    setGeneralError(null);

    // Chuẩn bị payload khớp IndicatorTargetsInput schema (không thừa trường)
    const yVal = yellowAt.trim() !== '' ? Number(yellowAt) : null;
    const rVal = redAt.trim() !== '' ? Number(redAt) : null;
    const tVal = isKci && targetValue.trim() !== '' ? Number(targetValue) : null;

    const payload: IndicatorTargetsInput = {
      unitKind,
      unitLabel: unitLabel.trim(),
      direction: yVal !== null || rVal !== null ? direction : null,
      yellowAt: yVal,
      redAt: rVal,
      targetValue: tVal,
    };

    try {
      const url = `/api/profiles/${encodeURIComponent(riskCode)}/indicators/${encodeURIComponent(indicator.code)}/targets${
        cycle ? `?cycle=${cycle}` : ''
      }`;

      await apiSend('PUT', url, payload);

      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
          setFieldErrors(err.fieldErrors);
        }
        setGeneralError(err.message);
      } else {
        setGeneralError('Không thể lưu thiết lập do xảy ra lỗi máy chủ.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <RecordDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Thiết lập ngưỡng và mục tiêu"
      description={`Cấu hình ngưỡng số, đơn vị và mục tiêu cho chỉ số ${indicator.code} – ${indicator.name}`}
    >
      <form onSubmit={handleSubmit} className="space-y-5 p-1" data-testid="indicator-targets-form">
        {/* Banner cảnh báo bài học nghiệp vụ 4C */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5 text-xs text-amber-800">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="leading-relaxed">
            <strong>Lưu ý:</strong> Số liệu đã duyệt trước đây giữ nguyên vùng cũ. Ngưỡng số và mục tiêu mới chỉ áp dụng cho các bản nộp tiếp theo.
          </div>
        </div>

        {generalError && (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2.5 text-xs text-red-800"
            role="alert"
          >
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Lỗi thiết lập</p>
              <p className="mt-0.5 leading-relaxed">{generalError}</p>
            </div>
          </div>
        )}

        {/* 1. Loại đơn vị (unitKind) */}
        <div>
          <label className="block text-xs font-semibold text-text mb-1.5">
            Loại đơn vị <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleUnitKindChange('percent')}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                unitKind === 'percent'
                  ? 'border-brand-blue bg-brand-blue/10 text-brand-blue font-semibold'
                  : 'border-border bg-surface text-text hover:bg-bg-tint'
              }`}
            >
              <span>Phần trăm (%)</span>
            </button>
            <button
              type="button"
              onClick={() => handleUnitKindChange('count')}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                unitKind === 'count'
                  ? 'border-brand-blue bg-brand-blue/10 text-brand-blue font-semibold'
                  : 'border-border bg-surface text-text hover:bg-bg-tint'
              }`}
            >
              <span>Số đếm</span>
            </button>
          </div>
          {fieldErrors.unitKind && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.unitKind}</p>
          )}
        </div>

        {/* 2. Nhãn đơn vị (unitLabel) */}
        <div>
          <label htmlFor="unitLabel" className="block text-xs font-semibold text-text mb-1">
            Nhãn hiển thị đơn vị <span className="text-red-500">*</span>
          </label>
          <input
            id="unitLabel"
            type="text"
            value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)}
            required
            placeholder={unitKind === 'percent' ? '%' : 'vụ việc, sự cố...'}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
          <p className="mt-1 text-[11px] text-text-muted">
            Ví dụ: &quot;%&quot; cho tỷ lệ, &quot;vụ việc&quot; hoặc &quot;sự cố&quot; cho số đếm.
          </p>
          {fieldErrors.unitLabel && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.unitLabel}</p>
          )}
        </div>

        {/* 3. Chiều hướng (direction) */}
        <div>
          <label className="block text-xs font-semibold text-text mb-1.5">
            Chiều hướng chỉ số
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDirection('higher_is_worse')}
              className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition ${
                direction === 'higher_is_worse'
                  ? 'border-brand-blue bg-brand-blue/10 text-brand-blue font-semibold'
                  : 'border-border bg-surface text-text hover:bg-bg-tint'
              }`}
            >
              <span className="text-xs">Càng cao càng xấu (≥)</span>
              <span className="text-[10px] text-text-muted mt-0.5">Vàng &lt; Đỏ (sự cố, vi phạm)</span>
            </button>
            <button
              type="button"
              onClick={() => setDirection('lower_is_worse')}
              className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition ${
                direction === 'lower_is_worse'
                  ? 'border-brand-blue bg-brand-blue/10 text-brand-blue font-semibold'
                  : 'border-border bg-surface text-text hover:bg-bg-tint'
              }`}
            >
              <span className="text-xs">Càng thấp càng xấu (≤)</span>
              <span className="text-[10px] text-text-muted mt-0.5">Vàng &gt; Đỏ (sẵn sàng, đạt chuẩn)</span>
            </button>
          </div>
          {fieldErrors.direction && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.direction}</p>
          )}
        </div>

        {/* 4 & 5. Ngưỡng số: Vàng & Đỏ */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="yellowAt" className="block text-xs font-semibold text-text mb-1">
              Ngưỡng cảnh báo vàng ({direction === 'higher_is_worse' ? '≥' : '≤'})
            </label>
            <div className="relative">
              <input
                id="yellowAt"
                type="number"
                step={unitKind === 'percent' ? '0.01' : '1'}
                value={yellowAt}
                onChange={(e) => setYellowAt(e.target.value)}
                placeholder="VD: 1 hoặc 95"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text pr-10 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
              <span className="absolute right-3 top-2.5 text-xs text-text-muted">{unitLabel}</span>
            </div>
            {fieldErrors.yellowAt && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.yellowAt}</p>
            )}
          </div>

          <div>
            <label htmlFor="redAt" className="block text-xs font-semibold text-text mb-1">
              Ngưỡng báo động đỏ ({direction === 'higher_is_worse' ? '≥' : '≤'})
            </label>
            <div className="relative">
              <input
                id="redAt"
                type="number"
                step={unitKind === 'percent' ? '0.01' : '1'}
                value={redAt}
                onChange={(e) => setRedAt(e.target.value)}
                placeholder="VD: 2 hoặc 80"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text pr-10 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
              <span className="absolute right-3 top-2.5 text-xs text-text-muted">{unitLabel}</span>
            </div>
            {fieldErrors.redAt && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.redAt}</p>
            )}
          </div>
        </div>
        <p className="text-[11px] text-text-muted -mt-3">
          {direction === 'higher_is_worse'
            ? 'Theo chiều Càng cao càng xấu: Ngưỡng Vàng phải nhỏ hơn ngưỡng Đỏ.'
            : 'Theo chiều Càng thấp càng xấu: Ngưỡng Vàng phải lớn hơn ngưỡng Đỏ.'}
        </p>

        {/* 6. Mục tiêu (targetValue) - CHỈ KCI */}
        {isKci && (
          <div>
            <label htmlFor="targetValue" className="block text-xs font-semibold text-text mb-1">
              Mục tiêu kiểm soát ({unitLabel})
            </label>
            <div className="relative">
              <input
                id="targetValue"
                type="number"
                step={unitKind === 'percent' ? '0.01' : '1'}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="VD: 100"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text pr-10 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
              <span className="absolute right-3 top-2.5 text-xs text-text-muted">{unitLabel}</span>
            </div>
            <p className="mt-1 text-[11px] text-text-muted">
              Mục tiêu để đo lường tiến độ thực hiện kiểm soát ({unitKind === 'percent' ? 'thường là 100%' : 'giá trị mục tiêu'}).
            </p>
            {fieldErrors.targetValue && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.targetValue}</p>
            )}
          </div>
        )}

        <div className="pt-4 flex items-center justify-end gap-3 border-t border-border">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-text hover:bg-bg-tint transition"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-brand-blue px-4 py-2 text-xs font-semibold text-white hover:bg-brand-navy transition disabled:opacity-50"
          >
            {isLoading ? 'Đang lưu...' : 'Lưu thiết lập'}
          </button>
        </div>
      </form>
    </RecordDrawer>
  );
}
