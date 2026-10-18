# ADR-0016: M1 implementation choices (versions, validation, CSP, sessions, tooling)

- **Status:** Accepted
- **Date:** 2026-10-16
- **Related:** ADR-0004, ADR-0009, ADR-0010, ADR-0011, ADR-0012, ADR-0014, SEC-002, SEC-003, SEC-010, NFR-008

## Context
ADR-0009, ADR-0010 and ADR-0012 left several choices to milestone M1: exact versions, the Zod validator and OpenAPI packages, the Next.js request-interception file, the CSP strategy and BigInt round-tripping. Building the walking skeleton also exposed tooling constraints that needed decisions.

## Decision
1. **Pinned versions** (exact, in `package.json`; single `package-lock.json`): Next.js 16.4.2, React 19.3.1, Hono 4.13.13, `@hono/node-server` 2.1.5, MongoDB Node driver 7.7.0, Zod 4.6.7, Vitest 5.0.5, Playwright 1.64.1, pino 10.4.0, `@node-rs/argon2` 2.2.2. Local and CI test databases run MongoDB 8.2.x (`mongodb-memory-server` 11.3.0 downloads 8.2.6; Docker Compose uses `mongo:8.2.12`).
2. **TypeScript 6.0.3, not 7.x.** `typescript-eslint` 8.71 supports TypeScript below 6.1 only. **ESLint 9.39**, because the React lint plugins are not yet verified against ESLint 10.
3. **Validation:** `@hono/zod-validator` with a hook that throws the typed `VALIDATION_FAILED` error (422 with field paths). **OpenAPI generation is deferred** to M2 (when the first CRUD resources land). Until then `docs/architecture/api-design.md` plus the contracts package are the reference.
4. **Next.js request interception:** Next.js 16 renamed `middleware` to **`proxy.ts`**. It sets the CSP, forwards the pathname and request ID, and does an optimistic redirect when there is no session cookie (UX only).
5. **CSP:** a **per-request nonce** with `'strict-dynamic'` (no `'unsafe-inline'` for scripts). Every route renders dynamically (`dynamic = 'force-dynamic'` in the root layout), which a nonce requires. Development adds `'unsafe-eval'` and inline styles for React tooling only.
6. **Session cookie:** the opaque 32-byte token is HMAC-signed with `SESSION_SECRET` (Hono signed cookies) **and** stored only as its SHA-256 (ADR-0004). A tampered cookie is treated as signed out.
7. **BigInt:** the MongoDB client uses `useBigInt64: true`, so Int64 money round-trips as `bigint` (verified by an integration test beyond 2^53).
8. **API build:** esbuild bundles `apps/api` (internal `@soloops/*` packages compiled in; npm dependencies external). `tsup` was dropped because its current major requires a newer Node 22 minor.
9. **Rate limiting:** a small in-repo fixed-window, in-memory limiter keyed by client IP and email. `X-Forwarded-For` is trusted only when `TRUST_PROXY=true`.
10. **Lint boundaries:** a ~100-line in-repo ESLint rule (`soloops/module-boundaries`) enforces module `index.ts` imports, `ai` isolation and platform → module direction. Package-level restrictions use built-in `no-restricted-imports`. No resolver plugin is needed.

## Alternatives considered
- **TypeScript 7 / ESLint 10:** newest, but they break the type-aware lint toolchain today. Revisit when `typescript-eslint` supports them.
- **CSP with `'unsafe-inline'` scripts:** simpler and allows static pages, but much weaker against XSS. Rejected because every page is per-user and dynamic anyway.
- **`@hono/zod-openapi` now:** gives OpenAPI immediately, but changes every route definition before the API shape has settled. Deferred to M2.
- **Shared rate-limit store (MongoDB/Redis):** needed for multiple API replicas. Not needed for the single-instance MVP. Recorded as a known limitation.
- **`eslint-plugin-import-x` `no-restricted-paths`:** needs a TypeScript resolver to follow extensionless imports. The custom rule is smaller and has no dependencies.
- **`eslint-config-next`:** pulled a high-severity `npm audit` advisory (via `fast-glob` → `micromatch` → `braces`). Replaced by `eslint-plugin-react-hooks` only, which keeps `npm audit` clean.

## Rationale
These choices keep the documented architecture intact, pass the security controls without weakening them, and keep the dependency audit clean on the maintainer's Node 22.14 machine.

## Consequences
- `next.config.ts` rewrites are resolved **at build time**, so `API_INTERNAL_URL` must be set when running `next build` if the API is not on `localhost:4000`. In production the reverse proxy routes `/api/*` anyway.
- No page can be statically prerendered while the nonce CSP is in place.
- Rate limits reset when the API restarts and are per instance.
- Upgrading TypeScript or ESLint majors needs a new ADR or an amendment of this one.

## Security and operational implications
- Nonce CSP, signed and hashed session tokens, and SHA-pinned CI actions raise the baseline.
- The in-memory limiter is the main gap for horizontal scaling (see [known limitations](../../quality/known-limitations.md)).
- `npm audit --audit-level=high` reported 0 vulnerabilities on 2026-10-16 and runs in CI.
