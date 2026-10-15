import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChangePasswordView } from './ChangePasswordView';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

describe('ChangePasswordView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders change password form elements with correct hints and accessibility', () => {
    render(<ChangePasswordView />);

    expect(screen.getByRole('heading', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
    expect(screen.getByText(/Tối thiểu 10 ký tự, khác 5 mật khẩu gần nhất/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mật khẩu hiện tại$/)).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText(/^Mật khẩu mới$/)).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText(/^Nhập lại mật khẩu mới$/)).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByRole('button', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
  });

  it('shows client error early when confirm password does not match', async () => {
    render(<ChangePasswordView />);

    fireEvent.change(screen.getByLabelText(/^Mật khẩu hiện tại$/), { target: { value: 'CurrentPass123' } });
    fireEvent.change(screen.getByLabelText(/^Mật khẩu mới$/), { target: { value: 'NewPassword123' } });
    fireEvent.change(screen.getByLabelText(/^Nhập lại mật khẩu mới$/), { target: { value: 'DifferentPass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    await waitFor(() => {
      expect(screen.getByText('Mật khẩu nhập lại không khớp.')).toBeInTheDocument();
    });
  });

  it('attaches server fieldErrors to corresponding inputs', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/change-password') {
        return {
          ok: false,
          status: 422,
          json: async () => ({
            code: 'VALIDATION',
            message: 'Dữ liệu không hợp lệ',
            fieldErrors: {
              oldPassword: 'Mật khẩu hiện tại không đúng',
              newPassword: 'Mật khẩu mới trùng với một trong 5 mật khẩu gần nhất',
            },
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<ChangePasswordView />);

    fireEvent.change(screen.getByLabelText(/^Mật khẩu hiện tại$/), { target: { value: 'WrongOld' } });
    fireEvent.change(screen.getByLabelText(/^Mật khẩu mới$/), { target: { value: 'SameOldPass1' } });
    fireEvent.change(screen.getByLabelText(/^Nhập lại mật khẩu mới$/), { target: { value: 'SameOldPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    await waitFor(() => {
      expect(screen.getByText('Mật khẩu hiện tại không đúng')).toBeInTheDocument();
      expect(screen.getByText('Mật khẩu mới trùng với một trong 5 mật khẩu gần nhất')).toBeInTheDocument();
    });
  });

  it('successfully changes password and redirects to /', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/change-password') {
        return {
          ok: true,
          status: 204,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<ChangePasswordView />);

    fireEvent.change(screen.getByLabelText(/^Mật khẩu hiện tại$/), { target: { value: 'CurrentValid1' } });
    fireEvent.change(screen.getByLabelText(/^Mật khẩu mới$/), { target: { value: 'BrandNewPassword123' } });
    fireEvent.change(screen.getByLabelText(/^Nhập lại mật khẩu mới$/), { target: { value: 'BrandNewPassword123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('logout button calls /api/auth/logout and redirects to /login', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/logout') {
        return {
          ok: true,
          status: 204,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<ChangePasswordView />);

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });
});
