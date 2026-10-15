'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type ImportUsersResult = components['schemas']['ImportUsersResult'];
type ImportedUser = components['schemas']['ImportedUser'];
type ImportRowError = components['schemas']['ImportRowError'];

export interface BulkImportUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BulkImportUsersDialog({
  open,
  onOpenChange,
  onSuccess,
}: BulkImportUsersDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<ImportRowError[] | null>(null);
  const [createdUsers, setCreatedUsers] = useState<ImportedUser[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setCreatedUsers(null);
    setFile(null);
    setGeneralError(null);
    setRowErrors(null);
    onOpenChange(false);
  }, [onOpenChange]);

  // Reset all sensitive data and state whenever dialog closes
  useEffect(() => {
    if (!open) {
      setFile(null);
      setIsSubmitting(false);
      setGeneralError(null);
      setRowErrors(null);
      setCreatedUsers(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [open]);

  // Handle Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose]);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setGeneralError(null);
      setRowErrors(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsSubmitting(true);
    setGeneralError(null);
    setRowErrors(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await apiSend<ImportUsersResult>('/api/users/import', {
        method: 'POST',
        body: formData,
      });

      setCreatedUsers(result.created);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'IMPORT_INVALID' && Array.isArray(err.details)) {
          setRowErrors(err.details as ImportRowError[]);
        } else {
          setGeneralError(err.message);
        }
      } else if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'IMPORT_INVALID') {
        const anyErr = err as unknown as { details?: ImportRowError[]; message?: string };
        if (Array.isArray(anyErr.details)) {
          setRowErrors(anyErr.details);
        } else {
          setGeneralError(anyErr.message ?? 'Tệp không hợp lệ.');
        }
      } else {
        setGeneralError((err as Error).message || 'Không thể nhập tệp người dùng.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!createdUsers || createdUsers.length === 0) return;

    const headers = 'email,full_name,role,temporary_password\r\n';
    const rows = createdUsers
      .map(
        (u) =>
          `"${u.email.replace(/"/g, '""')}","${u.fullName.replace(/"/g, '""')}","${u.role}","${u.temporaryPassword.replace(/"/g, '""')}"`,
      )
      .join('\r\n');

    // UTF-8 BOM \uFEFF ensures proper decoding in Microsoft Excel
    const csvContent = '\uFEFF' + headers + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mat-khau-tam-nguoi-dung.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-import-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl bg-surface border border-border rounded-card shadow-lg p-6 my-8 text-text max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-brand-navy">
              <Upload className="w-4 h-4" aria-hidden="true" />
            </div>
            <h2 id="bulk-import-title" className="text-lg font-bold">
              Nhập người dùng hàng loạt
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-control text-text-muted hover:text-text hover:bg-bg-page focus:outline-none focus:ring-2 focus:ring-brand-blue"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {createdUsers ? (
            /* Step 3: Success Screen */
            <div className="space-y-4">
              <div className="p-4 rounded-card bg-state-ok-bg/30 border border-state-ok-line/40 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-state-ok-line shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-text">
                    Đã tạo thành công {createdUsers.length} người dùng
                  </h3>
                  <p className="text-xs text-text-muted mt-1">
                    Hệ thống đã tạo tài khoản và sinh mật khẩu tạm ngẫu nhiên cho toàn bộ danh sách trong file.
                  </p>
                </div>
              </div>

              <div
                role="alert"
                className="p-3.5 rounded-card bg-state-warn-bg/30 border border-state-warn-line/40 text-xs text-text flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-state-warn-line shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="font-semibold">Cảnh báo bảo mật quan trọng:</strong> Mật khẩu tạm chỉ hiển thị một lần duy nhất. Khi đóng hộp thoại này, toàn bộ mật khẩu tạm sẽ biến mất vĩnh viễn khỏi trang. Hãy bấm nút tải file CSV bên dưới để lưu lại và gửi cho người dùng.
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-control text-sm font-medium bg-brand-navy text-surface hover:bg-brand-navy-light transition-colors focus:outline-none focus:ring-2 focus:ring-brand-bright focus:ring-offset-2"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Tải file mật khẩu tạm (CSV)</span>
                </button>
              </div>
            </div>
          ) : (
            /* Steps 1 & 2: Template & Upload Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Step 1 */}
              <div className="p-4 rounded-card bg-bg-page border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-navy uppercase tracking-wider">
                    Bước 1: Tải file mẫu
                  </span>
                  <a
                    href="/api/users/import-template"
                    download="mau-nguoi-dung.csv"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:text-brand-navy underline focus:outline-none focus:ring-2 focus:ring-brand-blue rounded"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Tải file mẫu CSV</span>
                  </a>
                </div>
                <p className="text-xs text-text-muted">
                  File mẫu gồm 4 cột bắt buộc: <code className="text-brand-navy font-mono">email, full_name, role, unit_code</code>. Tối đa 200 dòng trong một lần nhập.
                </p>
              </div>

              {/* Step 2 */}
              <div className="space-y-3">
                <label
                  htmlFor="bulk-user-file-input"
                  className="block text-sm font-semibold text-text"
                >
                  Bước 2: Chọn file CSV hoặc Excel
                </label>

                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    id="bulk-user-file-input"
                    type="file"
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, .xlsx"
                    onChange={handleFileChange}
                    className="block w-full text-xs text-text file:mr-3 file:py-2 file:px-4 file:rounded-control file:border-0 file:text-xs file:font-medium file:bg-brand-navy file:text-surface hover:file:bg-brand-navy-light cursor-pointer border border-border rounded-control p-1 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                </div>

                {file && (
                  <div className="flex items-center gap-2 text-xs text-text-muted bg-surface border border-border px-3 py-2 rounded-control">
                    <FileSpreadsheet className="w-4 h-4 text-brand-blue" aria-hidden="true" />
                    <span className="font-medium text-text">{file.name}</span>
                    <span>({formatFileSize(file.size)})</span>
                  </div>
                )}
              </div>

              {/* Error Banners */}
              {generalError && (
                <div
                  role="alert"
                  className="p-3 rounded-card bg-state-bad-bg/30 border border-state-bad-line/40 text-xs text-state-bad-line"
                >
                  {generalError}
                </div>
              )}

              {rowErrors && rowErrors.length > 0 && (
                <div className="space-y-2">
                  <div
                    role="alert"
                    className="p-3 rounded-card bg-state-bad-bg/30 border border-state-bad-line/40 text-xs text-state-bad-line font-medium"
                  >
                    Tệp tải lên có lỗi ở {rowErrors.length} vị trí. Không ai được tạo trong hệ thống. Vui lòng sửa file và tải lên lại.
                  </div>

                  <div className="border border-border rounded-control overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-bg-page text-text-muted border-b border-border font-semibold">
                        <tr>
                          <th className="py-2 px-3 w-16">Dòng</th>
                          <th className="py-2 px-3 w-28">Cột</th>
                          <th className="py-2 px-3">Thông báo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rowErrors.map((err, idx) => (
                          <tr key={idx} className="hover:bg-bg-page/50">
                            <td className="py-2 px-3 font-mono">
                              {err.row === 0 ? 'Toàn tệp' : err.row}
                            </td>
                            <td className="py-2 px-3 font-mono text-brand-navy">
                              {err.field || '—'}
                            </td>
                            <td className="py-2 px-3 text-state-bad-line">
                              {err.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-border">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-control text-xs font-medium text-text border border-border hover:bg-bg-page focus:outline-none focus:ring-2 focus:ring-brand-blue"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!file || isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-control text-xs font-medium bg-brand-navy text-surface hover:bg-brand-navy-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-brand-bright focus:ring-offset-2"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isSubmitting ? 'Đang nhập...' : 'Bắt đầu nhập'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer when completed */}
        {createdUsers && (
          <div className="pt-3 border-t border-border flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-control text-xs font-medium bg-surface text-text border border-border hover:bg-bg-page focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
