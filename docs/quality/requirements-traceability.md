# Requirements Traceability Matrix

Chain: **Requirement → User story → Acceptance criteria → Design/module → API/UI → Test case → Status**.

> **Status values:** `Planned` (designed, not implemented; its test cases are **Blocked**) · `In progress` · `Done` (only when the tests listed **exist and pass**, per the [definition of done](../engineering/definition-of-done.md)). Last updated 2026-10-19. "Done" rows passed locally (`npm run validate`, `npm run test:coverage`, Playwright; latest run in [release readiness audit §13](release-readiness-audit.md#13-final-release-closure-2026-10-19)). CI has not run on GitHub yet.

## Functional requirements

| FR | Pri | US | AC | Module | API / UI | TC | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FR-001 | M | US-001 | AC-001.1–.2 | identity | `POST /auth/register` · S-01 | TC-001.1–.2 | Done |
| FR-002 | M | US-001 | AC-001.3–.4 | identity | `POST /auth/login`, `/logout`, `GET /auth/me` · S-01 | TC-001.3–.4, TC-SEC-05 | Done |
| FR-003 | M | US-001 | AC-001.1 | workspace | `POST /auth/register` | TC-001.1 | Done |
| FR-004 | S | US-003 | AC-003.1–.2 | workspace | `{ws}/members` · S-12 | TC-003.1–.2 | Planned |
| FR-005 | M | US-002 | AC-002.1–.3 | workspace | `PATCH {ws}` · S-12 | TC-002.1–.3, TC-002.1d, TC-019.1 | Done (M5: invoice drafts take the workspace tax label and rate) |
| FR-010 | M | US-004 | AC-004.1–.3 | core-ops | `{ws}/clients` · S-02 | TC-004.1–.3, TC-004.V, TC-004.E, TC-004.P | Done (M2) |
| FR-011 | M | US-005 | AC-005.1–.2 | core-ops | `{ws}/projects` · S-03, S-04 | TC-005.1–.2, TC-005.V, TC-005.E, TC-BR-029.1–.2 | Done (M2) |
| FR-012 | M | US-006 | AC-006.1–.2 | core-ops | `…/requirements` · S-05 | TC-006.1–.2, TC-006.V | Done (M2) |
| FR-013 | M | US-007 | AC-007.1–.3 | core-ops | `…/baselines` · S-05 | TC-007.1–.3, TC-007.C, TC-BR-005, TC-BR-028.baseline | Done (M2) |
| FR-014 | M | US-016 | AC-016.1–.2 | core-ops | `…/tasks` · S-09 | TC-016.1–.5, TC-016.S, TC-016.U, TC-016.L | Done (M2; links to approved change-request versions M4) |
| FR-015 | S | US-024 | AC-024.1 | billing (reads core-ops, scope-guard) | `…/overview` · S-04 | TC-024.1 | Done (M4) |
| FR-016 | S | US-014 | AC-014.1 | audit | `{ws}/audit-events` · S-13 | TC-014.1 | Planned |
| FR-017 | S | US-026 | AC-026.1–.4 | dashboard | `GET {ws}/dashboard` · S-14 | TC-026.1–.4 | Planned |
| FR-020 | M | US-008 | AC-008.1–.2 | scope-guard | `…/change-requests` · S-06 | TC-008.1–.2 | Done (M3) |
| FR-021 | M | US-009 | AC-009.1, .3, .5, .6 | scope-guard, ai | `…/versions/{n}/analyze` · S-07 | TC-009.1, .3, .5, .6, TC-AI-01–05 | Done (M3; mock and stub providers only, no model evaluated) |
| FR-022 | M | US-009, US-010 | AC-009.2 | scope-guard | `PATCH …/versions/{n}` · S-07 | TC-009.2 | Done (M3) |
| FR-023 | M | US-010 | AC-010.1–.3 | scope-guard | propose · S-07 | TC-010.1–.3 | Done (M3) |
| FR-024 | M | US-011 | AC-011.1–.2 | scope-guard | `…/propose` · S-07 | TC-011.1–.2, TC-BR-008 | Done (M3) |
| FR-025 | M | US-012 | AC-012.1–.6 | scope-guard | `…/decisions` · S-07 | TC-012.1–.6 | Done (M3) |
| FR-026 | M | US-013 | AC-013.1–.2 | scope-guard | `POST …/versions` · S-07 | TC-013.1–.2 | Done (M3) |
| FR-027 | S | US-011 | AC-011.3 | scope-guard | `…/summary` · S-08 | TC-011.3 | Done (M3) |
| FR-028 | M | US-014 | AC-014.1–.2 | scope-guard, audit | `GET …/change-requests/{crId}`, `…/diff` · S-07 | TC-014.1–.2 | Done (M3) |
| FR-029 | S | US-013 | AC-013.3 | scope-guard | `…/withdraw` · S-07 | TC-013.3 | Done (M3) |
| FR-030 | M | US-015 | AC-015.1–.2 | scope-guard, core-ops | `POST …/versions/{n}/tasks` · S-07 | TC-015.1–.6 | Done (M4) |
| FR-031 | C | — | — | scope-guard | — | — | Not planned for MVP |
| FR-032 | S | US-027 | AC-027.1–.3 | scope-guard | `GET {ws}/change-requests?status=` · S-15 | TC-027.1–.3 | Done (M3) |
| FR-040 | M | US-017 | AC-017.1–.3 | billing | `…/billable-entries` · S-10 | TC-017.1–.8 | Done (M4) |
| FR-041 | M | US-018 | AC-018.1–.2 | billing | `…/billable-entries?state=unbilled` · S-10 | TC-018.1–.3, TC-BR-016 | Done (M4). Invoice drafting from this list is M5 |
| FR-042 | M | US-019 | AC-019.1–.2, .4 | billing | `POST {ws}/invoices` · S-10, S-11 | TC-019.1–.2, .4 | Done (M5) |
| FR-043 | S | US-019 | AC-019.3 | billing | `PATCH {ws}/invoices/{id}` · S-11 | TC-019.3 | Done (M5) |
| FR-044 | M | US-020 | AC-020.1–.4 | billing | `…/issue` · S-11 | TC-020.1–.4, TC-BR-023 | Done (M5) |
| FR-045 | S | US-020 | AC-020.5 | billing | S-11 print | TC-020.5 | Done (M5) |
| FR-046 | S | US-021 | AC-021.1 | billing | `…/void` · S-11 | TC-021.1 | Done (M5) |
| FR-050 | M | US-022 | AC-022.1–.2 | ai | config · `{ws}/ai/status` | TC-022.1–.2 | Done (M3). A real endpoint was smoke-tested manually with one local open-weight model on 2026-10-18 and 2026-10-19 (release audit §12.4, §13); no model has been evaluated |
| FR-051 | M | US-009 | AC-009.3–.4 | ai, scope-guard | S-07 | TC-009.3–.4 | Done (M3) |
| FR-052 | M | US-009 | AC-009.1 | ai | AiGeneration | TC-009.1 | Done (M3) |
| FR-053 | C | US-022 | AC-022.2 | ai | `{ws}/ai/status` | TC-022.2 | Done (M3) |
| FR-054 | M | US-022 | AC-022.3 | ai, workspace | `PUT {ws}/ai-enablement` · S-12 | TC-022.3 | Done (M3) |
| FR-060 | C | US-025 | AC-025.1 | community | S-07 | TC-025.1 | Planned |
| FR-061 | S | US-023 | AC-023.1 | community | `{ws}/export` | TC-023.1 | Planned |
| FR-062 | C | — | — | community | docs | — | Planned |

## M1 implementation evidence (Requirement → Implementation → Tests → Status)

| Requirement | Implementation | Tests (all passing 2026-10-16) | Status |
| --- | --- | --- | --- |
| FR-001 register | `apps/api/src/modules/identity/{routes,service}.ts`, `packages/contracts/src/identity.ts`, `apps/web/src/features/auth/RegisterForm.tsx` | `apps/api/test/identity.test.ts` (TC-001.1, TC-001.2, password boundaries 11/12/256/257), `auth-forms.test.tsx`, E2E journey | Done |
| FR-002 sign in/out, server-side session | identity module, `SignInForm.tsx`, `SignOutButton.tsx` | TC-001.3, TC-001.4, TC-SEC-05 (flags, hash-only storage, rotation, idle 7 d, absolute 30 d, `__Host-` in secure mode), E2E | Done |
| FR-003 workspace + OWNER on registration | `modules/workspace/service.ts` `createWorkspaceForOwner` (in the registration transaction, audited) | TC-001.1 (membership, defaults, `member.added` audit) | Done |
| FR-005 workspace settings | `modules/workspace/{routes,service,repository}.ts`, `WorkspaceSettingsForm.tsx` | `apps/api/test/workspace.test.ts` (TC-002.1, TC-002.2, TC-002.3 −1/0/10000/10001, field errors, mass assignment, 428/412, concurrent PATCH), `WorkspaceSettingsForm.test.tsx`, E2E | Done: defaults are used by new projects (M2) and invoice drafts (M5) |
| SEC-001 argon2id | `identity/domain/password.ts` (+ concurrency cap) | TC-001.1 hash format; argon2 cap test | Done |
| SEC-002 sessions | `identity/domain/session-token.ts`, `identity/routes.ts` | TC-SEC-05, register-while-signed-in test | Done |
| SEC-003 CSRF | `platform/http/csrf.ts` | TC-SEC-04 (missing/wrong header, foreign/missing Origin, safe GET allowed) | Done |
| SEC-004 isolation | `platform/db/collections.ts` (`TenantCollection`, user-scoped view), `workspace/membership.ts` | TC-SEC-01 matrix, TC-SEC-02 route inventory, TenantCollection and guard tests, TC-TEN-04 (revoked membership → 404 on the next request), E2E foreign URL → 404 | Done for M1 routes (extend matrix every milestone) |
| SEC-005 validation, body limit | `platform/http/validate.ts`, contracts, `bodyLimit` in `app.ts` | ERR-010 cases, NoSQL operator injection, malformed JSON 400, 413 | Done for M1 routes |
| SEC-006 rate limits | `platform/http/rate-limit.ts`, buckets in `app.ts` | TC-SEC-06, `security-hardening.test.ts` (XFF spoofing, per-email, per-IP spraying, register per IP, bounded memory); `scope-guard-ai.test.ts` (per-workspace AI limit, one concurrent analysis per version) | Done for auth and AI |
| SEC-007 secrets | `platform/config`, `platform/logging` | config tests (no values in errors, production refusals), TC-SEC-07 | Done |
| SEC-010 headers, lockfile, audit | `secureHeaders` (API), `proxy.ts` nonce CSP + `next.config.ts` headers (web), CI `npm audit` | Security header test, E2E CSP/header test | Done (CI audit not yet executed on GitHub) |
| SEC-011 owner-only | `requireMembership({ role: OWNER })` + service check | TC-002.2, TC-SEC-03, TC-TEN-04 (role downgrade), TC-TEN-05 (per-workspace roles), TC-020.2 (invoice issue and void) | Done for settings, AI enablement, invoice issue and void. Member management (FR-004) is not built |
| NFR-008 strict TS, boundaries | `packages/config` | TC-ARCH-01 (13 tests), `tsc` in 5 workspaces | Done |
| NFR-010 logs, health | `platform/logging`, `request-logger.ts`, `/healthz`, `/readyz` | TC-SEC-07, request-log test, readiness tests (pending migrations / DB down → 503) | Done |
| NFR-012 360 px | M1 screens | E2E responsive (Chromium 360 px, Pixel 7) | Done for M1 screens |
| A11Y-001–003, 006, 007 | Components with labels, ErrorSummary, focus ring, skip link, tokens | Component tests, E2E axe (WCAG 2.2 AA tags) and keyboard order | Done for M1 screens |
| ERR-005 / ERR-008 / ERR-009 / ERR-010 | If-Match, return path, 503 mapping, 422 problem+json | workspace, identity, platform and web tests | Done for M1 routes |

## M2 implementation evidence (Requirement → Implementation → Tests → Status)

| Requirement | Implementation | Tests (all passing 2026-10-17) | Status |
| --- | --- | --- | --- |
| FR-010 clients | `apps/api/src/modules/core-ops/{routes,service,repository,documents}.ts`, migration `0002-core-ops`, `packages/contracts/src/core-ops.ts`; S-02 `apps/web/src/app/w/[workspaceId]/clients/**`, `features/clients/*` | `core-ops-clients-projects.test.ts`, `security.test.ts` (TC-SEC-01/01d), `ClientForm.test.tsx`, `core-ops.test.tsx`; E2E `m2-core-ops.spec.ts` | Done |
| FR-011 projects | same module; S-03 `projects/page.tsx`, S-04 `projects/[projectId]/{layout,page}.tsx`, `features/projects/*` | `core-ops-clients-projects.test.ts`, `ProjectForm.test.tsx`; E2E | Done |
| FR-012 requirements | same module; S-05 `projects/[projectId]/requirements/page.tsx`, `features/requirements/*` | `core-ops-requirements.test.ts`, `RequirementsBoard.test.tsx`; E2E | Done |
| FR-013 baselines, BR-004, BR-005 | `service.createBaseline` (transaction + audit), `domain/baseline-hash.ts`, draft-only update filters in `repository.ts` | `core-ops-requirements.test.ts`, `baseline-hash.test.ts`, `RequirementsBoard.test.tsx`; E2E | Done |
| FR-014 tasks, BR-015 | `service.createTask/updateTask`, `domain/task-scope.ts`; S-09 `projects/[projectId]/tasks/page.tsx`, `features/tasks/*` | `core-ops-tasks.test.ts`, `task-scope.test.ts`, `TasksBoard.test.tsx`; E2E | Done for baseline and internal links |
| BR-029 archived read-only | `isProjectReadOnly`, guarded `archivedAt: null` writes, `touchProject` in each child transaction | TC-004.3, TC-005.2, TC-BR-029.1–.2, TC-008.2 (change requests), `delivery-billing.test.ts` "BR-029 an archived project refuses new, edited and deleted work" (entries) | Done for clients, projects, requirements, baselines, tasks, change requests and billable entries |
| SEC-004 (M2 routes) | `requireMembership` on every Core Ops path; `TenantCollection` for the five new collections | TC-SEC-01 (22 routes), TC-SEC-02, TC-SEC-01d; E2E `SEC-004 AC-004.2` | Done for M2 routes |

## Test execution traceability (Requirement → AC → Test case → Automated test → Result, 2026-10-17)

Detailed cases are in [test cases](test-cases.md). Result is from the final run in the [execution report](test-execution-report.md).

| Requirement | Acceptance criteria | Test cases | Automated tests | Result |
| --- | --- | --- | --- | --- |
| FR-001 | AC-001.1, AC-001.2 | TC-001.1, TC-001.2, TC-001.B, TC-001.V, TC-001.5, TC-001.6 | `apps/api/test/identity.test.ts`, `atomicity-and-boundaries.test.ts`; `apps/web/src/features/auth/auth-forms.test.tsx`; E2E `M1 journey` | Pass |
| FR-002 | AC-001.3, AC-001.4 | TC-001.3, TC-001.4, TC-SEC-05a–f, logout edge cases | `identity.test.ts`, `security-hardening.test.ts`, `atomicity-and-boundaries.test.ts`, `session-token.test.ts`, `shell.test.tsx`; E2E journey and `ERR-008` | Pass |
| FR-003 | AC-001.1 | TC-001.1, TC-001.5, TC-001.5b, TC-001.6 | `identity.test.ts`, `atomicity-and-boundaries.test.ts` | Pass |
| FR-005 | AC-002.1 (persistence), AC-002.2, AC-002.3 | TC-002.0–3, TC-002.V, TC-002.M, TC-002.C1–C3, TC-BR-028.settings, settings boundaries | `workspace.test.ts`, `atomicity-and-boundaries.test.ts`, `validate.test.ts`, `documents.test.ts`, `WorkspaceSettingsForm.test.tsx`, `settings-form.test.ts`; E2E journey | Pass |
| FR-005 | AC-002.1 (defaults used by new projects) | TC-002.1d | `core-ops-clients-projects.test.ts` | Pass |
| FR-005 | AC-002.1 (defaults used by new invoices) | TC-002.1d, TC-019.1 | `invoices.test.ts` | Pass |
| FR-010 | AC-004.1, AC-004.2, AC-004.3 | TC-004.1, TC-004.V, TC-004.2, TC-004.E, TC-004.3, TC-004.P, TC-SEC-01d | `core-ops-clients-projects.test.ts`, `security.test.ts`; `ClientForm.test.tsx`, `core-ops.test.tsx`; E2E `m2-core-ops.spec.ts` | Pass |
| FR-011 | AC-005.1, AC-005.2 | TC-005.1, TC-005.2, TC-005.V, TC-005.E, TC-002.1d, TC-BR-029.1–.2 | `core-ops-clients-projects.test.ts`; `ProjectForm.test.tsx`; E2E | Pass |
| FR-012 | AC-006.1, AC-006.2 | TC-006.1, TC-006.2, TC-006.V | `core-ops-requirements.test.ts`; `RequirementsBoard.test.tsx`; E2E | Pass |
| FR-013 | AC-007.1, AC-007.2, AC-007.3 | TC-007.1–.3, TC-007.C, TC-BR-005, TC-BR-028.baseline | `core-ops-requirements.test.ts`, `baseline-hash.test.ts`; `RequirementsBoard.test.tsx`; E2E | Pass |
| FR-014 | AC-016.1, AC-016.2 | TC-016.1, TC-016.S, TC-016.2, TC-016.U, TC-016.L | `core-ops-tasks.test.ts`, `task-scope.test.ts`; `TasksBoard.test.tsx`; E2E | Pass. Approved change-request links: TC-016.4, TC-016.5 (`delivery-billing.test.ts`) and `TasksBoard.test.tsx` (S-09 approved change requests) |
| SEC-001 | — | TC-001.1, TC-SEC-06c | `identity.test.ts`, `security-hardening.test.ts` | Pass |
| SEC-002 | AC-001.4 | TC-SEC-05a–f | `identity.test.ts`, `security-hardening.test.ts`, `atomicity-and-boundaries.test.ts`, `session-token.test.ts` | Pass |
| SEC-003 | — | TC-SEC-04 | `security.test.ts`, `atomicity-and-boundaries.test.ts` (logout), `api-client.test.ts` | Pass |
| SEC-004 | AC-004.2 | TC-SEC-01, TC-SEC-01b, TC-SEC-01d, TC-SEC-02, TC-TEN-01–04, TC-004.2 | `security.test.ts`, `platform.test.ts`, `guards.test.ts`, `security-hardening.test.ts`, `membership-lifecycle.test.ts`; E2E `SEC-004` | Pass |
| SEC-005 | — | TC-SEC-INP, TC-002.V, TC-002.M, TC-TEN-02 | `security.test.ts`, `workspace.test.ts`, `guards.test.ts`, `contracts.test.ts` | Pass |
| SEC-006 | AC-001.3 | TC-SEC-06a–c | `identity.test.ts`, `security-hardening.test.ts`, `atomicity-and-boundaries.test.ts` | Pass (auth). AI limits: Pass (`scope-guard-ai.test.ts`: per-workspace rate limit, one concurrent analysis per version) |
| SEC-007 | — | TC-SEC-07, TC-SEC-CFG | `platform.test.ts`, `security-hardening.test.ts` | Pass |
| SEC-010 | — | TC-SEC-10 | `security.test.ts`; E2E `SEC-010` | Pass |
| SEC-011 | AC-002.2 | TC-002.2, TC-SEC-03, TC-TEN-04, TC-TEN-05 | `workspace.test.ts`, `security.test.ts`, `membership-lifecycle.test.ts`, `WorkspaceSettingsForm.test.tsx` | Pass (settings, AI enablement via TC-SEC-03, invoice issue and void via TC-020.2 in `invoices.test.ts`). Member management (FR-004) is not built |
| NFR-002 / BR-028 | — | TC-BR-028a, TC-001.5, TC-BR-028.settings, TC-BR-028.baseline, TC-007.C | `platform.test.ts`, `atomicity-and-boundaries.test.ts`, `core-ops-requirements.test.ts` | Pass for implemented actions |
| NFR-008 / BR-001 (boundary part) | — | TC-ARCH-01 | `packages/config/test/boundaries.test.ts` | Pass |
| NFR-010 | — | TC-HLT-01, TC-REQ-ID, TC-SEC-07, TC-ERR-500 | `platform.test.ts`, `security.test.ts`, `error-mapping.test.ts` | Pass |
| NFR-012 | — | TC-RESP, CT-CO-UI | E2E `responsive.spec.ts` | Pass (M1 and M2 screens) |
| A11Y-002, -003, -007 | — | CT-FORM-01–03, TC-E2E-03 (M1), CT-CO-UI | `components.test.tsx`, `auth-forms.test.tsx`, Core Ops component tests; E2E axe and keyboard | Pass (M1 and M2 screens) |
| ERR-005, -008, -009, -010 | — | TC-002.C1–C3, CT-FORM-05, TC-HLT-01, TC-002.V | as above | Pass |
| FR-020–FR-029, FR-032 | AC-008.1–.2, AC-009.1–.6, AC-010.1–.3, AC-011.1–.3, AC-012.1–.6, AC-013.1–.3, AC-014.1–.2, AC-027.1–.3 | TC-008.x, TC-009.x, TC-010.x, TC-011.x, TC-012.x, TC-013.x, TC-014.x, TC-027.x, TC-IDEM-01/02 ([test cases §2d](test-cases.md#2d-scope-guard-and-ai-fr-020fr-032-fr-050fr-054-m3)) | `scope-guard-lifecycle.test.ts`, `scope-guard-ai.test.ts`, domain unit tests, `change-requests.test.tsx`; E2E `m3-scope-guard.spec.ts` | Pass |
| FR-050–FR-054 | AC-022.1–.3, AC-009.3–.4 | TC-022.1–.3, TC-AI-01…05, TC-AI-OAC | `scope-guard-ai.test.ts`, `output.test.ts`, `AiSettings.test.tsx`; E2E | Pass (mock and stub providers only) |
| FR-015, FR-030, FR-040, FR-041, BR-012, BR-013 (task links), BR-016, BR-018 (edit/delete guard), BR-020, BR-021 (preview) | AC-015.1–.2, AC-016.1, AC-017.1–.3, AC-018.1–.2, AC-024.1 | TC-015.x, TC-016.3–.5, TC-017.x, TC-018.x, TC-024.1, UT-ELIG-01…05 ([test cases §2e](test-cases.md#2e-delivery-and-billable-work-fr-015-fr-030-fr-040-fr-041-m4)) | `delivery-billing.test.ts`, `eligibility.test.ts`, `billing.test.tsx`, `TasksBoard.test.tsx`, `change-requests.test.tsx`; E2E `m4-delivery-billing.spec.ts` | Pass |
| FR-042–FR-046, BR-017–BR-025, BR-028 (invoices), BR-030 (entries on invoices), ERR-006, ERR-007 | AC-019.1–.4, AC-020.1–.5, AC-021.1 | TC-019.x, TC-020.x, TC-021.1, TC-BR-019, TC-BR-023, TC-BR-030, UT-INV-01…05 ([test cases §2f](test-cases.md#2f-invoices-fr-042fr-046-m5)) | `invoices.test.ts`, `invoice-calc.test.ts`, `invoices.test.tsx`, `billing.test.tsx`; E2E `m5-invoices.spec.ts` (TC-E2E-01) | Pass |
| FR-004, FR-016, FR-017, FR-060–FR-062 | see [acceptance criteria](../product/acceptance-criteria.md) | see the [test plan](test-plan.md) | E2E-WF-13 exists as `test.fixme` (needs FR-004 to add a member without seeding) | **Blocked**: not implemented (see [test cases §8](test-cases.md#8-blocked-requirements-not-implemented-yet)) |

## Business rules → tests

| BR | Test cases |
| --- | --- |
| BR-001 | TC-009.2, TC-009.6, TC-ARCH-01 (Pass) |
| BR-002 | TC-009.6, TC-ARCH-01, TC-AI-PRICE (Pass) |
| BR-003 | TC-010.1, TC-011.2, CT-DE-01 (Pass) |
| BR-004 | TC-007.1, TC-007.2, TC-007.C, TC-007.C2, TC-006.L (Pass) |
| BR-005 | TC-BR-005, TC-007.1, TC-007.C2 (Pass) |
| BR-006 | TC-011.2 (Pass) |
| BR-007 | TC-011.1, UT-PROP-01…03 (Pass) |
| BR-008 | TC-011.2, TC-BR-008 / UT-HASH-01…04 (Pass) |
| BR-009 | TC-013.2 (Pass) |
| BR-010 | TC-012.2, TC-012.3, TC-012.4, E2E stale decision (Pass) |
| BR-011 | TC-011.2, TC-013.1, E2E-WF-12 (Pass) |
| BR-012 | TC-015.2, TC-017.2 |
| BR-013 | TC-012.6, TC-016.5, TC-017.8 (Pass). TC-BR-013 is a test-plan ID whose case is covered by TC-016.5 and TC-017.8; no test carries the ID TC-BR-013 itself |
| BR-014 | TC-012.1, TC-012.5 (Pass) |
| BR-015 | TC-016.1, TC-016.S, TC-016.U, TC-016.R (Pass for baseline and internal links) |
| BR-016 | TC-018.1–.3, TC-017.2, TC-017.8, UT-ELIG-01…05 (M4) |
| BR-017 | TC-019.2, TC-020.4, E2E-WF-11 (M5) |
| BR-018 | TC-017.3, TC-019.4 (incl. concurrent drafts) |
| BR-019 | UT-MNY-01…07, UT-INV-04, UT-CON-INV-03 |
| BR-020 | TC-010.1, TC-019.1, UT-INV-01…03, CT-INV-01 |
| BR-021 | TC-017.5, TC-017.6, TC-019.1 (rate copied onto the line) |
| BR-022 | TC-018.3 (`CURRENCY_MISMATCH`), BR-022 client totals ignored (`invoices.test.ts`) |
| BR-023 | TC-020.1, TC-020.2, TC-020.3, TC-BR-023 (concurrent issues), TC-SEC-03 |
| BR-024 | TC-021.1 |
| BR-025 | TC-019.3 |
| BR-026 | UT-CON-SG-01 (`packages/contracts/src/scope-guard.test.ts`, effort range bounds) and CT-SUM-01 (`change-requests.test.tsx`, disclaimer in the proposal summary) (Pass). TC-010.3 and TC-BR-026 are test-plan IDs covered by those two tests; no test carries those IDs |
| BR-027 | TC-AI-02 / TC-009.1 indicative cost, TC-AI-PRICE (Pass) |
| BR-028 | TC-BR-028, TC-BR-028.baseline/.req/.task/.project, CR transitions (M3), `cr.tasks.created` (M4), `invoice.created/issued/voided` (M5) |
| BR-029 | TC-004.3, TC-005.2, TC-005.R, TC-BR-029.1–.6 (Pass); TC-008.2 (Pass, `scope-guard-lifecycle.test.ts`); entries: `delivery-billing.test.ts` BR-029 (Pass) |
| BR-030 | TC-BR-030 (entries on any invoice line cannot be deleted; no delete paths for decisions or issued invoices) |

## Non-functional, security, privacy, accessibility → verification

| ID | Verification |
| --- | --- |
| NFR-001 | TC-BR-019, TC-019.1 |
| NFR-002 | TC-BR-028, TC-BR-023 |
| NFR-003 | TC-BR-030. The audit service exposes an insert path only (`apps/api/src/modules/audit/index.ts`). There is no dedicated test that audit events cannot be changed; the equivalent for approvals is `scope-guard-lifecycle.test.ts` "BR-014 approvals are insert-only" |
| NFR-004 | Load test script (M6), measured and recorded |
| NFR-005, NFR-006 | TC-AI-01, TC-009.3 |
| NFR-007 | Manual: `docker stats` during E2E (M6) |
| NFR-008 | TC-ARCH-01, CI typecheck |
| NFR-009 | This matrix: every BR has ≥ 1 TC |
| NFR-010 | TC-SEC-07, `/readyz` integration test |
| NFR-011, NFR-012 | Playwright projects (chromium, firefox, webkit) + mobile viewport |
| NFR-013 | Code review |
| NFR-014 | **Not automated:** the CI workflow has no licence check. Manual lockfile licence scans were done on 2026-10-18 and 2026-10-19 (release audit §11, §13): no GPL/AGPL; optional `sharp`/`libvips` binaries are LGPL-3.0-or-later |
| NFR-015 | SC-7 contributor trial |
| NFR-016 | Restore rehearsal record |
| SEC-001–011 | TC-SEC-01…09, TC-001.2–.4, TC-002.2, TC-020.2 |
| PRV-001–005 | TC-SEC-09, TC-022.3, TC-023.1, review of OQ-005 |
| A11Y-001–007 | TC-E2E-03, component axe checks, manual keyboard pass per screen |
