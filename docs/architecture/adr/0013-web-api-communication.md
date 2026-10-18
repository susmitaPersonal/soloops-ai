# ADR-0013: Web-to-API communication over a same-origin `/api` path

- **Status:** Accepted
- **Date:** 2026-10-16
- **Related:** ADR-0004, ADR-0009, ADR-0010, SEC-002, SEC-003

## Context
With separate Next.js and Hono processes, the browser, Next.js Server Components and the API must communicate. The cookie-based session and CSRF model (ADR-0004) assumes a **single origin**.

## Decision
1. **Same origin for the browser.** The public origin (`APP_ORIGIN`) serves the UI at `/` and the API at `/api/*`.
   - **Production:** a reverse proxy routes `/api/*` to the API service and everything else to the web service.
   - **Development:** Next.js `rewrites()` forward `/api/:path*` to `API_INTERNAL_URL`.
2. **Browser → API:** Client Components use `@soloops/api-client` with relative URLs (`/api/v1/...`), `credentials: 'include'` and the `X-Requested-With: soloops` header. The API sets the session cookie itself, and the cookie passes through the proxy or rewrite unchanged.
3. **Next.js server → API:** Server Components call `API_INTERNAL_URL` directly through a `server-only` helper. It forwards the incoming `Cookie` header and the request ID, uses `cache: 'no-store'`, and performs **reads only**. Mutations always originate in the browser, so CSRF and idempotency keys follow one path.
4. **No Server Actions or Route Handlers for business operations** (ADR-0009). The API is the only mutation surface.
5. **CORS is disabled** on the API. Only same-origin requests are expected.

## Alternatives considered
- **Browser calls the API on a separate origin with CORS:** needs cross-site cookies (`SameSite=None`), which weakens CSRF protection, plus a more complex config. Rejected.
- **Next.js BFF proxies every call through Route Handlers:** an extra hop, and duplicated error, idempotency and header handling. Rejected.
- **Bearer tokens in browser storage:** exposed to XSS theft (see ADR-0004). Rejected.

## Rationale
Same-origin keeps the simple, strong cookie model of ADR-0004. A thin `server-only` fetch helper gives Server Components server-rendered data without exposing internals.

## Consequences
- Development depends on Next.js rewrites, and production depends on correct proxy routing. Both are documented in [deployment architecture](../deployment-architecture.md).
- Server-side fetches must forward cookies explicitly. Forgetting to do so yields a `401`, never another user's data, because responses are not cached.

## Security and operational implications
- The API's Origin check compares against `APP_ORIGIN`. Server-to-server GETs carry no `Origin`, which is allowed only for safe methods.
- `API_INTERNAL_URL` must point to a private network address in production.
