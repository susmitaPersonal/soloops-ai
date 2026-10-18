# Test Execution Report

- **Latest results:** the release-closure runs of 2026-10-18 and 2026-10-19 are recorded in [release readiness audit §12–§13](release-readiness-audit.md#13-final-release-closure-2026-10-19). They supersede the counts in this report. Sections §1–§13 below are **historical**, kept as the per-milestone record.
- **Date:** 2026-10-17 (final run, then an independent re-verification pass the same day: §9). **M2 Core Ops results: §10; M3 Scope Guard and AI: §11; M4 Delivery and billable work: §12; M5 Invoices and AI resilience: §13** (each section supersedes the counts before it). **Scope of §1–§9:** milestone M1 code (identity, workspace settings, platform security and data access). **Environment:** Windows 11 Pro, Node 22.14.0, npm 10.9.2, MongoDB 8.2.6 single-node replica set via `mongodb-memory-server` 11.3.0, Playwright 1.64.1 Chromium. Docker daemon **not** running.
- Related: [testing strategy](testing-strategy.md) · [test cases](test-cases.md) · [traceability](requirements-traceability.md) · [implementation status](implementation-status.md).

## 1. Summary

| Suite | Files | Passed | Failed | Skipped | Blocked (not runnable) |
| --- | --- | --- | --- | --- | --- |
| API unit + integration (`apps/api`) | 13 | 196 | 0 | 0 | — |
| Web component + unit (`apps/web`) | 7 | 63 | 0 | 0 | — |
| Contracts (`packages/contracts`) | 1 | 49 | 0 | 0 | — |
| API client (`packages/api-client`) | 1 | 10 | 0 | 0 | — |
| Architecture TC-ARCH-01 (`packages/config`) | 1 | 15 | 0 | 0 | — |
| **Vitest total** | **23** | **333** | **0** | **0** | — |
| E2E Playwright (Chromium desktop + Pixel 7) | 3 | 9 | 0 | 13 | 13 `test.fixme` = principal workflow steps (see §5) |

Counts are Vitest/Playwright test executions (`it.each` rows count individually). `Skipped` E2E tests are exactly the 13 blocked workflow steps. Nothing else is skipped.

## 2. Commands executed (final run) and results

| Command | Result |
| --- | --- |
| `npx prettier --write apps packages e2e` | Formatted; then `prettier --check .` → "All matched files use Prettier code style!" |
| `npm run validate` | lint ✔ (0 ESLint problems), typecheck ✔ (5 workspaces), `npm test` ✔ (330 passed), build ✔ (API esbuild + `next build`), docs check ✘ **3 broken links**: they pointed at this report before it was written. Fixed by writing it, then the docs check was re-run (§6) |
| `npm run test:coverage` | Exit 0: every coverage gate met (§3) |
| `npx playwright test` (in `e2e/`, after the build from `validate`) | Exit 0: 9 passed, 13 skipped (blocked) |
| `npx playwright test --repeat-each=3` | Exit 0: 27 passed, 39 skipped. Stability check after the focus fix (§4, F-3) |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |

## 3. Coverage (V8)

| Workspace | Statements | Branches | Functions | Lines | Gate | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `apps/api` | 95.15% (569/598) | 87.81% (245/279) | 95.13% | 96.98% | platform/modules 80 / 70 | Met |
| `apps/web` | 95.77% (136/142) | 89.79% (132/147) | 96.66% | 96.18% | features/components/lib 80 / 70 | Met |
| `packages/contracts` | 100% (67/67) | 75% (12/16) | 100% | 100% | 90 / 75 | Met |
| `packages/api-client` | 100% (51/51) | 93.75% (30/32) | 100% | 100% | 90 / 80 | Met |
| `packages/config` | 93.22% (55/59) | 85.29% (29/34) | 100% | 97.87% | 90 / 80 | Met |

**Exclusions** (justified in the [testing strategy §6](testing-strategy.md#6-coverage-and-quality-gates)): API process entry points (`main.ts`, `migrate.ts`); web Server Components (`src/app/**`), `proxy.ts` and the `server-only` fetch helper. Those run only inside Next.js and are exercised by Playwright. **Remaining uncovered lines** are defensive branches: the system clock's real-time path, `??` fallbacks on regex captures, and HTTP-exception branches other than 400/413. None of them implements a business rule.

Coverage is not used as evidence of security or quality. The critical properties below are verified **explicitly** by named tests (§7).

## 4. Failures encountered and resolutions

| # | Failure | Classification | Resolution |
| --- | --- | --- | --- |
| F-1 | Web suite exited 1 with "Unhandled Rejection: Error: network" in `SignOutButton` (CT-OUT-02) while all assertions passed | **Code defect**: `try/finally` without `catch` produced an unhandled promise rejection when logout failed (offline / expired session) | Fixed in `apps/web/src/features/auth/SignOutButton.tsx`: catch, then still leave the protected area. Re-run: 0 unhandled errors, exit 0 |
| F-2 | Contracts suite exited 1: branch coverage 75% below the 80% gate | **Configuration (gate too strict for unreachable branches)** | The uncovered branches are `??` fallbacks required by `noUncheckedIndexedAccess` that cannot be reached at runtime. Gate set to 75% branches with the reason documented in `vitest.config.ts` and the strategy. Statements stay at 100% |
| F-3 | E2E journey failed: the error summary was not focused after an invalid submit (it had passed in M1) | **Code defect (a11y race, A11Y-003)**: React Hook Form's default `shouldFocusError` moved focus to the invalid input in competition with `ErrorSummary` | `shouldFocusError: false` in the three forms that render an ErrorSummary. Verified with `--repeat-each=3` (27/27 passed) |
| F-4 | E2E repeat run: registrations stalled with "Too many attempts" | **Configuration**: SEC-006 per-IP registration limit (10/hour) working as designed; every E2E user registers from localhost | Raised only the per-IP limits in the E2E stack env (`e2e/stack.mjs`, commented). Per-IP + email and per-email limits keep production values. Per-IP limits are verified in `security-hardening.test.ts` |
| F-5 | E2E: the 'wrong password' assertion matched two `role=alert` elements | **Test defect**: Next.js's route announcer also uses `role=alert` | Scoped the locator to the sign-in form |
| F-6 | API typecheck: `res.json()` typed `unknown`, raw-filter `_id` typed as `ObjectId` in tests | **Test defect** | Typed `json()` helper; explicit document types in tests |
| F-7 | (M1, recorded for completeness) Decimal money string `"1500.50"` gave a 500 instead of 422 | **Code defect**: Zod 4 ran the BigInt refinement after the regex failed | `abort: true` on the regex in `packages/contracts/src/common.ts`. Covered by `workspace.test.ts › ERR-010 …` and `contracts.test.ts` |

**Review-driven additions.** An independent `test-engineer` agent review found:
- one vacuous atomicity claim (TC-001.2 could not detect a partial write);
- missing forced-failure rollback tests for real use cases;
- missing length boundaries;
- weak audit assertions;
- three order-dependence risks.

All were addressed: `atomicity-and-boundaries.test.ts` (31 tests), exact `changedFields`, self-contained foreign-PATCH test, fresh context for TC-SEC-06, deterministic email in `error-mapping.test.ts`.

**Mutation checks** (control removed → tests must fail → restored):

| Control removed | Failing tests |
| --- | --- |
| Tenant scoping in `TenantCollection` | 12 |
| CSRF check | 5 |
| Session rotation | 1 |
| Rightmost `X-Forwarded-For` hop | 1 |
| Registration transaction | 2 (TC-001.5, TC-001.5b) |

The first four were run in M1; the registration-transaction mutation was run in this pass.

## 5. Blocked and untested requirements

**Blocked, because the code does not exist** (designed in the [test plan](test-plan.md) and listed in [test cases §8](test-cases.md#8-blocked-requirements-not-implemented-yet)):

| Area | Requirements / rules |
| --- | --- |
| Core Ops (M2) | FR-010–FR-015, BR-004/005/015/029 |
| Scope Guard (M3) | FR-020, FR-022–FR-032. Change-request state machine, version hashing, approval integrity, stale and parallel decisions (BR-006–014) |
| Open AI (M4) | FR-021, FR-050–FR-054, BR-001–003 (behavioural part), BR-027, ERR-001–003. All AI-specific cases: structured output, schema violations, timeouts, retries, prompt injection, payload minimisation |
| Billing (M5) | FR-040–FR-046, BR-016–BR-025. Eligibility, invoice maths and rounding, gapless numbering, issue idempotency |
| Other | FR-004, FR-016, FR-017, FR-060, FR-061; the AC-002.1 "defaults applied to new projects and invoices" part; idempotency middleware; pagination and filtering |
| E2E | Principal workflow steps 2–10 and variants (E2E-WF-02…14), present as `test.fixme` |

Consequently these mandatory properties are **not yet verifiable**:
- approval version integrity;
- prevention of unapproved billable work;
- invoice calculation correctness;
- AI failure handling.

What *is* verified for them today:
- the BR-001 import boundary: the `ai` module cannot import domain modules (TC-ARCH-01);
- the money representation primitives: Int64/bigint round trip and float-free decimal conversion.

**Implemented but not covered by automated tests:**
- Docker Compose database path (MAN-01).
- Firefox and WebKit (NFR-011).
- Screen-reader and dark-mode checks (MAN-02/03).
- Production-like proxy deployment (MAN-05).
- Load and performance (NFR-004).
- CI on GitHub has never run.

## 6. Verification after writing this report

| Command | Result |
| --- | --- |
| `node scripts/check-docs.mjs` | `Checked 76 Markdown files. 0 error(s), 0 warning(s).` |
| `npx prettier --check .`, `npx eslint . --max-warnings=0` | Clean (no code changed after the final test run; only docs and `ci.yml`, which now runs `npm run test:coverage`) |

## 7. Explicitly tested critical properties

| Property | Status | Evidence |
| --- | --- | --- |
| Workspace isolation | Tested | TC-SEC-01/02 matrix and route inventory, TC-TEN-01–05 (incl. revoked membership and per-workspace roles), guard unit tests, foreign invalid request is 404 (not 422/428), E2E foreign URL → 404 |
| Unauthorized state transitions | Tested for implemented transitions | Member PATCH → 403 (TC-002.2, TC-SEC-03), unauthenticated → 401, CSRF → 403, stale or concurrent update → 412 (one winner) |
| Approval version integrity | **Blocked (M3)** | — |
| Invoice calculation correctness | **Blocked (M5)** | Money primitives only (UT-MAP-01, TC-DB-01, contracts) |
| Prevention of unapproved billable work | **Blocked (M3/M5)** | — |
| AI failure handling | **Blocked (M4)** | BR-001 boundary only (TC-ARCH-01) |

## 8. Known limitations and recommended next actions

1. Push the first commit and confirm `.github/workflows/ci.yml` passes on GitHub (lint, typecheck, tests with the cached `mongod`, build, docs, contrast, E2E, audit).
2. Start Docker and run `MONGODB_URI_TEST="mongodb://localhost:27017/?replicaSet=rs0" npm run test:integration`.
3. Add Firefox and WebKit Playwright projects (NFR-011) and screen-reader smoke tests before v0.1.
4. With each milestone (M2–M5): turn the matching `test.fixme` steps and Blocked cases into real tests, add every new tenant route to `TENANT_ROUTES` (TC-SEC-02 enforces this), and add per-action TC-BR-028 rollback tests using the `failInsertsInto` pattern.
5. M4: add the deterministic AI suite with the `mock` provider ([testing strategy §8](testing-strategy.md#8-ai-testing-implemented-in-m3)), and keep model evaluation out of CI.

## 9. Re-verification pass (2026-10-17)

An independent pass re-ran every suite from a clean shell to check the results above, then looked for gaps in the **implemented** code. Docker was still unavailable (`docker info`: the daemon pipe was not found), so the in-memory replica set was used again.

### Commands and results

| # | Command | Result |
| --- | --- | --- |
| 1 | `npm run validate` (before any change) | Exit 0. 330 passed (api 193, web 63, contracts 49, api-client 10, config 15). Docs check: 76 files, 0 errors. The figures in §1–§3 reproduced exactly |
| 2 | `npm run test:coverage` | Exit 0. Same percentages as §3 |
| 3 | `npx playwright test` | Exit 0. 9 passed, 13 skipped (the blocked steps in §5) |
| 4 | `npx vitest run test/membership-lifecycle.test.ts` (new file) | 3 passed |
| 5 | Mutation checks (table below) | Each mutation caught. Sources restored and confirmed byte-identical with `cmp` |
| 6 | `npm run validate` (after the changes) | **Exit 1**: Prettier flagged the new test file (F-9) |
| 7 | `npm run test:coverage`, `npx playwright test` (same run as 6) | Both exit 0. Coverage: api 95.15% statements / 87.81% branches (unchanged, because the new tests exercise code that was already covered). E2E: 9 passed, 13 skipped |
| 8 | `npx prettier --write …`, then `npm run validate` | **Exit 0.** Vitest **333 passed, 0 failed** (api 196 in 13 files). Lint and Prettier clean, typecheck clean, build OK. Docs check: 76 files, 0 errors |

### Gap found and closed

No test removed a membership, or changed a role, **after** a session existed. A future change that cached the role or the workspace list in the session would have passed the whole suite. The new tests are `apps/api/test/membership-lifecycle.test.ts` (TC-TEN-04, TC-TEN-05 in [test cases §3](test-cases.md#3-workspace-isolation-and-authorisation-sec-004-sec-011)):
- a removed member gets 404 on the next request, and `/auth/me` stops listing the workspace;
- a downgraded owner gets 403;
- a user who belongs to two workspaces gets each workspace's own role.

### Failures and resolutions

| # | Failure | Classification | Resolution |
| --- | --- | --- | --- |
| F-8 | Removing the OWNER role checks made `TC-SEC-04 rejects a mutation from a foreign Origin` fail, although CSRF was intact | **Test defect (order dependence)**: the test compared workspace A's `taxLabel` with the default `'Tax'`. Under the mutation, an earlier test in the same file had legitimately changed it | The test now compares the whole document with a snapshot taken just before the request, sends the current `If-Match` (so a CSRF bypass would give 200 rather than 412), and asserts the `CSRF_REJECTED` code. Re-run under the role mutation: only TC-SEC-03 fails, as it should |
| F-9 | `npm run validate` exit 1: Prettier style issue in `membership-lifecycle.test.ts` | **Process slip** (the file was formatted from `apps/api` before a later edit) | Formatted from the repository root; validate then exited 0 |

### Mutation checks in this pass

| Control removed | Failing tests | Notes |
| --- | --- | --- |
| `requireMembership` role check only | 0 | Expected: the service repeats the OWNER check (defence in depth), so removing one layer is not observable over HTTP. See [testing strategy §4](testing-strategy.md#4-conventions) |
| Both OWNER checks (middleware and service) | 5 before F-8, 4 after it (TC-SEC-03, TC-002.2, TC-TEN-04 downgrade, TC-TEN-05) | The 5th failure before the fix was F-8 |
| `Origin` comparison in `csrfProtection` | 3 | Foreign-Origin and no-Origin tests. The third is a knock-on failure: the mutated logout really ends the session that the next test uses |

### What remains unchanged

§5 and §7 still apply. Approval version integrity, prevention of unapproved billable work, invoice calculation correctness and AI failure handling remain **Blocked** because that code does not exist (M3–M5). No product feature was built to make a test possible, and no blocked test was converted into a passing one.

## 10. M2 Core Ops (2026-10-17)

**Scope:** FR-010–FR-014 (clients, projects, requirements, baselines, tasks), BR-004, BR-005, BR-015, BR-028 (baseline), BR-029, plus SEC-004 for every new route. The design choices are recorded in [ADR-0017](../architecture/adr/0017-m2-core-ops-implementation-choices.md). **Environment:** as in the header (Windows 11, Node 22.14.0, MongoDB 8.2.6 replica set via `mongodb-memory-server`, Playwright Chromium). Docker was still unavailable.

### 10.1 Final results

| Suite | Files | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| API unit + integration (`apps/api`) | 20 | 382 | 0 | 0 |
| Web component + unit (`apps/web`) | 12 | 108 | 0 | 0 |
| Contracts | 2 | 65 | 0 | 0 |
| API client | 2 | 16 | 0 | 0 |
| Architecture (TC-ARCH-01) | 1 | 15 | 0 | 0 |
| **Vitest total** | **37** | **586** | **0** | **0** |
| E2E Playwright, `--repeat-each=2` (Chromium desktop + Pixel 7) | 4 | 30 (15 per run) | 0 | 22 (11 blocked `test.fixme` steps per run: E2E-WF-04…14) |

Coverage (`npm run test:coverage`, all gates met):

| Workspace | Statements | Branches |
| --- | --- | --- |
| `apps/api` (all) | 95.59% (1021/1068) | 89.03% (479/538) |
| `apps/api/src/modules/core-ops` | 95.19% | 89.08% |
| `apps/web` (gated folders) | 92.05% (498/541) | 86.87% (490/564) |
| `packages/contracts` | 100% (137/137) | 81.81% (18/22) |
| `packages/api-client` | 100% (77/77) | 95% (38/40) |
| `packages/config` | 93.22% (55/59) | 85.29% (29/34) |

### 10.2 Commands executed (final run, in order)

| Command | Result |
| --- | --- |
| `npx prettier --write apps packages e2e`, then `npm run lint && npm run typecheck && npm test && npm run build` | Exit 0. ESLint 0 problems, Prettier clean, `tsc` clean in every workspace, 586 Vitest tests passed, API bundle and `next build` OK. All 12 routes are dynamic (`ƒ`), so no per-user page is cached |
| `npm run test:coverage` | Exit 0, every gate met (§10.1) |
| `npx playwright test --repeat-each=2` (in `e2e/`, after the build) | Exit 0: 30 passed, 22 skipped |
| `npm audit --audit-level=high` | `found 0 vulnerabilities`. M2 added no dependencies |
| `npm run validate` (after writing this section) | See §10.6 |

### 10.3 Failures encountered and resolutions

| # | Failure | Classification | Resolution |
| --- | --- | --- | --- |
| M2-1 | `TC-SEC-02 route inventory` failed after the routes were added | **Expected guard** (the test exists for this) | Every new tenant route was added to the TC-SEC-01 matrix, filled with workspace A's **real** resource IDs, and the TC-SEC-01d matrix was added (resource IDs from another workspace) |
| M2-2 | `platform.test.ts › records applied scripts …` expected only migration 0001 | Test assumption outdated by the new migration | The explicit list now includes `0002-core-ops` (still an exact list) |
| M2-3 | Web RTL tests: `Found multiple elements` for server field-error text | **Test defect**: the message correctly appears in both the ErrorSummary and on the field (A11Y-003) | Assert `toHaveAccessibleDescription` on the field, which is stronger |
| M2-4 | ESLint: `!=`, and React Compiler skipping memoisation for RHF `watch()` | Code style / compatibility | `!== null`; `useWatch` instead of `watch` |
| M2-5 | E2E strict-mode violations: `'Requirements'` matched the tab and "View requirements"; task title matched a visually hidden label | **Test defect**: Playwright role names match substrings | Tab links scoped to the `Project` navigation landmark with `exact: true`; exact text match. A page snapshot confirmed only one task existed |
| M2-6 | `npm run validate` exit 1: unused `workspaceId` in an E2E test | Lint | Removed the unused binding |
| M2-7 | `test:coverage` exit 1: `api-client` 81.8% statements (gate 90), `contracts` 89.05% / 72.7% (gates 90 / 75) | Missing tests for new methods, path builders and update schemas | Added UT-CLI-CO-06 (every client method's method and path) and UT-CON-CO-08/09. Gates unchanged |
| M2-8 | Tampered project cursor with a valid shape but an invalid date returned **200** (silently filtered on epoch 0) | **Code defect** (found in self-review) | The service rejects it with 422 on `cursor` (TC-CUR). A mutation run without the check returned 200 |
| M2-9 | **Security review F1 (Medium):** `updateTask` read the task outside the transaction, so a concurrent unlink plus `billable: true` could produce a billable internal task (BR-015) | **Code defect** | Read inside the transaction; compare `rowVersion` with If-Match before checking BR-015. TC-016.R: the old structure, restored temporarily, gives **200**; the fix gives 422 |
| M2-10 | **Security review F2 (Low):** baselines read at most 500 drafts, and creation had no cap | **Code defect** (BR-004) | Cap of 500 active requirements at creation, plus a guard that refuses a partial freeze (TC-006.L). The test reviewer's probe confirmed that the old code froze 500 of 502 drafts |
| M2-11 | **Security review F3 (Low):** a client archive could race child writes and project PATCH (BR-029) | **Code defect** | Client archive touches its projects in a transaction; project PATCH runs in a transaction. TC-BR-029.3/.4 |
| M2-12 | TC-BR-029.3/.4 **still failed after the F3 fix** (201/200) | **Code defect in the design itself** | A `$set updatedAt` with an unchanged value is a no-op and raises no write conflict. Every touch now increments a hidden `activityVersion` (projects and clients, migration 0002). This also hardens the project-archive protection, which had silently depended on the clock moving |
| M2-13 | **Test review D2 (Low):** `createProject` checked the client outside any transaction | **Code defect** (AC-005.2) | Check, client touch and insert run in one transaction. TC-005.R: without the touch **201**, with it 409 |
| M2-14 | **Test review:** missing rollback, BR-029, parallel-edit, member-access and edit-vs-baseline cases; weak assertions; order dependence (shared clock, a self-dependent "unchanged" test, text-based `sort()`); a hash test that mirrored the code | Test gaps and defects | `core-ops-integrity.test.ts` (TC-BR-028.req/.task/.project, TC-BR-029.5/.6, TC-006.2C, TC-016.2C, TC-007.C2, TC-AUTH-M). Tightened TC-016.1/.2, TC-BR-029.1, TC-007.3 and TC-SEC-01d (body equal to that for a missing ID); UT-BLH-02 pins a literal SHA-256; UT-BLH-06; clock restored; numeric sort. Dead code `verifyBaseline` removed |

### 10.4 Mutation checks (control removed → tests must fail → restored and verified with `cmp`)

| Control removed | Failing tests |
| --- | --- |
| BR-004 pre-check only (`if (existing.baselineId) …`) | 0. Expected: the draft-only update filter still blocks the write (defence in depth) |
| BR-004 pre-check **and** draft-only filters | 1 (TC-007.2) |
| BR-015 "internal cannot be billable" | 3 |
| BR-015 "draft requirement cannot authorise" | 4 |
| BR-029 service check in `lockWritableProject` | 1 (archived-client case; archived projects are still blocked by the guarded touch) |
| AC-005.2 archived-client check | 1 |
| BR-005 hash over the wrong content | 2 |
| AC-016.2 assignee membership check | 1 |
| Projects cursor date validation | 1 (TC-CUR) |
| Pre-fix `updateTask` structure (F1) | 1 (TC-016.R: 200 instead of 422) |
| Client-archive project touch (F3) | 2 (TC-BR-029.3/.4) |
| Project-create client touch (D2) | 1 (TC-005.R) |

### 10.5 What M2 does not cover (still blocked or limited)

- FR-015 overview: change requests by status and the eligible unbilled total (M3/M5). Task links to change-request versions (M3, refused with 422 today). FR-004 member management.
- Approval version integrity, prevention of unapproved billable work, invoice calculation and AI failure handling remain **Blocked** (§5, §7). M2 adds the BR-015 half of "no unapproved billable work" for tasks.
- Residual and accepted limitations: see [known limitations](known-limitations.md#implementation-limitations-m2-core-ops). These include the assignee check outside the transaction, member-level archive with no unarchive, the "Me"-only assignee picker, and the inline forms and native dialog.
- Not run: Docker Compose database path, CI on GitHub, Firefox and WebKit, screen readers.

### 10.6 Final `npm run validate`

| Command | Result |
| --- | --- |
| `npm run validate` (lint → typecheck → test → build → docs:check), after all docs were written | **Exit 0.** Prettier clean, ESLint 0 problems, typecheck clean, Vitest 586 passed (16 + 15 + 65 + 382 + 108), build OK, docs check: 77 Markdown files, 0 errors, 0 warnings |

## 11. M3 Scope Guard and AI (2026-10-17)

**Scope:**
- FR-020–FR-029 and FR-032: change requests, immutable versions, propose with hash, hash-bound client decisions, revisions, withdraw, history and diff, the client summary and the approvals queue;
- FR-050–FR-054: AI provider port with the `none`, `mock` and `openai-compatible` adapters, analysis, generation records, status and enablement;
- `Idempotency-Key` on Scope Guard transitions;
- BR-001–BR-014, BR-026–BR-028.

Design choices: [ADR-0018](../architecture/adr/0018-m3-scope-guard-and-ai-implementation-choices.md). **AI was tested only with a scripted provider, the `mock` adapter and a local HTTP stub. No real model endpoint was called, and no model was evaluated.**

### 11.1 Results (final run)

| Suite | Passed | Failed | Skipped |
| --- | --- | --- | --- |
| API (`apps/api`, 26 files: 7 unit + 19 integration on a real replica set) | 617 | 0 | 0 |
| Web (`apps/web`, 15 files) | 145 | 0 | 0 |
| Contracts | 73 | 0 | 0 |
| API client | 18 | 0 | 0 |
| Architecture (TC-ARCH-01) | 15 | 0 | 0 |
| **Vitest total** | **868** | **0** | **0** |
| E2E Playwright `--repeat-each=2` (6 spec files, Chromium desktop + Pixel 7) | 48 (24 per run) | 0 | 10 (5 blocked `test.fixme` per run: E2E-WF-08…11, 13, all M4–M5) |

Coverage (`npm run test:coverage`, every gate met):

| Area | Statements | Branches |
| --- | --- | --- |
| `apps/api` (all) | 94.65% (1770/1870) | 86.87% (927/1067) |
| `apps/api/src/modules/scope-guard` | 93.73% | 80.78% |
| `apps/api/src/modules/ai` | 90.32% | 89.83% |
| `apps/web` (gated folders) | 83.94% (863/1028) | 79.26% (776/979) |
| `packages/contracts` | 96.27% | 85.71% |
| `packages/api-client` | 100% | 88% |

### 11.2 Commands executed

| Command | Result |
| --- | --- |
| `npm run validate` | Lint, typecheck, tests and build passed. The **docs check failed with 1 error**: a link to the renamed testing-strategy heading `#8-ai-testing-planned-for-m4`. Fixed; see §11.5 |
| `npm run test:coverage` | Exit 0 |
| `npx playwright test --repeat-each=2` | Exit 0: 48 passed, 10 skipped |
| `npm audit --audit-level=high` | `found 0 vulnerabilities`. M3 added no dependencies |
| Mutation script (10 mutations, §11.4) | Each caught; every file restored byte-for-byte |

### 11.3 Failures encountered and resolutions

| # | Failure | Classification | Resolution |
| --- | --- | --- | --- |
| M3-1 | `TC-SEC-02` failed when the routes were added | Expected guard | 15 routes added to the TC-SEC-01 matrix with real IDs and valid bodies; TC-SEC-01d covers CR IDs; `ai-enablement` is in the owner-only list |
| M3-2 | Web component tests: duplicate text (status region and alert); a whitespace-sensitive accessible name | Test defects | Assert on the status role; regex for the name |
| M3-3 | E2E: "Draft saved" never appeared | **Code defect (UX)**: the editor was keyed on `rowVersion`, so `router.refresh()` remounted it and dropped the success message | Keyed on CR and version; the form resets from the saved response |
| M3-4 | E2E: "Start revision" failed with `IDEMPOTENCY_KEY_REUSED` | **Code defect**: dialog-less actions reused the key left by the previous dialog | Fresh key per action (CT-NSP-09). Dialog retries after network errors keep their key (CT-NSP-05) |
| M3-5 | E2E: decision dialog closed on network errors, so a retry generated a new key | **Code defect** (found while writing tests) | Uncertain outcomes (network / 5xx) keep the dialog and the key open |
| M3-6 | E2E at 360 px: page overflow of 87 px (Core Ops) and 162 px (Scope Guard) | **Code defect (layout, NFR-012)**: the fifth project tab made the min-content width of flex/grid items exceed the viewport; a long badge sentence could not wrap | `min-width: 0` on page children and `main`; `minmax(0, 1fr)` shell column; badges wrap. Found with a temporary diagnostic spec, deleted afterwards |
| M3-7 | E2E M1 journey: the error summary was not focused after an invalid save | **Code defect (UX)**: blur validation inserted error text above Save while focus left the field; the button moved under the pointer and the click was lost (made visible by the longer settings page) | All forms validate on submit, then re-validate on change; design system §7.2 updated |
| M3-8 | `test:coverage` exit 1: web `src/lib` 68.75% (gate 80) | Missing test | `today.test.ts` (time-zone default and fallback) |
| M3-9 | Docs check: missing anchor after the heading rename | Docs | Link updated |

### 11.4 Mutation checks

| Control removed | Failing tests |
| --- | --- |
| BR-010 hash check (service and update guard) | 1 |
| BR-013 supersede the previous approval | 1 |
| BR-006 draft-only edits (pre-check, in-transaction check, guard) | 1 |
| AC-009.4 workspace AI opt-in | 1 |
| BR-009 one open version (check and guard) | 1 |
| AC-012.5 decision date not in the future | 1 |
| BR-007 propose completeness | 2 |
| ADR-0015 `derivedStatus` recomputed with every write | 11 |
| AI: exactly one repair attempt | 2 |
| AI: retry only retryable errors | 2 |

### 11.5 Final docs check

`node scripts/check-docs.mjs` after the fix: `Checked 78 Markdown files. 0 error(s), 0 warning(s).` `npx prettier --check .`: all files use Prettier code style.

### 11.6 Not verified (environment)

- A **real** OpenAI-compatible endpoint, and any model's quality, latency or cost. To verify, set `AI_PROVIDER=openai-compatible`, `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY`, enable AI in Settings, analyse a change request, and check `aiGenerations` and the `ai.generation` logs. Then run the evaluation of ai-architecture §7, which is not built yet.
- Docker Compose MongoDB, CI on GitHub, Firefox and WebKit, and screen readers, as before.

## 12. M4 Delivery and billable work (2026-10-17)

**Scope:** FR-030 tasks from approved versions, task links to approved versions (BR-012, BR-013), FR-040 / FR-041 billable entries with server eligibility (BR-016), BR-018 edit/delete guard, BR-020 / BR-021 amount previews, FR-015 project overview. Design choices: [ADR-0019](../architecture/adr/0019-m4-delivery-and-billable-work-implementation-choices.md).

### 12.1 Results

| Suite | Passed | Failed | Skipped |
| --- | --- | --- | --- |
| API (`apps/api`, 28 files) | 697 | 0 | 0 |
| Web (`apps/web`, 16 files) | 167 | 0 | 0 |
| Contracts | 81 | 0 | 0 |
| API client | 20 | 0 | 0 |
| Architecture (TC-ARCH-01) | 15 | 0 | 0 |
| **Vitest total** | **980** | **0** | **0** |
| E2E Playwright `--repeat-each=2` (7 spec files, Chromium desktop + Pixel 7) | 60 (30 per run) | 0 | 6 (3 blocked `test.fixme` per run: E2E-WF-10, 11, 13, all M5) |

Coverage (`npm run test:coverage`, exit 0, every gate met):

| Area | Statements | Branches |
| --- | --- | --- |
| `apps/api` (all) | 95.55% (2062/2158) | 87.68% (1104/1259) |
| `apps/api/src/modules/billing` | 97.23% | 84.95% |
| `apps/api/src/modules/billing/domain` | 95.23% | 88.46% |
| `apps/web` (gated folders) | 85.07% (1015/1193) | 80.49% (916/1138) |
| `apps/web/src/features/billing` | 91.86% | 85.47% |
| `packages/contracts` | 96.37% | 90.9% |
| `packages/api-client` | 100% | 87.27% |

### 12.2 Commands executed

| Command | Result |
| --- | --- |
| `npm run test:coverage` | Exit 0 |
| `npm run build` then `npx playwright test --repeat-each=2` | Exit 0: 60 passed, 6 skipped |
| Mutation script (11 mutations, §12.4) | Each caught; every file restored byte-for-byte |
| `npm run validate` | Exit 0: lint, typecheck, 980 tests, build, docs check (79 files, 0 errors) |

### 12.3 Failures encountered and resolutions

| # | Failure | Classification | Resolution |
| --- | --- | --- | --- |
| M4-1 | `TC-SEC-02` failed when the routes were added | Expected guard | 7 routes added to the matrix with real IDs (a real entry in workspace A) |
| M4-2 | `CT-TAB-01` expected four project tabs | Expected (new Billing tab) | Test updated |
| M4-3 | API-client test: overview reply "did not match the contract" | Test defect: the fixture had an empty CR-count map; the contract requires every status | Fixture lists every status (the server always sends them) |
| M4-4 | Component test: Delete button not found by name | Test-revealed a11y defect: the visually hidden span lost its leading space in the accessible name | Explicit `aria-label` |
| M4-5 | E2E `SEC-004` billing page | Test defect (curly vs straight apostrophe in the expected text) | Matched the page text; separate browser context as in M3 |
| M4-6 | Calendar dates shown a day early west of UTC (found in review, not by a test) | **Code defect (display)**: `receivedOn` / `decidedOn` formatted as local datetimes | `formatDay` (UTC day) for calendar dates |
| M4-7 | Lint warning: React Compiler skips `watch()` | Code quality | `useWatch` |

### 12.4 Mutation checks

| Control removed | Failing tests |
| --- | --- |
| AC-015.2 only APPROVED versions convert | 1 |
| FR-030 skip criteria converted before | 2 |
| BR-012 new task links need APPROVED (not SUPERSEDED) | 1 |
| BR-016(a) CR work must be on an authorised version | 1 |
| BR-021 version rate before the project rate | 1 |
| AC-017.3 guarded `invoiceId: null` update | 1 |
| Work date not in the future | 2 |
| Non-billable task refused | 1 |
| CR of another project in the body → 422 | 1 |
| data-model §4.6 currency fixed after entries | 1 |
| BR-016(b) invoiced work is ineligible | 3 |

### 12.5 Not verified (environment)

Docker Compose MongoDB, CI on GitHub, Firefox and WebKit, screen readers and a real AI endpoint, as before.

## 13. M5 Invoices and AI resilience (2026-10-18)

**Scope:** FR-042–FR-046 invoices (drafts, edits, adjustments, owner issue with gapless numbers, void, print), BR-017–BR-025, BR-028 for invoices, BR-030 for invoiced entries, the AI resilience review (FR-051), and the complete principal workflow E2E. Design choices: [ADR-0020](../architecture/adr/0020-m5-invoice-implementation-choices.md).

### 13.1 Results

| Suite | Passed | Failed | Skipped |
| --- | --- | --- | --- |
| API (`apps/api`, 30 files) | 746 | 0 | 0 |
| Web (`apps/web`, 17 files) | 184 | 0 | 0 |
| Contracts | 85 | 0 | 0 |
| API client | 21 | 0 | 0 |
| Architecture (TC-ARCH-01) | 15 | 0 | 0 |
| **Vitest total** | **1051** | **0** | **0** |
| E2E Playwright `--repeat-each=2` (8 spec files, Chromium desktop + Pixel 7) | 66 (33 per run) | 0 | 2 (E2E-WF-13 per run, blocked on FR-004) |

Coverage (`npm run test:coverage`, exit 0, every gate met):

| Area | Statements | Branches |
| --- | --- | --- |
| `apps/api` (all) | 95.25% (2308/2423) | 87.11% (1217/1397) |
| `apps/api/src/modules/billing` | 94.44% | 82.55% |
| `apps/api/src/modules/billing/domain` | 96.77% | 90.62% |
| `apps/api/src/modules/ai` | 91% | 90.47% |
| `apps/web` (gated folders) | 85.05% (1155/1358) | 80.39% (1029/1280) |
| `apps/web/src/features/invoices` | 83.33% | 79.68% |
| `packages/contracts` | 96.35% | 92.06% |
| `packages/api-client` | 100% | 86.2% |

### 13.2 Commands executed

| Command | Result |
| --- | --- |
| `npm run test:coverage` | Exit 0 |
| `npm run build` then `npx playwright test --repeat-each=2` | Exit 0: 66 passed, 2 skipped |
| `npm audit --audit-level=high` | `found 0 vulnerabilities`. M5 added no dependencies |
| Mutation script (11 mutations) plus one manual mutation (BR-030), §13.4 | 10 caught, 2 not independently load-bearing; every file restored byte-for-byte |
| `npm run validate` | Exit 0: lint, typecheck, 1051 tests, build, docs check (81 files, 0 errors) |

### 13.3 Failures encountered and resolutions

| # | Failure | Classification | Resolution |
| --- | --- | --- | --- |
| M5-1 | `TC-SEC-02` failed when the routes were added | Expected guard | 7 invoice routes in the matrix with a real draft; issue and void in the owner-only list; TC-SEC-01d accepts a `projectId` body error |
| M5-2 | `CT-NAV-03` and `CT-BIL-06` | Expected (Billing nav entry; drafting stays available on archived projects per workflows §4) | Tests updated to the documented behaviour |
| M5-3 | `CT-INV-09`: two headings "Invoice RS-0007" | **Code defect (a11y)**: the issued view rendered two `h1` elements | The embedded invoice paper uses `h2` |
| M5-4 | E2E 360 px: 5 px page overflow on the invoice draft | **Code defect (layout, NFR-012)**: visually hidden header text escaped the table's scroll container | The scroll container is positioned. Found with a temporary diagnostic spec, deleted afterwards |
| M5-5 | E2E journey: heading asserted before the print page loaded | Test defect | Wait for the `/print` URL |
| M5-6 | `TC-020.1` relied on an earlier test's invoice prefix | Test defect (order dependence) | Reads the prefix itself |
| M5-7 | Released entries of a void invoice could be deleted (found in the release audit, not by a test) | **Code defect (BR-030)** | Delete refused when any invoice line references the entry; index `workspace_line_entry`; test in `TC-021.1` |
| M5-8 | Every CR and settings page waited for an AI reachability probe (up to 3 s when the endpoint is down) (found in the AI resilience review) | **Code defect (resilience)** | Probe result cached for 30 s, shared by concurrent callers; TC-AI-HC |

### 13.4 Mutation checks

| Control removed | Failing tests |
| --- | --- |
| BR-023 owner-only issue | 1 |
| BR-017 refuse ineligible work at draft | 1 |
| AC-019.4 work already on an invoice → 409 | 1 |
| AC-020.4 eligibility re-check at issue | 1 |
| BR-024 void releases entries | 1 |
| Negative subtotal refused | 1 |
| BR-020 tax on the subtotal | 3 |
| BR-020 TIME amounts recomputed | 2 |
| AI status probe cache | 1 |
| BR-030 entry on an invoice cannot be deleted (manual mutation) | 1 |
| BR-018 reserved-count check | **0**: masked by the in-transaction read and write-conflict retry (defense in depth, ADR-0020) |
| BR-018 `invoiceId: null` reservation filter | **0**: same reason |

### 13.5 Not verified (environment)

Docker Compose MongoDB, CI on GitHub, Firefox and WebKit, screen readers, a real AI endpoint, and printing to paper or PDF in a real browser dialog (the print view's DOM and watermark are verified).

*Historical (as of 2026-10-18, M5).* Later, Docker Compose MongoDB and a real open-weight endpoint were verified locally (release audit §11, §12.4, §13). CI on GitHub, Firefox and WebKit, screen readers and paper or PDF printing are still not verified.
