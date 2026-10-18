# Security Architecture

> **Status:** Proposed. Requirements SEC-001…011, PRV-001…005 are in [requirements](../product/requirements.md#security-requirements). Use the `soloops-security-review` skill or the `security-reviewer` agent for reviews.

## Threat model summary

| Asset | Threats | Key controls |
| --- | --- | --- |
| Workspace data (clients, scope, invoices) | Cross-tenant access (IDOR), account takeover, NoSQL operator injection | Membership middleware, `TenantCollection` scoping, 404 on foreign IDs, Zod-validated filters, argon2id, rate limits |
| Next.js server rendering | Per-user data cached and served to another user | `cache: 'no-store'`, dynamic rendering for protected routes, no secrets in the web app ([ADR-0009](adr/0009-nextjs-app-router-frontend.md)) |
| Approval records | Forgery, tampering, repudiation | Immutable records bound to a content hash, append-only audit, no update/delete paths, DB grants |
| Invoices | Billing unapproved work, number manipulation, double issue | Eligibility service, owner-only issue, transactional gapless numbering, idempotency |
| Session | Theft, fixation, CSRF | HttpOnly/Secure/SameSite cookies, rotation on login, Origin + custom header check |
| AI channel | Prompt injection, data leakage to provider, key leakage | No tools or write capability, schema validation, minimisation, opt-in disclosure, secret handling |
| Supply chain | Malicious or vulnerable dependency | Lockfile, `npm audit` in CI, Dependabot or Renovate, minimal dependencies, license check |

## Authentication

- argon2id with parameters set via config. Initial target: memory ≥ 19 MiB, iterations ≥ 2, parallelism 1, tuned so hashing takes about 100–500 ms on the reference server. Use a maintained native implementation chosen in M1.
- Passwords: minimum 12 characters, maximum 256, no composition rules. A breached-password check is post-MVP.
- Login errors are generic. Timing is equalised by hashing a dummy password when the user is not found.
- Sessions: a 32-byte random token goes in the cookie and only its SHA-256 is stored. Idle timeout 7 days, absolute timeout 30 days (configurable). The session ID rotates on login, and the session is deleted on logout.
- Cookie: `soloops_sid` in development, or `__Host-soloops_sid` when `COOKIE_SECURE=true` (required in production). It is `HttpOnly`, `SameSite=Lax`, `Path=/`, and HMAC-signed with `SESSION_SECRET`. Registering or signing in while a session exists revokes the old session.
- Rate limits (implemented in M1): per IP + email, per email, and per IP buckets. `X-Forwarded-For` is trusted only with `TRUST_PROXY=true`, and then only its rightmost hop. Concurrent argon2id work is capped.

## Authorisation and tenant isolation

1. All tenant routes include `:workspaceId` and pass through `requireMembership`.
2. Repositories only receive `TenantCollection` wrappers, which inject `workspaceId` into every filter, insert and aggregation. Only `platform/db` can touch raw collections (lint-enforced, [ADR-0012](adr/0012-mongodb-and-data-access.md)).
3. MongoDB has no foreign keys. Before linking documents, services load each referenced document through the same workspace scope, so a foreign ID is "not found". Integration tests cover this.
4. Foreign or nonexistent IDs return `404` with identical bodies.
5. Owner-only operations: settings, members, AI enablement, invoice issue/void, export (SEC-011).
6. **Test obligation:** a parameterised integration suite iterates over every tenant endpoint with a user from workspace B against resources of workspace A and expects `404`. Adding an endpoint without adding it to this suite fails the "route inventory" test.

## Input and output handling

- Zod validation on every body, param and query. Unknown keys are stripped. String length limits come from the [data model](data-model.md).
- **NoSQL injection:** MongoDB filters are built only from validated primitives. Request objects are never passed into a query, which prevents operators such as `$ne` or `$where` being injected. Server-side JavaScript (`$where`, `$function`) is not used.
- JSON body limit is 256 KB.
- All user and AI text is rendered as text, with no `dangerouslySetInnerHTML`. If Markdown rendering is added later, it must use a sanitiser.
- Security headers: the API uses Hono's secure-headers middleware. HTML pages get headers from the Next.js `headers()` config: a **per-request nonce CSP** set in `apps/web/src/proxy.ts` (`script-src 'self' 'nonce-…' 'strict-dynamic'`, no `'unsafe-inline'` scripts; every page renders dynamically, ADR-0016), `frame-ancestors 'none'`, HSTS in production, `Referrer-Policy: same-origin`.

## CSRF

The web and API are served from one origin (`/` and `/api/*`, see [ADR-0013](adr/0013-web-api-communication.md)). Cookies are `SameSite=Lax`. Every non-GET request must include `X-Requested-With: soloops` and an `Origin` header matching `APP_ORIGIN`. CORS is disabled (same-origin only).

## Secrets management

- Secrets (`SESSION_SECRET`, credentials inside `MONGODB_URI`, `AI_API_KEY`) come from the environment or the platform secret store only.
- `.env` is git-ignored. `.env.example` contains placeholders only.
- Config validation errors name the variable but never print its value. Logger redaction is configured ([backend](backend-architecture.md#logging)).

## Audit logging

Actions listed in BR-028 insert an `auditEvents` document in the same MongoDB transaction. Audit events and approvals have no update or delete code paths. In production, the app connects with a custom MongoDB role that allows only `find` and `insert` on `auditEvents` and `approvals` ([ADR-0012](adr/0012-mongodb-and-data-access.md)).

## AI-specific risks

| Risk | Mitigation |
| --- | --- |
| Prompt injection in client text tries to change state | Architecturally impossible: the analysis endpoint only returns data. Tested in AC-009.6 |
| Injection tries to exfiltrate other data | The prompt contains only data from this project. The model has no tools or retrieval |
| Hallucinated requirements or facts | Unknown keys dropped. Human review mandatory. AI provenance badges |
| Data shared with a third-party provider | Opt-in per workspace with disclosure. Minimised payload. Operators can self-host an endpoint |
| Cost abuse | Per-workspace rate limits and a concurrency limit of 1 per version |

## Dependency and supply-chain security

- Commit `package-lock.json` and use `npm ci` in CI.
- `npm audit --audit-level=high` in CI. Failures block merge unless an issue documents an accepted risk.
- Automated dependency update PRs.
- License allow-list check (NFR-014).
- Keep GitHub Actions minimal and pin third-party actions to a commit SHA.

## Secure deployment defaults

- `NODE_ENV=production` requires `COOKIE_SECURE=true`, a `SESSION_SECRET` of ≥ 32 bytes and HTTPS (TLS terminated at the reverse proxy).
- The container runs as a non-root user on a read-only filesystem except a tmp directory.
- MongoDB is not exposed publicly. Remote connections use TLS. The app user has least-privilege custom roles (no admin, no `dropDatabase`).
- The web container holds no secrets and reaches the API only over the private network (`API_INTERNAL_URL`).
- Backups are encrypted at rest by the storage provider, and restore is rehearsed (NFR-016).
