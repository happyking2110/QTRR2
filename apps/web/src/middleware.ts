import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function applySecurityHeaders(headers: Headers, nonce: string) {
  // Content Security Policy với nonce cho script theo yêu cầu Kế hoạch 4B
  const cspHeader = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');

  headers.set('Content-Security-Policy', cspHeader);
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const currentPath = pathname + search;

  const nonce = btoa(crypto.randomUUID());
  const sessionCookie = request.cookies.get('hsrr_session')?.value;

  // Nếu không có cookie phiên hsrr_session và đường dẫn không phải /login thì chuyển hướng
  if (!sessionCookie && pathname !== '/login') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', currentPath);
    const redirectResponse = NextResponse.redirect(loginUrl);
    applySecurityHeaders(redirectResponse.headers, nonce);
    return redirectResponse;
  }

  // Chuyển tiếp request kèm tiêu đề x-hsrr-path và x-nonce để Server Components biết đường dẫn hiện tại
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-hsrr-path', currentPath);
  requestHeaders.set('x-nonce', nonce);

  applySecurityHeaders(requestHeaders, nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('x-hsrr-path', currentPath);
  applySecurityHeaders(response.headers, nonce);

  return response;
}

export const config = {
  matcher: [
    /*
     * Khớp tất cả các tuyến trừ:
     * - _next/static, _next/image, _next/webpack-hmr
     * - favicon.ico
     * - api/* (thuộc về backend qua rewrites)
     * - các tệp tài nguyên tĩnh (.svg, .png, .jpg, .woff, .woff2, ...)
     */
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
};
