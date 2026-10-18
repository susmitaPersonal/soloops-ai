# ADR-0014: Testing strategy for Next.js, Hono and MongoDB

- **Status:** Accepted
- **Date:** 2026-10-16
- **Supersedes:** [ADR-0008](0008-testing-strategy.md)
- **Related:** NFR-009, SC-1–3, [testing strategy](../testing-strategy.md)

## Context
ADR-0008 assumed Express (Supertest) and PostgreSQL. The stack is now Hono, MongoDB and Next.js App Router. The principle of testing invariants against a real database is unchanged.

## Decision
- **Unit:** Vitest for pure domain functions in `apps/api` and for `packages/*`.
- **API integration:** Vitest with `createApp(deps).request(...)` (in-process Hono, no network) against a **real MongoDB replica set**, either `mongodb-memory-server`'s replica-set mode (a real `mongod` binary) or a Docker single-node replica set. Each test file uses its own database name, and databases are dropped afterwards.
- **Component:** Vitest + React Testing Library for **Client Components**. Async Server Components are covered by E2E tests.
- **E2E:** Playwright against the built web and API, a MongoDB replica set, and the `mock` AI provider.
- **Architecture:** ESLint boundary rules (ADR-0011) plus a route-inventory test listing Hono routes (TC-ARCH-01, TC-SEC-02).
- Model evaluation stays outside CI.

## Alternatives considered
- **Mocking the MongoDB driver:** misses transactions, unique indexes and conditional-update races, which are the invariants that matter. Rejected.
- **Supertest:** unnecessary because Hono supports in-process `app.request()`.
- **Testing Server Components with RTL:** async Server Components are not well supported by RTL. Use E2E instead.

## Rationale
This keeps the real-database guarantee of ADR-0008 with tools native to the new stack.

## Consequences
- CI needs a `mongod` binary (cached download) or Docker.
- Integration tests must cover referential integrity, because MongoDB has no foreign keys (ADR-0012).

## Security and operational implications
No real AI keys or personal data in CI. Test databases are isolated and disposable.
