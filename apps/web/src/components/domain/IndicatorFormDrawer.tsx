'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RecordDrawer } from '@/components/data/RecordDrawer';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ReferencedAlert } from '@/components/ui/ReferencedAlert';
import { AlertTriangle } from 'lucide-react';

type CreateIndicatorRequest = components['schemas']['CreateIndicatorRequest'];
type IndicatorInput = components['schemas']['IndicatorInput'];

export type IndicatorFrequency = 'Tháng' | 'Quý' | 'Hàng quý' | 'Theo đợt diễn tập';

export interface IndicatorFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskCode: string;
  kind?: 'kri' | 'kci';
  suggestedCode?: string;
  initialIndicator?: {
    code: string;
    kind: 'kri' | 'kci';
    name: string;
    formula: string;
    frequency: string;
    thresholds: {
      green: string;
      yellow: string;
      red: string;
    };
    note?: string | null;
  } | null;
  cycle?: number;
  onSuccess?: () => void;
}

const FREQUENCY_OPTIONS: IndicatorFrequency[] = [
  'Tháng',
  'Quý',
  'Hàng quý',
  'Theo đợt diễn tập',
];

export function IndicatorFormDrawer({
  open,
  onOpenChange,
  riskCode,
  kind = 'kri',
  suggestedCode = '',
  initialIndicator,
  cycle,
  onSuccess,
}: IndicatorFormDrawerProps) {
  const router = useRouter();
  const isEditing = Boolean(initialIndicator);
  const activeKind = initialIndicator?.kind || kind;

  const [code, setCode] = useState(
    initialIndicator?.code || suggestedCode || `${riskCode}.${activeKind.toUpperCase()}01`
  );
  const [name, setName] = useState(initialIndicator?.name || '');
  const [formula, setFormula] = useState(initialIndicator?.formula || '');
  const [frequency, setFrequency] = useState<IndicatorFrequency>(
    (initialIndicator?.frequency as IndicatorFrequency) || 'Hàng quý'
  );
  const [thresholdGreen, setThresholdGreen] = useState(initialIndicator?.thresholds.green || '');
  const [thresholdYellow, setThresholdYellow] = useState(initialIndicator?.thresholds.yellow || '');
  const [thresholdRed, setThresholdRed] = useState(initialIndicator?.thresholds.red || '');
  const [note, setNote] = useState(initialIndicator?.note || '');

  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [apiErrorObj, setApiErrorObj] = useState<{
    code?: string;
    message?: string;
    details?: unknown;
  } | null>(null);

  useEffect(() => {
    if (initialIndicator) {
      setCode(initialIndicator.code);
      setName(initialIndicator.name);
      setFormula(initialIndicator.formula);
      const freq = initialIndicator.frequency as IndicatorFrequency;
      setFrequency(FREQUENCY_OPTIONS.includes(freq) ? freq : 'Hàng quý');
      setThresholdGreen(initialIndicator.thresholds.green || '');
      setThresholdYellow(initialIndicator.thresholds.yellow || '');
      setThresholdRed(initialIndicator.thresholds.red || '');
      setNote(initialIndicator.note || '');
    } else {
      setCode(suggestedCode || `${riskCode}.${activeKind.toUpperCase()}01`);
      setName('');
      setFormula('');
      setFrequency('Hàng quý');
      setThresholdGreen(activeKind === 'kri' ? '< 5%' : 'Hiệu quả');
      setThresholdYellow(activeKind === 'kri' ? '5% - 10%' : 'Hiệu quả một phần');
      setThresholdRed(activeKind === 'kri' ? '> 10%' : 'Chưa hiệu quả');
      setNote('');
    }
    setFieldErrors({});
    setGeneralError(null);
    setApiErrorObj(null);
  }, [initialIndicator, suggestedCode, riskCode, activeKind, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFieldErrors({});
    setGeneralError(null);
    setApiErrorObj(null);

    const trimmedCode = code.trim().toUpperCase();
    const errors: Record<string, string> = {};

    if (!isEditing) {
      if (!trimmedCode) {
        errors.code = `Vui lòng nhập mã ${activeKind.toUpperCase()}`;
      } else if (!/^[A-Z0-9]+\.[A-Z0-9]+\.(NN|AH|KS|KH|KRI|KCI)[0-9]{2,3}$/.test(trimmedCode)) {
        errors.code = `Mã chỉ số phải bắt đầu bằng ${riskCode}.${activeKind.toUpperCase()}... (ví dụ ${riskCode}.${activeKind.toUpperCase()}04)`;
      }
    }
    if (!name.trim()) errors.name = 'Vui lòng nhập tên chỉ số';
    if (!thresholdGreen.trim()) errors.thresholdGreen = 'Vui lòng nhập ngưỡng Xanh';
    if (!thresholdYellow.trim()) errors.thresholdYellow = 'Vui lòng nhập ngưỡng Vàng';
    if (!thresholdRed.trim()) errors.thresholdRed = 'Vui lòng nhập ngưỡng Đỏ';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsLoading(false);
      return;
    }

    try {
      if (isEditing) {
        const body: IndicatorInput = {
          name: name.trim(),
          formula: formula.trim(),
          frequency,
          thresholds: {
            green: thresholdGreen.trim(),
            yellow: thresholdYellow.trim(),
            red: thresholdRed.trim(),
          },
          note: note.trim() || null,
        };
        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>(
          'PUT',
          `/api/profiles/${encodeURIComponent(riskCode)}/indicators/${encodeURIComponent(initialIndicator!.code)}${cycleQuery}`,
          body,
        );
      } else {
        const body: CreateIndicatorRequest = {
          code: trimmedCode,
          name: name.trim(),
          formula: formula.trim(),
          frequency,
          thresholds: {
            green: thresholdGreen.trim(),
            yellow: thresholdYellow.trim(),
            red: thresholdRed.trim(),
          },
          note: note.trim() || null,
        };
        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>(
          'POST',
          `/api/profiles/${encodeURIComponent(riskCode)}/indicators${cycleQuery}`,
          body,
        );
      }

      onOpenChange(false);
      router.refresh();
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === 'CONFLICT') {
          setFieldErrors((prev) => ({
            ...prev,
            code: err.message || `Mã ${activeKind.toUpperCase()} đã tồn tại trong chu kỳ.`,
          }));
        } else if (err.code === 'REFERENCED') {
          setApiErrorObj({
            code: err.code,
            message: err.message,
            details: err.details,
          });
        } else if (err.fieldErrors) {
          setFieldErrors(err.fieldErrors);
        } else {
          setGeneralError(err.message);
        }
      } else {
        setGeneralError('Đã xảy ra lỗi không xác định.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <RecordDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={
        isEditing
          ? `Sửa chỉ số ${initialIndicator?.code}`
          : `Thêm chỉ số ${activeKind.toUpperCase()} (${riskCode})`
      }
      description={
        activeKind === 'kri'
          ? 'Chỉ số đo lường mức độ rủi ro chính (KRI).'
          : 'Chỉ số đo lường hiệu quả kiểm soát chính (KCI).'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {generalError && (
          <div role="alert" className="rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3 text-state-bad-fg">
            {generalError}
          </div>
        )}

        <ReferencedAlert error={apiErrorObj} />

        <div>
          <label htmlFor="indCode" className="block font-semibold text-text mb-1">
            Mã chỉ số <span className="text-state-bad-fg">*</span>
          </label>
          <input
            id="indCode"
            type="text"
            required
            disabled={isEditing}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={`Ví dụ: ${riskCode}.${activeKind.toUpperCase()}04`}
            className="w-full rounded-control border border-border px-3 py-2 text-text font-mono uppercase disabled:bg-bg-tint disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
          {fieldErrors.code && (
            <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.code}</p>
          )}
          {!isEditing && suggestedCode && (
            <p className="mt-1 text-[11px] text-text-muted">
              Gợi ý mã kế tiếp: <span className="font-mono font-semibold text-text">{suggestedCode}</span> (máy chủ quyết định tính duy nhất).
            </p>
          )}
          {isEditing && (
            <p className="mt-0.5 text-[11px] text-text-muted">Mã chỉ số không thể thay đổi sau khi tạo.</p>
          )}
        </div>

        <div>
          <label htmlFor="indName" className="block font-semibold text-text mb-1">
            Tên chỉ số <span className="text-state-bad-fg">*</span>
          </label>
          <input
            id="indName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên định danh chỉ số..."
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
          {fieldErrors.name && (
            <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.name}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="indFormula" className="block font-semibold text-text mb-1">
              Công thức / Cách đo lường
            </label>
            <input
              id="indFormula"
              type="text"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="Ví dụ: Số vụ việc / Tổng số..."
              className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label htmlFor="indFreq" className="block font-semibold text-text mb-1">
              Tần suất báo cáo <span className="text-state-bad-fg">*</span>
            </label>
            <select
              id="indFreq"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as IndicatorFrequency)}
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Ba ô ngưỡng */}
        <div className="rounded-control border border-border/80 bg-bg-tint/30 p-3 space-y-3">
          <div className="flex items-start gap-2 text-state-warn-fg bg-state-warn-bg/60 p-2.5 rounded-control border border-state-warn-line/30">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="text-[11px] leading-relaxed">
              <strong>Cảnh báo:</strong> Khi thay đổi cấu hình ngưỡng, số liệu đã duyệt trước đây vẫn giữ nguyên vùng cũ.
            </span>
          </div>

          <span className="font-semibold text-text block">Các ngưỡng đánh giá vùng</span>

          <div className="space-y-2.5">
            <div>
              <label htmlFor="threshGreen" className="flex items-center gap-1.5 font-medium text-state-ok-fg mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-state-ok-line" />
                Vùng Xanh ({activeKind === 'kri' ? 'Trong ngưỡng' : 'Hiệu quả'}) <span className="text-state-bad-fg">*</span>
              </label>
              <input
                id="threshGreen"
                type="text"
                required
                value={thresholdGreen}
                onChange={(e) => setThresholdGreen(e.target.value)}
                placeholder={activeKind === 'kri' ? '< 5%' : 'Hiệu quả'}
                className="w-full rounded-control border border-border px-3 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
            </div>

            <div>
              <label htmlFor="threshYellow" className="flex items-center gap-1.5 font-medium text-state-warn-fg mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-state-warn-line" />
                Vùng Vàng ({activeKind === 'kri' ? 'Cảnh báo' : 'Hiệu quả một phần'}) <span className="text-state-bad-fg">*</span>
              </label>
              <input
                id="threshYellow"
                type="text"
                required
                value={thresholdYellow}
                onChange={(e) => setThresholdYellow(e.target.value)}
                placeholder={activeKind === 'kri' ? '5% - 10%' : 'Hiệu quả một phần'}
                className="w-full rounded-control border border-border px-3 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
            </div>

            <div>
              <label htmlFor="threshRed" className="flex items-center gap-1.5 font-medium text-state-bad-fg mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-state-bad-line" />
                Vùng Đỏ ({activeKind === 'kri' ? 'Vượt ngưỡng' : 'Chưa hiệu quả'}) <span className="text-state-bad-fg">*</span>
              </label>
              <input
                id="threshRed"
                type="text"
                required
                value={thresholdRed}
                onChange={(e) => setThresholdRed(e.target.value)}
                placeholder={activeKind === 'kri' ? '> 10%' : 'Chưa hiệu quả'}
                className="w-full rounded-control border border-border px-3 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="indNote" className="block font-semibold text-text mb-1">
            Ghi chú
          </label>
          <textarea
            id="indNote"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú thêm về chỉ số..."
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
            className="rounded-control border border-border bg-surface px-4 py-2 font-medium text-text hover:bg-bg-tint transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-control bg-brand-blue px-4 py-2 font-semibold text-white hover:bg-brand-navy transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm chỉ số'}
          </button>
        </div>
      </form>
    </RecordDrawer>
  );
}
