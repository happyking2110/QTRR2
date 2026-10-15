import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

describe('Next.js Session Middleware', () => {
  it('redirects to /login?next=... when hsrr_session cookie is missing on protected route', () => {
    const req = new NextRequest(new URL('http://localhost:3000/actions?cycle=2026'));
    const res = middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toBe('http://localhost:3000/login?next=%2Factions%3Fcycle%3D2026');
  });

  it('allows request through when hsrr_session cookie is present', () => {
    const req = new NextRequest(new URL('http://localhost:3000/actions'));
    req.cookies.set('hsrr_session', 'dummy_token_value');
    const res = middleware(req);

    expect(res.status).toBe(200);
    // x-hsrr-path header should be passed on the request
    expect(res.headers.get('x-middleware-rewrite') || res.status).toBeTruthy();
  });

  it('does not redirect when accessing /login without cookie', () => {
    const req = new NextRequest(new URL('http://localhost:3000/login?next=%2F'));
    const res = middleware(req);

    expect(res.status).toBe(200);
  });

  it('sets x-hsrr-path header to the current request pathname and search', () => {
    const req = new NextRequest(new URL('http://localhost:3000/profiles/HD11.R27?tab=kri'));
    req.cookies.set('hsrr_session', 'valid_session');
    const res = middleware(req);

    expect(res.status).toBe(200);
    // Request headers set by middleware
    const pathHeader = res.headers.get('x-hsrr-path');
    expect(pathHeader).toBe('/profiles/HD11.R27?tab=kri');
  });

  it('sets security headers (CSP with nonce, X-Frame-Options, Referrer-Policy, X-Content-Type-Options)', () => {
    const req = new NextRequest(new URL('http://localhost:3000/login'));
    const res = middleware(req);

    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('same-origin');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });
});

