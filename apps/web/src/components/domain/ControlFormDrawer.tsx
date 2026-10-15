'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RecordDrawer } from '@/components/data/RecordDrawer';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ReferencedAlert } from '@/components/ui/ReferencedAlert';

type CreateControlRequest = components['schemas']['CreateControlRequest'];
type ControlInput = components['schemas']['ControlInput'];

export interface ControlFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskCode: string;
  suggestedCode?: string;
  initialControl?: {
    code: string;
    description: string;
    ownerText: string;
    frequency: string;
    objective: string;
    method: string;
    designEff: string;
    operatingEff: string;
    overallEff: string;
    needsSupplement: boolean;
  } | null;
  cycle?: number;
  onSuccess?: () => void;
}

export function ControlFormDrawer({
  open,
  onOpenChange,
  riskCode,
  suggestedCode = '',
  initialControl,
  cycle,
  onSuccess,
}: ControlFormDrawerProps) {
  const router = useRouter();
  const isEditing = Boolean(initialControl);

  const [code, setCode] = useState(initialControl?.code || suggestedCode || `${riskCode}.KS01`);
  const [description, setDescription] = useState(initialControl?.description || '');
  const [ownerText, setOwnerText] = useState(initialControl?.ownerText || '');
  const [frequency, setFrequency] = useState(initialControl?.frequency || 'Hàng tháng');
  const [objective, setObjective] = useState(initialControl?.objective || 'Phòng ngừa');
  const [method, setMethod] = useState(initialControl?.method || 'Tự động');
  const [designEff, setDesignEff] = useState(initialControl?.designEff || 'Hiệu quả');
  const [operatingEff, setOperatingEff] = useState(initialControl?.operatingEff || 'Hiệu quả');
  const [overallEff, setOverallEff] = useState(initialControl?.overallEff || 'Hiệu quả');
  const [needsSupplement, setNeedsSupplement] = useState(initialControl?.needsSupplement || false);

  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [apiErrorObj, setApiErrorObj] = useState<{
    code?: string;
    message?: string;
    details?: unknown;
  } | null>(null);

  useEffect(() => {
    if (initialControl) {
      setCode(initialControl.code);
      setDescription(initialControl.description);
      setOwnerText(initialControl.ownerText || '');
      setFrequency(initialControl.frequency || 'Hàng tháng');
      setObjective(initialControl.objective || 'Phòng ngừa');
      setMethod(initialControl.method || 'Tự động');
      setDesignEff(initialControl.designEff || 'Hiệu quả');
      setOperatingEff(initialControl.operatingEff || 'Hiệu quả');
      setOverallEff(initialControl.overallEff || 'Hiệu quả');
      setNeedsSupplement(Boolean(initialControl.needsSupplement));
    } else {
      setCode(suggestedCode || `${riskCode}.KS01`);
      setDescription('');
      setOwnerText('');
      setFrequency('Hàng tháng');
      setObjective('Phòng ngừa');
      setMethod('Tự động');
      setDesignEff('Hiệu quả');
      setOperatingEff('Hiệu quả');
      setOverallEff('Hiệu quả');
      setNeedsSupplement(false);
    }
    setFieldErrors({});
    setGeneralError(null);
    setApiErrorObj(null);
  }, [initialControl, suggestedCode, riskCode, open]);

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
        errors.code = 'Vui lòng nhập mã kiểm soát';
      } else if (!/^[A-Z0-9]+\.[A-Z0-9]+\.(NN|AH|KS|KH|KRI|KCI)[0-9]{2,3}$/.test(trimmedCode)) {
        errors.code = `Mã kiểm soát phải bắt đầu bằng ${riskCode}.KS... (ví dụ ${riskCode}.KS05)`;
      }
    }
    if (!description.trim()) errors.description = 'Vui lòng nhập mô tả kiểm soát';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsLoading(false);
      return;
    }

    try {
      if (isEditing) {
        const body: ControlInput = {
          description: description.trim(),
          ownerText: ownerText.trim(),
          frequency: frequency.trim(),
          objective: objective.trim(),
          method: method.trim(),
          designEff: designEff.trim(),
          operatingEff: operatingEff.trim(),
          overallEff: overallEff.trim(),
          needsSupplement,
        };
        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>(
          'PUT',
          `/api/profiles/${encodeURIComponent(riskCode)}/controls/${encodeURIComponent(initialControl!.code)}${cycleQuery}`,
          body,
        );
      } else {
        const body: CreateControlRequest = {
          code: trimmedCode,
          description: description.trim(),
          ownerText: ownerText.trim(),
          frequency: frequency.trim(),
          objective: objective.trim(),
          method: method.trim(),
          designEff: designEff.trim(),
          operatingEff: operatingEff.trim(),
          overallEff: overallEff.trim(),
          needsSupplement,
        };
        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>(
          'POST',
          `/api/profiles/${encodeURIComponent(riskCode)}/controls${cycleQuery}`,
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
            code: err.message || 'Mã kiểm soát đã tồn tại trong chu kỳ.',
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
      title={isEditing ? `Sửa kiểm soát ${initialControl?.code}` : `Thêm kiểm soát (${riskCode})`}
      description="Biện pháp kiểm soát hiện tại để phòng ngừa hoặc giảm thiểu rủi ro."
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {generalError && (
          <div role="alert" className="rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3 text-state-bad-fg">
            {generalError}
          </div>
        )}

        <ReferencedAlert error={apiErrorObj} />

        <div>
          <label htmlFor="controlCode" className="block font-semibold text-text mb-1">
            Mã kiểm soát <span className="text-state-bad-fg">*</span>
          </label>
          <input
            id="controlCode"
            type="text"
            required
            disabled={isEditing}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={`Ví dụ: ${riskCode}.KS05`}
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
            <p className="mt-0.5 text-[11px] text-text-muted">Mã kiểm soát không thể thay đổi sau khi tạo.</p>
          )}
        </div>

        <div>
          <label htmlFor="controlDesc" className="block font-semibold text-text mb-1">
            Mô tả kiểm soát <span className="text-state-bad-fg">*</span>
          </label>
          <textarea
            id="controlDesc"
            rows={3}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Nội dung biện pháp kiểm soát..."
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
          {fieldErrors.description && (
            <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.description}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="controlOwner" className="block font-semibold text-text mb-1">
              Chủ kiểm soát (văn bản Excel)
            </label>
            <input
              id="controlOwner"
              type="text"
              value={ownerText}
              onChange={(e) => setOwnerText(e.target.value)}
              placeholder="Ví dụ: Ban CNTT"
              className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label htmlFor="controlFreq" className="block font-semibold text-text mb-1">
              Tần suất kiểm soát
            </label>
            <input
              id="controlFreq"
              type="text"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="Hàng ngày, Hàng tuần, Hàng tháng, Định kỳ..."
              className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="controlObj" className="block font-semibold text-text mb-1">
              Mục tiêu kiểm soát
            </label>
            <input
              id="controlObj"
              type="text"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Phòng ngừa, Phát hiện, Khắc phục..."
              className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label htmlFor="controlMethod" className="block font-semibold text-text mb-1">
              Cách thức thực hiện
            </label>
            <input
              id="controlMethod"
              type="text"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="Tự động, Bán tự động, Thủ công..."
              className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
        </div>

        <div className="rounded-control border border-border/80 bg-bg-tint/30 p-3 space-y-3">
          <span className="font-semibold text-text block">Đánh giá hiệu quả kiểm soát</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="designEff" className="block font-medium text-text mb-1">
                Thiết kế
              </label>
              <input
                id="designEff"
                type="text"
                value={designEff}
                onChange={(e) => setDesignEff(e.target.value)}
                placeholder="Hiệu quả, Hiệu quả một phần..."
                className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
            </div>
            <div>
              <label htmlFor="operatingEff" className="block font-medium text-text mb-1">
                Vận hành
              </label>
              <input
                id="operatingEff"
                type="text"
                value={operatingEff}
                onChange={(e) => setOperatingEff(e.target.value)}
                placeholder="Hiệu quả, Hiệu quả một phần..."
                className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
            </div>
            <div>
              <label htmlFor="overallEff" className="block font-medium text-text mb-1">
                Tổng thể
              </label>
              <input
                id="overallEff"
                type="text"
                value={overallEff}
                onChange={(e) => setOverallEff(e.target.value)}
                placeholder="Hiệu quả, Hiệu quả một phần..."
                className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="needsSupplement"
            type="checkbox"
            checked={needsSupplement}
            onChange={(e) => setNeedsSupplement(e.target.checked)}
            className="rounded border-border text-brand-blue focus:ring-brand-blue"
          />
          <label htmlFor="needsSupplement" className="font-medium text-text cursor-pointer">
            Cần bổ sung / tăng cường kiểm soát
          </label>
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
            {isLoading ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm kiểm soát'}
          </button>
        </div>
      </form>
    </RecordDrawer>
  );
}
