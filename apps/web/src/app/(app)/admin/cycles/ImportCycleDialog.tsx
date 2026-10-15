'use client';

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, AlertTriangle, AlertCircle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import type { components } from '@/lib/api/schema';
import { cn } from '@/lib/utils';

type ImportCycleReport = components['schemas']['ImportCycleReport'];
type ImportIssue = components['schemas']['ImportIssue'];

export interface ImportCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ImportCycleDialog({
  open,
  onOpenChange,
  onSuccess,
}: ImportCycleDialogProps) {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<ImportCycleReport | null>(null);
  const [blockingIssues, setBlockingIssues] = useState<ImportIssue[] | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const resetState = () => {
    setFile(null);
    setReport(null);
    setBlockingIssues(null);
    setGeneralError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !year) return;

    setIsLoading(true);
    setGeneralError(null);
    setBlockingIssues(null);
    setReport(null);

    const formData = new FormData();
    formData.append('year', String(year));
    formData.append('file', file);

    try {
      // Bắt buộc dùng FormData và KHÔNG đặt Content-Type thủ công (để trình duyệt tự thêm boundary)
      const res = await fetch('/api/cycles/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setReport(data as ImportCycleReport);
        onSuccess?.();
      } else if (res.status === 422) {
        // Lỗi IMPORT_INVALID có thể trả về danh sách issues chặn trong details hoặc data.issues
        const issues: ImportIssue[] =
          data?.details?.issues || data?.issues || (Array.isArray(data?.details) ? data.details : []);
        if (issues.length > 0) {
          setBlockingIssues(issues);
        } else {
          setGeneralError(data?.message || 'Tệp tải lên không hợp lệ.');
        }
      } else {
        setGeneralError(data?.message || `Lỗi tải lên (${res.status}): Không thể import chu kỳ.`);
      }
    } catch {
      setGeneralError('Lỗi kết nối máy chủ khi tải lên tệp.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface p-6 shadow-2xl transition-all animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
          <div className="flex items-start justify-between pb-3 border-b border-border shrink-0">
            <div>
              <Dialog.Title className="text-base font-bold text-text">
                Import chu kỳ từ tệp Excel
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-text-muted">
                Tải lên tệp Excel (.xlsx) chứa toàn bộ hồ sơ rủi ro, kiểm soát và kế hoạch hành động.
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
            {/* Nếu có báo cáo thành công */}
            {report ? (
              <div className="space-y-4">
                <div className="rounded-control border border-state-ok-line/40 bg-state-ok-bg p-4 flex items-start gap-3 text-state-ok-fg">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="font-bold text-sm">Import chu kỳ {report.year} thành công!</h3>
                    <p className="text-xs mt-0.5 text-state-ok-fg/90">
                      Dữ liệu chu kỳ đã được xử lý và lưu vào cơ sở dữ liệu.
                    </p>
                  </div>
                </div>

                {/* Bảng số đếm */}
                <div className="rounded-control border border-border bg-bg-tint/30 p-4 space-y-3">
                  <h4 className="font-bold text-text uppercase tracking-wider text-[11px]">
                    Báo cáo số đếm import
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Hồ sơ</span>
                      <strong className="text-text text-base font-bold">{report.counts.profiles}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Nguyên nhân</span>
                      <strong className="text-text text-base font-bold">{report.counts.causes}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Ảnh hưởng</span>
                      <strong className="text-text text-base font-bold">{report.counts.impacts}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Kiểm soát</span>
                      <strong className="text-text text-base font-bold">{report.counts.controls}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Kế hoạch</span>
                      <strong className="text-text text-base font-bold">{report.counts.actions}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Đầu việc đã tạo</span>
                      <strong className="text-text text-base font-bold">{report.counts.tasksCreated}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Chỉ số KRI</span>
                      <strong className="text-text text-base font-bold">{report.counts.kri}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Chỉ số KCI</span>
                      <strong className="text-text text-base font-bold">{report.counts.kci}</strong>
                    </div>
                    <div className="bg-surface p-2.5 rounded border border-border">
                      <span className="text-text-muted block text-[11px]">Kỳ đã khởi tạo</span>
                      <strong className="text-text text-base font-bold">{report.counts.periodsCreated}</strong>
                    </div>
                  </div>
                </div>

                {/* Danh sách cảnh báo nếu có */}
                {report.issues && report.issues.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-state-warn-fg flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                      <span>Cảnh báo dữ liệu ({report.issues.length})</span>
                    </h4>
                    <div className="overflow-x-auto rounded border border-border bg-surface max-h-56">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-bg-tint text-text-muted uppercase text-[10px] sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Mã cảnh báo</th>
                            <th className="px-3 py-2 font-semibold">Tham chiếu</th>
                            <th className="px-3 py-2 font-semibold">Mô tả</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {report.issues.map((issue, idx) => (
                            <tr key={idx} className="hover:bg-bg-tint/30">
                              <td className="px-3 py-2 font-mono text-[11px] font-semibold text-brand-navy">
                                {issue.code}
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px] text-text-muted">{issue.ref}</td>
                              <td className="px-3 py-2 text-text">{issue.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Form tải lên */
              <form id="import-cycle-form" onSubmit={handleSubmit} className="space-y-4">
                {generalError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3 text-xs text-state-bad-fg"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">Lỗi import chu kỳ</p>
                      <p className="mt-0.5">{generalError}</p>
                    </div>
                  </div>
                )}

                {/* Bảng lỗi chặn 422 IMPORT_INVALID */}
                {blockingIssues && (
                  <div className="rounded-control border border-state-bad-line/40 bg-state-bad-bg/30 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-1.5 font-bold text-state-bad-fg">
                      <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                      <span>Dữ liệu tệp không hợp lệ ({blockingIssues.length} vấn đề cần sửa trước)</span>
                    </div>
                    <div className="overflow-x-auto rounded border border-border bg-surface max-h-56">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-bg-tint text-text-muted uppercase text-[10px] sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Mức</th>
                            <th className="px-3 py-2 font-semibold">Mã lỗi</th>
                            <th className="px-3 py-2 font-semibold">Vị trí / Tham chiếu</th>
                            <th className="px-3 py-2 font-semibold">Mô tả chi tiết</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {blockingIssues.map((issue, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2">
                                <span
                                  className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase',
                                    issue.level === 'error'
                                      ? 'bg-state-bad-bg text-state-bad-fg'
                                      : 'bg-state-warn-bg text-state-warn-fg',
                                  )}
                                >
                                  {issue.level}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px] font-bold text-brand-navy">
                                {issue.code}
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px] text-text-muted">{issue.ref}</td>
                              <td className="px-3 py-2 text-text">{issue.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="importYear" className="block font-semibold text-text mb-1">
                    Năm chu kỳ <span className="text-state-bad-fg">*</span>
                  </label>
                  <input
                    id="importYear"
                    type="number"
                    min={2000}
                    max={2100}
                    required
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value, 10) || 2026)}
                    className="w-full rounded-control border border-border px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-brand-blue"
                  />
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    Năm của chu kỳ quản lý rủi ro (ví dụ: 2026).
                  </p>
                </div>

                <div>
                  <label htmlFor="importFile" className="block font-semibold text-text mb-1">
                    Chọn tệp Excel (.xlsx) <span className="text-state-bad-fg">*</span>
                  </label>
                  <div className="mt-1 flex flex-col items-center justify-center px-6 pt-5 pb-6 border-2 border-dashed border-border rounded-control hover:border-brand-blue transition">
                    <FileSpreadsheet className="mx-auto h-10 w-10 text-brand-navy mb-2" aria-hidden="true" />
                    <input
                      id="importFile"
                      name="file"
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      required
                      className="block w-full text-xs text-text file:mr-3 file:py-1.5 file:px-3 file:rounded-control file:border-0 file:text-xs file:font-semibold file:bg-brand-blue file:text-white hover:file:bg-brand-navy cursor-pointer border border-border rounded-control p-1 focus:outline-none focus:ring-1 focus:ring-brand-blue"
                      onChange={(e) => {
                        const selected = e.target.files?.[0] || null;
                        setFile(selected);
                      }}
                    />
                    <p className="text-[11px] text-text-muted mt-2">Chỉ chấp nhận tệp định dạng .xlsx</p>
                    {file && (
                      <p className="text-xs font-semibold text-brand-navy pt-2">
                        Đã chọn: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border shrink-0">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleOpenChange(false)}
                    className="rounded-control border border-border bg-surface px-4 py-2 font-medium text-text hover:bg-bg-tint transition-colors disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !file}
                    className="rounded-control bg-brand-blue px-4 py-2 font-semibold text-white hover:bg-brand-navy transition-colors disabled:opacity-50"
                  >
                    {isLoading ? 'Đang import...' : 'Bắt đầu import'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {report && (
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border shrink-0">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="rounded-control bg-brand-blue px-4 py-2 font-semibold text-white hover:bg-brand-navy transition-colors"
              >
                Đóng
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
