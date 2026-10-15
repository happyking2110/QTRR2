import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UsersView } from './UsersView';
import * as client from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type UserListItem = components['schemas']['UserListItem'];
type UnitSummary = components['schemas']['UnitSummary'];

// Mock Next.js navigation
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/admin/users',
}));

describe('UsersView', () => {
  const mockUnits: UnitSummary[] = [
    { code: 'BAN_CNTT', name: 'Ban Công nghệ Thông tin', kind: 'department' },
    { code: 'TT_KD', name: 'Trung tâm Kinh doanh', kind: 'center' },
  ];

  const mockUsers: UserListItem[] = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'admin@mobifone.vn',
      fullName: 'Quản trị viên Hệ thống',
      role: 'admin',
      unit: null,
      isActive: true,
      mustChangePassword: false,
      lockedUntil: null,
      lastLoginAt: '2026-10-12T08:30:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'unit.user@mobifone.vn',
      fullName: 'Trần Đơn Vị',
      role: 'unit',
      unit: { code: 'BAN_CNTT', name: 'Ban Công nghệ Thông tin', kind: 'department' },
      isActive: true,
      mustChangePassword: true,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: '2026-02-01T00:00:00Z',
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'locked.user@mobifone.vn',
      fullName: 'Lê Tạm Khóa',
      role: 'viewer',
      unit: null,
      isActive: true,
      mustChangePassword: false,
      lockedUntil: '2026-10-13T12:00:00Z', // Future lock
      lastLoginAt: '2026-10-10T10:00:00Z',
      createdAt: '2026-03-01T00:00:00Z',
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      email: 'disabled.user@mobifone.vn',
      fullName: 'Phạm Đã Tắt',
      role: 'ban4',
      unit: null,
      isActive: false,
      mustChangePassword: false,
      lockedUntil: null,
      lastLoginAt: '2026-09-01T00:00:00Z',
      createdAt: '2026-04-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    mockReplace.mockReset();
    mockSearchParams = new URLSearchParams();
  });

  it('renders table columns, users, and Vietnamese status badges', () => {
    render(<UsersView initialUsers={mockUsers} units={mockUnits} />);

    // Columns
    expect(screen.getByRole('columnheader', { name: 'Họ và tên' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Vai trò' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Đơn vị' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Trạng thái' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Đăng nhập gần nhất' })).toBeInTheDocument();

    // User rows
    expect(screen.getAllByText('Quản trị viên Hệ thống')[0]).toBeInTheDocument();
    expect(screen.getAllByText('admin@mobifone.vn')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Trần Đơn Vị')[0]).toBeInTheDocument();
    expect(screen.getAllByText('unit.user@mobifone.vn')[0]).toBeInTheDocument();

    // Status mapping:
    // User 1: Active
    expect(screen.getAllByText('Hoạt động')[0]).toBeInTheDocument();
    // User 2: Must change password
    expect(screen.getAllByText('Chờ đổi mật khẩu')[0]).toBeInTheDocument();
    // User 3: Locked
    expect(screen.getAllByText('Tạm khóa')[0]).toBeInTheDocument();
    // User 4: Inactive
    expect(screen.getAllByText('Đã tắt')[0]).toBeInTheDocument();

    // Last login null
    expect(screen.getAllByText('Chưa đăng nhập')[0]).toBeInTheDocument();
  });

  it('filters users by search query and updates URL search parameter', () => {
    render(<UsersView initialUsers={mockUsers} units={mockUnits} />);

    const searchInput = screen.getByPlaceholderText(/Tìm theo email hoặc họ tên/i);
    fireEvent.change(searchInput, { target: { value: 'Trần' } });

    expect(screen.getAllByText('Trần Đơn Vị')[0]).toBeInTheDocument();
    expect(screen.queryByText('Quản trị viên Hệ thống')).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('q=Tr%E1%BA%A7n'));
  });

  it('filters users by role and updates URL', () => {
    render(<UsersView initialUsers={mockUsers} units={mockUnits} />);

    const roleSelect = screen.getByLabelText(/Lọc theo vai trò/i);
    fireEvent.change(roleSelect, { target: { value: 'admin' } });

    expect(screen.getAllByText('Quản trị viên Hệ thống')[0]).toBeInTheDocument();
    expect(screen.queryByText('Trần Đơn Vị')).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('role=admin'));
  });

  it('handles reset password action and displays one-time temporary password', async () => {
    vi.spyOn(client, 'apiSend').mockResolvedValueOnce({
      temporaryPassword: 'NewTempPassword789!',
    });

    render(<UsersView initialUsers={mockUsers} units={mockUnits} />);

    // Click reset password on first user
    const resetButtons = screen.getAllByRole('button', { name: /Đặt lại mật khẩu/i });
    fireEvent.click(resetButtons[0]);

    // Modal opens asking for confirmation
    expect(screen.getByText(/Bạn có chắc chắn muốn đặt lại mật khẩu/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Xác nhận đặt lại/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText('NewTempPassword789!')).toBeInTheDocument();
    });
    expect(screen.getByText(/Mật khẩu tạm chỉ hiển thị một lần duy nhất/i)).toBeInTheDocument();
  });

  it('handles disabling user and displays 409 error when trying to disable last admin', async () => {
    const error409 = new client.ApiClientError({
      message: 'Không thể tắt quản trị viên hoạt động cuối cùng của hệ thống.',
      code: 'INVALID_STATE',
      statusCode: 409,
    });
    vi.spyOn(client, 'apiSend').mockRejectedValueOnce(error409);

    render(<UsersView initialUsers={mockUsers} units={mockUnits} />);

    // Toggle active on admin user
    const toggleButtons = screen.getAllByRole('button', { name: /Tắt tài khoản/i });
    fireEvent.click(toggleButtons[0]);

    // Confirmation dialog
    expect(screen.getByText(/Bạn có chắc muốn tắt tài khoản/i)).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /Xác nhận tắt/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Không thể tắt quản trị viên hoạt động cuối cùng của hệ thống.'),
      ).toBeInTheDocument();
    });
  });

  it('opens and closes CreateUserDialog when button is clicked', () => {
    render(<UsersView initialUsers={mockUsers} units={mockUnits} />);

    const addBtn = screen.getByRole('button', { name: /Thêm người dùng/i });
    fireEvent.click(addBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Thêm người dùng mới')).toBeInTheDocument();
  });

  it('opens and closes BulkImportUsersDialog when button is clicked', () => {
    render(<UsersView initialUsers={mockUsers} units={mockUnits} />);

    const bulkBtn = screen.getByRole('button', { name: /Nhập hàng loạt/i });
    fireEvent.click(bulkBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Nhập người dùng hàng loạt')).toBeInTheDocument();
  });
});
