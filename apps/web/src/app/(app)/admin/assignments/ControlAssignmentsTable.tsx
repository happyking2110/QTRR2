'use client';

import React, { useState } from 'react';
import { Save, Check, AlertCircle, ChevronDown, CheckSquare, Square } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type AssignmentControl = components['schemas']['AssignmentControl'];
type UnitSummary = components['schemas']['UnitSummary'];

export interface ControlAssignmentsTableProps {
  controls: AssignmentControl[];
  units: UnitSummary[];
  riskCode: string;
  cycleYear: number;
  canEdit: boolean;
  isArchived: boolean;
  onSaved?: (controlCode: string, newUnits: UnitSummary[]) => void;
}

export function ControlAssignmentsTable({
  controls,
  units,
  riskCode,
  cycleYear,
  canEdit,
  isArchived,
  onSaved,
}: ControlAssignmentsTableProps) {
  // Map of controlCode -> selected unit codes array
  const [selectedUnitsMap, setSelectedUnitsMap] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    controls.forEach((c) => {
      initial[c.code] = c.units.map((u) => u.code);
    });
    return initial;
  });

  // Map of controlCode -> original saved unit codes array
  const [savedUnitsMap, setSavedUnitsMap] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    controls.forEach((c) => {
      initial[c.code] = c.units.map((u) => u.code);
    });
    return initial;
  });

  // Saving state & status messages per row
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [statusMessageMap, setStatusMessageMap] = useState<
    Record<string, { type: 'ok' | 'error'; text: string }>
  >({});

  // Open dropdown per row
  const [openDropdownCode, setOpenDropdownCode] = useState<string | null>(null);

  const toggleUnitForControl = (controlCode: string, unitCode: string) => {
    if (!canEdit || isArchived) return;
    setSelectedUnitsMap((prev) => {
      const current = prev[controlCode] ?? [];
      const updated = current.includes(unitCode)
        ? current.filter((c) => c !== unitCode)
        : [...current, unitCode];
      return { ...prev, [controlCode]: updated };
    });
  };

  const handleSave = async (controlCode: string) => {
    if (!canEdit || isArchived) return;
    const currentCodes = selectedUnitsMap[controlCode] ?? [];

    setSavingMap((prev) => ({ ...prev, [controlCode]: true }));
    setStatusMessageMap((prev) => ({ ...prev, [controlCode]: { type: 'ok', text: '' } }));

    try {
      const updatedUnits = await apiSend<UnitSummary[]>(
        `/api/profiles/${encodeURIComponent(riskCode)}/controls/${encodeURIComponent(controlCode)}/units?cycle=${cycleYear}`,
        {
          method: 'PUT',
          body: { unitCodes: currentCodes },
        },
      );

      setSavedUnitsMap((prev) => ({ ...prev, [controlCode]: currentCodes }));
      setStatusMessageMap((prev) => ({
        ...prev,
        [controlCode]: { type: 'ok', text: 'Đã lưu' },
      }));
      onSaved?.(controlCode, updatedUnits);

      setTimeout(() => {
        setStatusMessageMap((prev) => {
          const next = { ...prev };
          delete next[controlCode];
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
        [controlCode]: { type: 'error', text: message },
      }));
    } finally {
      setSavingMap((prev) => ({ ...prev, [controlCode]: false }));
    }
  };

  const unassignedCount = controls.filter((c) => {
    const codes = savedUnitsMap[c.code] ?? [];
    return codes.length === 0;
  }).length;

  return (
    <div className="space-y-3">
      {/* Table Header Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h2 className="text-base font-bold text-text flex items-center gap-2">
            <span>Bảng Kiểm soát</span>
            <span className="text-xs font-normal text-text-muted">
              ({controls.length} kiểm soát)
            </span>
          </h2>
          <p className="text-xs text-text-muted">
            Một biện pháp kiểm soát có thể gán cho nhiều đơn vị cùng chịu trách nhiệm thực hiện.
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
          <span>Chỉ quản trị viên được gán đơn vị cho bảng Kiểm soát. Bạn đang xem ở chế độ chỉ đọc.</span>
        </div>
      )}

      {/* Table Container */}
      <div className="bg-surface border border-border rounded-card overflow-x-auto shadow-sm">
        <table className="w-full text-xs text-left min-w-[700px]">
          <thead className="bg-bg-page text-text-muted border-b border-border font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4 w-28">Mã</th>
              <th className="py-3 px-4 min-w-[200px]">Mô tả kiểm soát</th>
              <th className="py-3 px-4 w-48">Chủ kiểm soát (gốc)</th>
              <th className="py-3 px-4 min-w-[220px]">Đơn vị thực hiện</th>
              <th className="py-3 px-4 w-28 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {controls.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-muted">
                  Không có biện pháp kiểm soát nào trong hồ sơ này.
                </td>
              </tr>
            ) : (
              controls.map((control) => {
                const currentCodes = selectedUnitsMap[control.code] ?? [];
                const savedCodes = savedUnitsMap[control.code] ?? [];
                const isDirty =
                  JSON.stringify([...currentCodes].sort()) !==
                  JSON.stringify([...savedCodes].sort());
                const isSaving = savingMap[control.code] ?? false;
                const status = statusMessageMap[control.code];
                const isOpen = openDropdownCode === control.code;

                return (
                  <tr
                    key={control.code}
                    className={`hover:bg-bg-page/40 transition-colors ${
                      isDirty ? 'bg-brand-light/30' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-brand-navy align-top">
                      {control.code}
                    </td>
                    <td className="py-3 px-4 text-text align-top leading-relaxed">
                      {control.description}
                    </td>
                    <td className="py-3 px-4 text-text-muted align-top italic">
                      {control.ownerText}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="relative">
                        {/* Dropdown Toggle Button */}
                        <button
                          type="button"
                          disabled={!canEdit || isArchived}
                          onClick={() => setOpenDropdownCode(isOpen ? null : control.code)}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs rounded-control border border-border bg-bg-page text-text hover:bg-surface disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-brand-blue"
                          aria-label={`Chọn đơn vị cho kiểm soát ${control.code}`}
                          title={!canEdit ? 'Chỉ quản trị viên được gán' : undefined}
                        >
                          <span className="truncate">
                            {currentCodes.length === 0
                              ? '— Chưa gán —'
                              : `${currentCodes.length} đơn vị đã chọn`}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" aria-hidden="true" />
                        </button>

                        {/* Dropdown Menu */}
                        {isOpen && (
                          <div className="absolute left-0 top-full mt-1 z-30 w-64 bg-surface border border-border rounded-card shadow-lg p-2 max-h-56 overflow-y-auto space-y-1">
                            <div className="flex items-center justify-between pb-1 border-b border-border text-[11px] text-text-muted font-semibold">
                              <span>Chọn các đơn vị</span>
                              <button
                                type="button"
                                onClick={() => setOpenDropdownCode(null)}
                                className="text-brand-blue hover:underline"
                              >
                                Đóng
                              </button>
                            </div>
                            {units.map((unit) => {
                              const checked = currentCodes.includes(unit.code);
                              return (
                                <button
                                  key={unit.code}
                                  type="button"
                                  onClick={() => toggleUnitForControl(control.code, unit.code)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-control text-xs text-left hover:bg-bg-page focus:outline-none"
                                >
                                  {checked ? (
                                    <CheckSquare className="w-4 h-4 text-brand-navy shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-text-muted shrink-0" />
                                  )}
                                  <span className="truncate text-text">
                                    {unit.name} ({unit.code})
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Chips of currently selected units */}
                        {currentCodes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {currentCodes.map((code) => {
                              const u = units.find((item) => item.code === code);
                              return (
                                <span
                                  key={code}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-brand-light text-brand-navy border border-brand-blue/20"
                                >
                                  {u?.name ?? code}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right align-top">
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          disabled={!canEdit || isArchived || !isDirty || isSaving}
                          onClick={() => handleSave(control.code)}
                          aria-label={`Lưu đơn vị cho ${control.code}`}
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
