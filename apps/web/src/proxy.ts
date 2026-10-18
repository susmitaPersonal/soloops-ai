import { NextResponse, type NextRequest } from 'next/server';

// Production uses the __Host- prefixed name (COOKIE_SECURE=true); development the plain one.
const SESSION_COOKIES = ['__Host-soloops_sid', 'soloops_sid'];

function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  // Nonce-based CSP (security-architecture.md): every page renders dynamically, so a fresh
  // nonce per request is possible. Dev needs 'unsafe-eval' (React debugging) and inline styles
  // injected by the dev server; production does not.
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/**
 * Next.js 16 request interception (`proxy.ts`, formerly `middleware.ts`; ADR-0009 verified in M1).
 * - Sets the per-request CSP nonce.
 * - Passes the request ID and pathname to Server Components (X-Request-Id → API, NFR-010).
 * - Optimistic redirect to sign-in when no session cookie exists. This is UX only: the API
 *   remains the authority for every request (ADR-0009).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/w/') && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.search = `?returnTo=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  requestHeaders.set('x-soloops-pathname', pathname + search);
  const incomingId = request.headers.get('x-request-id');
  requestHeaders.set(
    'x-request-id',
    incomingId && /^[\w-]{1,64}$/.test(incomingId) ? incomingId : crypto.randomUUID(),
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
