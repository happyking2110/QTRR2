'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { components } from '@/lib/api/schema';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export type AuditEntry = components['schemas']['AuditEntry'];

export const ACTION_LABELS: Record<string, string> = {
  // 4.10 item 19
  login: 'Đăng nhập',
  login_failed: 'Đăng nhập thất bại',
  logout: 'Đăng xuất',
  change_password: 'Đổi mật khẩu',
  create_user: 'Tạo người dùng',
  import_users: 'Nhập người dùng hàng loạt',
  reset_password: 'Đặt lại mật khẩu',
  update_user: 'Cập nhật người dùng',
  upsert_unit: 'Cập nhật đơn vị',
  assign_control_units: 'Gán đơn vị kiểm soát',
  set_indicator_owner: 'Gán đơn vị phụ trách chỉ số',
  set_task_unit: 'Gán đơn vị phụ trách đầu việc',
  seed_units: 'Khởi tạo đơn vị',

  // 4.11 item 15
  submit_reading: 'Nộp số liệu chỉ số',
  submit_task_update: 'Cập nhật tiến độ đầu việc',
  withdraw_submission: 'Rút lại bản nộp',
  approve_submission: 'Duyệt bản nộp',
  reject_submission: 'Từ chối bản nộp',
  bulk_approve: 'Duyệt hàng loạt',
  close_period: 'Khóa kỳ báo cáo',
  reopen_period: 'Mở lại kỳ báo cáo',
  ensure_periods: 'Tạo các kỳ còn thiếu',
  create_event_period: 'Tạo kỳ đợt phát sinh',
  update_settings: 'Cập nhật cấu hình',
  set_residual: 'Đánh giá mức rủi ro còn lại',

  // Additional known actions
  import_cycle: 'Import chu kỳ',
  clone_cycle: 'Nhân bản chu kỳ',
  archive_cycle: 'Lưu trữ chu kỳ',
  seed_periods: 'Khởi tạo kỳ báo cáo',
  clear_demo: 'Xóa dữ liệu demo',
};

export function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function formatDiffValue(val: unknown): string {
  if (val === null || val === undefined) {
    return '—';
  }
  if (typeof val === 'object') {
    return JSON.stringify(val, null, 2);
  }
  if (typeof val === 'boolean') {
    return val ? 'true' : 'false';
  }
  return String(val);
}

export interface AuditDiffDrawerProps {
  entry: AuditEntry | null;
  open: boolean;
  onClose: () => void;
}

export function AuditDiffDrawer({ entry, open, onClose }: AuditDiffDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !entry) return null;

  const beforeObj =
    entry.before && typeof entry.before === 'object' && !Array.isArray(entry.before)
      ? (entry.before as Record<string, unknown>)
      : null;

  const afterObj =
    entry.after && typeof entry.after === 'object' && !Array.isArray(entry.after)
      ? (entry.after as Record<string, unknown>)
      : null;

  const hasObjectPayloads = beforeObj !== null || afterObj !== null;

  const allKeys = Array.from(
    new Set([
      ...(beforeObj ? Object.keys(beforeObj) : []),
      ...(afterObj ? Object.keys(afterObj) : []),
    ]),
  ).sort();

  const isBothNull = entry.before === null && entry.after === null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-diff-title"
      className="fixed inset-0 z-50 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div>
              <h2 id="audit-diff-title" className="text-base font-bold text-slate-900">
                Chi tiết nhật ký hoạt động
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Bản ghi #{entry.id} • {formatDateTime(entry.at)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="drawer-close-btn"
              aria-label="Đóng"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Metadata Summary Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Thông tin sự kiện
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block mb-0.5">Hành động:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-800">
                      {getActionLabel(entry.action)}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                      {entry.action}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5">Đối tượng:</span>
                  <div className="font-medium text-slate-800">
                    <span className="font-mono">{entry.entity}</span>
                    {entry.entityId ? (
                      <span className="ml-1 text-slate-600 font-mono">#{entry.entityId}</span>
                    ) : null}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5">Người thực hiện:</span>
                  {entry.user ? (
                    <div>
                      <div className="font-semibold text-slate-800">{entry.user.fullName}</div>
                      <div className="text-slate-500 text-[11px]">{entry.user.email}</div>
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200 text-slate-700">
                      Hệ thống
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5">Thời gian & IP:</span>
                  <div className="font-medium text-slate-800">{formatDateTime(entry.at)}</div>
                  <div className="text-slate-500 text-[11px] font-mono">
                    IP: {entry.ip ?? '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Before / After Diff Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  So sánh trước và sau (Diff)
                </h3>
                {entry.before === null && entry.after !== null && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Tạo mới (trước: —)
                  </span>
                )}
                {entry.before !== null && entry.after === null && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-rose-50 text-rose-700 border border-rose-200">
                    Đã xóa (sau: —)
                  </span>
                )}
              </div>

              {isBothNull ? (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 text-center">
                  Không có dữ liệu thay đổi trước và sau (<span className="font-mono">—</span>)
                </div>
              ) : hasObjectPayloads && allKeys.length > 0 ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs" data-testid="diff-table">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                          <th className="py-2.5 px-3.5 w-1/4">Trường</th>
                          <th className="py-2.5 px-3.5 w-1/3">Trước</th>
                          <th className="py-2.5 px-3.5 w-1/3">Sau</th>
                          <th className="py-2.5 px-3 w-16 text-center">Thay đổi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allKeys.map((key) => {
                          const bVal = beforeObj ? beforeObj[key] : undefined;
                          const aVal = afterObj ? afterObj[key] : undefined;
                          const bFormatted = formatDiffValue(bVal);
                          const aFormatted = formatDiffValue(aVal);
                          const isChanged =
                            entry.before === null ||
                            entry.after === null ||
                            JSON.stringify(bVal) !== JSON.stringify(aVal);

                          return (
                            <tr
                              key={key}
                              data-testid={`diff-row-${key}`}
                              data-changed={isChanged ? 'true' : 'false'}
                              className={cn(
                                'transition-colors',
                                isChanged
                                  ? 'bg-amber-50/80 font-medium text-amber-950 border-l-4 border-l-amber-500'
                                  : 'hover:bg-slate-50/60 text-slate-700',
                              )}
                            >
                              <td className="py-2 px-3.5 font-mono text-slate-800 break-all align-top">
                                {key}
                              </td>
                              <td
                                className="py-2 px-3.5 break-all align-top font-mono text-slate-600 whitespace-pre-wrap"
                                data-testid={`diff-before-${key}`}
                              >
                                {bFormatted}
                              </td>
                              <td
                                className="py-2 px-3.5 break-all align-top font-mono text-slate-900 whitespace-pre-wrap"
                                data-testid={`diff-after-${key}`}
                              >
                                {aFormatted}
                              </td>
                              <td className="py-2 px-3 text-center align-top">
                                {isChanged ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-200/80 text-amber-900">
                                    Đổi
                                  </span>
                                ) : (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] text-slate-400">
                                    —
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Non-object before/after fallback */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-xs font-semibold text-slate-500 block mb-1">
                      Trước:
                    </span>
                    <pre
                      data-testid="diff-before-raw"
                      className="text-xs font-mono text-slate-800 whitespace-pre-wrap"
                    >
                      {formatDiffValue(entry.before)}
                    </pre>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-xs font-semibold text-slate-500 block mb-1">
                      Sau:
                    </span>
                    <pre
                      data-testid="diff-after-raw"
                      className="text-xs font-mono text-slate-800 whitespace-pre-wrap"
                    >
                      {formatDiffValue(entry.after)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Collapsible raw JSON inspect */}
            <details className="text-xs rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <summary className="font-medium text-slate-600 cursor-pointer select-none hover:text-slate-900">
                Xem toàn bộ dữ liệu gốc (Raw JSON)
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Before:
                  </span>
                  <pre className="text-[11px] font-mono bg-white p-2 rounded border border-slate-200 overflow-x-auto max-h-48">
                    {formatDiffValue(entry.before)}
                  </pre>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                    After:
                  </span>
                  <pre className="text-[11px] font-mono bg-white p-2 rounded border border-slate-200 overflow-x-auto max-h-48">
                    {formatDiffValue(entry.after)}
                  </pre>
                </div>
              </div>
            </details>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 transition"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
