'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react';
import { apiSend, ApiClientError, safeNext } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type CurrentUser = components['schemas']['CurrentUser'];

export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get('next');
  const targetPath = safeNext(rawNext);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Kiểm tra nếu đã có phiên hợp lệ thì chuyển hướng ngay
  useEffect(() => {
    let active = true;
    apiSend<CurrentUser>('/api/auth/me', { method: 'GET', redirectOn401: false })
      .then((user) => {
        if (!active) return;
        if (user.mustChangePassword) {
          router.replace('/change-password');
        } else {
          router.replace(targetPath);
        }
      })
      .catch(() => {
        // Chưa đăng nhập (401), giữ nguyên màn hình đăng nhập
      });

    return () => {
      active = false;
    };
  }, [router, targetPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const user = await apiSend<CurrentUser>('POST', '/api/auth/login', {
        email: email.trim(),
        password,
      });

      if (user.mustChangePassword) {
        router.replace('/change-password');
      } else {
        router.replace(targetPath);
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError || (err && typeof err === 'object' && 'code' in err && 'message' in err)) {
        setErrorMessage(String((err as ApiClientError).message));
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Đã xảy ra lỗi không xác định. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-[#041F4A] flex items-center justify-center text-white mb-3 shadow-sm">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          MBF Risk Monitor
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Hồ sơ rủi ro trọng yếu
        </p>
      </div>

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            placeholder="ten@mobifone.vn"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#041F4A] focus:border-transparent transition-colors disabled:opacity-50"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Mật khẩu
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="••••••••••"
              className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#041F4A] focus:border-transparent transition-colors disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#041F4A] rounded"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="w-full mt-2 py-2.5 px-4 bg-[#041F4A] hover:bg-[#062c68] text-white text-sm font-medium rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#041F4A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</span>
        </button>
      </form>

      {/* Error Message */}
      {errorMessage && (
        <div
          role="alert"
          className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"
        >
          {errorMessage}
        </div>
      )}

      {/* Forgot password note */}
      <div className="mt-6 pt-4 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500">
          Quên mật khẩu? Liên hệ quản trị viên để được đặt lại.
        </p>
      </div>
    </div>
  );
}
