'use client';

import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Trash2, FileText, AlertTriangle, Eye, CheckCircle } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ReferencedAlert } from '@/components/ui/ReferencedAlert';
import { formatDate } from '@/lib/format';

type SplitTaskRequest = components['schemas']['SplitTaskRequest'];

export interface TaskSplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: {
    id: string;
    name: string;
    sourceText?: string | null;
    unit?: { code: string; name: string } | null;
    dueDate?: string | null;
  };
  units?: { code: string; name: string }[];
  onSuccess?: () => void;
}

interface SplitPartItem {
  name: string;
  unitCode: string;
  dueDate: string;
}

export function TaskSplitDialog({
  open,
  onOpenChange,
  task,
  units = [],
  onSuccess,
}: TaskSplitDialogProps) {
  const [parts, setParts] = useState<SplitPartItem[]>([
    { name: '', unitCode: task.unit?.code || '', dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '' },
    { name: '', unitCode: task.unit?.code || '', dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '' },
  ]);
  const [showPreview, setShowPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<{
    code?: string;
    message?: string;
    details?: unknown;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setApiError(null);
      setShowPreview(false);
      setParts([
        {
          name: `${task.name} (Phần 1)`,
          unitCode: task.unit?.code || '',
          dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
        },
        {
          name: `${task.name} (Phần 2)`,
          unitCode: task.unit?.code || '',
          dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
        },
      ]);
    }
  }, [open, task]);

  const handleAddPart = () => {
    if (parts.length >= 20) return;
    setParts((prev) => [
      ...prev,
      {
        name: `${task.name} (Phần ${prev.length + 1})`,
        unitCode: task.unit?.code || '',
        dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      },
    ]);
  };

  const handleRemovePart = (index: number) => {
    if (parts.length <= 2) return;
    setParts((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePartChange = (index: number, field: keyof SplitPartItem, value: string) => {
    setParts((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const hasEmptyName = parts.some((p) => !p.name.trim());
  const isInvalidPartCount = parts.length < 2 || parts.length > 20;
  const canSubmit = !hasEmptyName && !isInvalidPartCount && !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setApiError(null);

    const payload: SplitTaskRequest = {
      parts: parts.map((p) => ({
        name: p.name.trim(),
        unitCode: p.unitCode.trim() ? p.unitCode.trim() : null,
        dueDate: p.dueDate ? p.dueDate : null,
      })),
    };

    try {
      await apiSend('POST', `/api/tasks/${encodeURIComponent(task.id)}/split`, payload);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setApiError({
          code: err.code,
          message:
            err.code === 'INVALID_STATE'
              ? 'Không thể tách đầu việc do đầu việc đã có số liệu duyệt hoặc đang có bản nộp chờ duyệt.'
              : err.message,
          details: err.details,
        });
      } else {
        setApiError({
          code: 'INTERNAL',
          message: 'Không thể tách đầu việc do xảy ra lỗi máy chủ.',
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface p-6 shadow-2xl transition-all animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
          <div className="flex items-start justify-between pb-3 border-b border-border shrink-0">
            <div>
              <Dialog.Title className="text-base font-bold text-text">
                Tách đầu việc: {task.name}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-text-muted">
                Phân rã một đầu việc lớn thành từ 2 đến 20 phần việc chi tiết để giao đơn vị theo dõi.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-control p-1 text-text-muted hover:text-text transition-colors"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
            {/* Văn bản gốc trong Excel */}
            <div className="rounded-control border border-border bg-bg-tint/40 p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-brand-navy">
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Văn bản gốc trong Excel</span>
              </div>
              <p className="text-text-muted text-[11px] leading-relaxed whitespace-pre-line italic">
                {task.sourceText || 'Không có ghi chú văn bản gốc trong Excel'}
              </p>
            </div>

            {/* Thông báo lỗi */}
            {apiError && (
              <div>
                <ReferencedAlert error={apiError} />
                {apiError.code !== 'REFERENCED' && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3 text-xs text-state-bad-fg"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">{apiError.code || 'Lỗi'}</p>
                      <p className="mt-0.5">{apiError.message}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Hướng dẫn & Giới hạn */}
            <div className="flex items-center justify-between">
              <span className="font-semibold text-text">
                Danh sách các phần việc sau khi tách ({parts.length}/20)
              </span>
              <button
                type="button"
                data-testid="toggle-preview-button"
                onClick={() => setShowPreview(!showPreview)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:text-brand-navy"
              >
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showPreview ? 'Ẩn xem trước' : 'Xem trước'}</span>
              </button>
            </div>

            {/* Xem trước nếu bật */}
            {showPreview && (
              <div className="rounded-control border border-brand-blue-bright/30 bg-brand-blue-bright/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-brand-navy text-[11px]">
                  <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Bản xem trước ({parts.length} phần việc)</span>
                </div>
                <div className="overflow-x-auto rounded border border-border bg-surface">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-bg-tint text-text-muted uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-1.5 font-semibold">#</th>
                        <th className="px-3 py-1.5 font-semibold">Tên phần việc</th>
                        <th className="px-3 py-1.5 font-semibold">Đơn vị</th>
                        <th className="px-3 py-1.5 font-semibold">Hạn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {parts.map((p, idx) => {
                        const unitName = units.find((u) => u.code === p.unitCode)?.name || 'Chưa gán';
                        return (
                          <tr key={idx}>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-text-muted">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-1.5 font-medium text-text">{p.name || '—'}</td>
                            <td className="px-3 py-1.5 text-text-muted">{unitName}</td>
                            <td className="px-3 py-1.5 text-text">{formatDate(p.dueDate)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bảng nhập các phần việc */}
            <form id="task-split-form" onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-2">
                {parts.map((part, index) => (
                  <div
                    key={index}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-control border border-border bg-surface hover:border-brand-blue/30 transition-colors"
                  >
                    <span className="font-mono text-xs font-bold text-brand-navy w-6 shrink-0 text-center">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <input
                        type="text"
                        required
                        maxLength={500}
                        placeholder={`Tên phần việc ${index + 1}...`}
                        value={part.name}
                        onChange={(e) => handlePartChange(index, 'name', e.target.value)}
                        className="w-full rounded-control border border-border px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
                      />
                    </div>
                    <div className="w-full sm:w-44 shrink-0">
                      <select
                        value={part.unitCode}
                        onChange={(e) => handlePartChange(index, 'unitCode', e.target.value)}
                        className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
                      >
                        <option value="">Chưa gán đơn vị</option>
                        {units.map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-full sm:w-36 shrink-0">
                      <input
                        type="date"
                        value={part.dueDate}
                        onChange={(e) => handlePartChange(index, 'dueDate', e.target.value)}
                        className="w-full rounded-control border border-border px-2 py-1.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={parts.length <= 2}
                      onClick={() => handleRemovePart(index)}
                      className="p-1.5 text-text-muted hover:text-state-bad-fg disabled:opacity-30 disabled:cursor-not-allowed rounded"
                      title={parts.length <= 2 ? 'Cần tối thiểu 2 phần việc' : 'Xóa phần này'}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>

              {parts.length < 20 && (
                <button
                  type="button"
                  data-testid="add-part-button"
                  onClick={handleAddPart}
                  className="w-full py-2 border border-dashed border-border rounded-control text-xs font-semibold text-brand-blue hover:border-brand-blue hover:bg-bg-tint/40 transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Thêm phần việc ({parts.length}/20)</span>
                </button>
              )}

              {parts.length < 2 && (
                <p className="text-[11px] text-state-bad-fg">
                  Bắt buộc phân rã thành tối thiểu 2 phần việc.
                </p>
              )}
            </form>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border shrink-0">
            <span className="text-[11px] text-text-muted">
              Đầu việc gốc sẽ được thay thế bằng {parts.length} phần việc mới.
            </span>
            <div className="flex items-center gap-2">
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
                form="task-split-form"
                disabled={!canSubmit}
                data-testid="confirm-split-button"
                className="rounded-control bg-brand-blue px-4 py-2 font-semibold text-white hover:bg-brand-navy transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Đang phân rã...' : 'Xác nhận tách đầu việc'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
