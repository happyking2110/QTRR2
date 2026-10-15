'use client';

import React, { useState } from 'react';
import { Save, Check } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type AssignmentTask = components['schemas']['AssignmentTask'];
type UnitSummary = components['schemas']['UnitSummary'];
type TaskUnitResult = components['schemas']['TaskUnitResult'];

export interface TaskAssignmentsTableProps {
  tasks: AssignmentTask[];
  units: UnitSummary[];
  canEdit: boolean;
  isArchived: boolean;
  onSaved?: (taskId: string, unit: UnitSummary | null) => void;
}

export function TaskAssignmentsTable({
  tasks,
  units,
  canEdit,
  isArchived,
  onSaved,
}: TaskAssignmentsTableProps) {
  // Map of taskId -> selected unit code (or null)
  const [selectedUnitMap, setSelectedUnitMap] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {};
    tasks.forEach((t) => {
      initial[t.id] = t.unit ? t.unit.code : null;
    });
    return initial;
  });

  // Map of taskId -> saved unit code (or null)
  const [savedUnitMap, setSavedUnitMap] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {};
    tasks.forEach((t) => {
      initial[t.id] = t.unit ? t.unit.code : null;
    });
    return initial;
  });

  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [statusMessageMap, setStatusMessageMap] = useState<
    Record<string, { type: 'ok' | 'error'; text: string }>
  >({});

  const handleUnitChange = (taskId: string, codeVal: string) => {
    if (!canEdit || isArchived) return;
    setSelectedUnitMap((prev) => ({
      ...prev,
      [taskId]: codeVal ? codeVal : null,
    }));
  };

  const handleSave = async (taskId: string) => {
    if (!canEdit || isArchived) return;
    const currentCode = selectedUnitMap[taskId] ?? null;

    setSavingMap((prev) => ({ ...prev, [taskId]: true }));
    setStatusMessageMap((prev) => ({ ...prev, [taskId]: { type: 'ok', text: '' } }));

    try {
      const res = await apiSend<TaskUnitResult>(`/api/tasks/${encodeURIComponent(taskId)}/unit`, {
        method: 'PUT',
        body: { unitCode: currentCode },
      });

      setSavedUnitMap((prev) => ({ ...prev, [taskId]: currentCode }));
      setStatusMessageMap((prev) => ({
        ...prev,
        [taskId]: { type: 'ok', text: 'Đã lưu' },
      }));
      onSaved?.(taskId, res.unit);

      setTimeout(() => {
        setStatusMessageMap((prev) => {
          const next = { ...prev };
          delete next[taskId];
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
        [taskId]: { type: 'error', text: message },
      }));
    } finally {
      setSavingMap((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const unassignedCount = tasks.filter((t) => {
    const code = savedUnitMap[t.id];
    return !code;
  }).length;

  return (
    <div className="space-y-3">
      {/* Header Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h2 className="text-base font-bold text-text flex items-center gap-2">
            <span>Bảng Đầu việc (Kế hoạch hành động)</span>
            <span className="text-xs font-normal text-text-muted">
              ({tasks.length} đầu việc)
            </span>
          </h2>
          <p className="text-xs text-text-muted">
            Mỗi đầu việc cụ thể được phân công cho một đơn vị chịu trách nhiệm thực thi và báo cáo tiến độ.
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

      {/* Table */}
      <div className="bg-surface border border-border rounded-card overflow-x-auto shadow-sm">
        <table className="w-full text-xs text-left min-w-[700px]">
          <thead className="bg-bg-page text-text-muted border-b border-border font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4 w-24">Mã KH</th>
              <th className="py-3 px-4 min-w-[200px]">Tên đầu việc</th>
              <th className="py-3 px-4 w-48">Trách nhiệm (gốc)</th>
              <th className="py-3 px-4 min-w-[220px]">Đơn vị thực hiện</th>
              <th className="py-3 px-4 w-28 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-muted">
                  Không có đầu việc nào trong hồ sơ này.
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const currentCode = selectedUnitMap[task.id] ?? '';
                const savedCode = savedUnitMap[task.id] ?? '';
                const isDirty = currentCode !== savedCode;
                const isSaving = savingMap[task.id] ?? false;
                const status = statusMessageMap[task.id];

                return (
                  <tr
                    key={task.id}
                    className={`hover:bg-bg-page/40 transition-colors ${
                      isDirty ? 'bg-brand-light/30' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-brand-navy align-top">
                      {task.actionCode}
                    </td>
                    <td className="py-3 px-4 text-text align-top leading-relaxed">
                      {task.name}
                    </td>
                    <td className="py-3 px-4 text-text-muted align-top italic">
                      {task.responsibilityText}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <select
                        aria-label={`Đơn vị thực hiện cho đầu việc ${task.actionCode}`}
                        disabled={!canEdit || isArchived}
                        value={currentCode}
                        onChange={(e) => handleUnitChange(task.id, e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-control border border-border bg-bg-page text-text disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-brand-blue"
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
                          onClick={() => handleSave(task.id)}
                          aria-label={`Lưu đơn vị cho ${task.actionCode}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-control text-xs font-medium bg-brand-navy text-surface hover:bg-brand-navy-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue"
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
