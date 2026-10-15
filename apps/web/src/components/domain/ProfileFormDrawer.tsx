'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RecordDrawer } from '@/components/data/RecordDrawer';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ReferencedAlert } from '@/components/ui/ReferencedAlert';

type Heatmap = components['schemas']['Heatmap'];
type ScaleLevel = components['schemas']['ScaleLevel'];
type CreateProfileRequest = components['schemas']['CreateProfileRequest'];
type ProfileInput = components['schemas']['ProfileInput'];

export interface ProfileFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heatmap?: Heatmap | null;
  /** Nếu có, là chế độ Sửa; nếu undefined, là chế độ Thêm mới */
  initialProfile?: {
    riskCode: string;
    hsrrCode: string;
    name: string;
    riskType: string;
    riskZone: string;
    riskGroup: string;
    owner: string;
    relatedActivity?: string;
    preparedByUnit?: string;
    description?: string;
    inherent: {
      impactLabel: string;
      likelihoodLabel: string;
      levelLabel: string;
    };
  } | null;
  cycle?: number;
  onSuccess?: (riskCode: string) => void;
}

const DEFAULT_LEVEL_LABELS = ['Cao', 'Trung bình', 'Thấp'];
const EMPTY_SCALE_LEVELS: ScaleLevel[] = [];

export function ProfileFormDrawer({
  open,
  onOpenChange,
  heatmap,
  cycle,
  initialProfile,
  onSuccess,
}: ProfileFormDrawerProps) {
  const router = useRouter();
  const isEditing = Boolean(initialProfile);

  const [riskCode, setRiskCode] = useState(initialProfile?.riskCode || '');
  const [hsrrCode, setHsrrCode] = useState(initialProfile?.hsrrCode || '');
  const [name, setName] = useState(initialProfile?.name || '');
  const [riskType, setRiskType] = useState(initialProfile?.riskType || '');
  const [riskZone, setRiskZone] = useState(initialProfile?.riskZone || '');
  const [riskGroup, setRiskGroup] = useState(initialProfile?.riskGroup || '');
  const [owner, setOwner] = useState(initialProfile?.owner || '');
  const [relatedActivity, setRelatedActivity] = useState(initialProfile?.relatedActivity || '');
  const [preparedByUnit, setPreparedByUnit] = useState(initialProfile?.preparedByUnit || '');
  const [description, setDescription] = useState(initialProfile?.description || '');
  const [impactLabel, setImpactLabel] = useState(initialProfile?.inherent.impactLabel || '');
  const [likelihoodLabel, setLikelihoodLabel] = useState(initialProfile?.inherent.likelihoodLabel || '');
  const [levelLabel, setLevelLabel] = useState(initialProfile?.inherent.levelLabel || 'Cao');

  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [apiErrorObj, setApiErrorObj] = useState<{
    code?: string;
    message?: string;
    details?: unknown;
  } | null>(null);

  const impactLevels: ScaleLevel[] = heatmap?.impactLevels || EMPTY_SCALE_LEVELS;
  const likelihoodLevels: ScaleLevel[] = heatmap?.likelihoodLevels || EMPTY_SCALE_LEVELS;

  useEffect(() => {
    if (initialProfile) {
      setRiskCode(initialProfile.riskCode);
      setHsrrCode(initialProfile.hsrrCode);
      setName(initialProfile.name);
      setRiskType(initialProfile.riskType);
      setRiskZone(initialProfile.riskZone);
      setRiskGroup(initialProfile.riskGroup);
      setOwner(initialProfile.owner);
      setRelatedActivity(initialProfile.relatedActivity || '');
      setPreparedByUnit(initialProfile.preparedByUnit || '');
      setDescription(initialProfile.description || '');
      setImpactLabel(initialProfile.inherent.impactLabel);
      setLikelihoodLabel(initialProfile.inherent.likelihoodLabel);
      setLevelLabel(initialProfile.inherent.levelLabel);
    } else {
      setRiskCode('');
      setHsrrCode('');
      setName('');
      setRiskType('');
      setRiskZone('');
      setRiskGroup('');
      setOwner('');
      setRelatedActivity('');
      setPreparedByUnit('');
      setDescription('');
      setImpactLabel(impactLevels[0]?.label || '');
      setLikelihoodLabel(likelihoodLevels[0]?.label || '');
      setLevelLabel('Cao');
    }
    setFieldErrors({});
    setGeneralError(null);
    setApiErrorObj(null);
  }, [initialProfile, open, impactLevels, likelihoodLevels]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFieldErrors({});
    setGeneralError(null);
    setApiErrorObj(null);

    const trimmedRiskCode = riskCode.trim().toUpperCase();

    // Frontend validation tối thiểu theo hợp đồng
    const errors: Record<string, string> = {};
    if (!isEditing) {
      if (!trimmedRiskCode) {
        errors.riskCode = 'Vui lòng nhập mã hồ sơ';
      } else if (!/^[A-Z0-9]+\.[A-Z0-9]+$/.test(trimmedRiskCode)) {
        errors.riskCode = 'Mã rủi ro phải có dạng [A-Z0-9]+.[A-Z0-9]+ (ví dụ HD11.R28)';
      }
    }
    if (!name.trim()) errors.name = 'Vui lòng nhập tên rủi ro';
    if (!impactLabel) errors.impactLabel = 'Vui lòng chọn mức ảnh hưởng';
    if (!likelihoodLabel) errors.likelihoodLabel = 'Vui lòng chọn mức khả năng';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsLoading(false);
      return;
    }

    try {
      if (isEditing) {
        const body: ProfileInput = {
          hsrrCode: hsrrCode.trim() || `HSRRTY_MBF_${initialProfile!.riskCode}`,
          name: name.trim(),
          riskType: riskType.trim(),
          riskZone: riskZone.trim(),
          riskGroup: riskGroup.trim(),
          owner: owner.trim(),
          relatedActivity: relatedActivity.trim(),
          preparedByUnit: preparedByUnit.trim(),
          description: description.trim(),
          inherent: {
            impactLabel,
            likelihoodLabel,
            levelLabel,
          },
        };

        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>(
          'PUT',
          `/api/profiles/${encodeURIComponent(initialProfile!.riskCode)}${cycleQuery}`,
          body,
        );
        onOpenChange(false);
        router.refresh();
        onSuccess?.(initialProfile!.riskCode);
      } else {
        const body: CreateProfileRequest = {
          riskCode: trimmedRiskCode,
          hsrrCode: hsrrCode.trim() || `HSRRTY_MBF_${trimmedRiskCode}`,
          name: name.trim(),
          riskType: riskType.trim(),
          riskZone: riskZone.trim(),
          riskGroup: riskGroup.trim(),
          owner: owner.trim(),
          relatedActivity: relatedActivity.trim(),
          preparedByUnit: preparedByUnit.trim(),
          description: description.trim(),
          inherent: {
            impactLabel,
            likelihoodLabel,
            levelLabel,
          },
        };

        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend<void>('POST', `/api/profiles${cycleQuery}`, body);
        onOpenChange(false);
        router.refresh();
        onSuccess?.(trimmedRiskCode);
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === 'CONFLICT') {
          setFieldErrors((prev) => ({
            ...prev,
            riskCode: err.message || 'Mã rủi ro đã tồn tại trong chu kỳ.',
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
      title={isEditing ? `Sửa hồ sơ rủi ro ${initialProfile?.riskCode}` : 'Thêm hồ sơ rủi ro trọng yếu'}
      description={
        isEditing
          ? 'Cập nhật thông tin rủi ro và đánh giá mức rủi ro tiềm ẩn ban đầu.'
          : 'Tạo hồ sơ rủi ro mới trong chu kỳ hiện tại.'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {generalError && (
          <div
            role="alert"
            className="rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3 text-state-bad-fg"
          >
            {generalError}
          </div>
        )}

        <ReferencedAlert error={apiErrorObj} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="riskCode" className="block font-semibold text-text mb-1">
              Mã rủi ro (riskCode) <span className="text-state-bad-fg">*</span>
            </label>
            <input
              id="riskCode"
              type="text"
              required
              disabled={isEditing}
              placeholder="Ví dụ: HD11.R28"
              value={riskCode}
              onChange={(e) => setRiskCode(e.target.value.toUpperCase())}
              className="w-full rounded-control border border-border px-3 py-2 text-text font-mono uppercase disabled:bg-bg-tint disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
            {fieldErrors.riskCode && (
              <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.riskCode}</p>
            )}
            {isEditing && (
              <p className="mt-0.5 text-[11px] text-text-muted">Mã rủi ro không thể thay đổi sau khi tạo.</p>
            )}
          </div>

          <div>
            <label htmlFor="hsrrCode" className="block font-semibold text-text mb-1">
              Mã HSRR đầy đủ
            </label>
            <input
              id="hsrrCode"
              type="text"
              placeholder={`HSRRTY_MBF_${riskCode || 'HD11.R...'}`}
              value={hsrrCode}
              onChange={(e) => setHsrrCode(e.target.value)}
              className="w-full rounded-control border border-border px-3 py-2 text-text font-mono focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
            {fieldErrors.hsrrCode && (
              <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.hsrrCode}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="name" className="block font-semibold text-text mb-1">
            Tên rủi ro <span className="text-state-bad-fg">*</span>
          </label>
          <input
            id="name"
            type="text"
            required
            placeholder="Tên tóm tắt hồ sơ rủi ro"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
          {fieldErrors.name && (
            <p className="mt-1 text-state-bad-fg font-medium">{fieldErrors.name}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="riskType" className="block font-semibold text-text mb-1">
              Loại rủi ro
            </label>
            <input
              id="riskType"
              type="text"
              placeholder="Rủi ro vận hành"
              value={riskType}
              onChange={(e) => setRiskType(e.target.value)}
              className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label htmlFor="riskZone" className="block font-semibold text-text mb-1">
              Vùng rủi ro
            </label>
            <input
              id="riskZone"
              type="text"
              placeholder="Khối Cơ quan TCT"
              value={riskZone}
              onChange={(e) => setRiskZone(e.target.value)}
              className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label htmlFor="riskGroup" className="block font-semibold text-text mb-1">
              Nhóm rủi ro
            </label>
            <input
              id="riskGroup"
              type="text"
              placeholder="Công nghệ thông tin"
              value={riskGroup}
              onChange={(e) => setRiskGroup(e.target.value)}
              className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="owner" className="block font-semibold text-text mb-1">
              Chủ rủi ro
            </label>
            <input
              id="owner"
              type="text"
              placeholder="Ban Công nghệ thông tin"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label htmlFor="preparedByUnit" className="block font-semibold text-text mb-1">
              Đơn vị lập
            </label>
            <input
              id="preparedByUnit"
              type="text"
              placeholder="Ban CNTT"
              value={preparedByUnit}
              onChange={(e) => setPreparedByUnit(e.target.value)}
              className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
        </div>

        <div>
          <label htmlFor="relatedActivity" className="block font-semibold text-text mb-1">
            Hoạt động liên quan
          </label>
          <input
            id="relatedActivity"
            type="text"
            placeholder="Vận hành hệ thống CNTT"
            value={relatedActivity}
            onChange={(e) => setRelatedActivity(e.target.value)}
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
        </div>

        <div>
          <label htmlFor="description" className="block font-semibold text-text mb-1">
            Mô tả chi tiết rủi ro
          </label>
          <textarea
            id="description"
            rows={3}
            placeholder="Nội dung mô tả rủi ro chi tiết..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
        </div>

        {/* Đánh giá rủi ro tiềm ẩn (Inherent) */}
        <div className="rounded-control border border-border/80 bg-bg-tint/30 p-3 space-y-3">
          <div className="font-semibold text-text flex items-center justify-between">
            <span>Đánh giá mức rủi ro tiềm ẩn</span>
            <span className="text-[11px] text-text-muted font-normal">Theo thang điểm nhiệt</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="likelihoodLabel" className="block font-medium text-text mb-1">
                Khả năng xảy ra <span className="text-state-bad-fg">*</span>
              </label>
              <select
                id="likelihoodLabel"
                value={likelihoodLabel}
                onChange={(e) => setLikelihoodLabel(e.target.value)}
                className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
              >
                {likelihoodLevels.length > 0 ? (
                  likelihoodLevels.map((lvl) => (
                    <option key={lvl.score} value={lvl.label}>
                      {lvl.score} - {lvl.label}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Hiếm khi xảy ra">1 - Hiếm khi xảy ra</option>
                    <option value="Ít khi xảy ra">2 - Ít khi xảy ra</option>
                    <option value="Có thể xảy ra">3 - Có thể xảy ra</option>
                    <option value="Nhiều khả năng xảy ra">4 - Nhiều khả năng xảy ra</option>
                    <option value="Gần như chắc chắn xảy ra">5 - Gần như chắc chắn xảy ra</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label htmlFor="impactLabel" className="block font-medium text-text mb-1">
                Mức độ tác động <span className="text-state-bad-fg">*</span>
              </label>
              <select
                id="impactLabel"
                value={impactLabel}
                onChange={(e) => setImpactLabel(e.target.value)}
                className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
              >
                {impactLevels.length > 0 ? (
                  impactLevels.map((lvl) => (
                    <option key={lvl.score} value={lvl.label}>
                      {lvl.score} - {lvl.label}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Rất thấp">1 - Rất thấp</option>
                    <option value="Thấp">2 - Thấp</option>
                    <option value="Trung bình">3 - Trung bình</option>
                    <option value="Nghiêm trọng">4 - Nghiêm trọng</option>
                    <option value="Rất nghiêm trọng">5 - Rất nghiêm trọng</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label htmlFor="levelLabel" className="block font-medium text-text mb-1">
                Mức rủi ro <span className="text-state-bad-fg">*</span>
              </label>
              <select
                id="levelLabel"
                value={levelLabel}
                onChange={(e) => setLevelLabel(e.target.value)}
                className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
              >
                {DEFAULT_LEVEL_LABELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
            {isLoading ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm hồ sơ'}
          </button>
        </div>
      </form>
    </RecordDrawer>
  );
}
