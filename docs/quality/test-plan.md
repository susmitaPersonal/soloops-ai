# Test Plan

> **Status:** Executed for M1–M5 (latest full run 2026-10-19, [release audit §13](release-readiness-audit.md#13-final-release-closure-2026-10-19)). Per-case results are in the [traceability matrix](requirements-traceability.md). Cases for unbuilt features stay **Blocked**: member management (FR-004, including E2E-WF-13), the audit log UI (FR-016), the dashboard (FR-017) and export (FR-061). Some plan-level IDs are covered by tests under other IDs; the matrix names those tests. Detailed cases (preconditions, inputs, steps, expected and actual results) are in [test cases](test-cases.md), and results are in the [execution report](test-execution-report.md).

Levels: **U** unit · **I** API integration (in-process Hono, real MongoDB replica set) · **C** component · **E** end-to-end (Playwright) · **A** architecture/lint.

## A. Acceptance-criteria tests (`TC-nnn.k` verifies `AC-nnn.k`)

| TC | Level | What is verified |
| --- | --- | --- |
| TC-001.1 | I, E | Register creates user, workspace and OWNER membership, and signs in |
| TC-001.2 | I | Duplicate email gives a generic error (no enumeration) |
| TC-001.3 | I | Wrong password gives 401 generic. Rate limit after N attempts gives 429 |
| TC-001.4 | I | Logout deletes the session. The old cookie gets 401 |
| TC-002.1 | I, C | Owner saves settings, and defaults apply to a new project |
| TC-002.2 | I | Member PATCH settings gives 403 |
| TC-002.3 | I | Tax bps -1, 0, 10000, 10001 boundaries |
| TC-003.1 | I | Owner adds member, and an audit event is written |
| TC-003.2 | I | Member adds member gives 403 |
| TC-004.1 | I | Client created and listed in its own workspace only |
| TC-004.2 | I | Foreign client ID gives 404 (also in TC-SEC-01) |
| TC-004.3 | I | Archived client is read-only |
| TC-005.1 | I | Project creation with billing model and rate override |
| TC-005.2 | I | Project for an archived client gives 409 |
| TC-006.1 | I | Requirement keys are sequential and not reused after delete |
| TC-006.2 | I | Draft requirement edit saved |
| TC-007.1 | I | Baseline freezes all draft requirements, stores the hash, and writes audit atomically |
| TC-007.2 | I | Editing or deleting a baselined requirement gives 409 |
| TC-007.3 | I | Baseline with nothing to freeze gives 422 |
| TC-024.1 | I, C | Overview counts and eligible unbilled total |
| TC-026.1 | I | Dashboard lists awaiting-decision CRs across projects, ordered by `updatedAt` |
| TC-026.2 | I | Dashboard unbilled per project equals the eligibility service sum. Ineligible counts are separate |
| TC-026.3 | C, E | Empty workspace shows the setup checklist |
| TC-026.4 | I | Dashboard never includes other workspaces' data (also in TC-SEC-01) |
| TC-027.1 | I | Approvals queue status/project filters and cursor pagination |
| TC-027.2 | E | Opening a queue item lands on the awaiting version with the decision action |
| TC-027.3 | U, I | `derivedStatus` equals `deriveCrStatus(versions)` after every transition |
| TC-008.1 | I | CR created with verbatim raw text and draft v1 |
| TC-008.2 | I | CR on an archived project gives 409 |
| TC-009.1 | I | Mock success gives a schema-valid suggestion and an AiGeneration with metadata |
| TC-009.2 | C, E | Suggestion is not applied until "Apply". Applied fields show the AI badge |
| TC-009.3 | I | Mock timeout and invalid output leave the draft unchanged, with the failure status recorded |
| TC-009.4 | I, C | AI disabled hides the action, and the API returns 409 AI_DISABLED with no provider call |
| TC-009.5 | U, I | Unknown requirement keys dropped, with a warning |
| TC-009.6 | I | Injection text causes no state change on any entity |
| TC-010.1 | U, I | TIME price = roundHalfUp(minutes × rate / 60). A client-sent price is ignored |
| TC-010.2 | I | FIXED price = entered amount |
| TC-010.3 | C | Estimate disclaimer rendered with effort. Covered by CT-SUM-01 (`change-requests.test.tsx`) |
| TC-011.1 | I | Propose with missing assumptions or acceptance criteria gives 422 with a field list |
| TC-011.2 | I | Propose freezes the version and stores the hash. PATCH afterwards gives 409. Audit written |
| TC-011.3 | C, E | Summary page contains all required sections and the disclaimer |
| TC-012.1 | I | Approve stores an immutable decision, sets state APPROVED, writes audit |
| TC-012.2 | I | Decision on a non-PROPOSED version gives 409 |
| TC-012.3 | I | Hash mismatch gives 409 VERSION_HASH_MISMATCH |
| TC-012.4 | I | Parallel decisions: exactly one 201, the rest 409 |
| TC-012.5 | I | Future decision date gives 422. Today is accepted |
| TC-012.6 | I | Approving v2 supersedes v1 |
| TC-013.1 | I | New version copies content, increments the number, and keeps history |
| TC-013.2 | I | Second open version gives 409 |
| TC-013.3 | I | Withdraw sets WITHDRAWN, and conversion gives 409 |
| TC-014.1 | I, C | History shows versions, decisions and audit chronologically |
| TC-014.2 | U, C | Field-level diff between versions |
| TC-015.1 | I | Convert creates linked tasks and writes audit |
| TC-015.2 | I | Convert from non-APPROVED (including SUPERSEDED) gives 409 |
| TC-016.1 | I | Billable task without a scope link gives 422 |
| TC-016.2 | I | Assignee must be a member |
| TC-017.1 | I | TIME entry minutes boundaries 0/1/1440/1441 |
| TC-017.2 | I | Entry on an unapproved CR version is saved but ineligible (CR_NOT_APPROVED) |
| TC-017.3 | I | Edit or delete of an invoiced entry gives 409 |
| TC-018.1 | I, C | Eligible and ineligible lists with reasons |
| TC-018.2 | C | UI renders server eligibility only (no client logic) |
| TC-019.1 | U, I | Invoice math: zero tax, .5 rounding, single and many lines |
| TC-019.2 | I | Ineligible entry in the selection gives 422 listing the entries |
| TC-019.3 | I | Adjustment without a reason gives 422 |
| TC-019.4 | I | Entry already on a non-void invoice gives 409 |
| TC-020.1 | I | Owner issue assigns the next number, freezes, marks billed, writes audit |
| TC-020.2 | I | Member issue gives 403 |
| TC-020.3 | I | Same Idempotency-Key returns the same response and consumes no extra number |
| TC-020.4 | I | Entry became ineligible after drafting, so issue gives 409 |
| TC-020.5 | C, E | Draft print view watermark |
| TC-021.1 | I | Void keeps the number, releases entries, writes audit |
| TC-022.1 | I | `AI_PROVIDER=none`: app starts and status is "unconfigured" |
| TC-022.2 | I | Bad endpoint: status "unreachable", no secret in logs |
| TC-022.3 | I, C | Enabling AI requires acknowledgement and writes audit. Member gets 403 |
| TC-023.1 | I | Export contains only own-workspace data |
| TC-025.1 | C | Template pre-fills a draft |

## B. Rule-level tests (`TC-BR-nnn`)

| TC | Level | What is verified |
| --- | --- | --- |
| TC-BR-005 | U | Baseline hash is stable under key order. Multiple baselines per project |
| TC-BR-008 | U | Canonical JSON hashing is deterministic, and every listed field affects the hash |
| TC-BR-013 | I | Work logged under v1 stays eligible after v2 approval supersedes v1. Covered by TC-016.5 and TC-017.8 (`delivery-billing.test.ts`) |
| TC-BR-016 | U | Table test: every eligibility reason code and the eligible case, including CURRENCY_MISMATCH (BR-022) |
| TC-BR-019 | U | Property tests: integer-only arithmetic, Σ lines = subtotal, tax rounding bounds |
| TC-BR-021 | U | Rate resolution order: CR version → project override → workspace default |
| TC-BR-023 | I | Concurrent issues of different drafts produce a gapless, unique sequence |
| TC-BR-026 | U | Estimate schema bounds: low ≤ likely ≤ high, 0 < x ≤ 2000. Covered by UT-CON-SG-01 (`packages/contracts/src/scope-guard.test.ts`) |
| TC-BR-028 | I | Each audited action writes exactly one event. A forced failure rolls back both |
| TC-BR-030 | I | Deleting rows referenced by decisions or issued invoices is refused |

## C. Security tests (`TC-SEC-nn`)

| TC | Level | What is verified |
| --- | --- | --- |
| TC-SEC-01 | I | Cross-workspace matrix: every tenant endpoint with a foreign resource gives 404 |
| TC-SEC-02 | I | Route inventory: every registered tenant route appears in the TC-SEC-01 matrix |
| TC-SEC-03 | I | Role matrix: owner-only endpoints give 403 for members |
| TC-SEC-04 | I | Missing `X-Requested-With` or a foreign `Origin` on a mutation gives 403 |
| TC-SEC-05 | I | Cookie flags. Session rotation on login. Idle and absolute expiry |
| TC-SEC-06 | I | Rate limits on login and analyze give 429 |
| TC-SEC-07 | U, I | Logger redaction: password, cookie, authorization, AI key |
| TC-SEC-08 | C, E | Script-like text in CR, requirement and AI output renders as inert text |
| TC-SEC-09 | I | The mock provider captures the outbound payload, which contains no client contact data, rates or invoices |

## D. AI tests (`TC-AI-nn`)

| TC | Level | What is verified |
| --- | --- | --- |
| TC-AI-01 | I | Timeout aborts within `AI_TIMEOUT_MS`, records TIMEOUT, leaves the draft unchanged |
| TC-AI-02 | U | Output schema has no money fields. Indicative cost is computed from rate × minutes |
| TC-AI-03 | I | Invalid JSON triggers exactly one repair attempt, then INVALID_OUTPUT |
| TC-AI-04 | I | Provider `none` gives 409 AI_DISABLED |
| TC-AI-05 | U | Over-limit input is truncated with a notice. Requirement list truncation keeps keys |

## E. Architecture and E2E

| TC | Level | What is verified |
| --- | --- | --- |
| TC-ARCH-01 | A | Lint boundaries: `ai` cannot import domain modules; only `platform/db` imports `mongodb`; `packages/*` import no `apps/*`, `mongodb`, `hono`, `next` or `node:*`; `apps/web` imports no `mongodb` or `@soloops/api`; cross-module imports go via `index.ts` only |
| TC-E2E-01 | E | J1 → J4 happy path: register → client → project → baseline → CR → AI (mock) → propose → approve → tasks → entries → invoice issued |
| TC-E2E-02 | E | Rejected CR: its work appears as ineligible and cannot be invoiced |
| TC-E2E-03 | E | Axe scan of S-04, S-07, S-10, S-11 has no serious or critical violations |
