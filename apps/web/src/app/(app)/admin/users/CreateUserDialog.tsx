'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, UserPlus, Copy, Check, AlertTriangle } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type UnitSummary = components['schemas']['UnitSummary'];
type UserRole = components['schemas']['UserRole'];
type CreatedUser = components['schemas']['CreatedUser'];

export interface CreateUserDialogProps {
  open: boolean;
  units: UnitSummary[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateUserDialog({
  open,
  units,
  onOpenChange,
  onSuccess,
}: CreateUserDialogProps) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('unit');
  const [unitCode, setUnitCode] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleClose = useCallback(() => {
    setTemporaryPassword(null);
    onOpenChange(false);
  }, [onOpenChange]);

  // Clear everything on close
  useEffect(() => {
    if (!open) {
      setEmail('');
      setFullName('');
      setRole('unit');
      setUnitCode('');
      setIsSubmitting(false);
      setFieldErrors({});
      setGeneralError(null);
      setTemporaryPassword(null);
      setCopied(false);
    }
  }, [open]);

  // Handle Escape
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError(null);

    // Client-side quick check: if role is unit, unitCode is required
    if (role === 'unit' && !unitCode) {
      setFieldErrors({ unitCode: 'Vui lòng chọn đơn vị cho người dùng này.' });
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await apiSend<CreatedUser>('/api/users', {
        method: 'POST',
        body: {
          email: email.trim(),
          fullName: fullName.trim(),
          role,
          unitCode: unitCode ? unitCode : null,
        },
      });

      setTemporaryPassword(result.temporaryPassword);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setFieldErrors({ email: err.message || 'Email này đã tồn tại trong hệ thống.' });
        } else if (err.fieldErrors) {
          setFieldErrors(err.fieldErrors);
        } else {
          setGeneralError(err.message);
        }
      } else if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 409) {
        const anyErr = err as unknown as { message?: string };
        setFieldErrors({ email: anyErr.message || 'Email này đã tồn tại trong hệ thống.' });
      } else {
        setGeneralError((err as Error).message || 'Không thể tạo người dùng.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-user-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto"
    >
      <div className="relative w-full max-w-lg bg-surface border border-border rounded-card shadow-lg p-6 my-8 text-text">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-brand-navy">
              <UserPlus className="w-4 h-4" aria-hidden="true" />
            </div>
            <h2 id="create-user-dialog-title" className="text-lg font-bold">
              Thêm người dùng mới
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

        {/* Content */}
        <div className="py-4">
          {temporaryPassword ? (
            /* Result: Temporary password screen */
            <div className="space-y-4">
              <div
                role="alert"
                className="p-3.5 rounded-card bg-state-warn-bg/30 border border-state-warn-line/40 text-xs text-text flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-state-warn-line shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="font-semibold">Mật khẩu tạm chỉ hiển thị một lần duy nhất!</strong>
                  <p className="mt-0.5">
                    Hãy sao chép và gửi mật khẩu này cho người dùng trước khi đóng hộp thoại. Người dùng sẽ bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">
                  Mật khẩu tạm thời
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-bg-page border border-border rounded-control px-3.5 py-2.5 font-mono text-base font-bold text-brand-navy select-all tracking-wider">
                    {temporaryPassword}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-control text-xs font-medium bg-brand-navy text-surface hover:bg-brand-navy-light transition-colors focus:outline-none focus:ring-2 focus:ring-brand-bright"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-state-ok-line" aria-hidden="true" />
                        <span>Đã sao chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" aria-hidden="true" />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex justify-end">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-control text-xs font-medium bg-brand-navy text-surface hover:bg-brand-navy-light transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue"
                >
                  Hoàn tất và đóng
                </button>
              </div>
            </div>
          ) : (
            /* Creation Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {generalError && (
                <div
                  role="alert"
                  className="p-3 rounded-card bg-state-bad-bg/30 border border-state-bad-line/40 text-xs text-state-bad-line"
                >
                  {generalError}
                </div>
              )}

              {/* Email */}
              <div>
                <label
                  htmlFor="create-user-email"
                  className="block text-xs font-semibold text-text mb-1"
                >
                  Email <span className="text-state-bad-line">*</span>
                </label>
                <input
                  id="create-user-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nguyenvana@mobifone.vn"
                  className={`w-full px-3 py-2 text-xs rounded-control border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand-blue ${
                    fieldErrors.email ? 'border-state-bad-line' : 'border-border'
                  }`}
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-state-bad-line">{fieldErrors.email}</p>
                )}
              </div>

              {/* Họ tên */}
              <div>
                <label
                  htmlFor="create-user-name"
                  className="block text-xs font-semibold text-text mb-1"
                >
                  Họ và tên <span className="text-state-bad-line">*</span>
                </label>
                <input
                  id="create-user-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className={`w-full px-3 py-2 text-xs rounded-control border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand-blue ${
                    fieldErrors.fullName ? 'border-state-bad-line' : 'border-border'
                  }`}
                />
                {fieldErrors.fullName && (
                  <p className="mt-1 text-xs text-state-bad-line">{fieldErrors.fullName}</p>
                )}
              </div>

              {/* Vai trò */}
              <div>
                <label
                  htmlFor="create-user-role"
                  className="block text-xs font-semibold text-text mb-1"
                >
                  Vai trò <span className="text-state-bad-line">*</span>
                </label>
                <select
                  id="create-user-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-xs rounded-control border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand-blue"
                >
                  <option value="unit">Đơn vị</option>
                  <option value="ban4">Ban 4</option>
                  <option value="viewer">Chỉ xem</option>
                  <option value="admin">Quản trị viên</option>
                </select>
              </div>

              {/* Đơn vị */}
              <div>
                <label
                  htmlFor="create-user-unit"
                  className="block text-xs font-semibold text-text mb-1"
                >
                  Đơn vị {role === 'unit' && <span className="text-state-bad-line">*</span>}
                </label>
                <select
                  id="create-user-unit"
                  value={unitCode}
                  onChange={(e) => setUnitCode(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-control border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand-blue ${
                    fieldErrors.unitCode ? 'border-state-bad-line' : 'border-border'
                  }`}
                >
                  <option value="">— Không chọn —</option>
                  {units.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </select>
                {fieldErrors.unitCode && (
                  <p className="mt-1 text-xs text-state-bad-line">{fieldErrors.unitCode}</p>
                )}
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-control text-xs font-medium text-text border border-border hover:bg-bg-page focus:outline-none focus:ring-2 focus:ring-brand-blue"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-control text-xs font-medium bg-brand-navy text-surface hover:bg-brand-navy-light disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-bright focus:ring-offset-2"
                >
                  {isSubmitting ? 'Đang tạo...' : 'Tạo người dùng'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
