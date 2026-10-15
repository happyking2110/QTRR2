'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RecordDrawer } from '@/components/data/RecordDrawer';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ReferencedAlert } from '@/components/ui/ReferencedAlert';

type CreateCauseRequest = components['schemas']['CreateCauseRequest'];
type CauseInput = components['schemas']['CauseInput'];

export interface CauseFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskCode: string;
  suggestedCode?: string;
  initialCause?: {
    code: string;
    group: string;
    description: string;
  } | null;
  cycle?: number;
  onSuccess?: () => void;
}

const CAUSE_GROUP_SUGGESTIONS = ['Hệ thống', 'Quy trình', 'Con người', 'Khách quan'];

export function CauseFormDrawer({
  open,
  onOpenChange,
  riskCode,
  suggestedCode = '',
  initialCause,
  cycle,
  onSuccess,
}: CauseFormDrawerProps) {
  const router = useRouter();
  const isEditing = Boolean(initialCause);

  const [code, setCode] = useState(initialCause?.code || suggestedCode || `${riskCode}.NN01`);
  const [group, setGroup] = useState(initialCause?.group || 'Hệ thống');
  const [description, setDescription] = useState(initialCause?.description || '');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [apiErrorObj, setApiErrorObj] = useState<{
    code?: string;
    message?: string;
    details?: unknown;
  } | null>(null);

  useEffect(() => {
    if (initialCause) {
      setCode(initialCause.code);
      setGroup(initialCause.group);
      setDescription(initialCause.description);
    } else {
      setCode(suggestedCode || `${riskCode}.NN01`);
      setGroup('Hệ thống');
      setDescription('');
    }
    setFieldErrors({});
    setGeneralError(null);
    setApiErrorObj(null);
  }, [initialCause, suggestedCode, riskCode, open]);

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
        errors.code = 'Vui lòng nhập mã nguyên nhân';
      } else if (!/^[A-Z0-9]+\.[A-Z0-9]+\.(NN|AH|KS|KH|KRI|KCI)[0-9]{2,3}$/.test(trimmedCode)) {
        errors.code = `Mã nguyên nhân phải bắt đầu bằng ${riskCode}.NN... (ví dụ ${riskCode}.NN06)`;
      }
    }
    if (!group.trim()) errors.group = 'Vui lòng nhập hoặc chọn nhóm nguyên nhân';
    if (!description.trim()) errors.description = 'Vui lòng nhập mô tả nguyên nhân';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsLoading(false);
      return;
    }

    try {
      if (isEditing) {
        const body: CauseInput = {
          group: group.trim(),
          description: description.trim(),
        };
        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>(
          'PUT',
          `/api/profiles/${encodeURIComponent(riskCode)}/causes/${encodeURIComponent(initialCause!.code)}${cycleQuery}`,
          body,
        );
      } else {
        const body: CreateCauseRequest = {
          code: trimmedCode,
          group: group.trim(),
          description: description.trim(),
        };
        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>(
          'POST',
          `/api/profiles/${encodeURIComponent(riskCode)}/causes${cycleQuery}`,
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
            code: err.message || 'Mã nguyên nhân đã tồn tại trong chu kỳ.',
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
      title={isEditing ? `Sửa nguyên nhân ${initialCause?.code}` : `Thêm nguyên nhân (${riskCode})`}
      description="Nguyên nhân gây ra hoặc làm tăng rủi ro trọng yếu."
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {generalError && (
          <div role="alert" className="rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3 text-state-bad-fg">
            {generalError}
          </div>
        )}

        <ReferencedAlert error={apiErrorObj} />

        <div>
          <label htmlFor="causeCode" className="block font-semibold text-text mb-1">
            Mã nguyên nhân <span className="text-state-bad-fg">*</span>
          </label>
          <input
            id="causeCode"
            type="text"
            required
            disabled={isEditing}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={`Ví dụ: ${riskCode}.NN06`}
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
            <p className="mt-0.5 text-[11px] text-text-muted">Mã nguyên nhân không thể thay đổi sau khi tạo.</p>
          )}
        </div>

        <div>
          <label htmlFor="causeGroup" className="block font-semibold text-text mb-1">
            Nhóm nguyên nhân <span className="text-state-bad-fg">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {CAUSE_GROUP_SUGGESTIONS.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => setGroup(sug)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
                  group === sug
                    ? 'bg-brand-blue text-white border-brand-blue'
                    : 'bg-surface text-text-muted border-border hover:bg-bg-tint'
                }`}
              >
                {sug}
              </button>
            ))}
          </div>
          <input
            id="causeGroup"
            type="text"
            required
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="Hệ thống, Quy trình, Con người, Khách quan..."
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
          {fieldErrors.group && (
            <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.group}</p>
          )}
        </div>

        <div>
          <label htmlFor="causeDesc" className="block font-semibold text-text mb-1">
            Mô tả nguyên nhân <span className="text-state-bad-fg">*</span>
          </label>
          <textarea
            id="causeDesc"
            rows={4}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả cụ thể nguyên nhân..."
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
          {fieldErrors.description && (
            <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.description}</p>
          )}
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
            {isLoading ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm nguyên nhân'}
          </button>
        </div>
      </form>
    </RecordDrawer>
  );
}
