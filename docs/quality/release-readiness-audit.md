# Release Readiness Audit

**Date:** 2026-10-18. **Scope:** the code in the working tree after milestones M1–M5 (nothing has been committed or pushed yet). **Performed by:** the maintainer's Claude Code session, using the `soloops-security-review`, `soloops-testing` and `soloops-documentation` checklists. No reviewer agents were run for this audit; the M1 and M2 agent reviews are in [implementation status](implementation-status.md#m2-reviews). Every result below comes from a command that was actually run; anything not run is listed in [§7](#7-environment-limitations-not-verified).

## 1. Overall status

> **Current status (2026-10-18, after the release closure sprint): READY WITH LIMITATIONS.** See [§12](#12-release-closure-sprint-2026-10-18). The earlier verdict below is kept for history.

**Verdict: release candidate. Not released, and not yet releasable until the P0 process items in [§10](#10-p0--p1-next-actions) are done.**

- **No release blocker was found** in the four categories that must block a release:
  - authorisation bypass;
  - a path that makes unapproved work billable;
  - an incorrect authoritative invoice calculation;
  - a broken core workflow.

  Evidence for each is in [§3](#3-critical-findings).
- Two real defects were found and **fixed** during this audit:
  - BR-030 evidence after a void;
  - AI status probes slowing page loads.

  [§4](#4-changes-made-during-the-audit) lists them.
- What still prevents calling it released:
  - the code has never run in CI;
  - it has not been committed;
  - Docker Compose MongoDB has never been started;
  - no real AI endpoint has been called.

  These are verification gaps, not known defects.
- Product scope: every **Must** requirement is done.
  - **Should** items still open: FR-004 (members), FR-016 (audit log UI), FR-017 (dashboard), FR-061 (export).
  - **Could** items open: FR-060, FR-062.
  - The MVP works for a solo freelancer (one owner). Small teams cannot add members yet.
- Invoices are **drafts with one tax rate, not GST-compliant tax invoices** (OQ-002). The product says so on the invoice and the print view.

## 2. Requirements matrix

Full chain per requirement: [traceability matrix](requirements-traceability.md). Summary:

| Area | Requirements | Priority | Status | Main evidence |
| --- | --- | --- | --- | --- |
| Identity, workspace, settings | FR-001, FR-002, FR-003, FR-005 | M | Done | `identity.test.ts`, `workspace.test.ts`, E2E M1 journey |
| Members | FR-004 | S | **Not built** | Blocks E2E-WF-13 and team use |
| Core Ops | FR-010–FR-014 | M | Done | `core-ops-*.test.ts`, E2E-WF-02/03 |
| Project overview | FR-015 | S | Done | TC-024.1 |
| Audit log UI, dashboard | FR-016, FR-017 | S | **Not built** | Audit events are written (BR-028), but there is no screen |
| Scope Guard | FR-020, FR-022–FR-029, FR-032 | M/S | Done | `scope-guard-lifecycle.test.ts`, E2E M3 |
| AI | FR-021, FR-050–FR-054 | M/C | Done (mock and stub providers only) | `scope-guard-ai.test.ts`, E2E-WF-05/14 |
| Tasks from approved versions | FR-030 | M | Done | TC-015.x, E2E-WF-08 |
| Signed client approval | FR-031 | C | Not planned for MVP | ADR-0006 |
| Billable work and eligibility | FR-040, FR-041 | M | Done | TC-017.x, TC-018.x, E2E-WF-09/11a |
| Invoices | FR-042–FR-046 | M/S | Done | TC-019.x–TC-021.1, TC-E2E-01 |
| Community, export | FR-060–FR-062 | C/S | **Not built** | |
| Business rules | BR-001–BR-030 | — | Enforced server-side for all implemented records | [rules → tests](requirements-traceability.md#business-rules--tests), mutation checks in [execution report](test-execution-report.md) §10.4, §11.4, §12.4, §13.4 |
| Security | SEC-001–SEC-011 | M | Done for every implemented endpoint | TC-SEC-01 matrix (51 routes), TC-SEC-02 route inventory, TC-SEC-03 owner-only routes, `security-hardening.test.ts` |
| Accessibility | A11Y-001–A11Y-007 | M | axe (serious/critical) clean on every built screen; keyboard paths tested for sign-in | E2E A11Y-007 tests in every milestone spec. **No screen-reader test** |
| NFR | NFR-001, -002, -003, -005, -006, -008, -009, -010, -012 | M | Verified by tests | Money unit tests, transactions, audit insert-only, AI timeouts, AI isolation, lint boundaries, logs, 360 px tests |
| NFR | NFR-004 (performance), NFR-007 (Docker Compose), NFR-011 (browsers), NFR-014 (licences), NFR-015 (onboarding), NFR-016 (backup) | M/S | **Not verified** | [§7](#7-environment-limitations-not-verified) |

## 3. Critical findings

| Category | Result | Why we believe it |
| --- | --- | --- |
| Authorisation bypass | **None found** | (1) Every registered tenant route must appear in the TC-SEC-01 matrix, or TC-SEC-02 fails: 51 routes, each tested with a foreign workspace, a missing ID and a malformed ID, all giving an identical `404`. (2) TC-SEC-01d: another workspace's resource IDs used inside one's own workspace look missing. (3) TC-SEC-03: settings, AI enablement, invoice issue and invoice void give `403` to members. (4) Data access only goes through `TenantCollection`, whose guards are unit-tested. (5) A cross-workspace attempt consumed no invoice number and changed none of A's records (asserted). |
| Unapproved billable path | **None found** | Each layer re-checks on its own: a billable task needs a baselined requirement or an APPROVED version (TC-016.x); entry eligibility is computed from authoritative records on every read (BR-016, never stored or accepted from clients); invoice drafts refuse ineligible work (TC-019.2); issue re-checks every line (TC-020.4); the AI module has no write path (lint, TC-ARCH-01). Mutation checks remove each of these controls in turn and a test fails every time. |
| Incorrect authoritative invoice calculation | **None found** | One pure bigint implementation (`invoice-calc.ts`, `platform/money.ts`): TIME = roundHalfUp(minutes × rate / 60), tax on the subtotal, half up. Covered by unit tests (zero tax, .5, 200 × 13-digit lines), integration tests (18% tax, adjustments) and the E2E journey (₹3,000 − ₹500 + 18% = ₹2,950.00). TIME amounts are recomputed at issue. Client-sent totals are ignored. |
| Broken core workflow | **None found** | TC-E2E-01 runs the whole J1–J4 workflow **through the UI only**: register → settings → client → project → requirement → baseline → CR → AI (mock) → propose → approve → tasks → work → draft → adjustment → issue RS-0001 → print → void. It passes on two consecutive runs. |
| Found and fixed in this audit | 2 defects | [§4](#4-changes-made-during-the-audit) |
| Residual risk accepted | Medium/Low | Two draft-reservation guards are defense in depth and not independently load-bearing. Tax settings are snapshotted at draft time. Rate limits and the AI health cache are in memory per process. Member removal does not exist, so assignee checks run outside the transaction. See [known limitations](known-limitations.md). |

## 4. Changes made during the audit

| Change | Type | Files | Test |
| --- | --- | --- | --- |
| **BR-030**: a released entry that appears on a void invoice could be hard-deleted, leaving the void invoice's line pointing at nothing. Deleting an entry referenced by any invoice line is now refused with `409` | Code defect fixed | `billing/service.ts`, `billing/repository.ts`, migration `0005` (index `workspace_line_entry`) | `TC-021.1` (BR-030 part); mutation check caught |
| **AI resilience**: every CR and settings page load probed the AI provider (up to 3 s when unreachable). The probe is now cached for 30 s and shared | Code defect fixed | `ai/service.ts` | `TC-AI-HC`; mutation check caught |
| AI failure UI coverage extended to `AI_PROVIDER_ERROR`, `AI_DISABLED` and `INTERNAL_ERROR` | Tests | `change-requests.test.tsx` | CT-AI-03 (7 cases) |
| Docs drift: FR-021 and FR-028 were marked Planned although done since M3; local development said AI was not implemented; the docs index said only M1 existed; test-case and traceability dates were stale | Docs | `requirements-traceability.md`, `local-development.md`, `docs/README.md`, `test-cases.md`, `testing-strategy.md` | Docs check |
| Release audit doc and links | Docs | this file, `docs/README.md`, `implementation-status.md`, `CLAUDE.md` | Docs check |

## 5. Test report

Latest full runs (2026-10-18), details in the [test execution report §13](test-execution-report.md#13-m5-invoices-and-ai-resilience-2026-10-18):

| Command | Result |
| --- | --- |
| `npm run validate` (lint, typecheck, tests, build, docs check) | **Exit 0.** Vitest 1051 passed, 0 failed (api 746, web 184, contracts 85, api-client 21, config 15); docs check `Checked 81 Markdown files. 0 error(s), 0 warning(s).` |
| `npm run test:coverage` | Exit 0. Every coverage gate met. `apps/api` 95.25% statements / 87.11% branches; `apps/web` gated folders 85.05% / 80.39% (measured before the BR-030 test was added) |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| Mutation checks (M2–M5) | M2 and M3 controls all caught (§10.4, §11.4); M4 11/11 (§12.4); M5 10 of 12, with 2 recorded as defense in depth (§13.4) |

The `validate` run includes the BR-030 assertion added during this audit; it extends the existing TC-021.1 test, so the test count is unchanged. The coverage run was taken just before that change, so the coverage percentages do not include the new code path.

## 6. E2E result

`npx playwright test --repeat-each=2` (Chromium desktop and Pixel 7 emulation, `mock` AI, real MongoDB replica set via `mongodb-memory-server`): **66 passed, 0 failed, 2 skipped**.
- The skipped test is **E2E-WF-13** (a member cannot issue invoices through the UI) on both runs.
- It needs FR-004 to add a second member without seeding the database, which the E2E rules forbid.
- The rule itself passes at API level (TC-020.2, TC-SEC-03) and component level (CT-INV-02).

All other principal-workflow steps (E2E-WF-02 … 12, 14) and TC-E2E-01 run. The BR-030 fix came after this E2E run. It changes only an API error path that the E2E tests do not exercise, and the API suite re-ran in `validate`.

## 7. Environment limitations (not verified)

| Not verified | Why | How to verify |
| --- | --- | --- |
| CI on GitHub | No commit or remote yet | Commit, push, check `.github/workflows/ci.yml` |
| ~~Docker Compose MongoDB (NFR-007)~~ | **Verified in the second pass ([§11](#11-checklist-audit-second-pass-2026-10-18))**: Compose `mongo:8.2.12` healthy, migrations applied, 746/746 API tests and 7/7 core E2E tests on it | — |
| A real OpenAI-compatible endpoint, model quality, latency and cost | No endpoint configured; the evaluation harness is not built | ai-architecture §7 |
| Firefox, Safari / WebKit, Edge (NFR-011) | Only Chromium and Pixel 7 emulation | Add Playwright projects |
| Screen readers (A11Y-001) | Not available | Manual test with NVDA / VoiceOver |
| Performance p95 (NFR-004), backup and restore (NFR-016) | Not measured or rehearsed | Load test, restore rehearsal |
| A human contributor following the README (NFR-015) | Only an automated clean-copy run was done ([§11](#11-checklist-audit-second-pass-2026-10-18)) | A fresh-clone trial by a new contributor |
| Printing to paper or PDF | Only the print view's DOM and watermark are tested | Manual browser print |
| Windows only | All runs were on Windows 11 | CI on Linux |

## 8. Known limitations

The full list is in [known limitations](known-limitations.md). The ones a release must state:
- Invoices are drafts with one tax rate, **not GST-compliant tax invoices**. There are no payments, credit notes or e-invoicing.
- One owner per workspace in practice, because members cannot be added (FR-004).
- Client approvals are **recorded by the freelancer** (name, date, channel, evidence, hash), not signed by the client.
- AI is advisory only and off by default. No model has been evaluated or is recommended.
- Rate limits and the AI health cache are in memory per API process.
- The billable-entry list shows the newest 500 entries. Entry editing is API-only.

## 9. Release checklist

| Item | Status |
| --- | --- |
| All Must requirements done with passing tests | ✅ |
| No open critical security, billing-integrity or workflow defect | ✅ (§3) |
| `npm run validate` green | ✅ (local) |
| E2E principal workflow green | ✅ (local, ×2) |
| `npm audit` high/critical = 0 | ✅ |
| Isolation matrix covers every tenant route | ✅ (TC-SEC-02 enforces it) |
| Docs, traceability, status and limitations updated | ✅ |
| Code committed and reviewed by a maintainer | ❌ P0 |
| CI green on GitHub | ❌ P0 |
| Docker Compose MongoDB verified (tests and core E2E) | ✅ (§11) |
| Backup and restore rehearsed | ❌ P1 |
| Real AI endpoint smoke test (if AI is advertised) | ❌ P1 |
| Members (FR-004) for small teams | ❌ P1 |

## 10. P0 / P1 next actions

**P0 (before any release):**
1. Maintainer review of M1–M5, then the first commit and push. Do not include `.env` files: secrets come from the environment only.
2. CI green on GitHub (lint, typecheck, tests, build, docs check) on Linux.
3. ~~Docker Compose verification~~: done in §11 (API suite and core E2E on Compose MongoDB). Remaining: make `e2e/stack.mjs` accept an external `E2E_MONGODB_URI` so CI can repeat it.
4. State the release scope honestly in the README: solo use, invoice drafts not tax-compliant, AI advisory, approvals recorded and not signed.

**P1 (next milestone, M6 hardening):**
1. FR-004 member management (with member-removal checks inside transactions), then unblock E2E-WF-13.
2. Backup and restore runbook rehearsed (NFR-016), plus a licence scan (NFR-014).
3. A real OpenAI-compatible endpoint smoke test, and the AI evaluation harness before recommending a model.
4. Firefox and WebKit Playwright projects; a screen-reader pass on the principal workflow.
5. A shared store for rate limits and caches if more than one API process is deployed.
6. FR-016 audit log UI and FR-017 dashboard; S-16 "Unbilled by project"; entry editing in the UI; pagination of billable entries.

## 11. Checklist audit (second pass, 2026-10-18)

The maintainer asked for an audit against the release checklist below, reporting gaps before any UI polish. Method: a clean copy of the working tree (no `node_modules`, build output or `.env` files) in a temp folder, set up by following the README; Docker Desktop was started for the Docker-backed checks. The temp copy and its container were removed afterwards.

| Checklist item | Result | Evidence |
| --- | --- | --- |
| M2–M5 implemented and traceability updated | ✅ | Traceability rows Done for FR-010–FR-046 (Must and Should items of M2–M5); FR-021 and FR-028 drift fixed in §4 |
| Critical security and billing rules verified | ✅ | §3; isolation matrix 51 routes; mutation checks M2–M5 (two BR-018 guards are defense in depth, §13.4 of the execution report) |
| Full tests, coverage, lint, typecheck, build pass | ✅ | Working tree: `npm run validate` and `npm run test:coverage` exit 0. Clean copy: `npm ci` (0 vulnerabilities) and `npm run validate` exit 0, 1051 tests |
| Core Playwright workflow runs, not skipped | ✅ | TC-E2E-01 and E2E-WF-02…12, 14 run (66 passed ×2 runs). Only E2E-WF-13 is skipped (needs FR-004 members) |
| MongoDB integration incl. Docker-backed tests | ✅ | Compose `mongo:8.2.12` reported healthy after ~15 s. `npm run db:migrate` applied 0001–0005, and a re-run applied none. `MONGODB_URI_TEST=… npm test -w @soloops/api`: **30 files, 746 passed**, and the container log shows the per-file `soloops_test_*` databases (2,382 drop events). Core E2E (M4 + M5 specs, incl. TC-E2E-01) against the Compose DB: **7 passed**, with invoices and `invoice.*` audit events present in its `soloops_e2e` database. Caveats: this machine's port 27017 is taken by another `mongod`, so the container was mapped to 27018 with `directConnection=true` (troubleshooting updated); and the E2E run needed a temp-copy-only patch of `e2e/stack.mjs` (P0 item 3) |
| README and setup verified on a clean environment | ⚠️ Partly | Automated clean copy: `npm ci`, copying both `.env.example` files, `SESSION_SECRET`, `docker compose up -d mongo`, `npm run db:migrate` and `npm run validate` all worked as written. **Not done:** `npm run dev` and a browser sign-up by hand, a fresh `git clone` (there is no commit yet), Linux or macOS, or a human newcomer |
| Open-weight AI integration and fallback verified | ⚠️ Fallback only | Fallback and failure handling: verified (mock and HTTP-stub adapters, 7 UI failure kinds, E2E-WF-14 manual path, AI status cache). **The real open-weight path is not verified**: this machine has no model runtime (no Ollama, llama.cpp, LM Studio or vLLM; nothing on ports 11434, 1234, 8000, 8080 or 5000). Verifying it needs a model download (several GB) and the maintainer's go-ahead; then run TC-E2E-01 with `AI_PROVIDER=openai-compatible` and record the result. No model may be recommended until the ai-architecture §7 evaluation exists |
| License, contribution instructions, CI | ⚠️ | **License:** MIT `LICENSE` present, but the README still says "pending maintainer confirmation (OQ-001)": the maintainer must confirm. Lockfile licence scan: 454 packages, no GPL, AGPL or unlicensed. The runtime `sharp` image binaries (optional dependency of Next.js) are **LGPL-3.0-or-later** (`libvips`), which is OSI-approved and acceptable dynamically linked and unmodified, but should be listed in a third-party notice. MPL-2.0 packages are dev-only. Workspace `package.json` files have no `license` field (private packages). **Contributing:** `docs/contributing/` has a guide, code of conduct, issue guidelines and a PR checklist, all linked from the README; there is no root `CONTRIBUTING.md`, so GitHub will not surface it automatically. **CI:** the workflow covers audit, lint, typecheck, coverage, build, docs, contrast and E2E; all four pinned action SHAs match their tags (`git ls-remote`); `npm run design:contrast` passes locally (90 pairs). **CI has never run**, because there is no commit or remote |
| Final audit document completed | ✅ | This document |

**Gaps, in priority order (no UI polish before these):**
1. **P0** First commit, push, and CI green on GitHub (never run).
2. **P0** Maintainer confirms the MIT licence (OQ-001) and the release scope wording.
3. **P0** A real open-weight endpoint smoke test of TC-E2E-01, if AI is part of the release claim. Otherwise ship with AI documented as "off by default, unverified with real models".
4. **P1** `E2E_MONGODB_URI` support in `e2e/stack.mjs` plus a CI job against a MongoDB service container; a root `CONTRIBUTING.md` pointer; a third-party notice for LGPL `libvips`.
5. **P1** A human fresh-clone trial with `npm run dev`, ideally on Linux and macOS.
6. **P1** FR-004 members (unblocks E2E-WF-13).

## 12. Release closure sprint (2026-10-18)

### 12.1 Final status: READY WITH LIMITATIONS

- **Verified locally:**
  - the core workflow, and the security and billing integrity rules;
  - lint, typecheck, Prettier, tests, coverage, build and the docs check;
  - E2E with the in-memory MongoDB **and** the Docker Compose MongoDB;
  - MongoDB on Docker;
  - one real open-weight model through the UI;
  - the licence decision.
- **No critical issue is open.**
- **Remaining limitations** (none block correctness, security or data integrity):
  - **GitHub Actions has never run.** There is no commit and no remote, and the maintainer has not yet authorised a commit. Remote CI is therefore **unverified**: local results are not CI results.
  - **Member management (FR-004) is not built.** It is a *Should*, not a release-scope *Must*. Its E2E test stays skipped and is not counted as passing.
  - **AI estimate quality is unevaluated.** Only the integration is proven.
  - A human fresh-clone trial and Linux/macOS runs are not done.

### 12.2 What changed and why

| Change | Why |
| --- | --- |
| Licence: **MIT confirmed by the maintainer**; OQ-001 resolved; README, product overview and repository guide no longer say "pending/assumed" | Maintainer decision (asked in this sprint) |
| `sharp`/`libvips` third-party notice: **not added** (not warranted) | The repository distributes source only: no Dockerfile, no `standalone` output, no bundled binaries. `sharp` is an optional dependency of Next.js, installed by npm with its own LICENSE files, and the app does not import `next/image`. **A notice becomes required** if anyone ships container images or packaged builds that include `node_modules/@img/*` (LGPL-3.0-or-later `libvips`) |
| Root `CONTRIBUTING.md` | GitHub surfaces it; it covers setup, validation, branch/PR rules, no secrets, and licensing |
| README: AI defaults, advisory role, fallback, verification status; database port note; current limitations; link to CONTRIBUTING | The previous text did not explain AI behaviour or limitations |
| Local development documents `E2E_MONGODB_URI` and a verified Ollama configuration; troubleshooting covers a busy port 27017 (override **and** `directConnection=true`) | Accurate setup instructions |
| `e2e/stack.mjs`: optional `E2E_MONGODB_URI` (local hosts only unless `ALLOW_REMOTE_TEST_DB=true`; a fresh `soloops_e2e_<ms>_<id>` database per run, dropped on exit; leftovers older than 1 h are swept at start because Windows kills the process without a catchable signal) | Run E2E on the supported Docker setup (NFR-007) |
| `e2e/package.json`: `mongodb` 7.7.0 declared as a dev dependency (exact version already in the lockfile; one lockfile line changed) | The stack imports it; it no longer relies on hoisting |
| CI: a new job `docker-mongodb` (`docker compose up -d --wait mongo` → migrate → API tests via `MONGODB_URI_TEST` → build → E2E via `E2E_MONGODB_URI`; Mongo logs on failure), using the same SHA-pinned actions. The existing `validate` job is unchanged | Docker-backed integration in CI |
| A CI defect found before it shipped: the first version of the migrate step lacked `APP_ORIGIN` and would have failed config validation; now fixed. The secret is generated per run with `openssl rand -base64 32`, never stored | Simulated the step locally |
| `.gitignore`: `docker-compose.override.yml` | Machine-specific port overrides must not be committed |
| AI docs: `AI_STRUCTURED_OUTPUT=json_schema` recommended for small local models (environment configuration, local development, README) | Measured: 4/4 vs 1/4 schema-valid ([§12.4](#124-real-open-weight-ai-verification)) |

### 12.3 Commands run (this sprint) and results

| Command | Exit | Result |
| --- | --- | --- |
| `git status` / `git add -n .` (dry run) | 0 | Branch `main`, no commits, no remote; only source, docs and config files are candidates (no build output or local files) |
| Secret scan over the files that would be committed (private keys, AWS/OpenAI/GitHub/Slack/Google key patterns, `mongodb+srv` credentials) | — | No matches; only `example.com` emails; `.env.example` files have empty secret placeholders; no `.env` files on disk |
| `npx prettier --check .` | 0 | All files formatted |
| `npm run validate` | 0 | Lint, typecheck, Vitest **1051 passed, 0 failed** (api 746, web 184, contracts 85, api-client 21, config 15), build, docs check |
| `npm run test:coverage` | 0 | All gates met. api 95.25% statements / 87.13% branches; web 85.05% / 80.39%; contracts 96.35% / 92.06%; api-client 100% / 86.2%; config 93.22% / 85.29% |
| `npx playwright test` (in-memory MongoDB) | 0 | **33 passed, 1 skipped** (E2E-WF-13) |
| `E2E_MONGODB_URI=... npx playwright test` (Docker Compose `mongo:8.2.12`) | 0 | **33 passed, 1 skipped** (E2E-WF-13) |
| `docker compose up -d --wait mongo` | 0 | Healthy |
| CI migrate step simulated (same env as the job) | 0 | Applied 0001–0005 (the first attempt exited 1 on the missing `APP_ORIGIN`, which was then fixed) |
| `MONGODB_URI_TEST=... npm test -w @soloops/api` on Docker MongoDB | 0 | 30 files, **746 passed** |
| `node e2e/stack.mjs` with a non-local `E2E_MONGODB_URI` | non-zero | Refused as intended: "must point at a local MongoDB" |
| `npm install -w @soloops/e2e --save-dev --save-exact mongodb@7.7.0` | 0 | 0 vulnerabilities |

No commit SHA (no commit was made). No GitHub Actions URL (no run).

### 12.4 Real open-weight AI verification

| Item | Result |
| --- | --- |
| Runtime and model | **Ollama 0.40.5** (installed with `winget install Ollama.Ollama`, installer hash verified), **`qwen2.5:1.5b`** (986 MB, digest verified). Free, local, no API key |
| Configuration | Existing variables only: `AI_PROVIDER=openai-compatible`, `AI_BASE_URL=http://127.0.0.1:11434/v1`, `AI_MODEL=qwen2.5:1.5b`, default `AI_TIMEOUT_MS`; then `AI_STRUCTURED_OUTPUT=json_schema`. No code or schema change |
| Path exercised | The built API and the production web build, against the Compose MongoDB, driven through the real UI: register → settings (`/ai/status` = `openai-compatible`, `qwen2.5:1.5b`, **`health: ok`**) → turn AI on → client, project, baselined REQ-1 → record CR → **Analyse with AI** |
| `prompt` mode (default) | 4 requests: **1 SUCCEEDED, 3 FAILED `INVALID_OUTPUT`** (rejected after the one repair attempt). Each failure showed "did not match the expected format ... Your draft is unchanged" |
| `json_schema` mode | 4 requests: **4/4 SUCCEEDED**, about 1.4 s each (warm model) |
| What the UI showed | Description, scope, criteria, assumptions, risks, an effort range, questions for the client, and an indicative cost "calculated by SoloOps ... not by the AI", labelled "Suggestion only" with the model name and `cr-analysis@1` |
| Advisory behaviour | Before Apply, the draft and confirmed effort were unchanged. After Apply and Save, all 8 CRs in the check database were `DRAFT` with **0 approvals, 0 tasks, 0 invoices, no confirmed effort and no pricing** |
| Generation records | `aiGenerations` held provider `openai-compatible`, model `qwen2.5:1.5b`, status, error code, latency, tokens (about 729 in / 485 out) and prompt/schema versions; the `ai.generation` logs had no request text and no key |
| Fallback with a real outage | Ollama stopped → status **`unreachable`** → analysis failed in 0.9 s with `NETWORK`; the UI showed "The AI provider could not complete the analysis. Your draft is unchanged" |
| Quality (not claimed) | Identical requests produced effort ranges of 10–40 h and 50–150 h. This is an **integration** proof only; the ai-architecture §7 evaluation has not been run and no model is recommended |
| Clean-up | The check database was dropped; servers stopped. Ollama and the model stay installed (stopped). Uninstall with `winget uninstall Ollama.Ollama` if unwanted |

### 12.5 Skipped test: E2E-WF-13 (member cannot issue)

FR-004 is a **Should** requirement, so it is outside the Must release scope. No member API or UI exists, and creating a member for E2E would mean seeding the database, which the E2E rules forbid. Building FR-004 is feature work, not release closure, so it was not done. The rule is enforced and tested at API level (TC-020.2, TC-SEC-03: member → 403) and component level (CT-INV-02). The test remains `test.fixme`, reported as skipped and **not counted as passing**.

### 12.6 Remaining limitations, owners and next steps

| # | Item | Owner | Exact next step |
| --- | --- | --- | --- |
| 1 | No commit, no remote, GitHub CI never run | Maintainer | `git add -A && git commit -m "SoloOps AI M1–M5"`; create the GitHub repository; `git remote add origin <url>`; `git push -u origin main`; check that both CI jobs (`validate`, `docker-mongodb`) pass, then record the run URL here |
| 2 | Member management (FR-004) | Product / dev | Build FR-004 (M6), then unblock E2E-WF-13 |
| 3 | AI estimate quality | Dev | Build the ai-architecture §7 harness and dataset; run it on `qwen2.5:1.5b` (`json_schema`) and at least one larger open model |
| 4 | Human fresh-clone trial; Linux/macOS | Contributor | Follow README/CONTRIBUTING on a clean machine and record the result |
| 5 | Third-party notice if distributing binaries | Maintainer | Only when shipping images or packaged builds: add `THIRD_PARTY_NOTICES` covering `sharp` / `libvips` (LGPL-3.0-or-later) |
| 6 | Backup/restore rehearsal, performance baseline, Firefox/WebKit, screen reader | Dev | See §7 |

### 12.7 Final validation

Run after the last edit of this sprint: `npx prettier --check .` exit 0; `npm run validate` exit 0 (Vitest 1051 passed, 0 failed; docs check `Checked 82 Markdown files. 0 error(s), 0 warning(s).`). Commit candidates: 380 files (`git add -n .`), secret-pattern hits: 0. Code is unchanged since the coverage and Playwright runs in §12.3 (only docs changed afterwards), so those were not repeated.
