# Testing Strategy (operational)

> **Scope:** how the SoloOps AI test system is built and run **today** (after milestone M2). The architectural decision is [ADR-0014](../architecture/adr/0014-testing-strategy-for-next-hono-mongodb.md), and the design-level principles live in [architecture/testing-strategy.md](../architecture/testing-strategy.md). Test cases are in [test-cases.md](test-cases.md) and results in [test-execution-report.md](test-execution-report.md).

## 1. Test levels and tools

| Level | Tool | Location | What it proves | Database |
| --- | --- | --- | --- | --- |
| Unit | Vitest 5 | `apps/api/src/**/*.test.ts`, `packages/*/src/*.test.ts`, `apps/web/src/**/*.test.ts` | Pure logic: session-token rules, query guards, If-Match parsing, error mapping, DTO mapping, money-string conversion, schemas, baseline content hash (BR-005), task-scope decision (BR-015) | None |
| API integration | Vitest + in-process Hono `app.request()` | `apps/api/test/*.test.ts` | Routes → services → **real MongoDB**: auth, isolation, roles, CSRF, rate limits, transactions, indexes, validators, health | Real single-node replica set |
| Component | Vitest + React Testing Library + jsdom | `apps/web/src/**/*.test.tsx` | Client Components: forms, validation, error mapping, loading/empty/error states, labels, keyboard, focus | None (API client mocked at the module boundary) |
| Architecture | Vitest + ESLint API | `packages/config/test/boundaries.test.ts` | TC-ARCH-01 import boundaries (`mongodb` only in `platform/db`, `ai` isolation, isomorphic packages) | None |
| End-to-end | Playwright 1.64 (+ axe-core) | `e2e/tests/*.spec.ts` | Built web + built API in a real browser: journeys, CSP, cookies, redirects, accessibility, 360 px layout | Real replica set started by `e2e/stack.mjs` |
| Security | Integration + E2E suites | `security*.test.ts`, E2E | Cross-workspace matrix, route inventory, role matrix, CSRF, rate-limit bypasses, redaction, CSP | As above |
| AI evaluation | Planned harness, **not** CI | — | Model quality on the evaluation set | — (not built: needs a real endpoint and a dataset, ai-architecture §7) |

No other test tools are installed. In particular there is no Supertest, no mocked MongoDB driver and no repository-level mock that stands in for database behaviour (ADR-0014).

## 2. Commands

| Command | Runs |
| --- | --- |
| `npm test` | All Vitest suites in every workspace (unit + component + integration + architecture) |
| `npm run test:unit` | API unit tests (`apps/api/src`) plus packages and web |
| `npm run test:integration` | API integration tests (`apps/api/test`) |
| `npm run test:coverage` | All Vitest suites with V8 coverage and quality gates (fails below thresholds) |
| `npm run test:e2e` | Playwright. Run `npm run build` first, and `npx playwright install chromium` once |
| `npm run test:all` | `npm test`, build, then E2E |
| `npm run validate` | Lint, typecheck, `npm test`, build, docs check (what CI runs, plus E2E and audit in CI) |
| Single file | `npx vitest run test/identity.test.ts` inside the workspace |

## 3. Environment separation and safety

- **No production database, ever.** Each API test file creates its own database named `soloops_test_<16 hex>` and drops it in `afterAll` (`apps/api/test/helpers.ts`). `INF-02` proves the drop happens.
- **Default database:** `mongodb-memory-server` starts a real `mongod` 8.2.6 single-node replica set in `test/global-setup.ts`. Transactions, unique indexes, TTL indexes and `$jsonSchema` validators are real.
- **External database (optional):** `MONGODB_URI_TEST`. The global setup **refuses** non-local hosts and `mongodb+srv://` URIs unless `ALLOW_REMOTE_TEST_DB=true` (`INF-04`).
- **Configuration:** tests build config through the real `loadConfig()` with `NODE_ENV=test`, a test-only session secret, cheap argon2 parameters (production minimums are enforced only in production, and tested), and raised per-IP rate limits. Per-IP limits are tested in their own contexts in `security-hardening.test.ts`.
- **E2E:** `e2e/stack.mjs` starts its own replica set, runs the built migration script and the built API (port 4000), with a random session secret per run. Per-IP limits are raised there too, because every browser user registers from localhost.
- **Data:** only obviously fake names and `@example.com` addresses. No real personal data.
- **AI:** no AI provider exists yet. When it does (M4), CI uses only the `mock` provider, and live endpoints are never called from automated tests.

## 4. Conventions

- **Naming:** a test title starts with the ID it verifies: `TC-001.3 …`, `BR-010 …`, `TC-SEC-04 …`. Tests without a plan ID use a level prefix: `UT-` (unit), `CT-` (component), `INF-` (infrastructure), `E2E-`. This makes `grep <ID>` find the test.
- **Discovery:** `*.test.ts` / `*.test.tsx` for Vitest, `*.spec.ts` for Playwright. Unit tests sit next to the code; API integration tests live in `apps/api/test/`.
- **Determinism:** an injected `createFixedClock()` controls time (session expiry, rate-limit windows). There are no sleeps. UUIDv7 IDs are generated and never asserted by value.
- **Assertions come from the documents**, not from the code: expected values cite ACs and BRs (for example the tax boundaries −1/0/10000/10001 come from AC-002.3).
- **Queries:** RTL tests query by role, label and text, never by CSS class. A message shown both in the ErrorSummary and on its field is asserted with `toHaveAccessibleDescription` on the field. In Playwright, role names match substrings, so tab links are scoped to their `navigation` landmark and use `exact: true`.
- **Shared fixtures within a file:** tests that share a workspace never assert against default values that another test may have changed. Take a snapshot just before the request and compare with it, or create a fresh fixture. This keeps a mutation's failures pointing at the control that was removed (F-8 in the execution report).
- **Deterministic race tests:** to test an interleaving such as "the client is archived after this request read it", wrap the real `Database` so that a competing request runs, through the normal app, at that exact point: a hooked `findOne` with a session, or a hooked `withTransaction`. Then assert the outcome. Never rely on `Promise.all` timing alone for these (`apps/api/test/core-ops-races.test.ts`).
- **Defence in depth and mutations:** some controls exist in two layers. For example, OWNER is required both by `requireMembership({ role })` and by the service. Removing only one layer is correctly not detectable over HTTP, so a mutation check must remove every layer of the control.

## 5. Fixtures and factories

| Fixture | Where | Purpose |
| --- | --- | --- |
| `createTestContext(env?)` | `apps/api/test/helpers.ts` | Isolated DB, migrations applied, fixed clock, silent logger, `request()` helper that adds `Origin` and the CSRF header (each can be omitted) |
| `t.register()` | same | Registers a user **through the API** and returns cookie, user ID and workspace ID |
| `t.addMember(workspaceId, role)` | same | Adds a second user to a workspace. FR-004 (member API) is not built yet, so it inserts through the tenant-scoped collection (validator applies). Switch to the API when FR-004 lands |
| `t.twoWorkspaces()` | same | Two independent owners for isolation tests |
| `sessionCookie(res)`, `json(res)` | same | Response helpers |
| `coreOps(t, user)` | `apps/api/test/core-ops-fixtures.ts` | User-bound request helper and factories (`client`, `project`, `requirement`, `baseline`, `task`, `baselinedProject(n)`) that create data **through the API**, so fixtures pass the same validation and rules as real use |
| `registerViaUi`, `seriousAxeViolations`, `watchCsp`, `expectNoHorizontalOverflow`, `apiAs` | `e2e/tests/support.ts` | Shared E2E helpers. `apiAs` calls the real API as the signed-in browser user (cookie, CSRF header, Origin) and is used only to set up data for layout checks |
| Module mocks | web tests | `vi.mock('@/lib/api/browser')` and `vi.mock('next/navigation')`: the only mocked boundary in component tests |

## 6. Coverage and quality gates

V8 coverage (`@vitest/coverage-v8` 5.0.5) writes `coverage/` per workspace (text, HTML, `lcov`, `json-summary`). `npm run test:coverage` **fails** when a gate is missed.

| Workspace | Gate (statements / branches) | Excluded, with reason |
| --- | --- | --- |
| `apps/api` | `src/platform/**` and `src/modules/**`: 80 / 70 | `src/main.ts`, `src/migrate.ts`: process entry points that only wire dependencies, run by E2E |
| `apps/web` | `src/features/**`, `src/components/**`, `src/lib/**`: 80 / 70 | `src/app/**` (async Server Components), `src/proxy.ts`, `src/lib/api/server.ts` (`server-only`): they run only inside Next.js and are covered by Playwright |
| `packages/contracts` | 90 / 75 | None. The branch gate is 75 because the remaining branches are `??` fallbacks that `noUncheckedIndexedAccess` requires on regex captures and that cannot be reached at runtime |
| `packages/api-client` | 90 / 80 | None |
| `packages/config` | 90 / 80 | None |

Coverage is a floor, not evidence of quality. The required gate stays the traceability rule: every implemented Must Have AC and every implemented BR has at least one passing test that fails without the implementation. Mutation checks (removing a control and confirming tests fail) are recorded in the execution report.

## 7. Failure reporting

- Vitest prints failing assertions with diffs, and reports unhandled rejections as errors (exit 1). Do not ignore them: one exposed a real `SignOutButton` defect.
- Playwright keeps a trace and `error-context.md` for each failure in `e2e/test-results/`. CI uploads the HTML report on failure.
- Always check the **exit code**, not just the summary line.

## 8. AI testing (implemented in M3)

Deterministic AI tests (CI) and model-quality evaluation (manual) are **separate**:

- **Deterministic tests (CI) — implemented in M3** (`apps/api/test/scope-guard-ai.test.ts`, `src/modules/ai/domain/output.test.ts`). Three providers are used, and none of them is a real endpoint: a **scripted provider** injected through `createApp({ aiProvider })`, which records each request and scripts each answer; the **`mock` adapter** with `[mock:<name>]` scenarios, used by E2E through `stack.mjs`; and a **local HTTP stub** for the real `openai-compatible` adapter. Planned coverage was: valid structured output; missing required fields; invalid JSON with exactly one repair attempt (TC-AI-03); schema violations and unknown fields dropped; oversized output; timeouts (TC-AI-01) and provider 5xx/429 with the retry limit; prompt-injection text that tries to change state (TC-009.6); outbound payload minimisation, with no contact data, rates or invoices (TC-SEC-09); AI output can never approve, propose, price or invoice (BR-001–003, TC-AI-02). The architectural half of BR-001 is already enforced: the lint rule forbids the `ai` module from importing domain modules (TC-ARCH-01).
- **Model evaluation (manual, never CI):** the procedure in [ai-architecture.md §7](../architecture/ai-architecture.md#7-evaluation), run against the operator's chosen endpoint with an anonymised sample set. Its results never gate merges.

## 9. Known gaps in the test system

- CI has not run on GitHub yet: the repository has no remote ([release audit §13](release-readiness-audit.md#13-final-release-closure-2026-10-19)). The Docker Compose database path (`MONGODB_URI_TEST`, `E2E_MONGODB_URI`) was exercised once, locally on Windows on 2026-10-18 (release audit §11, §12.3). It has not been exercised on Linux; the CI `docker-mongodb` job covers that once CI runs.
- E2E runs Chromium only, desktop plus a Pixel 7 profile. Firefox and WebKit projects (NFR-011) are not configured yet.
- No load or performance tests (NFR-004 is planned for M6).
