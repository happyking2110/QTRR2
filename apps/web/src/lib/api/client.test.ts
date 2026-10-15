import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiGet, apiSend, ApiClientError, getErrorMessage, safeNext, ERROR_MESSAGES, isRedirectError } from './client';

describe('client.ts API utilities', () => {
  beforeEach(() => {
    process.env.API_BASE_URL = 'http://localhost:3001';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('safeNext function (Open Redirect protection)', () => {
    it('allows valid relative paths starting with single slash', () => {
      expect(safeNext('/')).toBe('/');
      expect(safeNext('/actions')).toBe('/actions');
      expect(safeNext('/indicators?kind=kri&cycle=2026')).toBe('/indicators?kind=kri&cycle=2026');
      expect(safeNext('/admin/users')).toBe('/admin/users');
    });

    it('rejects double-slash protocol-relative URLs and external protocols', () => {
      expect(safeNext('//evil.com')).toBe('/');
      expect(safeNext('//evil.com/path')).toBe('/');
      expect(safeNext('http://evil.com')).toBe('/');
      expect(safeNext('https://evil.com')).toBe('/');
      expect(safeNext('/http://evil.com')).toBe('/');
      expect(safeNext('/https://evil.com')).toBe('/');
      expect(safeNext('/http:evil.com')).toBe('/');
    });

    it('rejects backslashes', () => {
      expect(safeNext('\\evil.com')).toBe('/');
      expect(safeNext('/\\evil.com')).toBe('/');
      expect(safeNext('/path\\something')).toBe('/');
    });

    it('falls back to "/" for null, undefined, and empty string', () => {
      expect(safeNext(null)).toBe('/');
      expect(safeNext(undefined)).toBe('/');
      expect(safeNext('')).toBe('/');
      expect(safeNext('   ')).toBe('/');
    });

    it('rejects /login paths to prevent redirect loops', () => {
      expect(safeNext('/login')).toBe('/');
      expect(safeNext('/login?next=%2F')).toBe('/');
      expect(safeNext('/login/something')).toBe('/');
      expect(safeNext('/LOGIN?next=%2F')).toBe('/');
    });
  });

  describe('apiGet client for Server Components', () => {
    it('successfully returns data for 200 JSON response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      } as unknown as Response);

      const data = await apiGet<{ status: string }>('/api/health');
      expect(data).toEqual({ status: 'ok' });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/health',
        expect.objectContaining({
          cache: 'no-store',
        }),
      );
    });

    it('handles 404 NOT_FOUND with ErrorBody', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          code: 'NOT_FOUND',
          message: 'Không tìm thấy dữ liệu',
          requestId: 'req-404',
        }),
      } as unknown as Response);

      await expect(apiGet('/api/profiles/UNKNOWN')).rejects.toThrow(ApiClientError);

      try {
        await apiGet('/api/profiles/UNKNOWN');
      } catch (err) {
        const apiErr = err as ApiClientError;
        expect(apiErr.code).toBe('NOT_FOUND');
        expect(apiErr.statusCode).toBe(404);
        expect(apiErr.message).toBe('Không tìm thấy dữ liệu');
        expect(apiErr.requestId).toBe('req-404');
      }
    });

    it('handles 422 VALIDATION with fieldErrors record', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          code: 'VALIDATION',
          message: 'Dữ liệu không hợp lệ',
          fieldErrors: { year: 'Năm phải là số nguyên' },
        }),
      } as unknown as Response);

      try {
        await apiGet('/api/cycles');
      } catch (err) {
        const apiErr = err as ApiClientError;
        expect(apiErr.code).toBe('VALIDATION');
        expect(apiErr.statusCode).toBe(422);
        expect(apiErr.fieldErrors).toEqual({ year: 'Năm phải là số nguyên' });
      }
    });

    it('handles network failure with Vietnamese message', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED'));

      try {
        await apiGet('/api/overview');
      } catch (err) {
        const apiErr = err as ApiClientError;
        expect(apiErr.code).toBe('NETWORK_ERROR');
        expect(apiErr.statusCode).toBe(0);
        expect(apiErr.message).toBe('Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng hoặc thử lại sau.');
      }
    });

    it('throws redirect error on 401 response and re-throws when caller checks isRedirectError', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'UNAUTHENTICATED',
          message: 'Phiên làm việc đã hết hạn hoặc chưa đăng nhập.',
        }),
      } as unknown as Response);

      let caughtError: unknown = null;
      let rethrown = false;

      try {
        try {
          await apiGet('/api/cycles');
        } catch (err) {
          if (isRedirectError(err)) {
            rethrown = true;
            throw err;
          }
        }
      } catch (outerErr) {
        caughtError = outerErr;
      }

      expect(rethrown).toBe(true);
      expect(isRedirectError(caughtError)).toBe(true);
      expect((caughtError as Error).message).toBe('NEXT_REDIRECT');
    });

    it('throws redirect error to /change-password on 403 MUST_CHANGE_PASSWORD', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          code: 'MUST_CHANGE_PASSWORD',
          message: 'Bạn cần đổi mật khẩu trước khi tiếp tục.',
        }),
      } as unknown as Response);

      let caughtError: unknown = null;
      let rethrown = false;

      try {
        try {
          await apiGet('/api/overview');
        } catch (err) {
          if (isRedirectError(err)) {
            rethrown = true;
            throw err;
          }
        }
      } catch (outerErr) {
        caughtError = outerErr;
      }

      expect(rethrown).toBe(true);
      expect(isRedirectError(caughtError)).toBe(true);
    });
  });

  describe('isRedirectError helper', () => {
    it('returns true for Next.js redirect errors with digest', () => {
      const err = new Error('NEXT_REDIRECT');
      (err as unknown as { digest: string }).digest = 'NEXT_REDIRECT;replace;/login?next=%2F;307;';
      expect(isRedirectError(err)).toBe(true);
    });

    it('returns true for error with NEXT_REDIRECT message', () => {
      expect(isRedirectError(new Error('NEXT_REDIRECT'))).toBe(true);
    });

    it('returns false for normal errors, ApiClientError, null, and undefined', () => {
      expect(isRedirectError(new Error('Something failed'))).toBe(false);
      expect(isRedirectError(new ApiClientError({ code: 'NOT_FOUND', statusCode: 404, message: 'Not found' }))).toBe(false);
      expect(isRedirectError(null)).toBe(false);
      expect(isRedirectError(undefined)).toBe(false);
      expect(isRedirectError('NEXT_REDIRECT')).toBe(false);
      expect(isRedirectError({})).toBe(false);
    });
  });

  describe('apiSend client for Client Components', () => {
    it('calls fetch with same-origin credentials and Content-Type for JSON body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as unknown as Response);

      const res = await apiSend('POST', '/api/auth/login', { email: 'a@mobifone.vn', password: '123' });
      expect(res).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          credentials: 'same-origin',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Accept: 'application/json',
          }),
          body: JSON.stringify({ email: 'a@mobifone.vn', password: '123' }),
        }),
      );
    });

    it('does not set Content-Type header when body is FormData', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ createdCount: 1 }),
      } as unknown as Response);

      const formData = new FormData();
      formData.append('file', new Blob(['test']), 'test.csv');

      await apiSend('POST', '/api/users/import', formData);
      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = call[1].headers;
      expect(headers['Content-Type']).toBeUndefined();
      expect(headers.Accept).toBe('application/json');
    });

    it('returns undefined for 204 No Content response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      } as unknown as Response);

      const res = await apiSend('POST', '/api/auth/logout');
      expect(res).toBeUndefined();
    });

    it('redirects window.location to /login?next=... on 401 response', async () => {
      const mockLocation = {
        pathname: '/actions',
        search: '?cycle=2026',
        href: '',
      };
      vi.stubGlobal('window', {
        location: mockLocation,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'UNAUTHENTICATED',
          message: 'Hết phiên đăng nhập',
        }),
      } as unknown as Response);

      await expect(apiSend('GET', '/api/auth/me')).rejects.toThrow(ApiClientError);
      expect(mockLocation.href).toBe('/login?next=%2Factions%3Fcycle%3D2026');
    });

    it('does not redirect on 401 when current page is /login', async () => {
      const mockLocation = {
        pathname: '/login',
        search: '?next=%2F',
        href: 'http://localhost:3000/login?next=%2F',
      };
      vi.stubGlobal('window', {
        location: mockLocation,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'UNAUTHENTICATED',
          message: 'Chưa đăng nhập',
        }),
      } as unknown as Response);

      await expect(apiSend('GET', '/api/auth/me')).rejects.toThrow(ApiClientError);
      expect(mockLocation.href).toBe('http://localhost:3000/login?next=%2F');
    });

    it('does not redirect on 401 when redirectOn401 option is false', async () => {
      const mockLocation = {
        pathname: '/dashboard',
        search: '',
        href: 'http://localhost:3000/dashboard',
      };
      vi.stubGlobal('window', {
        location: mockLocation,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'UNAUTHENTICATED',
          message: 'Chưa đăng nhập',
        }),
      } as unknown as Response);

      await expect(
        apiSend('/api/auth/me', { method: 'GET', redirectOn401: false }),
      ).rejects.toThrow(ApiClientError);
      expect(mockLocation.href).toBe('http://localhost:3000/dashboard');
    });

    it('extracts details from IMPORT_INVALID error', async () => {
      const errorDetails = [
        { row: 2, field: 'email', message: 'Email đã tồn tại' },
        { row: 3, field: 'role', message: 'Vai trò không hợp lệ' },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          code: 'IMPORT_INVALID',
          message: 'Dữ liệu tệp không hợp lệ',
          details: errorDetails,
        }),
      } as unknown as Response);

      try {
        await apiSend('POST', '/api/users/import', new FormData());
      } catch (err) {
        const apiErr = err as ApiClientError;
        expect(apiErr.code).toBe('IMPORT_INVALID');
        expect(apiErr.statusCode).toBe(422);
        expect(apiErr.details).toEqual(errorDetails);
      }
    });

    it('handles network failure in apiSend with NETWORK_ERROR', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      try {
        await apiSend('POST', '/api/auth/login', {});
      } catch (err) {
        const apiErr = err as ApiClientError;
        expect(apiErr.code).toBe('NETWORK_ERROR');
        expect(apiErr.message).toBe('Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng hoặc thử lại sau.');
      }
    });
  });

  describe('getErrorMessage mapping for 16 OpenAPI ErrorCodes', () => {
    const codes = [
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'MUST_CHANGE_PASSWORD',
      'ACCOUNT_LOCKED',
      'RATE_LIMITED',
      'VALIDATION',
      'NOT_FOUND',
      'CONFLICT',
      'REFERENCED',
      'PERIOD_NOT_FOUND',
      'PERIOD_CLOSED',
      'CYCLE_ARCHIVED',
      'INVALID_STATE',
      'SELF_APPROVAL',
      'IMPORT_INVALID',
      'INTERNAL',
      'NETWORK_ERROR',
    ];

    it.each(codes)('has a non-empty Vietnamese message for code "%s"', (code) => {
      const msg = getErrorMessage(code);
      expect(msg).toBeTruthy();
      expect(msg).not.toBe('Đã xảy ra lỗi. Vui lòng thử lại.');
      expect(ERROR_MESSAGES[code]).toBe(msg);
    });

    it('kiểm tra chính xác thông báo tiếng Việt cho PERIOD_CLOSED, SELF_APPROVAL, INVALID_STATE, CYCLE_ARCHIVED (W1)', () => {
      expect(getErrorMessage('PERIOD_CLOSED')).toBe('Kỳ báo cáo đã đóng, không thể sửa đổi số liệu.');
      expect(getErrorMessage('SELF_APPROVAL')).toBe('Không thể tự phê duyệt bản ghi do chính mình tạo.');
      expect(getErrorMessage('INVALID_STATE')).toBe('Trạng thái dữ liệu không hợp lệ cho thao tác này.');
      expect(getErrorMessage('CYCLE_ARCHIVED')).toBe('Chu kỳ đã được lưu trữ, chỉ có thể xem dữ liệu.');
    });

    it('falls back to default message for unknown codes', () => {
      expect(getErrorMessage('UNKNOWN_CODE_XYZ')).toBe('Đã xảy ra lỗi. Vui lòng thử lại.');
    });
  });
});
