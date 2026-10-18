# ADR-0019: M4 delivery and billable work implementation choices

- **Status:** Accepted
- **Date:** 2026-10-17
- **Related:** FR-014, FR-015, FR-030, FR-040, FR-041, BR-012, BR-013, BR-015, BR-016, BR-018–BR-021, BR-029, ADR-0003, ADR-0007, ADR-0012, ADR-0017, ADR-0018

## Context
M4 connects approved change requests to delivery and to billable work:
- tasks are created from an approved version;
- tasks can link to approved versions;
- work is logged as billable entries;
- the server classifies each entry as eligible or not (BR-016);
- the project overview shows server totals.

The data model fixes the `billableEntries` shape and the eligibility chart (workflows §4). Several details were open:
- how core-ops checks change-request state without importing scope-guard;
- how duplicate conversions are prevented;
- whether eligibility is stored;
- what an entry's scope is when it is logged against a task;
- how amounts and rates are computed for display.

## Decision
1. **Ports instead of a module cycle.**
   - `scope-guard` and `billing` depend on `core-ops`.
   - `core-ops` needs two answers from them:
     - "is this CR version approved?" (BR-012, for task links);
     - "does this project have billable entries?" (data-model §4.6 currency lock).
   - It declares a `CoreOpsPorts` interface. `app.ts` creates the services and then fills the ports, so `core-ops` never imports either module (ADR-0003, lint boundaries).
   - Without ports (unit setups), a CR link is never authorised and the currency is never locked. Both defaults fail closed.
2. **Task links to change requests (BR-012, BR-013).**
   - A **new** or **changed** link needs an `APPROVED` version of the **same project**.
   - Keeping the **same** link while changing only `billable` accepts `APPROVED` or `SUPERSEDED` (`authorisesExistingWork`), so work linked before a revision stays authorised.
3. **Conversion (FR-030, AC-015.1, AC-015.2).**
   - Endpoint: `POST …/change-requests/{crId}/versions/{n}/tasks` with `{ criterionIndexes }` and an optional `Idempotency-Key`.
   - Only an `APPROVED` version converts. Every other state, including `SUPERSEDED`, is `409 INVALID_STATE_TRANSITION`. An index beyond the version's criteria is `422`.
   - Each chosen criterion becomes one billable `TODO` task linked to the version. The task title is the criterion text, up to 200 characters.
   - The task stores `origin { changeRequestId, versionNumber, criterionIndex }`. The unique partial index `workspace_origin_unique` (migration `0004`) makes a second task for the same criterion impossible.
   - The service skips criteria converted before and reports them in `alreadyConverted`:
     - `201` if anything was created;
     - `200` if nothing was;
     - no audit event when nothing was created.
   - The approval check, the BR-029 project lock, the inserts, the audit event `cr.tasks.created` and the idempotency record share one transaction. The project lock makes concurrent conversions conflict and retry, so the retry sees the first one's tasks.
4. **Eligibility is computed on read, never stored** (data-model §4.12).
   - `billing/domain/eligibility.ts` is a pure function over facts the service reads from authoritative records:
     - the requirement's baseline state;
     - the CR version's authorisation state via `scopeGuard.getAuthorisationState`;
     - `invoiceId`;
     - the currencies.
   - Checks run in the order of the workflows §4 chart. The first failure is reported with a closed reason code and a readable explanation (AC-018.1).
   - Approving a version or baselining a requirement changes the classification of existing entries with no write to them.
   - Request bodies cannot carry eligibility or amounts: Zod strips unknown keys (AC-018.2).
5. **An entry's scope.**
   - With `taskId`, the scope is **copied** from the task at creation (data-model §4.12). An `INTERNAL` task scope becomes `NONE`.
   - A task that is **not billable** is refused (`422 taskId`), so a billable entry cannot hide behind a non-billable task.
   - Without a task, the scope is chosen directly. A requirement or CR version from another project, from another workspace, or one that does not exist is `422` with the same message every time (ADR-0017 §5).
   - A CR version that exists but is not approved is **accepted** and classified `CR_NOT_APPROVED` (AC-017.2).
6. **Amounts (BR-019–BR-021, ADR-0007).**
   - TIME: `roundHalfUp(minutes × rate / 60)` with `platform/money.ts`.
   - The rate is resolved per entry:
     1. the rate frozen on the approved version (TIME pricing), for change-request work;
     2. else the project override;
     3. else the workspace default.
   - FIXED: `amountMinor` as entered.
   - The DTO carries `hourlyRateMinor` and `billableAmountMinor` as integer strings, and the list carries `eligibleTotalMinor` (the sum of the eligible entries).
   - These are **previews**. M5 invoices copy the rate onto lines and recompute totals in their own transaction.
7. **Entry rules.**
   - `workDate` is a calendar day that cannot be later than today in the workspace time zone (`422`).
   - The currency is the project currency at creation.
   - Edits use `If-Match`. Edits and deletes are guarded by `invoiceId: null` in the update itself, so work invoiced between the read and the write is still refused (`409 ALREADY_INVOICED`, AC-017.3).
   - Kind, task and scope are fixed after creation.
   - Deletes are hard deletes of unbilled work (`TenantCollection.deleteOne`, tenant-scoped like every other method).
   - Every write runs the BR-029 project lock.
8. **Currency lock.** `PATCH /projects/{id}` refuses a currency change with `409 INVALID_STATE_TRANSITION` once the project has an entry (data-model §4.6). The same currency or other fields are fine.
9. **List size.** `GET …/billable-entries` returns at most `ENTRY_LIST_CAP = 500` entries (newest work first) with `truncated: true` when more exist. Totals then cover only the listed entries. Pagination is deferred.
10. **Overview (FR-015, AC-024.1).**
    - `GET /projects/{id}/overview` lives in `billing`, the only module that can read core-ops, scope-guard and entries without a cycle.
    - It returns:
      - requirement counts (draft and baselined);
      - the baseline count;
      - CR counts for every status (zeros included);
      - task counts by status and by scope kind;
      - the unbilled eligible total and counts.
11. **Web.**
    - S-07 offers **Create tasks from this version…** as the primary action on `APPROVED` versions. All criteria are preselected, and the dialog keeps one Idempotency-Key per opening.
    - S-09 offers approved CR versions as task scopes. A task's existing (superseded) link stays selectable.
    - S-10 lists the server's eligible and ineligible sections, reasons, explanations, amounts and total verbatim, with **Log work** and **Delete**. Entry **editing** is API-only for now.
    - Calendar dates (`workDate`, `decidedOn`, `receivedOn`) are formatted as UTC days (`formatDay`), so they do not shift a day west of UTC.

## Alternatives considered
- **Storing eligibility on the entry:** it would go stale on every decision, supersession or baseline (data-model §4.12).
- **core-ops importing scope-guard:** this creates a module cycle, because scope-guard already uses core-ops.
- **Re-deriving an entry's scope from its task on every read:** a task re-linked later would silently re-scope already logged work. The copied scope is the record of what the work was logged against.
- **Rejecting duplicate conversions with `409`:** "process the same approved request twice" is a normal retry, so reporting `alreadyConverted` is friendlier and still creates nothing.
- **Allowing entries on non-billable tasks and classifying them `UNSCOPED`:** the task may be linked to a baselined requirement, which would make that rule confusing. Refusing is clearer.

## Consequences
- The overview and the billing list read every listed entry's authorisation state. This means one CR lookup per distinct version per request (memoised), which is fine at MVP scale.
- Invoices (M5) must re-check eligibility in their own transaction (BR-017). The preview total is never trusted as an invoice total.
- No audit event is written for entry create, edit or delete. They are not in the BR-028 critical list.

## Security and operational implications
- The seven new routes are in the TC-SEC-01 cross-workspace matrix and TC-SEC-01d. They are member routes (no owner-only action in M4).
- Mutation checks (execution report §12.4) confirm that the following controls are load-bearing:
  - approved-only conversion;
  - the duplicate skip;
  - approved-only new links;
  - CR eligibility;
  - version rate first;
  - the guarded `invoiceId: null` update;
  - the future-date check;
  - the non-billable task refusal;
  - the foreign-CR check;
  - the currency lock;
  - invoiced-is-ineligible.
