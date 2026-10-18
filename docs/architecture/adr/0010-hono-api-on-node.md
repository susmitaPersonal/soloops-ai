# ADR-0010: Hono API on Node.js

- **Status:** Accepted (stack directed by the maintainer). OpenAPI clause amended by [ADR-0021](0021-openapi-deferred-beyond-mvp.md): no OpenAPI document ships in the MVP release.
- **Date:** 2026-10-16
- **Supersedes:** the API part of [ADR-0001](0001-technology-stack.md)
- **Related:** ADR-0003 (modular monolith, still in force), ADR-0011, ADR-0012

## Context
ADR-0001 chose Express. The maintainer has directed Hono. The API remains the modular monolith of ADR-0003 and the only place where business rules, money and AI orchestration run.

## Decision
- `apps/api` is a Hono application served on Node.js via the Node adapter (`@hono/node-server`). It is TypeScript strict and ESM.
- `createApp(deps)` builds the Hono app from injected dependencies (config, db, clock, AI provider). `main.ts` only wires real dependencies and starts the server. Tests call `app.request()` directly.
- **Middleware:**
  - request ID
  - structured logging (pino)
  - secure headers
  - CSRF (Origin check plus a required `X-Requested-With` header)
  - body size limit
  - rate limiting
  - session
  - workspace membership
  - idempotency
  - a central `onError` mapper to problem+json
- **Validation:** Zod schemas from `@soloops/contracts` via a Zod validator middleware. The specific package (`@hono/zod-validator` or `@hono/zod-openapi`) is chosen in M1.
- **OpenAPI:** generated from the same Zod contracts and served at `/api/v1/openapi.json`. The generator is chosen in M1.
- Module routers are Hono sub-apps mounted under `/api/v1`. Tenant routers mount under `/api/v1/workspaces/:workspaceId`, behind `requireMembership`.

## Alternatives considered
- **Express (ADR-0001):** most familiar, but weaker TypeScript typing of context and validators.
- **Fastify:** fast and mature with schema validation, but its plugin and encapsulation model is heavier for new contributors.
- **Hono RPC client (`hc<AppType>`):** gives end-to-end types, but the web app would import types from `apps/api`, coupling the frontend build to backend internals. We use explicit contracts and a client package instead (ADR-0011).

## Rationale
Hono is small, typed, standards-based (Fetch `Request`/`Response`) and easy to test in-process. That suits a contributor-friendly open-source MVP.

## Consequences
- Some middleware (rate limiting, idempotency) is implemented in-repo or via small third-party packages chosen in M1.
- Route inventory for the isolation test suite (TC-SEC-02) comes from the Hono app's registered routes.

## Security and operational implications
- The API is the single authorisation point.
- It listens on an internal port (default 4000) and is reachable publicly only through the same-origin path `/api/*` (ADR-0013).
- Graceful shutdown closes the HTTP server, then the MongoDB client.
