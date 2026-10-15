'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface ReferencedAlertProps {
  error: {
    code?: string;
    message?: string;
    details?: unknown;
  } | null;
}

export function ReferencedAlert({ error }: ReferencedAlertProps) {
  if (!error || error.code !== 'REFERENCED') return null;

  let items: string[] = [];
  if (Array.isArray(error.details)) {
    items = error.details.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const kind = obj.kind ? String(obj.kind) : '';
        const target = obj.code || obj.periodKey || obj.id || '';
        if (kind && target) {
          const kindNames: Record<string, string> = {
            control: 'Kiểm soát',
            cause: 'Nguyên nhân',
            action: 'Kế hoạch hành động',
            task: 'Đầu việc',
            reading: 'Số liệu chỉ số kỳ',
            task_update: 'Cập nhật tiến độ kỳ',
            residual: 'Đánh giá mức còn lại kỳ',
          };
          const label = kindNames[kind] || kind;
          return `${label}: ${target}`;
        }
      }
      return JSON.stringify(item);
    });
  } else if (error.details && typeof error.details === 'object') {
    items = Object.entries(error.details).map(([k, v]) => `${k}: ${String(v)}`);
  }

  return (
    <div
      role="alert"
      className="rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3.5 text-xs text-state-bad-fg"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1.5 flex-1">
          <p className="font-semibold">{error.message || 'Dữ liệu đang được tham chiếu, không thể xóa hoặc sửa.'}</p>
          {items.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-state-bad-fg/90">
                Danh sách mục đang tham chiếu (vui lòng gỡ liên kết trước):
              </p>
              <ul className="mt-1 list-disc list-inside space-y-0.5 text-[11px] font-mono">
                {items.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
