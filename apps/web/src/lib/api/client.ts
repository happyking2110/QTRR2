/**
 * API client thống nhất cho frontend MBF Risk Monitor.
 * - apiGet: Server Component client qua API_BASE_URL (cache: 'no-store'), chuyển tiếp cookie phiên,
 *   tự động chuyển hướng khi 401 (/login?next=...) hoặc 403 MUST_CHANGE_PASSWORD (/change-password).
 * - apiSend: Client Component client qua cùng gốc /api/* (credentials: 'same-origin'),
 *   hỗ trợ JSON và FormData, xử lý 204, 401 window redirect, ném ApiClientError.
 * - safeNext: chuẩn hóa an toàn đường dẫn chuyển hướng sau đăng nhập.
 * - ERROR_MESSAGES: 16 ErrorCode của OpenAPI v0.3.0 + NETWORK_ERROR.
 */

export const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'Phiên làm việc đã hết hạn hoặc chưa đăng nhập.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  MUST_CHANGE_PASSWORD: 'Bạn cần đổi mật khẩu trước khi tiếp tục.',
  ACCOUNT_LOCKED: 'Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần.',
  RATE_LIMITED: 'Bạn đã thực hiện quá nhiều yêu cầu. Vui lòng thử lại sau.',
  VALIDATION: 'Dữ liệu gửi lên không hợp lệ.',
  NOT_FOUND: 'Không tìm thấy dữ liệu yêu cầu.',
  CONFLICT: 'Dữ liệu đã tồn tại hoặc xảy ra xung đột.',
  REFERENCED: 'Dữ liệu đang được tham chiếu, không thể xóa hoặc sửa.',
  PERIOD_NOT_FOUND: 'Không tìm thấy kỳ báo cáo được chọn.',
  PERIOD_CLOSED: 'Kỳ báo cáo đã đóng, không thể sửa đổi số liệu.',
  CYCLE_ARCHIVED: 'Chu kỳ đã được lưu trữ, chỉ có thể xem dữ liệu.',
  INVALID_STATE: 'Trạng thái dữ liệu không hợp lệ cho thao tác này.',
  SELF_APPROVAL: 'Không thể tự phê duyệt bản ghi do chính mình tạo.',
  IMPORT_INVALID: 'Dữ liệu tệp tải lên không hợp lệ.',
  INTERNAL: 'Đã xảy ra lỗi máy chủ nội bộ. Vui lòng liên hệ quản trị viên.',
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng hoặc thử lại sau.',
};

export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

/**
 * Kiểm tra và chuẩn hóa đường dẫn next an toàn (chống Open Redirect).
 * Chỉ chấp nhận chuỗi bắt đầu bằng đúng một dấu '/', không chứa '//', 'http:', 'https:', '\\'.
 * Nếu không hợp lệ hoặc rỗng/null, mặc định trả về '/'.
 */
export function safeNext(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') {
    return '/';
  }
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === '/login' ||
    lower.startsWith('/login?') ||
    lower.startsWith('/login/')
  ) {
    return '/';
  }
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !trimmed.includes('\\') &&
    !trimmed.toLowerCase().startsWith('/http:') &&
    !trimmed.toLowerCase().startsWith('/https:')
  ) {
    return trimmed;
  }
  return '/';
}

/**
 * Kiểm tra xem một lỗi có phải là lỗi chuyển hướng của Next.js (do redirect() ném ra) hay không.
 * Trong Server Component, các khối try/catch phải ném lại lỗi này để Next.js thực hiện chuyển hướng HTTP 307.
 */
export function isRedirectError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
    return true;
  }
  const message = (err as { message?: unknown }).message;
  if (typeof message === 'string' && message.includes('NEXT_REDIRECT')) {
    return true;
  }
  return false;
}

function normalizeFieldErrors(raw: unknown): Record<string, string> | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    const res: Record<string, string> = {};
    for (const item of raw) {
      if (item && typeof item === 'object' && 'field' in item && 'message' in item) {
        res[String(item.field)] = String(item.message);
      }
    }
    return res;
  }
  if (typeof raw === 'object') {
    return raw as Record<string, string>;
  }
  return undefined;
}

export class ApiClientError extends Error {
  code: string;
  statusCode: number;
  fieldErrors?: Record<string, string>;
  details?: unknown;
  requestId?: string;

  constructor(opts: {
    code: string;
    message: string;
    statusCode: number;
    fieldErrors?: Record<string, string>;
    details?: unknown;
    requestId?: string;
  }) {
    super(opts.message);
    this.name = 'ApiClientError';
    Object.setPrototypeOf(this, ApiClientError.prototype);
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.fieldErrors = opts.fieldErrors;
    this.details = opts.details;
    this.requestId = opts.requestId;
  }
}

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * Gọi API từ Server Component (qua API_BASE_URL).
 * - Đọc và chuyển tiếp cookie phiên của request hiện tại.
 * - Tự động redirect tới /login khi gặp 401 UNAUTHENTICATED.
 * - Tự động redirect tới /change-password khi gặp 403 MUST_CHANGE_PASSWORD.
 */
export async function apiGet<T>(
  path: string,
  params?: QueryParams,
): Promise<T> {
  const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';

  let queryString = '';
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== null && val !== undefined && val !== '') {
        searchParams.append(key, String(val));
      }
    }
    const qs = searchParams.toString();
    if (qs) {
      queryString = `?${qs}`;
    }
  }

  const url = `${baseUrl}${path}${queryString}`;

  const headersInit: Record<string, string> = {
    Accept: 'application/json',
  };

  let currentPath = '/';
  try {
    const { headers, cookies } = await import('next/headers');
    const cookieStore = cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    if (cookieHeader) {
      headersInit.cookie = cookieHeader;
    } else {
      const hCookie = headers().get('cookie');
      if (hCookie) {
        headersInit.cookie = hCookie;
      }
    }
    const pathHeader = headers().get('x-hsrr-path');
    if (pathHeader) {
      currentPath = safeNext(pathHeader);
    }
  } catch {
    // Không ở trong Server Request Context (ví dụ test unit)
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: headersInit,
      cache: 'no-store',
    });
  } catch {
    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      statusCode: 0,
      message: getErrorMessage('NETWORK_ERROR'),
    });
  }

  if (response.status === 401) {
    try {
      const { redirect } = await import('next/navigation');
      redirect(`/login?next=${encodeURIComponent(currentPath)}`);
    } catch (e) {
      if (isRedirectError(e)) {
        throw e;
      }
    }
  }

  if (!response.ok) {
    let errorData: {
      code?: string;
      message?: string;
      fieldErrors?: unknown;
      details?: unknown;
      requestId?: string;
    } | null = null;

    try {
      errorData = await response.json();
    } catch {
      errorData = null;
    }

    if (response.status === 403 && errorData?.code === 'MUST_CHANGE_PASSWORD') {
      try {
        const { redirect } = await import('next/navigation');
        redirect('/change-password');
      } catch (e) {
        if (isRedirectError(e)) {
          throw e;
        }
      }
    }

    const code = errorData?.code ?? (response.status === 404 ? 'NOT_FOUND' : 'INTERNAL');
    const defaultMsg = getErrorMessage(code);
    const message = errorData?.message && errorData.message.trim() !== ''
      ? errorData.message
      : defaultMsg;

    throw new ApiClientError({
      code,
      statusCode: response.status,
      message,
      fieldErrors: normalizeFieldErrors(errorData?.fieldErrors),
      details: errorData?.details,
      requestId: errorData?.requestId,
    });
  }

  return response.json() as Promise<T>;
}

/**
 * Gọi API từ Client Component (cùng gốc /api/...).
 * - credentials: 'same-origin' (tự động đính kèm cookie của trình duyệt).
 * - Hỗ trợ body dạng JSON hoặc FormData (không đặt Content-Type thủ công cho FormData).
 * - Trả về undefined khi status 204.
 * - Chuyển hướng window.location tới /login?next=... khi status 401.
 * - Ném ApiClientError kèm code, message, fieldErrors, details.
 */
export type ApiSendMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiSendOptions {
  method?: ApiSendMethod;
  body?: unknown | FormData;
  redirectOn401?: boolean;
}

/**
 * Gọi API từ Client Component (cùng gốc /api/...).
 * - credentials: 'same-origin' (tự động đính kèm cookie của trình duyệt).
 * - Hỗ trợ body dạng JSON hoặc FormData (không đặt Content-Type thủ công cho FormData).
 * - Hỗ trợ cả 2 dạng gọi:
 *     apiSend(method, path, body?, options?)
 *     apiSend(path, { method?, body?, redirectOn401? }?)
 * - Trả về undefined khi status 204.
 * - Chuyển hướng window.location tới /login?next=... khi status 401 (trừ khi đang ở trang auth hoặc redirectOn401=false).
 * - Ném ApiClientError kèm code, message, fieldErrors, details.
 */
export function apiSend<T = void>(
  method: ApiSendMethod,
  path: string,
  body?: unknown | FormData,
  options?: { redirectOn401?: boolean },
): Promise<T>;
export function apiSend<T = void>(
  path: string,
  options?: ApiSendOptions,
): Promise<T>;
export async function apiSend<T = void>(
  arg1: ApiSendMethod | string,
  arg2?: string | ApiSendOptions | unknown | FormData,
  arg3?: unknown | FormData,
  arg4?: { redirectOn401?: boolean },
): Promise<T> {
  let method: ApiSendMethod;
  let path: string;
  let body: unknown | FormData | undefined;
  let redirectOn401 = true;

  if (typeof arg2 === 'string') {
    method = arg1 as ApiSendMethod;
    path = arg2;
    body = arg3;
    if (arg4 && typeof arg4 === 'object' && 'redirectOn401' in arg4) {
      redirectOn401 = arg4.redirectOn401 ?? true;
    }
  } else {
    path = arg1;
    if (arg2 && typeof arg2 === 'object' && ('method' in arg2 || 'body' in arg2 || 'redirectOn401' in arg2)) {
      const opts = arg2 as ApiSendOptions;
      method = opts.method ?? 'POST';
      body = opts.body;
      if (opts.redirectOn401 !== undefined) {
        redirectOn401 = opts.redirectOn401;
      }
    } else {
      method = 'GET';
      body = undefined;
    }
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headersInit: Record<string, string> = {
    Accept: 'application/json',
  };
  if (!isFormData && body !== undefined) {
    headersInit['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: headersInit,
      body: isFormData ? (body as FormData) : (body !== undefined ? JSON.stringify(body) : undefined),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      statusCode: 0,
      message: getErrorMessage('NETWORK_ERROR'),
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (response.status === 401 && path !== '/api/auth/login' && redirectOn401) {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname.toLowerCase();
      const isAuthPage =
        currentPath === '/login' ||
        currentPath.startsWith('/login?') ||
        currentPath.startsWith('/login/') ||
        currentPath === '/change-password' ||
        currentPath.startsWith('/change-password?') ||
        currentPath.startsWith('/change-password/');

      if (!isAuthPage) {
        const nextParam = encodeURIComponent(safeNext(window.location.pathname + window.location.search));
        window.location.href = `/login?next=${nextParam}`;
      }
    }
  }

  if (!response.ok) {
    let errorData: {
      code?: string;
      message?: string;
      fieldErrors?: unknown;
      details?: unknown;
      requestId?: string;
    } | null = null;

    try {
      errorData = await response.json();
    } catch {
      errorData = null;
    }

    const code = errorData?.code ?? (response.status === 404 ? 'NOT_FOUND' : 'INTERNAL');
    const defaultMsg = getErrorMessage(code);
    const message = errorData?.message && errorData.message.trim() !== ''
      ? errorData.message
      : defaultMsg;

    throw new ApiClientError({
      code,
      statusCode: response.status,
      message,
      fieldErrors: normalizeFieldErrors(errorData?.fieldErrors),
      details: errorData?.details,
      requestId: errorData?.requestId,
    });
  }

  try {
    return (await response.json()) as T;
  } catch {
    return undefined as T;
  }
}
