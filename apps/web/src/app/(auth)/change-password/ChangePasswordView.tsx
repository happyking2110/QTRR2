'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Eye, EyeOff, Loader2, LogOut } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';

export function ChangePasswordView() {
  const router = useRouter();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setFieldErrors({});

    // Client-side quick check
    if (newPassword !== confirmPassword) {
      setFieldErrors({
        confirmPassword: 'Mật khẩu nhập lại không khớp.',
      });
      return;
    }

    setLoading(true);

    try {
      await apiSend('POST', '/api/auth/change-password', {
        oldPassword,
        newPassword,
      });

      router.replace('/');
    } catch (err: unknown) {
      if (err instanceof ApiClientError || (err && typeof err === 'object' && 'code' in err)) {
        const apiErr = err as ApiClientError;
        if (apiErr.fieldErrors && Object.keys(apiErr.fieldErrors).length > 0) {
          setFieldErrors(apiErr.fieldErrors);
        } else {
          setGeneralError(apiErr.message);
        }
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Đã xảy ra lỗi không xác định. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await apiSend('POST', '/api/auth/logout');
    } catch {
      // Bỏ qua lỗi logout phía client
    } finally {
      router.replace('/login');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8">
      {/* Header */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-[#041F4A] flex items-center justify-center text-white mb-3 shadow-sm">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Đổi mật khẩu
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          MBF Risk Monitor
        </p>
      </div>

      {/* Helper notice */}
      <div className="mb-6 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs sm:text-sm">
        💡 Tối thiểu 10 ký tự, khác 5 mật khẩu gần nhất.
      </div>

      {/* Change Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Old password */}
        <div>
          <label
            htmlFor="oldPassword"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Mật khẩu hiện tại
          </label>
          <div className="relative">
            <input
              id="oldPassword"
              type={showOld ? 'text' : 'password'}
              name="oldPassword"
              autoComplete="current-password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              disabled={loading}
              className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#041F4A] focus:border-transparent transition-colors disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowOld(!showOld)}
              aria-label={showOld ? 'Ẩn mật khẩu hiện tại' : 'Hiện mật khẩu hiện tại'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#041F4A] rounded"
            >
              {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {fieldErrors.oldPassword && (
            <p className="mt-1 text-xs text-red-600 font-medium">
              {fieldErrors.oldPassword}
            </p>
          )}
        </div>

        {/* New password */}
        <div>
          <label
            htmlFor="newPassword"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Mật khẩu mới
          </label>
          <div className="relative">
            <input
              id="newPassword"
              type={showNew ? 'text' : 'password'}
              name="newPassword"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#041F4A] focus:border-transparent transition-colors disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              aria-label={showNew ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#041F4A] rounded"
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {fieldErrors.newPassword && (
            <p className="mt-1 text-xs text-red-600 font-medium">
              {fieldErrors.newPassword}
            </p>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Nhập lại mật khẩu mới
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirm ? 'text' : 'password'}
              name="confirmPassword"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#041F4A] focus:border-transparent transition-colors disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              aria-label={showConfirm ? 'Ẩn mật khẩu nhập lại' : 'Hiện mật khẩu nhập lại'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#041F4A] rounded"
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600 font-medium">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        {/* General Error */}
        {generalError && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"
          >
            {generalError}
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading || !oldPassword || !newPassword || !confirmPassword}
          className="w-full mt-2 py-2.5 px-4 bg-[#041F4A] hover:bg-[#062c68] text-white text-sm font-medium rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#041F4A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{loading ? 'Đang đổi mật khẩu...' : 'Đổi mật khẩu'}</span>
        </button>
      </form>

      {/* Logout button */}
      <div className="mt-6 pt-4 border-t border-slate-100 flex justify-center">
        <button
          type="button"
          onClick={handleLogout}
          disabled={logoutLoading}
          className="text-xs text-slate-500 hover:text-slate-700 font-medium flex items-center space-x-1.5 p-2 rounded hover:bg-slate-50 transition-colors"
        >
          {logoutLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <LogOut className="w-3.5 h-3.5" />
          )}
          <span>Đăng xuất</span>
        </button>
      </div>
    </div>
  );
}
