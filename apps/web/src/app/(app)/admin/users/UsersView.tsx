'use client';

import React, { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  UserPlus,
  Upload,
  KeyRound,
  Edit2,
  Power,
  Copy,
  Check,
  AlertTriangle,
  X,
  Users,
} from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { CreateUserDialog } from './CreateUserDialog';
import { BulkImportUsersDialog } from './BulkImportUsersDialog';

type UserListItem = components['schemas']['UserListItem'];
type UnitSummary = components['schemas']['UnitSummary'];
type UserRole = components['schemas']['UserRole'];
type ResetPasswordResult = components['schemas']['ResetPasswordResult'];

export interface UsersViewProps {
  initialUsers: UserListItem[];
  units: UnitSummary[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Quản trị viên',
  ban4: 'Ban 4',
  unit: 'Đơn vị',
  viewer: 'Chỉ xem',
};

export function UsersView({ initialUsers, units }: UsersViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [users, setUsers] = useState<UserListItem[]>(initialUsers);

  // Dialog states
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  // Edit user modal state
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('unit');
  const [editUnitCode, setEditUnitCode] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Reset password modal state
  const [resetUser, setResetUser] = useState<UserListItem | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<string | null>(null);
  const [resetCopied, setResetCopied] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Toggle active modal state
  const [toggleUser, setToggleUser] = useState<UserListItem | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Search & Filter state derived from URL
  const queryParam = searchParams.get('q') ?? '';
  const roleParam = searchParams.get('role') ?? 'all';
  const unitParam = searchParams.get('unit') ?? 'all';
  const statusParam = searchParams.get('status') ?? 'all';

  const [searchQuery, setSearchQuery] = useState(queryParam);
  const [roleFilter, setRoleFilter] = useState(roleParam);
  const [unitFilter, setUnitFilter] = useState(unitParam);
  const [statusFilter, setStatusFilter] = useState(statusParam);

  const updateUrl = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (!val || val === 'all') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });
    const qs = params.toString();
    router.replace(qs ? `/admin/users?${qs}` : '/admin/users');
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    updateUrl({ q: val ? val : null });
  };

  const handleRoleChange = (val: string) => {
    setRoleFilter(val);
    updateUrl({ role: val });
  };

  const handleUnitChange = (val: string) => {
    setUnitFilter(val);
    updateUrl({ unit: val });
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    updateUrl({ status: val });
  };

  // Re-fetch users list after create/edit/import/toggle
  const refreshUsers = async () => {
    try {
      const data = await apiSend<UserListItem[]>('/api/users');
      setUsers(data);
    } catch {
      // ignore
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    const qLower = searchQuery.toLowerCase().trim();
    return users.filter((u) => {
      // Search query
      if (qLower) {
        const matchName = u.fullName.toLowerCase().includes(qLower);
        const matchEmail = u.email.toLowerCase().includes(qLower);
        if (!matchName && !matchEmail) return false;
      }

      // Role filter
      if (roleFilter !== 'all' && u.role !== roleFilter) {
        return false;
      }

      // Unit filter
      if (unitFilter !== 'all') {
        if (!u.unit || u.unit.code !== unitFilter) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        const isLocked = u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now();
        if (statusFilter === 'locked' && !isLocked) return false;
        if (statusFilter === 'must_change_password' && !u.mustChangePassword) return false;
        if (statusFilter === 'active' && (!u.isActive || isLocked)) return false;
        if (statusFilter === 'disabled' && u.isActive) return false;
      }

      return true;
    });
  }, [users, searchQuery, roleFilter, unitFilter, statusFilter]);

  const formatLastLogin = (val: string | null) => {
    if (!val) return 'Chưa đăng nhập';
    const date = new Date(val);
    if (isNaN(date.getTime())) return 'Chưa đăng nhập';

    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date);
  };

  const renderStatusBadge = (user: UserListItem) => {
    const isLocked = user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now();
    if (isLocked) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-state-bad-bg text-state-bad-line border border-state-bad-line/30">
          Tạm khóa
        </span>
      );
    }
    if (user.mustChangePassword) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-state-warn-bg text-state-warn-line border border-state-warn-line/30">
          Chờ đổi mật khẩu
        </span>
      );
    }
    if (user.isActive) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-state-ok-bg text-state-ok-line border border-state-ok-line/30">
          Hoạt động
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-state-none-bg text-text-muted border border-border">
        Đã tắt
      </span>
    );
  };

  // Row Action Handlers
  const openEditModal = (user: UserListItem) => {
    setEditingUser(user);
    setEditRole(user.role);
    setEditUnitCode(user.unit?.code ?? '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (editRole === 'unit' && !editUnitCode) {
      setEditError('Vai trò Đơn vị bắt buộc phải chọn đơn vị.');
      return;
    }

    setIsEditing(true);
    setEditError(null);

    try {
      const updated = await apiSend<UserListItem>(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        body: {
          role: editRole,
          unitCode: editRole === 'unit' || editUnitCode ? editUnitCode : null,
        },
      });

      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditingUser(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditError(err.message);
      } else {
        setEditError((err as Error).message || 'Không thể cập nhật người dùng.');
      }
    } finally {
      setIsEditing(false);
    }
  };

  const handleConfirmResetPassword = async () => {
    if (!resetUser) return;
    setIsResetting(true);
    try {
      const res = await apiSend<ResetPasswordResult>(`/api/users/${resetUser.id}/reset-password`, {
        method: 'POST',
      });
      setResetPasswordResult(res.temporaryPassword);
      // Mark user as mustChangePassword
      setUsers((prev) =>
        prev.map((u) => (u.id === resetUser.id ? { ...u, mustChangePassword: true } : u)),
      );
    } catch {
      // Error handling
    } finally {
      setIsResetting(false);
    }
  };

  const closeResetModal = () => {
    setResetUser(null);
    setResetPasswordResult(null);
    setResetCopied(false);
  };

  const handleCopyResetPassword = async () => {
    if (!resetPasswordResult) return;
    try {
      await navigator.clipboard.writeText(resetPasswordResult);
      setResetCopied(true);
      setTimeout(() => setResetCopied(false), 3000);
    } catch {
      // fallback
    }
  };

  const handleConfirmToggleActive = async () => {
    if (!toggleUser) return;
    setIsToggling(true);
    setToggleError(null);

    try {
      const updated = await apiSend<UserListItem>(`/api/users/${toggleUser.id}`, {
        method: 'PATCH',
        body: {
          isActive: !toggleUser.isActive,
        },
      });

      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setToggleUser(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setToggleError(err.message);
      } else if (err && typeof err === 'object' && 'message' in err) {
        setToggleError((err as { message: string }).message);
      } else {
        setToggleError('Không thể thay đổi trạng thái người dùng.');
      }
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-navy">
            <Users className="w-4 h-4 text-brand-blue" aria-hidden="true" />
            <span>Quản trị hệ thống</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-text mt-1">
            Quản trị người dùng
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Quản lý tài khoản, phân quyền và cấp lại mật khẩu tạm cho người dùng MBF Risk Monitor.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setBulkImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-control text-xs font-medium border border-border bg-surface text-text hover:bg-bg-page transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue"
          >
            <Upload className="w-3.5 h-3.5 text-brand-navy" aria-hidden="true" />
            <span>Nhập hàng loạt</span>
          </button>
          <button
            type="button"
            onClick={() => setCreateUserOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-control text-xs font-medium bg-brand-navy text-surface hover:bg-brand-navy-light transition-colors focus:outline-none focus:ring-2 focus:ring-brand-bright focus:ring-offset-2"
          >
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Thêm người dùng</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface border border-border rounded-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-2.5" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Tìm theo email hoặc họ tên..."
              aria-label="Tìm kiếm người dùng"
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-control border border-border bg-bg-page text-text focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>

          {/* Role Filter */}
          <div>
            <label htmlFor="user-filter-role" className="sr-only">
              Lọc theo vai trò
            </label>
            <select
              id="user-filter-role"
              value={roleFilter}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-control border border-border bg-bg-page text-text focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              <option value="all">Tất cả vai trò</option>
              <option value="admin">Quản trị viên</option>
              <option value="ban4">Ban 4</option>
              <option value="unit">Đơn vị</option>
              <option value="viewer">Chỉ xem</option>
            </select>
          </div>

          {/* Unit Filter */}
          <div>
            <label htmlFor="user-filter-unit" className="sr-only">
              Lọc theo đơn vị
            </label>
            <select
              id="user-filter-unit"
              value={unitFilter}
              onChange={(e) => handleUnitChange(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-control border border-border bg-bg-page text-text focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              <option value="all">Tất cả đơn vị</option>
              {units.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label htmlFor="user-filter-status" className="sr-only">
              Lọc theo trạng thái
            </label>
            <select
              id="user-filter-status"
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-control border border-border bg-bg-page text-text focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Hoạt động</option>
              <option value="disabled">Đã tắt</option>
              <option value="locked">Tạm khóa</option>
              <option value="must_change_password">Chờ đổi mật khẩu</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-text-muted pt-1">
          <span>Hiển thị {filteredUsers.length} người dùng</span>
          {(searchQuery || roleFilter !== 'all' || unitFilter !== 'all' || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setRoleFilter('all');
                setUnitFilter('all');
                setStatusFilter('all');
                updateUrl({ q: null, role: null, unit: null, status: null });
              }}
              className="text-brand-blue hover:text-brand-navy underline"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Users Table (Desktop) */}
      <div className="hidden md:block bg-surface border border-border rounded-card overflow-hidden shadow-sm">
        <table className="w-full text-xs text-left">
          <thead className="bg-bg-page text-text-muted border-b border-border font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Họ và tên</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Vai trò</th>
              <th className="py-3 px-4">Đơn vị</th>
              <th className="py-3 px-4">Trạng thái</th>
              <th className="py-3 px-4">Đăng nhập gần nhất</th>
              <th className="py-3 px-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-text-muted">
                  Không tìm thấy người dùng nào phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-bg-page/40 transition-colors">
                  <td className="py-3 px-4 font-medium text-text">{user.fullName}</td>
                  <td className="py-3 px-4 font-mono text-text-muted">{user.email}</td>
                  <td className="py-3 px-4 font-medium text-brand-navy">
                    {ROLE_LABELS[user.role]}
                  </td>
                  <td className="py-3 px-4 text-text-muted">
                    {user.unit?.name || '—'}
                  </td>
                  <td className="py-3 px-4">{renderStatusBadge(user)}</td>
                  <td className="py-3 px-4 text-text-muted">
                    {formatLastLogin(user.lastLoginAt)}
                  </td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(user)}
                      className="p-1.5 rounded-control text-text-muted hover:text-brand-navy hover:bg-bg-page focus:outline-none focus:ring-1 focus:ring-brand-blue"
                      title="Sửa vai trò hoặc đơn vị"
                      aria-label={`Sửa vai trò hoặc đơn vị cho ${user.fullName}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetUser(user)}
                      className="p-1.5 rounded-control text-text-muted hover:text-brand-navy hover:bg-bg-page focus:outline-none focus:ring-1 focus:ring-brand-blue"
                      title="Đặt lại mật khẩu"
                      aria-label={`Đặt lại mật khẩu cho ${user.fullName}`}
                    >
                      <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setToggleUser(user)}
                      className={`p-1.5 rounded-control hover:bg-bg-page focus:outline-none focus:ring-1 focus:ring-brand-blue ${
                        user.isActive
                          ? 'text-text-muted hover:text-state-bad-line'
                          : 'text-state-bad-line hover:text-state-ok-line'
                      }`}
                      title={user.isActive ? 'Tắt tài khoản' : 'Bật tài khoản'}
                      aria-label={user.isActive ? `Tắt tài khoản ${user.fullName}` : `Bật tài khoản ${user.fullName}`}
                    >
                      <Power className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Users Cards (Mobile) */}
      <div className="md:hidden space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="p-6 text-center text-xs text-text-muted bg-surface rounded-card border border-border">
            Không tìm thấy người dùng nào phù hợp với bộ lọc.
          </div>
        ) : (
          filteredUsers.map((user) => (
            <div
              key={user.id}
              className="bg-surface border border-border rounded-card p-4 space-y-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-text">{user.fullName}</h2>
                  <p className="text-xs font-mono text-text-muted mt-0.5">{user.email}</p>
                </div>
                {renderStatusBadge(user)}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border">
                <div>
                  <span className="text-text-muted block">Vai trò:</span>
                  <span className="font-medium text-brand-navy">{ROLE_LABELS[user.role]}</span>
                </div>
                <div>
                  <span className="text-text-muted block">Đơn vị:</span>
                  <span className="text-text">{user.unit?.name || '—'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-text-muted block">Đăng nhập gần nhất:</span>
                  <span className="text-text">{formatLastLogin(user.lastLoginAt)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => openEditModal(user)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-control text-xs border border-border text-text hover:bg-bg-page"
                >
                  <Edit2 className="w-3 h-3" aria-hidden="true" />
                  <span>Sửa</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResetUser(user)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-control text-xs border border-border text-text hover:bg-bg-page"
                >
                  <KeyRound className="w-3 h-3" aria-hidden="true" />
                  <span>Đặt lại MK</span>
                </button>
                <button
                  type="button"
                  onClick={() => setToggleUser(user)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-control text-xs border ${
                    user.isActive
                      ? 'border-state-bad-line/30 text-state-bad-line hover:bg-state-bad-bg/30'
                      : 'border-state-ok-line/30 text-state-ok-line hover:bg-state-ok-bg/30'
                  }`}
                >
                  <Power className="w-3 h-3" aria-hidden="true" />
                  <span>{user.isActive ? 'Tắt' : 'Bật'}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create User Dialog */}
      <CreateUserDialog
        open={createUserOpen}
        units={units}
        onOpenChange={setCreateUserOpen}
        onSuccess={refreshUsers}
      />

      {/* Bulk Import Users Dialog */}
      <BulkImportUsersDialog
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        onSuccess={refreshUsers}
      />

      {/* Edit Role / Unit Modal */}
      {editingUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        >
          <div className="w-full max-w-md bg-surface border border-border rounded-card shadow-lg p-6 text-text">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 id="edit-user-title" className="text-base font-bold">
                Cập nhật vai trò & đơn vị
              </h2>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 rounded-control text-text-muted hover:text-text"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="py-4 space-y-4">
              <div>
                <span className="text-xs text-text-muted block">Người dùng</span>
                <span className="text-sm font-semibold text-text">{editingUser.fullName}</span>
                <span className="text-xs font-mono text-text-muted block">{editingUser.email}</span>
              </div>

              {editError && (
                <div role="alert" className="p-2.5 rounded-control bg-state-bad-bg/30 text-xs text-state-bad-line">
                  {editError}
                </div>
              )}

              <div>
                <label htmlFor="edit-user-role" className="block text-xs font-semibold text-text mb-1">
                  Vai trò mới
                </label>
                <select
                  id="edit-user-role"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-xs rounded-control border border-border bg-surface text-text"
                >
                  <option value="unit">Đơn vị</option>
                  <option value="ban4">Ban 4</option>
                  <option value="viewer">Chỉ xem</option>
                  <option value="admin">Quản trị viên</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit-user-unit" className="block text-xs font-semibold text-text mb-1">
                  Đơn vị {editRole === 'unit' && <span className="text-state-bad-line">*</span>}
                </label>
                <select
                  id="edit-user-unit"
                  value={editUnitCode}
                  onChange={(e) => setEditUnitCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-control border border-border bg-surface text-text"
                >
                  <option value="">— Không chọn —</option>
                  {units.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-3.5 py-1.5 rounded-control text-xs border border-border text-text"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="px-3.5 py-1.5 rounded-control text-xs font-medium bg-brand-navy text-surface hover:bg-brand-navy-light disabled:opacity-50"
                >
                  {isEditing ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-password-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        >
          <div className="w-full max-w-md bg-surface border border-border rounded-card shadow-lg p-6 text-text">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 id="reset-password-title" className="text-base font-bold">
                Đặt lại mật khẩu
              </h2>
              <button
                type="button"
                onClick={closeResetModal}
                className="p-1 rounded-control text-text-muted hover:text-text"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              {resetPasswordResult ? (
                <div className="space-y-4">
                  <div
                    role="alert"
                    className="p-3 rounded-card bg-state-warn-bg/30 border border-state-warn-line/40 text-xs text-text flex items-start gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 text-state-warn-line shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <strong className="font-semibold">Mật khẩu tạm chỉ hiển thị một lần duy nhất!</strong>
                      <p className="mt-0.5">
                        Người dùng sẽ bị buộc đổi mật khẩu khi đăng nhập bằng mật khẩu này.
                      </p>
                    </div>
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-text-muted mb-1.5">
                      Mật khẩu tạm thời mới
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-bg-page border border-border rounded-control px-3 py-2 font-mono text-sm font-bold text-brand-navy select-all tracking-wider">
                        {resetPasswordResult}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyResetPassword}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control text-xs font-medium bg-brand-navy text-surface hover:bg-brand-navy-light"
                      >
                        {resetCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-state-ok-line" aria-hidden="true" />
                            <span>Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border flex justify-end">
                    <button
                      type="button"
                      onClick={closeResetModal}
                      className="px-4 py-2 rounded-control text-xs font-medium bg-brand-navy text-surface hover:bg-brand-navy-light"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-text">
                    Bạn có chắc chắn muốn đặt lại mật khẩu cho người dùng{' '}
                    <strong>{resetUser.fullName}</strong> ({resetUser.email})? Mọi phiên đăng nhập hiện tại của người dùng này sẽ bị thu hồi ngay lập tức.
                  </p>

                  <div className="pt-3 border-t border-border flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeResetModal}
                      className="px-3.5 py-1.5 rounded-control text-xs border border-border text-text"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      disabled={isResetting}
                      onClick={handleConfirmResetPassword}
                      className="px-3.5 py-1.5 rounded-control text-xs font-medium bg-brand-navy text-surface hover:bg-brand-navy-light disabled:opacity-50"
                    >
                      {isResetting ? 'Đang đặt lại...' : 'Xác nhận đặt lại'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toggle Active Confirmation Modal */}
      {toggleUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="toggle-active-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        >
          <div className="w-full max-w-md bg-surface border border-border rounded-card shadow-lg p-6 text-text">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 id="toggle-active-title" className="text-base font-bold">
                {toggleUser.isActive ? 'Tắt tài khoản người dùng' : 'Kích hoạt lại tài khoản'}
              </h2>
              <button
                type="button"
                onClick={() => setToggleUser(null)}
                className="p-1 rounded-control text-text-muted hover:text-text"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              {toggleError && (
                <div role="alert" className="p-3 rounded-card bg-state-bad-bg/30 text-xs text-state-bad-line">
                  {toggleError}
                </div>
              )}

              <p className="text-xs text-text">
                {toggleUser.isActive
                  ? `Bạn có chắc muốn tắt tài khoản của ${toggleUser.fullName} (${toggleUser.email})? Người dùng sẽ không thể đăng nhập và mọi phiên hiện tại sẽ bị thu hồi.`
                  : `Bạn có muốn kích hoạt lại tài khoản của ${toggleUser.fullName} (${toggleUser.email})?`}
              </p>

              <div className="pt-3 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setToggleUser(null)}
                  className="px-3.5 py-1.5 rounded-control text-xs border border-border text-text"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={isToggling}
                  onClick={handleConfirmToggleActive}
                  className={`px-3.5 py-1.5 rounded-control text-xs font-medium text-surface disabled:opacity-50 ${
                    toggleUser.isActive
                      ? 'bg-state-bad-line hover:bg-state-bad-line/90'
                      : 'bg-brand-navy hover:bg-brand-navy-light'
                  }`}
                >
                  {isToggling
                    ? 'Đang xử lý...'
                    : toggleUser.isActive
                    ? 'Xác nhận tắt'
                    : 'Xác nhận kích hoạt'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
