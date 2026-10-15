import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginView } from './LoginView';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'next' ? '/actions' : null),
  }),
}));

describe('LoginView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('renders login form elements with correct accessibility and autocomplete', () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: 'UNAUTHENTICATED' }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });

    render(<LoginView />);

    expect(screen.getByText('MBF Risk Monitor')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toHaveAttribute('autocomplete', 'username');
    const pwdInput = screen.getByLabelText(/^Mật khẩu$/);
    expect(pwdInput).toHaveAttribute('autocomplete', 'current-password');
    expect(pwdInput).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByText(/Quên mật khẩu\? Liên hệ quản trị viên để được đặt lại\./i)).toBeInTheDocument();
  });

  it('toggles password visibility when eye button is clicked', () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ code: 'UNAUTHENTICATED' }),
    } as Response));

    render(<LoginView />);
    const pwdInput = screen.getByLabelText(/^Mật khẩu$/);
    expect(pwdInput).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByRole('button', { name: /Hiện mật khẩu/i });
    fireEvent.click(toggleBtn);
    expect(pwdInput).toHaveAttribute('type', 'text');

    const hideBtn = screen.getByRole('button', { name: /Ẩn mật khẩu/i });
    fireEvent.click(hideBtn);
    expect(pwdInput).toHaveAttribute('type', 'password');
  });

  it('redirects to next when user already has an active session on mount', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'user-1',
            email: 'admin@mobifone.vn',
            fullName: 'Admin',
            role: 'admin',
            unit: null,
            mustChangePassword: false,
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<LoginView />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/actions');
    });
  });

  it('successfully logs in and redirects to next when mustChangePassword is false', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: 'UNAUTHENTICATED' }),
        } as Response;
      }
      if (url === '/api/auth/login') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'user-1',
            email: 'user@mobifone.vn',
            fullName: 'User',
            role: 'viewer',
            unit: null,
            mustChangePassword: false,
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<LoginView />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'user@mobifone.vn' } });
    fireEvent.change(screen.getByLabelText(/^Mật khẩu$/), { target: { value: 'ValidPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/actions');
    });

    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('ValidPass123!'));
  });

  it('redirects to /change-password when mustChangePassword is true', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: 'UNAUTHENTICATED' }),
        } as Response;
      }
      if (url === '/api/auth/login') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'user-2',
            email: 'user2@mobifone.vn',
            fullName: 'User 2',
            role: 'unit',
            unit: null,
            mustChangePassword: true,
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<LoginView />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'user2@mobifone.vn' } });
    fireEvent.change(screen.getByLabelText(/^Mật khẩu$/), { target: { value: 'TempPassword!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/change-password');
    });
  });

  it('displays API error message under button on 401 wrong credentials', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: 'UNAUTHENTICATED' }),
        } as Response;
      }
      if (url === '/api/auth/login') {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            code: 'UNAUTHENTICATED',
            message: 'Email hoặc mật khẩu không chính xác.',
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<LoginView />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'wrong@mobifone.vn' } });
    fireEvent.change(screen.getByLabelText(/^Mật khẩu$/), { target: { value: 'WrongPass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không chính xác.');
    });
  });

  it('displays ACCOUNT_LOCKED message on 423 error', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: 'UNAUTHENTICATED' }),
        } as Response;
      }
      if (url === '/api/auth/login') {
        return {
          ok: false,
          status: 423,
          json: async () => ({
            code: 'ACCOUNT_LOCKED',
            message: 'Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần.',
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<LoginView />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'locked@mobifone.vn' } });
    fireEvent.change(screen.getByLabelText(/^Mật khẩu$/), { target: { value: 'Pass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần.');
    });
  });

  it('displays NETWORK_ERROR message on network failure', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: 'UNAUTHENTICATED' }),
        } as Response;
      }
      if (url === '/api/auth/login') {
        throw new TypeError('fetch failed');
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<LoginView />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'net@mobifone.vn' } });
    fireEvent.change(screen.getByLabelText(/^Mật khẩu$/), { target: { value: 'Pass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng hoặc thử lại sau.');
    });
  });

  it('renders login form and does not mutate window.location when /api/auth/me returns 401', async () => {
    const originalLocation = window.location;
    const mockLocation = {
      ...originalLocation,
      pathname: '/login',
      search: '?next=%2Factions',
      href: 'http://localhost:3000/login?next=%2Factions',
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: mockLocation,
    });

    try {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/auth/me') {
          return {
            ok: false,
            status: 401,
            json: async () => ({ code: 'UNAUTHENTICATED' }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<LoginView />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
      });

      expect(mockLocation.href).toBe('http://localhost:3000/login?next=%2Factions');
      expect(mockReplace).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});

