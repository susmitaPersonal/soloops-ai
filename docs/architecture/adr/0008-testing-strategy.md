# ADR-0008: Testing strategy

- **Status:** Superseded by [ADR-0014](0014-testing-strategy-for-next-hono-mongodb.md) on 2026-10-16. Kept for history.
- **Date:** 2026-10-16
- **Related:** NFR-009, SC-1–3, [testing strategy](../testing-strategy.md)

## Context
Correctness of approvals, tenant isolation and money is the product's core promise. Contributors vary in experience, so tests are the main guard against regressions.

## Decision
- Vitest for unit and integration tests. Supertest against the Express app with a **real PostgreSQL** (Docker locally, a service container in CI).
- React Testing Library for components, and Playwright for end-to-end journeys using the `mock` AI provider.
- Each BR and Must Have AC has ≥ 1 test, discoverable by ID in the test name.
- Model-quality evaluation is a separate manual harness, never part of CI.

## Alternatives considered
- **Mocking the database:** faster, but misses constraint, transaction and locking behaviour that the invariants depend on. Rejected.
- **Jest:** works, but Vitest integrates natively with Vite and ESM.
- **Cypress:** viable. Playwright was chosen for multi-browser support and parallelism.

## Rationale
Real-DB integration tests verify the very invariants (unique indexes, locks, composite FKs) the design relies on.

## Consequences
CI needs a Postgres service, and tests need isolation (schema per worker or truncation).

## Security and operational implications
CI never receives real AI keys. Test fixtures contain no real personal data.
