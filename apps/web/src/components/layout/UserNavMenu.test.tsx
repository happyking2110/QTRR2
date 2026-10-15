import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserNavMenu } from './UserNavMenu';
import * as apiClient from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type CurrentUser = components['schemas']['CurrentUser'];

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

describe('UserNavMenu Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const adminUser: CurrentUser = {
    id: 'u-1',
    email: 'admin@mobifone.vn',
    fullName: 'Nguyễn Văn Admin',
    role: 'admin',
    unit: null,
    mustChangePassword: false,
  };

  const ban4User: CurrentUser = {
    id: 'u-2',
    email: 'ban4@mobifone.vn',
    fullName: 'Trần Thị Ban Bốn',
    role: 'ban4',
    unit: {
      code: 'BAN4',
      name: 'Ban Quản lý Rủi ro',
      kind: 'department',
    },
    mustChangePassword: false,
  };

  const unitUser: CurrentUser = {
    id: 'u-3',
    email: 'cntt@mobifone.vn',
    fullName: 'Lê Văn CNTT',
    role: 'unit',
    unit: {
      code: 'CNTT',
      name: 'Ban Công nghệ thông tin',
      kind: 'department',
    },
    mustChangePassword: false,
  };

  const viewerUser: CurrentUser = {
    id: 'u-4',
    email: 'viewer@mobifone.vn',
    fullName: 'Phạm Thị Xem',
    role: 'viewer',
    unit: null,
    mustChangePassword: false,
  };

  it('renders user button with name and toggles dropdown on click', () => {
    render(<UserNavMenu user={adminUser} />);

    const button = screen.getByRole('button', { name: /Nguyễn Văn Admin/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Quản trị viên')).toBeInTheDocument();
    expect(screen.getByText('admin@mobifone.vn')).toBeInTheDocument();
  });

  it('admin role sees "Chu kỳ", "Người dùng" and "Gán đơn vị" in menu', () => {
    render(<UserNavMenu user={adminUser} />);
    fireEvent.click(screen.getByRole('button', { name: /Nguyễn Văn Admin/i }));

    expect(screen.getByRole('menuitem', { name: 'Chu kỳ' })).toHaveAttribute('href', '/admin/cycles');
    expect(screen.getByRole('menuitem', { name: 'Người dùng' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('menuitem', { name: 'Gán đơn vị' })).toHaveAttribute('href', '/admin/assignments');
    expect(screen.getByRole('menuitem', { name: 'Đổi mật khẩu' })).toHaveAttribute('href', '/change-password');
    expect(screen.getByRole('menuitem', { name: 'Đăng xuất' })).toBeInTheDocument();
  });

  it('ban4 role sees "Gán đơn vị" and unit name, but NOT "Người dùng"', () => {
    render(<UserNavMenu user={ban4User} />);
    fireEvent.click(screen.getByRole('button', { name: /Trần Thị Ban Bốn/i }));

    expect(screen.getByText('Ban 4')).toBeInTheDocument();
    expect(screen.getByText('Ban Quản lý Rủi ro')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Gán đơn vị' })).toHaveAttribute('href', '/admin/assignments');
    expect(screen.queryByRole('menuitem', { name: 'Người dùng' })).not.toBeInTheDocument();
  });

  it('unit role does not see any admin menu items', () => {
    render(<UserNavMenu user={unitUser} />);
    fireEvent.click(screen.getByRole('button', { name: /Lê Văn CNTT/i }));

    expect(screen.getByText('Đơn vị')).toBeInTheDocument();
    expect(screen.getByText('Ban Công nghệ thông tin')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Người dùng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Gán đơn vị' })).not.toBeInTheDocument();
  });

  it('viewer role does not see any admin menu items', () => {
    render(<UserNavMenu user={viewerUser} />);
    fireEvent.click(screen.getByRole('button', { name: /Phạm Thị Xem/i }));

    expect(screen.getByText('Chỉ xem')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Người dùng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Gán đơn vị' })).not.toBeInTheDocument();
  });

  it('closes dropdown when Escape key is pressed', () => {
    render(<UserNavMenu user={adminUser} />);
    const button = screen.getByRole('button', { name: /Nguyễn Văn Admin/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('calls POST /api/auth/logout and redirects to /login on logout click', async () => {
    vi.spyOn(apiClient, 'apiSend').mockResolvedValueOnce(undefined as void);

    render(<UserNavMenu user={adminUser} />);
    fireEvent.click(screen.getByRole('button', { name: /Nguyễn Văn Admin/i }));

    const logoutBtn = screen.getByRole('menuitem', { name: 'Đăng xuất' });
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(apiClient.apiSend).toHaveBeenCalledWith('POST', '/api/auth/logout');
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('admin role sees "Chờ duyệt" with total pending count from all users', async () => {
    const mockApprovals = [
      { id: '1', submission: { submittedBy: { fullName: 'User A' } } },
      { id: '2', submission: { submittedBy: { fullName: 'User B' } } },
      { id: '3', submission: { submittedBy: { fullName: 'Nguyễn Văn Admin' } } },
      { id: '4', submission: { submittedBy: { fullName: 'User C' } } },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApprovals,
    }));

    render(<UserNavMenu user={adminUser} />);
    fireEvent.click(screen.getByRole('button', { name: /Nguyễn Văn Admin/i }));

    const approvalItem = await screen.findByRole('menuitem', { name: /Chờ duyệt/i });
    expect(approvalItem).toBeInTheDocument();
    expect(approvalItem).toHaveAttribute('href', '/approvals');
    expect(approvalItem).toHaveTextContent('4');
  });

  it('unit role sees "Chờ duyệt" with count of requests submitted by that user', async () => {
    const mockApprovals = [
      { id: '1', submission: { submittedBy: { fullName: 'User A' } } },
      { id: '2', submission: { submittedBy: { fullName: 'Lê Văn CNTT' } } },
      { id: '3', submission: { submittedBy: { fullName: 'Lê Văn CNTT' } } },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApprovals,
    }));

    render(<UserNavMenu user={unitUser} />);
    fireEvent.click(screen.getByRole('button', { name: /Lê Văn CNTT/i }));

    const approvalItem = await screen.findByRole('menuitem', { name: /Chờ duyệt/i });
    expect(approvalItem).toBeInTheDocument();
    expect(approvalItem).toHaveTextContent('2');
  });
});
