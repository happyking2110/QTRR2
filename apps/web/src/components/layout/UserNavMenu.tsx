'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  ChevronDown,
  LogOut,
  KeyRound,
  Users,
  UserCheck,
  Calendar,
  SlidersHorizontal,
  History,
  ClipboardCheck,
} from 'lucide-react';
import { apiSend } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type CurrentUser = components['schemas']['CurrentUser'];

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị viên',
  ban4: 'Ban 4',
  unit: 'Đơn vị',
  viewer: 'Chỉ xem',
};

export interface UserNavMenuProps {
  user: CurrentUser | null;
}

export function UserNavMenu({ user }: UserNavMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loadingLogout, setLoadingLogout] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Lấy số lượng bản chờ duyệt:
  // - Admin / Ban 4: tổng số các yêu cầu tất cả user gửi lên
  // - User (đơn vị): số yêu cầu user đó gửi
  useEffect(() => {
    let isMounted = true;
    if (user && user.role !== 'viewer') {
      fetch('/api/approvals')
        .then((res) => (res.ok ? res.json() : null))
        .then((data: unknown) => {
          if (!isMounted || !Array.isArray(data)) return;
          if (user.role === 'admin' || user.role === 'ban4') {
            setPendingCount(data.length);
          } else {
            const items = data as Array<{
              submission?: {
                submittedBy?: {
                  fullName?: string | null;
                } | null;
              } | null;
            }>;
            const myCount = items.filter((item) => {
              const submitterName = item?.submission?.submittedBy?.fullName;
              return (
                submitterName &&
                user.fullName &&
                submitterName.trim().toLowerCase() === user.fullName.trim().toLowerCase()
              );
            }).length;
            setPendingCount(myCount);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Đóng khi click ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  // Đóng khi nhấn phím Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!user) {
    return null;
  }

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const canManageUsers = user.role === 'admin';
  const canManageAssignments = user.role === 'admin' || user.role === 'ban4';
  const canManagePeriods = user.role === 'admin';
  const canManageSettings = user.role === 'admin';
  const canViewAudit = user.role === 'admin' || user.role === 'ban4';
  const showAdminSection =
    canManageUsers || canManageAssignments || canManagePeriods || canManageSettings || canViewAudit;

  const handleLogout = async () => {
    setLoadingLogout(true);
    try {
      await apiSend('POST', '/api/auth/logout');
    } catch {
      // Bỏ qua lỗi logout phía client
    } finally {
      router.replace('/login');
    }
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Menu người dùng: ${user.fullName}`}
        className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-white/50"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 text-white shrink-0">
          <User className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="max-w-[120px] sm:max-w-[160px] truncate">{user.fullName}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl bg-white shadow-lg ring-1 ring-black/5 divide-y divide-slate-100 z-50 focus:outline-none text-slate-800 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* User info header */}
          <div className="p-3">
            <p className="text-sm font-semibold text-slate-900 truncate">{user.fullName}</p>
            <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                {roleLabel}
              </span>
              {user.unit?.name && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 truncate max-w-[140px]" title={user.unit.name}>
                  {user.unit.name}
                </span>
              )}
            </div>
          </div>

          {/* Section: Chờ duyệt & Quản trị */}
          {(user.role !== 'viewer' || showAdminSection) && (
            <div className="py-1">
              {user.role !== 'viewer' && (
              <Link
                href="/approvals"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                role="menuitem"
              >
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>Chờ duyệt</span>
                </div>
                {pendingCount !== null && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700">
                    {pendingCount}
                  </span>
                )}
              </Link>
            )}
              {canManageUsers && (
                <>
                  <Link
                    href="/admin/cycles"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                    role="menuitem"
                  >
                    <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <span>Chu kỳ</span>
                  </Link>
                  <Link
                    href="/admin/users"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                    role="menuitem"
                  >
                    <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <span>Người dùng</span>
                  </Link>
                </>
              )}
              {canManageAssignments && (
                <Link
                  href="/admin/assignments"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                  role="menuitem"
                >
                  <UserCheck className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>Gán đơn vị</span>
                </Link>
              )}
              {canManagePeriods && (
                <Link
                  href="/admin/periods"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                  role="menuitem"
                >
                  <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>Kỳ báo cáo</span>
                </Link>
              )}
              {canManageSettings && (
                <Link
                  href="/admin/settings"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                  role="menuitem"
                >
                  <SlidersHorizontal className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>Cấu hình</span>
                </Link>
              )}
              {canViewAudit && (
                <Link
                  href="/admin/audit"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                  role="menuitem"
                >
                  <History className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>Nhật ký</span>
                </Link>
              )}
            </div>
          )}

          {/* Account and Logout items */}
          <div className="py-1">
            <Link
              href="/change-password"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
              role="menuitem"
            >
              <KeyRound className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span>Đổi mật khẩu</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loadingLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition text-left disabled:opacity-50"
              role="menuitem"
            >
              <LogOut className="h-4 w-4 text-red-500" aria-hidden="true" />
              <span>{loadingLogout ? 'Đang đăng xuất...' : 'Đăng xuất'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
