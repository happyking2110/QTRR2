'use client';

import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, AlertCircle } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type TaskInput = components['schemas']['TaskInput'];

export interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskCode: string;
  actionCode: string;
  units?: { code: string; name: string }[];
  initialTask?: {
    id: string;
    name: string;
    unitCode: string | null;
    dueDate: string | null;
  } | null;
  cycle?: number;
  onSuccess?: () => void;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  riskCode,
  actionCode,
  units = [],
  initialTask,
  cycle,
  onSuccess,
}: TaskFormDialogProps) {
  const isEditing = Boolean(initialTask);
  const [name, setName] = useState(initialTask?.name || '');
  const [unitCode, setUnitCode] = useState(initialTask?.unitCode || '');
  const [dueDate, setDueDate] = useState(initialTask?.dueDate || '');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<{
    code?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setApiError(null);
      if (initialTask) {
        setName(initialTask.name || '');
        setUnitCode(initialTask.unitCode || '');
        setDueDate(initialTask.dueDate ? initialTask.dueDate.slice(0, 10) : '');
      } else {
        setName('');
        setUnitCode('');
        setDueDate('');
      }
    }
  }, [open, initialTask]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setApiError(null);

    const payload: TaskInput = {
      name: name.trim(),
      unitCode: unitCode.trim() ? unitCode.trim() : null,
      dueDate: dueDate ? dueDate : null,
    };

    try {
      if (isEditing && initialTask) {
        await apiSend('PUT', `/api/tasks/${encodeURIComponent(initialTask.id)}`, payload);
      } else {
        const cycleQuery = cycle ? `?cycle=${cycle}` : '';
        await apiSend(
          'POST',
          `/api/profiles/${encodeURIComponent(riskCode)}/actions/${encodeURIComponent(actionCode)}/tasks${cycleQuery}`,
          payload,
        );
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setApiError({
          code: err.code,
          message: err.message,
        });
      } else {
        setApiError({
          code: 'INTERNAL',
          message: 'Không thể lưu đầu việc do xảy ra lỗi máy chủ.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface p-6 shadow-2xl transition-all animate-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between pb-3 border-b border-border">
            <div>
              <Dialog.Title className="text-base font-bold text-text">
                {isEditing ? 'Sửa đầu việc' : `Thêm đầu việc cho ${actionCode}`}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-text-muted">
                Đầu việc chi tiết phục vụ theo dõi tiến độ và báo cáo định kỳ.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-control p-1 text-text-muted hover:text-text transition-colors"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          {apiError && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3 text-xs text-state-bad-fg"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold">{apiError.code || 'Lỗi'}</p>
                <p className="mt-0.5">{apiError.message}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
            <div>
              <label htmlFor="taskName" className="block font-semibold text-text mb-1">
                Tên đầu việc <span className="text-state-bad-fg">*</span>
              </label>
              <textarea
                id="taskName"
                rows={2}
                required
                maxLength={500}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên đầu việc cụ thể..."
                className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="taskUnit" className="block font-semibold text-text mb-1">
                  Đơn vị phụ trách
                </label>
                <select
                  id="taskUnit"
                  value={unitCode}
                  onChange={(e) => setUnitCode(e.target.value)}
                  className="w-full rounded-control border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
                >
                  <option value="">Chưa gán đơn vị</option>
                  {units.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="taskDueDate" className="block font-semibold text-text mb-1">
                  Hạn hoàn thành (YYYY-MM-DD)
                </label>
                <input
                  id="taskDueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
                />
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
                {isLoading ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm đầu việc'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
