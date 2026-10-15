'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { components } from '@/lib/api/schema';
import { PageHero } from '@/components/ui/PageHero';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiSend, ApiClientError } from '@/lib/api/client';
import {
  SlidersHorizontal,
  Save,
  AlertCircle,
  CheckCircle2,
  Info,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Settings = components['schemas']['Settings'];

export interface SettingsViewProps {
  initialSettings: Settings;
}

export function SettingsView({ initialSettings }: SettingsViewProps) {
  const router = useRouter();

  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [slowDays, setSlowDays] = useState<string>(String(initialSettings.slowDays));
  const [slowProgress, setSlowProgress] = useState<string>(String(initialSettings.slowProgress));
  const [staleDays, setStaleDays] = useState<string>(String(initialSettings.staleDays));
  const [dueDay, setDueDay] = useState<string>(String(initialSettings.dueDay));

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const validate = (): {
    isValid: boolean;
    data?: Settings;
    errors: Record<string, string>;
  } => {
    const errors: Record<string, string> = {};

    const numSlowDays = Number(slowDays);
    if (!Number.isInteger(numSlowDays) || numSlowDays < 1 || numSlowDays > 365) {
      errors.slowDays = 'Số ngày cảnh báo nguy cơ chậm phải là số nguyên từ 1 đến 365 ngày.';
    }

    const numSlowProgress = Number(slowProgress);
    if (!Number.isInteger(numSlowProgress) || numSlowProgress < 0 || numSlowProgress > 100) {
      errors.slowProgress = 'Tiến độ tối thiểu phải là số nguyên từ 0 đến 100%.';
    }

    const numStaleDays = Number(staleDays);
    if (!Number.isInteger(numStaleDays) || numStaleDays < 1 || numStaleDays > 365) {
      errors.staleDays = 'Số ngày không cập nhật phải là số nguyên từ 1 đến 365 ngày.';
    }

    const numDueDay = Number(dueDay);
    if (!Number.isInteger(numDueDay) || numDueDay < 1 || numDueDay > 28) {
      errors.dueDay = 'Ngày hạn nhập mỗi tháng phải là số nguyên từ ngày 1 đến 28.';
    }

    if (Object.keys(errors).length > 0) {
      return { isValid: false, errors };
    }

    return {
      isValid: true,
      data: {
        slowDays: numSlowDays,
        slowProgress: numSlowProgress,
        staleDays: numStaleDays,
        dueDay: numDueDay,
      },
      errors: {},
    };
  };

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setSuccessMessage(null);

    const result = validate();
    if (!result.isValid) {
      setFieldErrors(result.errors);
      return;
    }

    setFieldErrors({});
    setConfirmOpen(true);
  };

  const handleSave = async () => {
    const result = validate();
    if (!result.isValid || !result.data) {
      setFieldErrors(result.errors);
      setConfirmOpen(false);
      return;
    }

    setIsSaving(true);
    setGeneralError(null);
    try {
      const updated = await apiSend<Settings>('PUT', '/api/settings', result.data);
      setSettings(updated);
      setSlowDays(String(updated.slowDays));
      setSlowProgress(String(updated.slowProgress));
      setStaleDays(String(updated.staleDays));
      setDueDay(String(updated.dueDay));
      setSuccessMessage('Đã lưu thành công cấu hình hệ thống.');
      setConfirmOpen(false);
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setGeneralError(err.message);
        if (err.fieldErrors) {
          setFieldErrors(err.fieldErrors);
        }
      } else {
        setGeneralError('Đã xảy ra lỗi khi lưu cấu hình. Vui lòng thử lại.');
      }
      setConfirmOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToCurrent = () => {
    setSlowDays(String(settings.slowDays));
    setSlowProgress(String(settings.slowProgress));
    setStaleDays(String(settings.staleDays));
    setDueDay(String(settings.dueDay));
    setFieldErrors({});
    setGeneralError(null);
    setSuccessMessage(null);
  };

  const hasChanges =
    slowDays !== String(settings.slowDays) ||
    slowProgress !== String(settings.slowProgress) ||
    staleDays !== String(settings.staleDays) ||
    dueDay !== String(settings.dueDay);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHero
        title="Cấu hình hệ thống"
        description="Thiết lập các ngưỡng cảnh báo tiến độ và quy tắc thời hạn số liệu của hệ thống MBF Risk Monitor"
      />

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

      {/* General error alert */}
      {generalError && (
        <div
          role="alert"
          className="p-3 rounded-control bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30 flex items-center gap-2 text-xs"
        >
          <AlertCircle className="w-4 h-4 text-state-bad-line shrink-0" aria-hidden="true" />
          <span>{generalError}</span>
        </div>
      )}

      {/* Main form card */}
      <form onSubmit={handleOpenConfirm} noValidate className="rounded-xl border border-border bg-surface shadow-subtle p-6 space-y-6">
        <div className="border-b border-border pb-4">
          <h2 className="text-sm font-bold text-text flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-brand-blue" aria-hidden="true" />
            <span>Ngưỡng cảnh báo và thời hạn nhập liệu</span>
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Các tham số này áp dụng cho toàn bộ việc tính toán trạng thái kế hoạch hành động và lịch hạn nộp số liệu
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 1. slowDays */}
          <div className="space-y-1.5">
            <label htmlFor="slow-days-input" className="block text-xs font-semibold text-text">
              Số ngày cảnh báo nguy cơ chậm <span className="text-brand-red">*</span>
            </label>
            <div className="relative">
              <input
                id="slow-days-input"
                type="number"
                min={1}
                max={365}
                required
                value={slowDays}
                onChange={(e) => {
                  setSlowDays(e.target.value);
                  if (fieldErrors.slowDays) setFieldErrors((prev) => ({ ...prev, slowDays: '' }));
                }}
                className={cn(
                  'w-full px-3 py-2 pr-14 rounded-control border bg-surface text-sm text-text font-mono focus:outline-none focus:ring-2 focus:ring-brand-bright transition',
                  fieldErrors.slowDays ? 'border-brand-red' : 'border-border',
                )}
              />
              <span className="absolute right-3 top-2.5 text-xs text-text-muted font-medium">
                ngày
              </span>
            </div>
            <p className="text-[11px] text-text-muted">
              Đầu việc còn ít hơn số ngày này đến hạn sẽ được kiểm tra nguy cơ chậm (Khoảng hợp lệ: 1 – 365).
            </p>
            {fieldErrors.slowDays && (
              <p role="alert" className="text-[11px] font-semibold text-brand-red">
                {fieldErrors.slowDays}
              </p>
            )}
          </div>

          {/* 2. slowProgress */}
          <div className="space-y-1.5">
            <label htmlFor="slow-progress-input" className="block text-xs font-semibold text-text">
              Tiến độ tối thiểu <span className="text-brand-red">*</span>
            </label>
            <div className="relative">
              <input
                id="slow-progress-input"
                type="number"
                min={0}
                max={100}
                required
                value={slowProgress}
                onChange={(e) => {
                  setSlowProgress(e.target.value);
                  if (fieldErrors.slowProgress) setFieldErrors((prev) => ({ ...prev, slowProgress: '' }));
                }}
                className={cn(
                  'w-full px-3 py-2 pr-12 rounded-control border bg-surface text-sm text-text font-mono focus:outline-none focus:ring-2 focus:ring-brand-bright transition',
                  fieldErrors.slowProgress ? 'border-brand-red' : 'border-border',
                )}
              />
              <span className="absolute right-3 top-2.5 text-xs text-text-muted font-medium">
                %
              </span>
            </div>
            <p className="text-[11px] text-text-muted">
              Mức tiến độ tối thiểu để không bị đánh dấu &quot;Có nguy cơ chậm&quot; (Khoảng hợp lệ: 0 – 100%).
            </p>
            {fieldErrors.slowProgress && (
              <p role="alert" className="text-[11px] font-semibold text-brand-red">
                {fieldErrors.slowProgress}
              </p>
            )}
          </div>

          {/* 3. staleDays */}
          <div className="space-y-1.5">
            <label htmlFor="stale-days-input" className="block text-xs font-semibold text-text">
              Số ngày không cập nhật <span className="text-brand-red">*</span>
            </label>
            <div className="relative">
              <input
                id="stale-days-input"
                type="number"
                min={1}
                max={365}
                required
                value={staleDays}
                onChange={(e) => {
                  setStaleDays(e.target.value);
                  if (fieldErrors.staleDays) setFieldErrors((prev) => ({ ...prev, staleDays: '' }));
                }}
                className={cn(
                  'w-full px-3 py-2 pr-14 rounded-control border bg-surface text-sm text-text font-mono focus:outline-none focus:ring-2 focus:ring-brand-bright transition',
                  fieldErrors.staleDays ? 'border-brand-red' : 'border-border',
                )}
              />
              <span className="absolute right-3 top-2.5 text-xs text-text-muted font-medium">
                ngày
              </span>
            </div>
            <p className="text-[11px] text-text-muted">
              Số ngày không có cập nhật tiến độ mới trước khi cảnh báo đình trệ (Khoảng hợp lệ: 1 – 365).
            </p>
            {fieldErrors.staleDays && (
              <p role="alert" className="text-[11px] font-semibold text-brand-red">
                {fieldErrors.staleDays}
              </p>
            )}
          </div>

          {/* 4. dueDay */}
          <div className="space-y-1.5">
            <label htmlFor="due-day-input" className="block text-xs font-semibold text-text">
              Ngày hạn nhập mỗi tháng <span className="text-brand-red">*</span>
            </label>
            <div className="relative">
              <input
                id="due-day-input"
                type="number"
                min={1}
                max={28}
                required
                value={dueDay}
                onChange={(e) => {
                  setDueDay(e.target.value);
                  if (fieldErrors.dueDay) setFieldErrors((prev) => ({ ...prev, dueDay: '' }));
                }}
                className={cn(
                  'w-full px-3 py-2 pr-16 rounded-control border bg-surface text-sm text-text font-mono focus:outline-none focus:ring-2 focus:ring-brand-bright transition',
                  fieldErrors.dueDay ? 'border-brand-red' : 'border-border',
                )}
              />
              <span className="absolute right-3 top-2.5 text-xs text-text-muted font-medium">
                hàng tháng
              </span>
            </div>
            <p className="text-[11px] text-text-muted">
              Ngày chốt hạn nộp số liệu trong tháng tiếp theo (Khoảng hợp lệ: 1 – 28).
            </p>
            {fieldErrors.dueDay && (
              <p role="alert" className="text-[11px] font-semibold text-brand-red">
                {fieldErrors.dueDay}
              </p>
            )}
          </div>
        </div>

        {/* Warning note about dueDay */}
        <div className="p-3.5 rounded-control bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5 text-xs">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <span className="font-semibold block">Lưu ý về ngày hạn nhập hàng tháng:</span>
            <p className="leading-relaxed opacity-90">
              Thay đổi ngày hạn nhập chỉ áp dụng cho các kỳ báo cáo được tạo sau khi đổi cấu hình. Các kỳ đã tồn tại vẫn giữ nguyên thời hạn nhập cũ.
            </p>
          </div>
        </div>

        {/* Submit and reset actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          {hasChanges && (
            <button
              type="button"
              onClick={handleResetToCurrent}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control text-xs font-medium border border-border bg-surface text-text hover:bg-bg-tint transition"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Khôi phục</span>
            </button>
          )}

          <button
            type="submit"
            disabled={!hasChanges}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-control text-xs font-semibold bg-brand-blue text-white hover:bg-brand-blue/90 disabled:opacity-40 transition shadow-xs"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Lưu cấu hình</span>
          </button>
        </div>
      </form>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Xác nhận lưu thay đổi cấu hình"
        description="Bạn có chắc chắn muốn lưu các thông số cấu hình mới này không? Các thay đổi sẽ có hiệu lực ngay lập tức đối với hệ thống."
        confirmText="Xác nhận lưu"
        isSubmitting={isSaving}
        onConfirm={handleSave}
      />
    </div>
  );
}
