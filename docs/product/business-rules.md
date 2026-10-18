# Business Rules

These rules are **invariants**. Code, tests and documentation must agree with them. A change to a rule requires an update to this file and to the affected tests and docs, and an ADR when the change is material ([ADR process](../architecture/adr/README.md)).

IDs are stable. Each rule names where it is enforced.

## AI boundaries

| ID | Rule | Enforced in |
| --- | --- | --- |
| BR-001 | AI output is a **suggestion**. It is stored as an AI generation and can be copied into a *draft* proposal. It never changes the status of any entity. | `ai` module has no write access to scope-guard/billing; architecture lint rule |
| BR-002 | AI must never approve, reject or propose a change request, create approvals, issue or void invoices, or set prices. These transitions require an authenticated human request to a dedicated endpoint. | scope-guard and billing services; route auth |
| BR-003 | AI-suggested effort is used only after a human confirms it. Confirmation happens when the human proposes the version containing those values. | scope-guard propose service |

## Scope baseline

| ID | Rule | Enforced in |
| --- | --- | --- |
| BR-004 | Creating a baseline freezes every not-yet-baselined active requirement of the project. Baselined requirements cannot be edited or deleted. Changes to the original scope are made through change requests. | core-ops requirement service |
| BR-005 | A project can have several baselines (for example a phase 2). Each baseline stores the SHA-256 content hash of the requirements it froze, which can be recomputed because they are immutable. | core-ops baseline service |

## Change requests and approvals

| ID | Rule | Enforced in |
| --- | --- | --- |
| BR-006 | A change-request version is editable only while `DRAFT`. | scope-guard version service |
| BR-007 | Proposing a version requires: a title, a clarified description, at least one acceptance criterion, **at least one assumption**, and a confirmed price (fixed amount, or hours and rate). | Zod schema + service |
| BR-008 | On propose, the version content is frozen and a SHA-256 hash of its canonical JSON is stored. | scope-guard propose service |
| BR-009 | A change request has **at most one open version** (`DRAFT` or `PROPOSED`) at a time. | conditional update on the CR document (`openVersionNumber` must be null) + service |
| BR-010 | A decision references exactly one version **and its content hash**. It is accepted only when that version is currently `PROPOSED` and the hash matches. | scope-guard decision service (MongoDB transaction; unique `approvals` index + state/hash-conditional CR update) |
| BR-011 | **Any** content change after a version is proposed requires a new version and a new decision. The MVP has no "minor edit" exception ([OQ-008](open-questions.md)). | BR-006 + versioning |
| BR-012 | Only `APPROVED` versions authorise work. `DRAFT`, `PROPOSED`, `CLARIFICATION_REQUESTED`, `REJECTED` and `WITHDRAWN` versions authorise nothing. | eligibility service; task conversion service |
| BR-013 | When a later version of the same change request is approved, the earlier approved version becomes `SUPERSEDED`. Work already linked to the superseded version stays authorised under that version. New tasks can be created only from the currently approved version. | scope-guard decision service |
| BR-014 | A decision records: decision, version, content hash, client decision-maker name, decision date (not in the future), channel (`EMAIL`, `CHAT`, `CALL`, `MEETING`, `IN_PERSON`, `OTHER`), optional evidence note, and the recording user and timestamp. Decisions are immutable. | Zod schema + DB |

## Tasks

| ID | Rule | Enforced in |
| --- | --- | --- |
| BR-015 | A billable task must link to a baselined requirement or to an `APPROVED` change-request version of the same project. A task with neither link is internal and cannot be billable. | core-ops task service |

## Billing

| ID | Rule | Enforced in |
| --- | --- | --- |
| BR-016 | **Eligibility.** A billable entry is eligible for invoicing only if **all** of the following hold: (a) it is linked, directly or via its task, to a baselined requirement or to a change-request version that is `APPROVED` or `SUPERSEDED`-after-approval; (b) it is not on a non-void invoice; (c) its currency equals the project currency. Otherwise it is ineligible and has a reason code. | billing eligibility service (single source of truth) |
| BR-017 | Invoice drafts never silently include ineligible work. Creating a draft with an ineligible entry is rejected, and issuing re-checks eligibility for every line. | billing invoice service |
| BR-018 | An entry can belong to at most one non-void invoice. | conditional update of `billableEntries.invoiceId` (must be null) inside the invoice transaction |
| BR-019 | **Money representation:** amounts are integers in currency minor units (for example paise), time is integer minutes, rates are minor units per hour, and tax rates are integer basis points (1800 = 18.00%). Floating-point is never used for money. | API billing domain `money` module (server-only, ADR-0007/0011) |
| BR-020 | **Calculation:** `TIME` line amount = `roundHalfUp(minutes × hourlyRateMinor / 60)`. `FIXED` line amount = entered amount. Subtotal = Σ line amounts. Tax = `roundHalfUp(subtotal × taxBps / 10000)`. Total = subtotal + tax. All totals are computed by the server, and client-supplied totals are ignored. | billing domain (pure functions) |
| BR-021 | The applicable hourly rate is resolved in this order: rate stored on the approved change-request version (for change-request work), then the project rate override, then the workspace default rate. The resolved rate is copied onto the invoice line. | billing domain |
| BR-022 | One currency per invoice, equal to the project currency. There is no currency conversion in the MVP. | billing invoice service |
| BR-023 | Only an `OWNER` can issue an invoice. Issuing assigns the next number for the workspace (gapless, transactional) and freezes the invoice. Issued invoices cannot be edited or deleted. | billing invoice service |
| BR-024 | Voiding an issued invoice requires a reason, keeps its number (it is never reused), and releases its entries back to unbilled. | billing invoice service |
| BR-025 | Manual adjustment lines (positive or negative) require a reason and are marked as manual on the invoice. | billing invoice service |

## Estimates

| ID | Rule | Enforced in |
| --- | --- | --- |
| BR-026 | Estimates are ranges (low ≤ likely ≤ high hours, each > 0 and ≤ 2,000) with explicit assumptions. The UI and the proposal summary always state: *"This is an estimate based on the listed assumptions, not a guarantee of actual effort."* | Zod schema; UI copy |
| BR-027 | Indicative cost ranges shown alongside AI suggestions are computed by the application (hours × resolved rate). The model's own price text, if any, is discarded. | ai output mapper; scope-guard |

## Audit, archiving and deletion

| ID | Rule | Enforced in |
| --- | --- | --- |
| BR-028 | These actions write an audit event in the same transaction: baseline creation, version propose/withdraw, decision recorded, task conversion, invoice create/issue/void, member and role changes, and AI enablement changes. | each service; integration tests |
| BR-029 | Archived clients and projects are read-only. No new change requests, tasks or entries can be added to them. | core-ops services |
| BR-030 | Records referenced by a decision or an issued invoice cannot be hard-deleted. | services (reference checks) + no delete paths in repositories |
