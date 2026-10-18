# Implementation Status

**Last updated:** 2026-10-19. **Current milestone:** M5 complete, plus the release-closure additions **workspace members (FR-004)** and the **evidence-bound AI scope check (FR-021, BR-031)** ([ADR-0022](../architecture/adr/0022-scope-check-and-members.md)), pending maintainer review. **Release status: not yet release-ready.** CI passed on GitHub on `def722b`, but the additions are not yet pushed or CI-verified, and the manual development-server and browser run is still open ([release readiness audit §14](release-readiness-audit.md#14-theme-alignment-ai-scope-check-and-members-2026-10-19)). **Next milestone:** M6 (MVP hardening).

> This report reflects **implemented and tested code only**. Documentation does not count as implementation. Every "Done" below has passing tests quoted in the [validation log](#validation-log).

## Summary

| Area | Status |
| --- | --- |
| Documentation foundation, Claude Code skills (8) and agents (6) | Done (M0) |
| Monorepo, tooling, CI workflow, Docker Compose | Done (M1). Docker Compose MongoDB verified locally on 2026-10-18 (release audit §11). CI passed on GitHub on 2026-10-19: both jobs, `def722b` ([run](https://github.com/susmitaPersonal/soloops-ai/actions/runs/39159239746)) |
| Identity and workspace (FR-001, FR-002, FR-003, FR-005) | Done (M1) |
| Platform security controls (SEC-001–007, SEC-010, SEC-011 for settings) | Done for M1 endpoints |
| Core Ops: clients, projects, requirements, baselines, tasks (FR-010–FR-014, BR-004/005/015/029) | Done (M2; task links to approved change-request versions M4) |
| Scope Guard: change requests, versions, hash-bound decisions, history, approvals queue (FR-020–FR-029, FR-032) | Done (M3) |
| AI: provider port, analysis, generations, status, enablement (FR-050–FR-054); scope check (FR-021, BR-031) | Done. Automated tests use the mock provider, a scripted provider and a local HTTP stub. The scope check was **evaluated** on 2026-10-19 with Ollama `qwen2.5:1.5b` (23 cases × 3): it passes 4 of 5 thresholds but **fails verdict accuracy** (0.30 vs 0.70), so no model is recommended ([AI evaluation results](ai-evaluation-results.md)) |
| Delivery: tasks from approved versions (FR-030), billable entries with server eligibility (FR-040, FR-041), project overview (FR-015) | Done (M4, [ADR-0019](../architecture/adr/0019-m4-delivery-and-billable-work-implementation-choices.md)) |
| Invoices: drafts, adjustments, owner issue with gapless numbers, void, print (FR-042–FR-046) | Done (M5, [ADR-0020](../architecture/adr/0020-m5-invoice-implementation-choices.md)) |
| Members (FR-004): list, add an existing account by email, remove; last owner protected | Done (release closure, ADR-0022). E2E-WF-13 now runs |
| Audit log UI (FR-016), dashboard (FR-017), Community | **Not started** |

## Roadmap progress

The milestone plan is in the [roadmap](../product/roadmap.md). This table is the live record.

| Milestone | Status | Notes |
| --- | --- | --- |
| M0 Foundation | Done | Docs, skills, agents |
| **M1 Walking skeleton** | **Done (2026-10-16)** | All exit criteria met except "CI green on GitHub", which needs a pushed commit. See [M1 exit criteria](#m1-exit-criteria) |
| **M2 Core Ops** | **Done (2026-10-17)** | See [M2 exit criteria](#m2-exit-criteria). OpenAPI generation and the mobile navigation drawer were deferred to M3 ([ADR-0017](../architecture/adr/0017-m2-core-ops-implementation-choices.md) §12) |
| **M3 Scope Guard + AI** | **Done (2026-10-17)** | Includes the AI work originally planned for M4 ([ADR-0018](../architecture/adr/0018-m3-scope-guard-and-ai-implementation-choices.md)). FR-030 (tasks from approved versions) moved to M4 |
| **M4 Delivery and billable work** | **Done (2026-10-17)** | FR-030, FR-040, FR-041, FR-015. See [M4 exit criteria](#m4-exit-criteria) |
| **M5 Invoice drafting and AI resilience** | **Done (2026-10-18)** | FR-042–FR-046, BR-017–BR-025, BR-030 (entries); AI status probe cache. See [M5 exit criteria](#m5-exit-criteria) |
| M6 MVP hardening | Next | See the [release readiness audit](release-readiness-audit.md) P0/P1 list |

### M1 exit criteria

| Criterion (roadmap) | Result | Evidence |
| --- | --- | --- |
| npm workspaces scaffold (`apps/web`, `apps/api`, `packages/contracts`, `packages/api-client`, `packages/config`) | Done (+ `e2e`) | Root `package.json` |
| Boundary lint rules | Done | `packages/config/eslint`, TC-ARCH-01 (13 tests) |
| CI (lint, typecheck, test, build) | Workflow written | `.github/workflows/ci.yml`. Not executed on GitHub yet |
| Docker Compose MongoDB replica set | Written, not run at M1; **verified 2026-10-18** (release audit §11) | `docker-compose.yml`. At M1 the Docker daemon was not running, so tests used `mongodb-memory-server` (real `mongod` 8.2.6) |
| Migration runner and identity/workspace collections | Done | `apps/api/migrations/0001-…`, runner in `platform/db/migrations.ts` |
| `TenantCollection` | Done | `apps/api/src/platform/db/collections.ts`, platform tests |
| Auth (register, login, logout, me) | Done | `apps/api/test/identity.test.ts` (19 tests), E2E |
| `requireMembership` | Done | `modules/workspace/membership.ts`, TC-SEC-01/02/03 |
| Next.js dev rewrite + `server-only` API helper | Done | `apps/web/next.config.ts`, `apps/web/src/lib/api/server.ts` |
| `/healthz` and `/readyz` | Done | Platform tests (incl. 503 when migrations pending or DB down) |
| One cross-workspace isolation test | Done (matrix + route inventory) | `apps/api/test/security.test.ts` |

### M2 exit criteria

| Criterion (roadmap: "clients, projects, requirements, baselines and tasks with UI and tests") | Result | Evidence |
| --- | --- | --- |
| FR-010 clients (create, list, view, edit, archive) through UI, API and MongoDB | Done | S-02 screens; `core-ops-clients-projects.test.ts`; E2E `m2-core-ops.spec.ts` |
| FR-011 projects for a client (billing model, currency, rate, start date, status; archive) | Done | S-03, S-04; same suites |
| FR-012 requirements with REQ-n keys, criteria and priority | Done | S-05; `core-ops-requirements.test.ts` |
| FR-013 baselines: transactional freeze, content hash, audit event | Done | S-05 L2 dialog; TC-007.1–.3, TC-007.C/C2, TC-BR-028.baseline |
| FR-014 tasks: status, assignee, billable rule | Done for baseline and internal links | S-09; `core-ops-tasks.test.ts`, TC-016.R. Change-request links: M3 |
| BR-004, BR-005, BR-015, BR-029 enforced on the server | Done | Mutation checks in the [execution report §10.4](test-execution-report.md#104-mutation-checks-control-removed--tests-must-fail--restored-and-verified-with-cmp) |
| Every new tenant route in the isolation matrix | Done | TC-SEC-01 (22 routes), TC-SEC-02, TC-SEC-01d |
| Security and test reviews run, findings fixed | Done | §M2 reviews below |

### M4 exit criteria

| Criterion (milestone brief) | Result | Evidence |
| --- | --- | --- |
| Tasks from approved requirements or approved change requests | Done | Baseline-linked tasks (M2); conversion of an approved version's criteria and task links to approved versions (TC-015.x, TC-016.3–.5); S-07 dialog, S-09 scope list |
| No duplicate tasks when the same approval is processed again | Done | Unique `workspace_origin_unique`, skip-and-report, project lock; TC-015.4/.5/.6; E2E-WF-08 |
| Task lifecycle | Done as documented | `TODO` / `IN_PROGRESS` / `DONE` with free transitions (M2). No stricter state machine is documented; recorded in [known limitations](known-limitations.md#implementation-limitations-m4-delivery-and-billable-work) |
| Work records; work performed vs eligibility vs invoice inclusion | Done | Entries record the work; eligibility is computed on read (BR-016); `invoiceId` marks inclusion (set by M5); TC-017.x, TC-018.x |
| Backend-computed eligibility from authoritative records | Done | `billing/domain/eligibility.ts` over requirement, version and invoice facts; client values stripped; TC-018.2, CT-BIL-02 |
| Delivery overview | Done | `GET …/overview`, S-04; TC-024.1 |
| UI, tests, Playwright | Done | S-07, S-09, S-10, S-04; 980 Vitest tests; E2E 60 passed (×2 runs) |
| Isolation matrix | Done | TC-SEC-01 now 44 routes; TC-SEC-01d |
| Mutation checks | 11/11 caught | [execution report §12.4](test-execution-report.md#124-mutation-checks) |

### M5 exit criteria

| Criterion (milestone brief) | Result | Evidence |
| --- | --- | --- |
| Deterministic integer-money invoice drafts from eligible work | Done | `domain/invoice-calc.ts` (bigint), TC-019.1, UT-INV-01…05 |
| No double invoicing | Done | Reservation in the draft transaction, TC-019.4 (concurrent), BR-018 |
| Lifecycle and audit | Done | DRAFT → ISSUED → VOID, guarded updates, `invoice.created/issued/voided` in the same transaction |
| Issue / void per docs (owner, idempotent, gapless) | Done | TC-020.1–.4, TC-BR-023, TC-021.1, TC-SEC-03 |
| AI failure handling across AI flows | Done | `cr-analysis` is the only flow; review in [ADR-0020](../architecture/adr/0020-m5-invoice-implementation-choices.md) §10; TC-AI-HC; CT-AI-03 now 7 failure kinds |
| Full E2E journey | Done | TC-E2E-01 (UI only), E2E-WF-11; E2E-WF-13 blocked on FR-004 |
| Docs | Done | ADR-0020, api-design, data-model, traceability, test cases §2f, execution report §13, this file |

## M2 reviews

- **`security-reviewer` agent (read-only):** no Critical or High findings. It reported one Medium (F1, a BR-015 update race) and two Low (F2, requirements beyond 500 escaping a baseline; F3, client-archive races). All three are **fixed with regression tests**. Two Info items were noted: path IDs are validated after the body, and member-level archive with no unarchive (recorded in the known limitations).
- **`test-engineer` agent (read-only):** found a Low defect (D2, project create racing a client archive), now **fixed with TC-005.R**. Its coverage gaps, weak assertions and order-dependence findings were addressed. D3 (assignee check outside the transaction) is recorded as a residual limitation, because no member-removal API exists yet.
- While fixing F3, the race tests exposed a deeper design flaw: no-op touches don't conflict. It was fixed with `activityVersion` (ADR-0017 §4).

## Requirements

Per-requirement status is in the [traceability matrix](requirements-traceability.md). Summary:

| Status | Requirements |
| --- | --- |
| Done | FR-001, FR-002, FR-003, FR-005, FR-010, FR-011, FR-012, FR-013, BR-004, BR-005, BR-029 (for clients, projects and their children), SEC-001, SEC-002, SEC-003, SEC-005, SEC-007, NFR-008, NFR-010 |
| Done (M3–M5) | FR-014 (all links), FR-015, FR-020–FR-030, FR-032, FR-040–FR-046, FR-050–FR-054, BR-001–BR-027, BR-030 (for implemented records) |
| Done for the implemented scope | BR-015, BR-028 (registration, settings, baseline, CR transitions, task conversion) |
| Done for implemented endpoints (re-verify per milestone) | SEC-004, SEC-006 (auth and AI limits), SEC-010, SEC-011 (settings, AI enablement, invoice issue and void; member management is not built), NFR-009, NFR-012 (M1–M5 screens), A11Y-001–003, A11Y-006, A11Y-007 (M1–M5 screens), ERR-005, ERR-008, ERR-009, ERR-010 |
| Done (M5) | AC-002.1: settings persist and are used as defaults for new projects (TC-002.1d) and invoice drafts (TC-019.1) |
| Partially done | NFR-013: `Intl`-ready money helpers exist, but UI strings are not yet centralised |
| Not started | All other FR, BR, NFR, PRV and A11Y items |

## M1 security review

The `security-reviewer` agent reviewed the M1 code on 2026-10-16 (read-only; `npm audit --audit-level=high`: 0 vulnerabilities). It reported no Critical issues. Every finding was fixed in M1 and has a regression test (`apps/api/test/security-hardening.test.ts` unless noted):

| # | Finding (severity) | Resolution |
| --- | --- | --- |
| 1 | Rate limit bypass via forged leftmost `X-Forwarded-For` (High with `TRUST_PROXY`) | Rightmost hop only; added a per-email bucket |
| 2 | Password spraying and mass registration across emails; unbounded argon2 work (Medium) | Per-IP login and register buckets (configurable); argon2 concurrency cap with fast 503 |
| 3 | Rate-limiter memory unbounded (Low/Medium) | Insertion-ordered eviction with a hard key cap |
| 4 | Tenant guard gaps: `$lookup`/`$unionWith`/`$graphLookup`/`$out`/`$merge`, `$rename` into the tenant key (Low) | Refused by `assertSafePipeline` / `assertSafeUpdate` |
| 5 | Global memberships view accepted any filter (Low) | Replaced by `Database.userScoped('memberships', userId)`, which injects `userId` |
| 6 | Register left an existing session alive (Low) | Previous session revoked (`identity.test.ts`) |
| 7 | Redaction only one level deep (Low) | Two-level paths, `set-cookie`, `x-api-key`, emails |
| 8 | No `__Host-` cookie prefix (Low) | `__Host-soloops_sid` when `COOKIE_SECURE=true` |
| 9 | Founding OWNER membership not audited (needs verification) | `member.added` written in the registration transaction (`identity.test.ts`) |

Residual risks are recorded in [known limitations](known-limitations.md#implementation-limitations-m1): in-memory limits, register enumeration without email verification, and per-email delay.

## Skills and agents used in M1

- Skills: `soloops-feature-development` (procedure), with `soloops-architecture`, `soloops-testing`, `soloops-security-review` and `soloops-documentation` applied from their checklists.
- Agents: `security-reviewer` (one run, findings above). No other agents were run.

## Files created in M1

- Root: `package.json`, `package-lock.json`, `.nvmrc`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `.gitattributes`, `eslint.config.mjs`, `docker-compose.yml`, `.github/workflows/ci.yml`. `.gitignore` was extended.
- `packages/config`: tsconfig base, ESLint config and boundary rule, TC-ARCH-01 tests.
- `packages/contracts`: common (IDs, problem codes, money strings), identity, workspace, audit, routes, tests.
- `packages/api-client`: typed fetch client, `ApiError`, tests.
- `apps/api`: platform (config, db, http, logging, clock, ids, errors), modules (identity, workspace, audit), `app.ts`, `main.ts`, `migrate.ts`, `migrations/`, `build.mjs`, `.env.example`, `test/` (5 integration suites).
- `apps/web`: `proxy.ts`, App Router pages (`/`, `/signin`, `/register`, `/w/[workspaceId]`, `/w/[workspaceId]/settings`, loading, error and not-found states), components (Button, TextField, Alert, ErrorSummary), auth and workspace features, `lib/api`, design tokens, component tests, `.env.example`.
- `e2e`: Playwright config, stack launcher, 2 specs.
- Docs: new [ADR-0016](../architecture/adr/0016-m1-implementation-choices.md). Updated: this file, the traceability matrix, test plan, known limitations, roadmap, API design, data model, monorepo structure, security architecture, environment configuration, local development, troubleshooting, the ADR and docs indexes, the root README and CLAUDE.md.

## Next actions (exact)

The current list, with exact commands, is in [release readiness audit §13](release-readiness-audit.md#13-final-release-closure-2026-10-19). In short:

1. **Done 2026-10-19:** published to https://github.com/susmitaPersonal/soloops-ai. Both CI jobs (`validate`, `docker-mongodb`) passed on `def722b` ([run](https://github.com/susmitaPersonal/soloops-ai/actions/runs/39159239746)). A maintainer review of the commits is not formally documented.
2. **P1:** A person runs `npm run dev` against a dedicated database and completes the browser journey from change request to invoice. Record the result in the release audit.
3. *Done 2026-10-19:* FR-004 member management; E2E-WF-13 unblocked. Push it and confirm CI passes on the new commit.
4. *Done 2026-10-19:* the scope-check evaluation harness (`npm run eval:ai`). **Next:** evaluate a larger open-weight model with the same dataset and thresholds (needs the maintainer's approval to download it). No model is recommended until one passes.

*Historical:* the earlier steps "make the first commit", "run the suite against Docker Compose MongoDB" and "verify one real endpoint" were done on 2026-10-18 and 2026-10-19 (release audit §11–§13).

## Validation log

Record every validation run here with its exact command and actual result.

| Date | Command | Result |
| --- | --- | --- |
| 2026-10-16 | `node scripts/check-docs.mjs` | `Checked 63 Markdown files. 0 error(s), 0 warning(s).` Exit 0 |
| 2026-10-16 | Same script on a scratch copy with injected defects (broken link, missing anchor, duplicate BR, bad agent skill reference, table pipe) | All injected defects reported. Exit 1, as expected |
| 2026-10-16 | Ad-hoc Node ID cross-check (AC→TC, BR→traceability, FR→traceability, TC references) | 69 AC, 97 TC, 30 BR, 88 requirement IDs. No gaps found |
| 2026-10-16 | Lint, typecheck, unit/integration/E2E tests, build | **Not run** (M0): no application code or package manifests existed |
| 2026-10-16 | Mermaid rendering | First pass: **not run** (only diagram type keywords were checked) |
| 2026-10-16 (stack update: ADR-0009–0014) | `node scripts/check-docs.mjs` | `Checked 70 Markdown files. 0 error(s), 0 warning(s).` Exit 0 |
| 2026-10-16 (stack update) | Every Mermaid block extracted and rendered with `@mermaid-js/mermaid-cli` 11.4.2 (local Chrome, run in a scratch directory and not added to the repo) | 19 diagrams, 0 failures |
| 2026-10-16 (stack update) | Ad-hoc ADR check: every ADR file is indexed and has all template sections | 14 ADRs, none missing |
| 2026-10-16 (design pass) | `node scripts/check-contrast.mjs` | 90 token pairs (light and dark), 0 failures. Colour math only: no rendered UI was audited |
| 2026-10-16 (design pass) | `node scripts/check-docs.mjs` | 72 Markdown files, 0 errors, 0 warnings |
| 2026-10-16 (design pass) | Mermaid render of every diagram with mermaid-cli 11.4.2 | 27 diagrams, 0 failures |
| 2026-10-16 (design pass) | `JSON.parse` of every ```json block in the docs | 18 blocks, 0 invalid |
| 2026-10-16 (design pass) | ID cross-check | 90 requirement IDs, 76 AC, 104 TC, 30 BR. Every AC has a TC, every BR and FR is traced, and no undefined AC, FR or US references |
| 2026-10-16 (design pass) | MongoDB validators, indexes and queries | **Not run** (M0): no database or code existed |
| 2026-10-16 (stack update) | Grep for stale stack terms (Express, Prisma, Postgres, Supertest, Vite, TanStack, …) outside superseded ADRs | Only intentional references remain: comparisons in ADR-0009–0014 and historical text in ADRs whose status line records the amendment |
| 2026-10-16 (M1) | `npm install` / `npm audit` | 0 vulnerabilities, no engine warnings on Node 22.14.0 / npm 10.9.0 (after pinning jsdom 29.1.1 and replacing `eslint-config-next`, see ADR-0016) |
| 2026-10-16 (M1) | `npm run validate` (lint → typecheck → test → build → docs:check) | **Exit 0.** ESLint 0 problems. Prettier clean. `tsc` clean in 5 workspaces. Tests: contracts 27, api-client 5, config (TC-ARCH-01) 13, **api 81 (real MongoDB 8.2.6 single-node replica set)**, web 25: **151 passed, 0 failed**. API esbuild bundle and `next build` succeeded. Docs check: 72 Markdown files, 0 errors |
| 2026-10-16 (M1) | `npx playwright test` (in `e2e/`, production builds, real replica set) | **8 passed, 0 failed** (Chromium desktop + Pixel 7 project): journey register → save settings → sign out → protected redirect → sign in returns; generic wrong-password error; cross-workspace URL → 404 page; nonce CSP and headers; axe (WCAG 2.2 AA tags) no serious/critical violations on sign-in, register, settings; keyboard order; no horizontal overflow at 360 px |
| 2026-10-16 (M1) | Mutation check: removed tenant scoping / CSRF check / session rotation, one at a time, then ran API tests | Each mutation caught: 12, 5 and 1 failing tests respectively. Restored code: 81 passed |
| 2026-10-16 (M1, after security fixes) | `npm run validate` | **Exit 0.** Tests: contracts 27, api-client 5, config 13, api 100, web 25: **170 passed, 0 failed**. Docs check: 73 Markdown files, 0 errors |
| 2026-10-16 (M1, after security fixes) | `npx playwright test` | **8 passed, 0 failed** |
| 2026-10-16 (M1, after security fixes) | Mutation: `clientIp` reverted to the leftmost `X-Forwarded-For` hop | Caught (1 failing test). Restored |
| 2026-10-17 (testing pass) | `npm run validate`, `npm run test:coverage`, `npx playwright test` (+ `--repeat-each=3`), `npm audit` | Vitest **330 passed, 0 failed** (api 193, web 63, contracts 49, api-client 10, config 15); all coverage gates met (api 95.15% / web 95.77% statements); E2E 9 passed, 13 skipped (blocked workflow steps); audit 0 vulnerabilities. Two code defects fixed (SignOutButton unhandled rejection, ErrorSummary focus race). Details: [test execution report](test-execution-report.md) |
| 2026-10-17 (re-verification pass) | `npm run validate`, `npm run test:coverage`, `npx playwright test`, mutation checks | Before changes: the testing-pass results reproduced exactly (330 passed; same coverage; E2E 9 passed, 13 skipped). Added TC-TEN-04/05 (`membership-lifecycle.test.ts`) and fixed one order-dependent CSRF test (F-8). Final `npm run validate`: exit 0, Vitest **333 passed, 0 failed** (api 196). One intermediate validate exited 1 on a Prettier issue in the new file (F-9), fixed. Details: [test execution report §9](test-execution-report.md#9-re-verification-pass-2026-10-17)
| 2026-10-17 (M2) | Lint, typecheck, `npm test`, build; `npm run test:coverage`; `npx playwright test --repeat-each=2`; `npm audit` | All exit 0. Vitest **586 passed, 0 failed** (api 382, web 108, contracts 65, api-client 16, config 15); every coverage gate met (api 95.59% / web 92.05% statements; core-ops module 95.19%); E2E 30 passed, 22 skipped (blocked M3–M5 steps); 0 vulnerabilities. Intermediate failures (lint, coverage gates, test defects, and 6 code defects including 4 found by the security and test reviews) are listed in the [execution report §10.3](test-execution-report.md#103-failures-encountered-and-resolutions) |
| 2026-10-17 (M3) | `npm run validate`, `npm run test:coverage`, `npx playwright test --repeat-each=2`, `npm audit`, mutation script | Vitest **868 passed, 0 failed** (api 617, web 145, contracts 73, api-client 18, config 15); coverage gates met; E2E 48 passed, 10 skipped (blocked M4–M5 steps); 0 vulnerabilities; 10/10 mutations caught. One docs-check error (renamed anchor) was fixed. Five code defects found by tests were fixed (editor remount, reused idempotency key, retry key, 360 px overflow, swallowed click on blur validation). Details: [execution report §11](test-execution-report.md#11-m3-scope-guard-and-ai-2026-10-17) |
| 2026-10-17 (M4) | `npm run test:coverage`, `npx playwright test --repeat-each=2`, mutation script, `npm run validate` | Vitest **980 passed, 0 failed** (api 697, web 167, contracts 81, api-client 20, config 15); coverage gates met; E2E 60 passed, 6 skipped (3 blocked M5 steps × 2); 11/11 mutations caught. Details: [execution report §12](test-execution-report.md#12-m4-delivery-and-billable-work-2026-10-17) |
| 2026-10-18 (M5) | `npm run test:coverage`, `npx playwright test --repeat-each=2`, mutation script, `npm audit --audit-level=high`, `npm run validate` | Vitest **1051 passed, 0 failed** (api 746, web 184, contracts 85, api-client 21, config 15); coverage gates met; E2E 66 passed, 2 skipped (E2E-WF-13 × 2, blocked on FR-004); 10/12 mutations caught, 2 defense-in-depth guards recorded; 0 vulnerabilities. Details: [execution report §13](test-execution-report.md#13-m5-invoices-and-ai-resilience-2026-10-18) |
| 2026-10-18 (release sprint) | `npm run validate`, `npm run test:coverage`, Playwright (in-memory and Docker MongoDB), API suite on Docker MongoDB, real-model UI check | Vitest 1051 passed; coverage gates met; E2E 33 passed / 1 skipped in both modes; API 746/746 on Docker; Ollama `qwen2.5:1.5b`: 4/4 schema-valid with `json_schema`, 1/4 with `prompt` (safe fallback). Details: [release audit §12](release-readiness-audit.md#12-release-closure-sprint-2026-10-18) |
| 2026-10-19 (independent audit) | Fresh `git clone` of `89cdc6c`, then `npm ci`, `npm run validate`, `npm run test:coverage`; shuffled API run (`--sequence.shuffle`, seed 20261019); real-model check through the AI service (Ollama `qwen2.5:1.5b`) | All exit 0: Vitest 1051 passed; shuffled API run 746/746; AI 3/3 `json_schema`, 3/3 `prompt`, outage → 502 with a FAILED record. Details: [release audit §13](release-readiness-audit.md#13-final-release-closure-2026-10-19) |
| 2026-10-19 (release closure) | `npm run lint`, `typecheck`, `test:coverage`, `build`, `design:contrast`, `npm audit`, `test:e2e`, plus a mutation check of the new home-page assertion | All exit 0 after one E2E test-locator fix: Vitest 1051 passed; E2E 33 passed, 1 skipped; the assertion fails on the old home-page copy. Details: [release audit §13.4](release-readiness-audit.md#134-validation-run-after-these-changes) |
| 2026-10-19 (GitHub CI) | First GitHub Actions run on `main` (`def722b`) | `validate` success, `docker-mongodb` success ([run](https://github.com/susmitaPersonal/soloops-ai/actions/runs/39159239746)) |
| 2026-10-19 (scope check + members) | `npm run lint`, `typecheck`, `test:coverage`, `build`, `docs:check`, `design:contrast`, `npm audit`, `test:e2e`; race tests ×10; `npm run eval:ai` ×3 (local `qwen2.5:1.5b`) | All exit 0: Vitest **1114 passed** (api 801, web 192, contracts 85, api-client 21, config 15); E2E **34 passed, 0 skipped**; races 10/10. Evaluation: T3 accuracy **fails** (0.304 vs 0.70); T1, T2, T4, T5 pass with the shipped prompt. Details: [release audit §14](release-readiness-audit.md#14-theme-alignment-ai-scope-check-and-members-2026-10-19), [AI evaluation results](ai-evaluation-results.md) |
| 2026-10-16 (M1) | `docker compose up -d mongo` | **Not run**: Docker daemon not running on this machine |
| 2026-10-16 (M1) | CI on GitHub | **Not run**: nothing committed or pushed yet |
