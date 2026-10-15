'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RecordDrawer } from '@/components/data/RecordDrawer';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ReferencedAlert } from '@/components/ui/ReferencedAlert';

type ScaleLevel = components['schemas']['ScaleLevel'];
type CreateImpactRequest = components['schemas']['CreateImpactRequest'];
type ImpactInput = components['schemas']['ImpactInput'];

export interface ImpactFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskCode: string;
  suggestedCode?: string;
  impactLevels?: ScaleLevel[];
  initialImpact?: {
    code: string;
    group: string;
    description: string;
    level: string;
  } | null;
  cycle?: number;
  onSuccess?: () => void;
}

const IMPACT_GROUP_SUGGESTIONS = ['Tài chính', 'Hoạt động', 'Danh tiếng', 'Tuân thủ'];
const DEFAULT_IMPACT_LEVELS = ['Rất thấp', 'Thấp', 'Trung bình', 'Nghiêm trọng', 'Rất nghiêm trọng'];
const EMPTY_SCALE_LEVELS: ScaleLevel[] = [];

export function ImpactFormDrawer({
  open,
  onOpenChange,
  riskCode,
  suggestedCode = '',
  impactLevels = EMPTY_SCALE_LEVELS,
  initialImpact,
  cycle,
  onSuccess,
}: ImpactFormDrawerProps) {
  const router = useRouter();
  const isEditing = Boolean(initialImpact);

  const [code, setCode] = useState(initialImpact?.code || suggestedCode || `${riskCode}.AH01`);
  const [group, setGroup] = useState(initialImpact?.group || 'Tài chính');
  const [description, setDescription] = useState(initialImpact?.description || '');
  const [level, setLevel] = useState(initialImpact?.level || 'Nghiêm trọng');

  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [apiErrorObj, setApiErrorObj] = useState<{
    code?: string;
    message?: string;
    details?: unknown;
  } | null>(null);

  useEffect(() => {
    if (initialImpact) {
      setCode(initialImpact.code);
      setGroup(initialImpact.group);
      setDescription(initialImpact.description);
      setLevel(initialImpact.level);
    } else {
      setCode(suggestedCode || `${riskCode}.AH01`);
      setGroup('Tài chính');
      setDescription('');
      setLevel(impactLevels[3]?.label || 'Nghiêm trọng');
    }
    setFieldErrors({});
    setGeneralError(null);
    setApiErrorObj(null);
  }, [initialImpact, suggestedCode, riskCode, impactLevels, open]);

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
        errors.code = 'Vui lòng nhập mã ảnh hưởng';
      } else if (!/^[A-Z0-9]+\.[A-Z0-9]+\.(NN|AH|KS|KH|KRI|KCI)[0-9]{2,3}$/.test(trimmedCode)) {
        errors.code = `Mã ảnh hưởng phải bắt đầu bằng ${riskCode}.AH... (ví dụ ${riskCode}.AH04)`;
      }
    }
    if (!group.trim()) errors.group = 'Vui lòng nhập hoặc chọn nhóm ảnh hưởng';
    if (!description.trim()) errors.description = 'Vui lòng nhập mô tả ảnh hưởng';
    if (!level.trim()) errors.level = 'Vui lòng chọn mức ảnh hưởng';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsLoading(false);
      return;
    }

    try {
      if (isEditing) {
        const body: ImpactInput = {
          group: group.trim(),
          description: description.trim(),
          level: level.trim(),
        };
        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>(
          'PUT',
          `/api/profiles/${encodeURIComponent(riskCode)}/impacts/${encodeURIComponent(initialImpact!.code)}${cycleQuery}`,
          body,
        );
      } else {
        const body: CreateImpactRequest = {
          code: trimmedCode,
          group: group.trim(),
          description: description.trim(),
          level: level.trim(),
        };
        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>(
          'POST',
          `/api/profiles/${encodeURIComponent(riskCode)}/impacts${cycleQuery}`,
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
            code: err.message || 'Mã ảnh hưởng đã tồn tại trong chu kỳ.',
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
      title={isEditing ? `Sửa ảnh hưởng ${initialImpact?.code}` : `Thêm ảnh hưởng (${riskCode})`}
      description="Hậu quả hoặc tác động tiềm ẩn khi rủi ro phát sinh."
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {generalError && (
          <div role="alert" className="rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3 text-state-bad-fg">
            {generalError}
          </div>
        )}

        <ReferencedAlert error={apiErrorObj} />

        <div>
          <label htmlFor="impactCode" className="block font-semibold text-text mb-1">
            Mã ảnh hưởng <span className="text-state-bad-fg">*</span>
          </label>
          <input
            id="impactCode"
            type="text"
            required
            disabled={isEditing}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={`Ví dụ: ${riskCode}.AH04`}
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
            <p className="mt-0.5 text-[11px] text-text-muted">Mã ảnh hưởng không thể thay đổi sau khi tạo.</p>
          )}
        </div>

        <div>
          <label htmlFor="impactGroup" className="block font-semibold text-text mb-1">
            Nhóm ảnh hưởng <span className="text-state-bad-fg">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {IMPACT_GROUP_SUGGESTIONS.map((sug) => (
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
            id="impactGroup"
            type="text"
            required
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="Tài chính, Hoạt động, Danh tiếng, Tuân thủ..."
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
          {fieldErrors.group && (
            <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.group}</p>
          )}
        </div>

        <div>
          <label htmlFor="impactLevel" className="block font-semibold text-text mb-1">
            Mức tác động (thang nhiệt) <span className="text-state-bad-fg">*</span>
          </label>
          <select
            id="impactLevel"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="w-full rounded-control border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          >
            {impactLevels.length > 0 ? (
              impactLevels.map((lvl) => (
                <option key={lvl.score} value={lvl.label}>
                  {lvl.score} - {lvl.label}
                </option>
              ))
            ) : (
              DEFAULT_IMPACT_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))
            )}
          </select>
          {fieldErrors.level && (
            <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.level}</p>
          )}
        </div>

        <div>
          <label htmlFor="impactDesc" className="block font-semibold text-text mb-1">
            Mô tả ảnh hưởng <span className="text-state-bad-fg">*</span>
          </label>
          <textarea
            id="impactDesc"
            rows={4}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả cụ thể thiệt hại hoặc ảnh hưởng..."
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
            {isLoading ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm ảnh hưởng'}
          </button>
        </div>
      </form>
    </RecordDrawer>
  );
}
