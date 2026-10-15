'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RecordDrawer } from '@/components/data/RecordDrawer';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ReferencedAlert } from '@/components/ui/ReferencedAlert';

type CreateActionRequest = components['schemas']['CreateActionRequest'];
type ActionInput = components['schemas']['ActionInput'];

export interface ActionFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskCode: string;
  suggestedCode?: string;
  initialAction?: {
    code: string;
    description: string;
    responsibilityText?: string;
    deliverable?: string;
    dueText: string;
  } | null;
  cycle?: number;
  onSuccess?: () => void;
}

export function ActionFormDrawer({
  open,
  onOpenChange,
  riskCode,
  suggestedCode = '',
  initialAction,
  cycle,
  onSuccess,
}: ActionFormDrawerProps) {
  const router = useRouter();
  const isEditing = Boolean(initialAction);

  const [code, setCode] = useState(initialAction?.code || suggestedCode || `${riskCode}.KH01`);
  const [description, setDescription] = useState(initialAction?.description || '');
  const [responsibilityText, setResponsibilityText] = useState(initialAction?.responsibilityText || '');
  const [deliverable, setDeliverable] = useState(initialAction?.deliverable || '');
  const [dueText, setDueText] = useState(initialAction?.dueText || '');

  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [apiErrorObj, setApiErrorObj] = useState<{
    code?: string;
    message?: string;
    details?: unknown;
  } | null>(null);

  useEffect(() => {
    if (initialAction) {
      setCode(initialAction.code);
      setDescription(initialAction.description);
      setResponsibilityText(initialAction.responsibilityText || '');
      setDeliverable(initialAction.deliverable || '');
      setDueText(initialAction.dueText || '');
    } else {
      setCode(suggestedCode || `${riskCode}.KH01`);
      setDescription('');
      setResponsibilityText('');
      setDeliverable('');
      setDueText('');
    }
    setFieldErrors({});
    setGeneralError(null);
    setApiErrorObj(null);
  }, [initialAction, suggestedCode, riskCode, open]);

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
        errors.code = 'Vui lòng nhập mã kế hoạch';
      } else if (!/^[A-Z0-9]+\.[A-Z0-9]+\.(NN|AH|KS|KH|KRI|KCI)[0-9]{2,3}$/.test(trimmedCode)) {
        errors.code = `Mã kế hoạch phải bắt đầu bằng ${riskCode}.KH... (ví dụ ${riskCode}.KH03)`;
      }
    }
    if (!description.trim()) errors.description = 'Vui lòng nhập mô tả kế hoạch';
    if (!dueText.trim()) errors.dueText = 'Vui lòng nhập thời hạn hoàn thành (văn bản)';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsLoading(false);
      return;
    }

    try {
      if (isEditing) {
        const body: ActionInput = {
          description: description.trim(),
          responsibilityText: responsibilityText.trim(),
          deliverable: deliverable.trim(),
          dueText: dueText.trim(),
        };
        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>(
          'PUT',
          `/api/profiles/${encodeURIComponent(riskCode)}/actions/${encodeURIComponent(initialAction!.code)}${cycleQuery}`,
          body,
        );
      } else {
        const body: CreateActionRequest = {
          code: trimmedCode,
          description: description.trim(),
          responsibilityText: responsibilityText.trim(),
          deliverable: deliverable.trim(),
          dueText: dueText.trim(),
        };
        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>(
          'POST',
          `/api/profiles/${encodeURIComponent(riskCode)}/actions${cycleQuery}`,
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
            code: err.message || 'Mã kế hoạch đã tồn tại trong chu kỳ.',
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
      title={isEditing ? `Sửa kế hoạch hành động ${initialAction?.code}` : `Thêm kế hoạch hành động (${riskCode})`}
      description="Biện pháp xử lý nhằm giảm thiểu rủi ro xuống mức chấp nhận được."
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {generalError && (
          <div role="alert" className="rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3 text-state-bad-fg">
            {generalError}
          </div>
        )}

        <ReferencedAlert error={apiErrorObj} />

        <div>
          <label htmlFor="actionCode" className="block font-semibold text-text mb-1">
            Mã kế hoạch <span className="text-state-bad-fg">*</span>
          </label>
          <input
            id="actionCode"
            type="text"
            required
            disabled={isEditing}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={`Ví dụ: ${riskCode}.KH03`}
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
            <p className="mt-0.5 text-[11px] text-text-muted">Mã kế hoạch không thể thay đổi sau khi tạo.</p>
          )}
        </div>

        <div>
          <label htmlFor="actionDesc" className="block font-semibold text-text mb-1">
            Mô tả kế hoạch hành động <span className="text-state-bad-fg">*</span>
          </label>
          <textarea
            id="actionDesc"
            rows={3}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Nội dung kế hoạch hành động cụ thể..."
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
          {fieldErrors.description && (
            <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.description}</p>
          )}
        </div>

        <div>
          <label htmlFor="actionResp" className="block font-semibold text-text mb-1">
            Trách nhiệm thực hiện (văn bản Excel)
          </label>
          <input
            id="actionResp"
            type="text"
            value={responsibilityText}
            onChange={(e) => setResponsibilityText(e.target.value)}
            placeholder="Ví dụ: Ban CNTT chủ trì, TT Mạng lưới phối hợp"
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
        </div>

        <div>
          <label htmlFor="actionDeliverable" className="block font-semibold text-text mb-1">
            Đầu ra yêu cầu (kết quả mong đợi)
          </label>
          <textarea
            id="actionDeliverable"
            rows={2}
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            placeholder="Ví dụ: Hệ thống hoàn thành nâng cấp, có biên bản nghiệm thu..."
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
        </div>

        <div>
          <label htmlFor="actionDue" className="block font-semibold text-text mb-1">
            Thời hạn hoàn thành (văn bản) <span className="text-state-bad-fg">*</span>
          </label>
          <input
            id="actionDue"
            type="text"
            required
            value={dueText}
            onChange={(e) => setDueText(e.target.value)}
            placeholder="Ví dụ: 31/12/2026, Quý 4/2026, Định kỳ hàng tháng..."
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
          {fieldErrors.dueText && (
            <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.dueText}</p>
          )}
          <p className="mt-1 text-[11px] text-text-muted">
            Nhập nguyên văn dạng chữ như Excel; máy chủ sẽ tự động phân tích và xác định ngày hạn (dueDate).
          </p>
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
            {isLoading ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm kế hoạch'}
          </button>
        </div>
      </form>
    </RecordDrawer>
  );
}
