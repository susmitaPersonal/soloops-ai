# Requirements

This is the authoritative list of functional, non-functional, security, privacy and accessibility requirements. IDs are **stable**: never renumber or reuse an ID. Deprecate a requirement by marking it `Withdrawn`.

**Priority** (MoSCoW): **M** = Must Have (MVP), **S** = Should Have (MVP if capacity allows), **C** = Could Have, **O** = Out of Scope for MVP.

Business rules (BR-xxx) are in [business-rules.md](business-rules.md). User stories and acceptance criteria are in [acceptance-criteria.md](acceptance-criteria.md). Traceability to design and tests is in [requirements-traceability.md](../quality/requirements-traceability.md).

## Functional requirements

### Identity and workspace

| ID | Requirement | Pri | Module |
| --- | --- | --- | --- |
| FR-001 | A visitor can register with name, email and password. | M | identity |
| FR-002 | A user can sign in and sign out. Authenticated state is held in a server-side session. | M | identity |
| FR-003 | Registration creates a workspace in which the user is `OWNER`. | M | workspace |
| FR-004 | An owner can add existing users to the workspace as `MEMBER`, and can remove members. | S | workspace |
| FR-005 | An owner can configure workspace settings: default currency, default hourly rate, tax label and rate, invoice number prefix, business time zone (used for "today" in date validations), billing details shown on print views, and the AI-enabled flag. | M | workspace |

### Core Ops

| ID | Requirement | Pri | Module |
| --- | --- | --- | --- |
| FR-010 | Members can create, view, edit and archive clients (name, contact person, email, phone, billing address, optional tax ID). | M | core-ops |
| FR-011 | Members can create, view, edit and archive projects for a client: name, description, billing model (`HOURLY` or `FIXED`), currency, optional hourly-rate override, start date and status. | M | core-ops |
| FR-012 | Members can record project requirements with a project-scoped key (`REQ-1`, `REQ-2`, …), title, description, acceptance criteria and priority. | M | core-ops |
| FR-013 | Members can create a **scope baseline** that freezes the current set of un-baselined requirements as the agreed original scope, with a timestamp and content hash. | M | core-ops |
| FR-014 | Members can create and update tasks (title, description, assignee, status `TODO`/`IN_PROGRESS`/`DONE`, billable flag). Each task links to a baselined requirement or an approved change-request version, or is marked internal (non-billable). | M | core-ops |
| FR-015 | A project overview shows requirements, change requests by status, tasks and the unbilled amount. | S | core-ops |
| FR-016 | Members can view the workspace audit log, filtered by entity. | S | audit |
| FR-017 | Members see a workspace dashboard. It shows change requests awaiting a decision or needing revision, recent decisions, the eligible unbilled amount per project (computed by the server), draft invoices, and ineligible entries needing attention. A new workspace sees a setup checklist instead. | S | dashboard (read-only composition) |

### Scope Guard

| ID | Requirement | Pri | Module |
| --- | --- | --- | --- |
| FR-020 | Members can record a change request with the original request text as received, source channel, requested-by name and received date. | M | scope-guard |
| FR-021 | Members can request AI analysis of a draft change-request version. The analysis returns a structured proposal: clarified description, in-scope and out-of-scope items, acceptance criteria, potentially affected requirements, dependencies, assumptions, effort range (low/likely/high hours), risks, timeline impact and questions for the client, plus a **scope check**: a verdict (new scope, changes agreed scope, likely already covered, unclear) with evidence from the agreed requirements (BR-031). A person confirms the verdict and the questions, which are saved with the version. | M | scope-guard, ai |
| FR-022 | Members can review and edit every proposal field before proposing. Fields that originate from AI are labelled as AI-suggested until a human edits or accepts them. | M | scope-guard |
| FR-023 | The proposed price is computed by the application from human-confirmed inputs: fixed amount, or confirmed hours × applicable rate. | M | scope-guard |
| FR-024 | Members can **propose** a draft version. It becomes immutable, and the system stores a content hash. | M | scope-guard |
| FR-025 | Members can record the client's decision (`APPROVED`, `REJECTED`, `CLARIFICATION_REQUESTED`) against a specific proposed version, with client name, decision date, channel and evidence note. | M | scope-guard |
| FR-026 | Members can create a new draft version of a change request after any decision or withdrawal. A new version requires a new decision. | M | scope-guard |
| FR-027 | Members can produce a client-facing proposal summary (print-friendly page and copyable plain text). | S | scope-guard |
| FR-028 | Members can view a change request's full history: all versions, diffs between versions, decisions and audit events. | M | scope-guard |
| FR-029 | Members can withdraw a proposed version before a decision is recorded. | S | scope-guard |
| FR-030 | Members can convert an approved version into tasks pre-filled from its acceptance criteria. The tasks link to that version. | M | scope-guard, core-ops |
| FR-031 | Clients can approve or reject via an expiring signed link without an account. | C | scope-guard |
| FR-032 | Members see a workspace-wide **approvals queue**: change requests whose status is `AWAITING_DECISION` or `NEEDS_REVISION`, with project, version, price and days waiting. It can be filtered by status and project. | S | scope-guard |

### Billing

| ID | Requirement | Pri | Module |
| --- | --- | --- | --- |
| FR-040 | Members can log billable entries: `TIME` (date, minutes, description) or `FIXED` (date, amount, description), linked to a task, a baselined requirement or an approved change-request version. | M | billing |
| FR-041 | Members can view unbilled entries per project. Each entry is classified **eligible** or **ineligible**, and ineligible entries show a human-readable reason. | M | billing |
| FR-042 | Members can create an invoice draft from selected eligible entries. The system computes line amounts, subtotal, tax and total. | M | billing |
| FR-043 | Members can edit draft line descriptions, remove lines and add manual adjustment lines. An adjustment line requires a reason. | S | billing |
| FR-044 | An owner can **issue** an invoice draft. Issuing assigns the next sequential invoice number for the workspace, makes the invoice immutable and marks its entries billed. | M | billing |
| FR-045 | Members can view and print an issued or draft invoice. Drafts are clearly watermarked "DRAFT". | S | billing |
| FR-046 | An owner can void an issued invoice with a reason. Voiding releases its entries back to unbilled. | S | billing |

### Open AI (provider adapters)

| ID | Requirement | Pri | Module |
| --- | --- | --- | --- |
| FR-050 | Operators configure the AI provider through environment variables (provider type, base URL, model, API key, timeout, retries). | M | ai |
| FR-051 | The application is fully usable with AI disabled or unavailable. Users can always write proposals manually. | M | ai, scope-guard |
| FR-052 | Each AI generation records metadata: feature, prompt version, schema version, provider, model, status, latency, token usage (if reported) and error code. | M | ai |
| FR-053 | Members can see whether AI is configured and reachable. | C | ai |
| FR-054 | AI features are disabled by default per workspace. Before enabling them, an owner must acknowledge a disclosure stating what data is sent to the configured provider. | M | ai, workspace |

### Community

| ID | Requirement | Pri | Module |
| --- | --- | --- | --- |
| FR-060 | Members can start requirements or change requests from community-contributed templates. | C | community |
| FR-061 | An owner can export all workspace data as JSON (and invoices/entries as CSV). | S | community |
| FR-062 | Documented extension points for AI adapters, templates and exporters. | C | community |

### Explicitly out of scope for MVP (O)

Payments and payment gateways · GST-compliant tax invoices (pending [OQ-002](open-questions.md)) · multi-currency conversion · email or chat sending/integration · client login or portal · time-tracking timers · Gantt/sprint planning · mobile native apps · AI auto-approval or auto-invoicing (permanently excluded, see [BR-001](business-rules.md)).

## Non-functional requirements

| ID | Requirement | Pri |
| --- | --- | --- |
| NFR-001 | **Correctness of money:** all monetary amounts are integer minor units and all calculations are server-side and deterministic ([BR-019](business-rules.md#billing)–[BR-021](business-rules.md#billing)). | M |
| NFR-002 | **Transactional integrity:** approval, baseline, invoice issue/void and task conversion are each atomic, including their audit events. | M |
| NFR-003 | **Auditability:** audit events are append-only and cannot be modified or deleted through the application. | M |
| NFR-004 | **Performance target:** p95 latency ≤ 300 ms for non-AI API requests at ≤ 10,000 records per workspace on the reference deployment. This target must be measured, not assumed. | S |
| NFR-005 | **AI responsiveness:** AI calls time out (default 60 s) with at most 1 retry. The UI shows progress and allows cancellation, and the rest of the app stays responsive. | M |
| NFR-006 | **Availability of core features:** AI outages must not block any non-AI workflow. | M |
| NFR-007 | **Self-hostability:** runs with Docker Compose on a single machine. The target is ≤ 2 GB RAM excluding any local model. | M |
| NFR-008 | **Maintainability:** TypeScript strict mode, lint-enforced module boundaries, and documented ADRs for material decisions. | M |
| NFR-009 | **Testability:** every business rule has at least one automated test, and CI runs lint, typecheck, unit, integration and build. | M |
| NFR-010 | **Observability:** structured JSON logs with request IDs, no secrets or passwords in logs, and health and readiness endpoints. | M |
| NFR-011 | **Browser support:** current and previous major versions of Chrome, Edge, Firefox and Safari. | M |
| NFR-012 | **Responsive UI:** usable from 360 px width upward. | M |
| NFR-013 | **Internationalisation readiness:** UI strings are centralised, and currency and dates are formatted with `Intl` (default locale `en-IN`). The MVP ships English only. | S |
| NFR-014 | **License hygiene:** all runtime dependencies use OSI-approved licenses compatible with the project license. | M |
| NFR-015 | **Onboarding:** a new contributor can go from a fresh clone to a running app in ≤ 15 minutes by following the docs. Measure this with real contributors. | S |
| NFR-016 | **Backup/restore:** documented and rehearsed database backup and restore procedure. | S |

## Security requirements

| ID | Requirement | Pri |
| --- | --- | --- |
| SEC-001 | Passwords are hashed with argon2id (memory-hard parameters documented in config). Plaintext passwords are never stored or logged. | M |
| SEC-002 | Sessions use opaque random IDs stored server-side, in cookies that are `HttpOnly`, `Secure` (in production) and `SameSite=Lax`. Sessions rotate on login and have idle and absolute timeouts. | M |
| SEC-003 | State-changing requests are protected against CSRF (SameSite cookies plus a required custom header and an `Origin` check). | M |
| SEC-004 | Every tenant-scoped read and write is authorised against the caller's workspace membership on the server. Cross-workspace access returns `404`. | M |
| SEC-005 | All request bodies, params and queries are validated with Zod. Request body size is limited. | M |
| SEC-006 | Rate limiting applies to authentication endpoints and AI endpoints. | M |
| SEC-007 | Secrets come only from environment variables or a secret store. They are never committed and never logged. | M |
| SEC-008 | Only the fields required for an AI task are sent to the AI provider. Credentials and unrelated client PII are never included. | M |
| SEC-009 | Client-supplied text sent to models is treated as untrusted (prompt injection). Model output is validated, never executed, and rendered as escaped text. | M |
| SEC-010 | Dependencies are pinned by lockfile and audited in CI. Security headers are set. | M |
| SEC-011 | Role checks enforce owner-only actions (issue/void invoice, settings, members, AI enablement). | M |

## Privacy requirements

| ID | Requirement | Pri |
| --- | --- | --- |
| PRV-001 | Collect only the personal data needed to manage clients and invoices. | M |
| PRV-002 | Owners can export all workspace data ([FR-061](#community)). | S |
| PRV-003 | Data sent to AI providers is disclosed before enablement ([FR-054](#open-ai-provider-adapters)). The provider's retention policy is the operator's responsibility and is not guaranteed by SoloOps AI. | M |
| PRV-004 | AI generation records store outputs and metadata. Storing full prompts is off by default and configurable. | S |
| PRV-005 | Retention and deletion policy for workspaces and issued invoices is defined before the first production release ([OQ-005](open-questions.md)). | M |

## Accessibility requirements

| ID | Requirement | Pri |
| --- | --- | --- |
| A11Y-001 | Target WCAG 2.2 Level AA. | M |
| A11Y-002 | All functionality is operable by keyboard, with a visible focus indicator and a logical focus order. Dialogs trap and restore focus. | M |
| A11Y-003 | Every form control has a programmatic label. Errors are associated with fields and summarised at the top on submit. | M |
| A11Y-004 | Status (change-request state, eligibility) is never conveyed by colour alone. | M |
| A11Y-005 | Async results (AI analysis finished, invoice issued) are announced via an `aria-live` region. | M |
| A11Y-006 | Text contrast is ≥ 4.5:1 and non-text UI contrast is ≥ 3:1. Users with `prefers-reduced-motion` get reduced motion. | M |
| A11Y-007 | Automated accessibility checks (axe) run in component or E2E tests for key screens. | S |

## Error and failure scenarios

| ID | Scenario | Required behaviour |
| --- | --- | --- |
| ERR-001 | AI provider timeout or unavailability | The draft is unchanged. The user sees "AI analysis unavailable — you can write the proposal manually". The generation is recorded with status `FAILED`. |
| ERR-002 | AI returns invalid or unsafe structured output | One repair retry. If it still fails, the same as ERR-001 with `INVALID_OUTPUT`. Partial output is never applied. |
| ERR-003 | AI references unknown requirement keys | Unknown keys are dropped and a warning is shown. |
| ERR-004 | Two users record conflicting decisions on the same version | The first one wins and the second gets `409 Conflict` with the current state. |
| ERR-005 | Editing a draft that changed since it was loaded | `412 Precondition Failed`. The UI offers to reload. |
| ERR-006 | Issuing an invoice twice (double click, retry) | Idempotent: the same issued invoice is returned and no second number is consumed. |
| ERR-007 | An invoice draft contains an entry that became ineligible (for example the entry was edited) | Issuing is blocked with a list of offending lines. |
| ERR-008 | Session expired | `401`. The UI redirects to sign-in and preserves the return path. Unsaved form data stays in memory where possible. |
| ERR-009 | Database unavailable | `503` with problem details. Readiness probe fails. No partial writes occur (transactions). |
| ERR-010 | Validation failure | `422` with field-level errors in problem+json format. |
