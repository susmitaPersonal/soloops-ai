---
name: soloops-testing
description: Choose and write the right SoloOps AI tests — unit, API integration on a real MongoDB replica set, component, security, end-to-end — with positive, negative, boundary and concurrency cases named by requirement/rule ID. Use when writing tests, reviewing test coverage, reproducing a bug, or deciding how to verify a change.
---

# SoloOps testing

## Purpose
Make every business rule and acceptance criterion provably enforced, with honest results.

## When to use
- Writing or reviewing tests.
- Verifying a bug fix.
- Filling gaps in the traceability matrix.

## Required inputs
The AC, BR or bug being verified, and the code under test.

## Procedure
1. Look up the planned cases in [test-plan.md](../../../docs/quality/test-plan.md) and the strategy in [testing-strategy.md](../../../docs/architecture/testing-strategy.md).
2. **Pick the level:**
   | Subject | Level |
   | --- | --- |
   | Pure logic (state machine, money, hashing, eligibility, AI mapping) | Unit (Vitest) |
   | HTTP plus DB behaviour, authorisation, transactions, idempotency, concurrency | Integration (in-process Hono `app.request()` + real MongoDB replica set, never a mocked driver) |
   | Client Components: forms, state-dependent buttons, error mapping, a11y | Component (RTL + vitest-axe). Server Components → E2E |
   | Journeys | E2E (Playwright, `mock` AI provider) |
3. **Design the cases:**
   - positive
   - negative (invalid input → 422, wrong state → 409, stale → 412)
   - authorisation (member → 403 on owner actions, foreign workspace → 404)
   - boundaries (0, 1, max, max+1)
   - concurrency (`Promise.all` of parallel decisions or issues → exactly one success or a gapless sequence)
   - idempotent retry
   - atomicity (a forced failure rolls back the audit event too)
4. **Name tests by ID:** `it('TC-012.3 BR-010 rejects mismatched hash', …)`.
5. **Keep tests deterministic:**
   - injected clock, seeded factories, two-workspace fixtures
   - no network, no real AI
   - a unique MongoDB database per test file, dropped afterwards
   - fake data only (`example.com`)
6. **Add every new tenant endpoint** to the cross-workspace matrix (TC-SEC-01/02).
7. **Run the tests and report the actual output.**
   - If tests cannot run (for example Docker is unavailable), say so explicitly. Never mark them as passed.
8. Update the TC rows and statuses in the [traceability matrix](../../../docs/quality/requirements-traceability.md).

## Defect reports
A defect report contains:
- Expected behaviour (cite the AC or BR)
- Actual behaviour
- Minimal reproduction steps or a failing test
- Environment
- Severity

## Output
Tests, actual run results, and traceability updates.

## Quality checklist
- [ ] Each touched BR and AC has ≥ 1 test that fails without the implementation.
- [ ] Negative, boundary, authorisation and concurrency cases are included where relevant.
- [ ] No mocked MongoDB driver in integration tests (referential integrity covered, because MongoDB has no FKs). No real AI in CI.
- [ ] Results are quoted from real runs.
