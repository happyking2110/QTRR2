'use client';

import React, { useState } from 'react';
import { Save, Check, AlertCircle } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type AssignmentIndicator = components['schemas']['AssignmentIndicator'];
type UnitSummary = components['schemas']['UnitSummary'];
type OwnerUnitResult = components['schemas']['OwnerUnitResult'];

export interface IndicatorAssignmentsTableProps {
  indicators: AssignmentIndicator[];
  units: UnitSummary[];
  riskCode: string;
  cycleYear: number;
  canEdit: boolean;
  isArchived: boolean;
  onSaved?: (indicatorCode: string, ownerUnit: UnitSummary | null) => void;
}

export function IndicatorAssignmentsTable({
  indicators,
  units,
  riskCode,
  cycleYear,
  canEdit,
  isArchived,
  onSaved,
}: IndicatorAssignmentsTableProps) {
  // Map of indicatorCode -> selected unit code (or null)
  const [selectedUnitMap, setSelectedUnitMap] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {};
    indicators.forEach((ind) => {
      initial[ind.code] = ind.ownerUnit ? ind.ownerUnit.code : null;
    });
    return initial;
  });

  // Map of indicatorCode -> saved unit code (or null)
  const [savedUnitMap, setSavedUnitMap] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {};
    indicators.forEach((ind) => {
      initial[ind.code] = ind.ownerUnit ? ind.ownerUnit.code : null;
    });
    return initial;
  });

  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [statusMessageMap, setStatusMessageMap] = useState<
    Record<string, { type: 'ok' | 'error'; text: string }>
  >({});

  const handleUnitChange = (indicatorCode: string, codeVal: string) => {
    if (!canEdit || isArchived) return;
    setSelectedUnitMap((prev) => ({
      ...prev,
      [indicatorCode]: codeVal ? codeVal : null,
    }));
  };

  const handleSave = async (indicatorCode: string) => {
    if (!canEdit || isArchived) return;
    const currentCode = selectedUnitMap[indicatorCode] ?? null;

    setSavingMap((prev) => ({ ...prev, [indicatorCode]: true }));
    setStatusMessageMap((prev) => ({ ...prev, [indicatorCode]: { type: 'ok', text: '' } }));

    try {
      const res = await apiSend<OwnerUnitResult>(
        `/api/profiles/${encodeURIComponent(riskCode)}/indicators/${encodeURIComponent(indicatorCode)}/owner?cycle=${cycleYear}`,
        {
          method: 'PUT',
          body: { unitCode: currentCode },
        },
      );

      setSavedUnitMap((prev) => ({ ...prev, [indicatorCode]: currentCode }));
      setStatusMessageMap((prev) => ({
        ...prev,
        [indicatorCode]: { type: 'ok', text: 'Đã lưu' },
      }));
      onSaved?.(indicatorCode, res.ownerUnit);

      setTimeout(() => {
        setStatusMessageMap((prev) => {
          const next = { ...prev };
          delete next[indicatorCode];
          return next;
        });
      }, 3000);
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : (err as Error).message || 'Lỗi khi lưu đơn vị';
      setStatusMessageMap((prev) => ({
        ...prev,
        [indicatorCode]: { type: 'error', text: message },
      }));
    } finally {
      setSavingMap((prev) => ({ ...prev, [indicatorCode]: false }));
    }
  };

  const unassignedCount = indicators.filter((ind) => {
    const code = savedUnitMap[ind.code];
    return !code;
  }).length;

  return (
    <div className="space-y-3">
      {/* Header Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h2 className="text-base font-bold text-text flex items-center gap-2">
            <span>Bảng Chỉ số (KRI / KCI)</span>
            <span className="text-xs font-normal text-text-muted">
              ({indicators.length} chỉ số)
            </span>
          </h2>
          <p className="text-xs text-text-muted">
            Mỗi chỉ số rủi ro KRI/KCI được gán cho duy nhất một đơn vị chủ trì theo dõi và báo cáo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unassignedCount > 0 ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-state-warn-bg text-state-warn-line border border-state-warn-line/40">
              Chưa gán: {unassignedCount}
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-state-ok-bg text-state-ok-line border border-state-ok-line/40">
              Tất cả đã được gán
            </span>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="p-2.5 rounded-control bg-bg-page border border-border text-xs text-text-muted flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-brand-blue shrink-0" aria-hidden="true" />
          <span>Chỉ quản trị viên được gán đơn vị cho bảng Chỉ số. Bạn đang xem ở chế độ chỉ đọc.</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-border rounded-card overflow-x-auto shadow-sm">
        <table className="w-full text-xs text-left min-w-[700px]">
          <thead className="bg-bg-page text-text-muted border-b border-border font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4 w-28">Mã</th>
              <th className="py-3 px-4 w-24">Loại</th>
              <th className="py-3 px-4 min-w-[240px]">Tên chỉ số</th>
              <th className="py-3 px-4 min-w-[220px]">Đơn vị phụ trách</th>
              <th className="py-3 px-4 w-28 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {indicators.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-muted">
                  Không có chỉ số nào trong hồ sơ này.
                </td>
              </tr>
            ) : (
              indicators.map((ind) => {
                const currentCode = selectedUnitMap[ind.code] ?? '';
                const savedCode = savedUnitMap[ind.code] ?? '';
                const isDirty = currentCode !== savedCode;
                const isSaving = savingMap[ind.code] ?? false;
                const status = statusMessageMap[ind.code];

                return (
                  <tr
                    key={ind.code}
                    className={`hover:bg-bg-page/40 transition-colors ${
                      isDirty ? 'bg-brand-light/30' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-brand-navy align-top">
                      {ind.code}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded font-mono font-semibold uppercase text-[10px] ${
                          ind.kind === 'kri'
                            ? 'bg-brand-navy text-surface'
                            : 'bg-brand-light text-brand-navy'
                        }`}
                      >
                        {ind.kind.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-text align-top leading-relaxed">
                      {ind.name}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <select
                        aria-label={`Đơn vị phụ trách cho chỉ số ${ind.code}`}
                        disabled={!canEdit || isArchived}
                        value={currentCode}
                        onChange={(e) => handleUnitChange(ind.code, e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-control border border-border bg-bg-page text-text disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-brand-blue"
                        title={!canEdit ? 'Chỉ quản trị viên được gán' : undefined}
                      >
                        <option value="">— Chưa gán —</option>
                        {units.map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.name} ({u.code})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right align-top">
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          disabled={!canEdit || isArchived || !isDirty || isSaving}
                          onClick={() => handleSave(ind.code)}
                          aria-label={`Lưu đơn vị cho ${ind.code}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-control text-xs font-medium bg-brand-navy text-surface hover:bg-brand-navy-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue"
                          title={!canEdit ? 'Chỉ quản trị viên được gán' : undefined}
                        >
                          <Save className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isSaving ? 'Lưu...' : 'Lưu'}</span>
                        </button>

                        {isDirty && !status && (
                          <span className="text-[10px] text-state-warn-line font-medium">
                            Chưa lưu
                          </span>
                        )}

                        {status?.type === 'ok' && (
                          <span className="text-[10px] text-state-ok-line font-medium flex items-center gap-0.5">
                            <Check className="w-3 h-3" />
                            <span>{status.text}</span>
                          </span>
                        )}

                        {status?.type === 'error' && (
                          <span className="text-[10px] text-state-bad-line max-w-[120px] text-right truncate">
                            {status.text}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
