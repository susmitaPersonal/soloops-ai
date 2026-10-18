# Testing Strategy

> **Status:** Accepted design ([ADR-0014](adr/0014-testing-strategy-for-next-hono-mongodb.md), superseding ADR-0008), **implemented for M1**. This page holds the principles. How the suites are actually configured and run (commands, fixtures, safety rules, coverage gates) is in the operational [testing strategy](../quality/testing-strategy.md). Test cases are in [test cases](../quality/test-cases.md) and the [test plan](../quality/test-plan.md), traced in the [traceability matrix](../quality/requirements-traceability.md), with results in the [execution report](../quality/test-execution-report.md).

## Pyramid and tools

| Level | Tool | Scope | Runs in CI |
| --- | --- | --- | --- |
| Unit | Vitest | Pure domain functions: state machine, money, hashing, eligibility classification, AI output mapping | Every PR |
| Integration (API) | Vitest + in-process Hono `app.request()` + **real MongoDB replica set** | Routes → services → DB, transactions, authorisation, idempotency, concurrency | Every PR |
| Component | Vitest + React Testing Library (+ vitest-axe) | Client Components: forms, state-dependent actions, error mapping, accessibility smoke | Every PR |
| End-to-end | Playwright (+ @axe-core/playwright) | Server-rendered pages and journeys J1–J4 against a built app with the `mock` AI provider | Every PR to `main` (can be nightly if slow) |
| Security | Integration suite | Cross-workspace matrix, role matrix, CSRF, rate limits | Every PR |
| AI evaluation | Custom harness | Model quality against the evaluation set | Manual / on demand, **not** CI |

## Principles

1. **Every business rule has a test** named with its ID, for example `it('BR-010 rejects decision with mismatched hash')`. This makes `grep BR-010` find its tests.
2. **Test behaviour, not implementation.** Integration tests go through HTTP. Unit tests target pure functions.
3. **Real database for integration.** Do not mock the MongoDB driver. Use a real replica set (`mongodb-memory-server` replica-set mode or Docker). Each test file gets its own database name, which is dropped afterwards. Integration tests must also cover referential integrity, because MongoDB has no foreign keys.
4. **Positive, negative and boundary cases** for each validation rule (for example minutes 0, 1, 1440, 1441).
5. **Determinism.** Inject a clock, and use seeded UUID and idempotency key helpers. Never call real AI endpoints in CI.
6. **Concurrency tests** for decisions and invoice numbering use `Promise.all` of parallel requests and assert that exactly one success or a gapless sequence results.
7. **Property-based tests** (fast-check) for money: sum of lines = subtotal, tax rounding bounds, and no float leakage.
8. **No claims without runs.** PR descriptions report the actual commands run and their results.

## Test data

- Builders and factories in `apps/api/test/factories/` create workspaces, users, projects and so on via services (not direct collection inserts), so invariants hold.
- Two-workspace fixtures exist for isolation tests.
- No real personal data. Use obviously fake names and emails at `example.com`.

## Coverage

Coverage is reported but **no percentage target is claimed** until a baseline exists. The required gate is the traceability rule: each Must Have AC and BR has ≥ 1 passing test.

## Commands (once M1 is scaffolded)

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint + Prettier check |
| `npm run typecheck` | `tsc --noEmit` across workspaces |
| `npm test` | Unit + component + integration (starts an in-memory replica set, or uses `MONGODB_URI_TEST` pointing at `docker compose up -d mongo`) |
| `npm run test:e2e` | Playwright |
| `npm run build` | Build all workspaces |
| `npm run validate` | All of the above except E2E |
| `npm run docs:check` | Documentation link and frontmatter checks |
