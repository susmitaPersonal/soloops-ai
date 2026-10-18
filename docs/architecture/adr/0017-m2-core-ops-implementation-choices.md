# ADR-0017: M2 Core Ops implementation choices

- **Status:** Accepted
- **Date:** 2026-10-17
- **Related:** FR-010–FR-014, BR-004, BR-005, BR-015, BR-028, BR-029, AC-002.1, AC-004.2, AC-007.1–.3, AC-016.1–.2, SEC-004, ADR-0006, ADR-0012, ADR-0016

## Context
Milestone M2 implements clients, projects, requirements, baselines and tasks. The requirements, data model and API design fix the behaviour, but several implementation details were open:
- the exact content the baseline hash covers;
- how concurrent baselines are prevented;
- what a foreign ID **inside a request body** returns;
- how tasks behave before change requests (M3) exist;
- which problem code a frozen requirement returns;
- whether to add OpenAPI generation, idempotency middleware and a dialog library now.

## Decision
1. **Module.** A new `core-ops` module (`apps/api/src/modules/core-ops`) owns `clients`, `projects`, `requirements`, `baselines` and `tasks`, created by migration `0002-core-ops`. It uses the `workspace` module only through its public `index.ts` (`requireMembership`, `getSettings`, `findMembership`). Every Core Ops route is open to any member (api-design §4, Auth = M).
2. **Baseline hash (BR-005).** `contentHash` = SHA-256 hex of `JSON.stringify` of the frozen requirements sorted by `number`, each serialised as `{ number, title, description, acceptanceCriteria, priority }` in that key order. Timestamps, IDs and `rowVersion` are excluded, so the hash can be recomputed from the stored, immutable documents (`domain/baseline-hash.ts`, unit-tested against a literal canonical string).
3. **Baseline concurrency.** The baseline transaction increments `projects.counters.baseline`, guarded by `archivedAt: null`, before reading the drafts. A concurrent baseline or requirement creation writes the same project document, so MongoDB raises a write conflict and the driver retries. The retry sees no drafts left and returns 422. This replaces the "project `rowVersion` guard" in the data model, because `rowVersion` is reserved for edits of the project's own fields (ERR-005).
4. **Serialising writes on the same project or client (BR-029).** MongoDB reports a write conflict only for a real change: a `$set` of an unchanged value, such as the same `updatedAt` within one millisecond, is a no-op and does not conflict. So every "touch" increments a hidden `activityVersion` field.
    - **Child writes touch the project.** Creating or editing requirements and tasks, and creating baselines, `$inc` `projects.activityVersion` and set `updatedAt` inside the same transaction, guarded by `archivedAt: null`. A concurrent project archive therefore conflicts and the retry sees it. The project list also stays ordered by recent activity.
    - **Archiving a client touches its active projects**, in one transaction. A child write or project edit that read the client before the archive then conflicts, and its retry returns 409.
    - **Project edits** read the client and write the project in one transaction.
    - **Project creation touches the client** (`clients.activityVersion`) in the same transaction as the insert, so it cannot race a client archive (AC-005.2).
    - **Task updates read the task inside the transaction** and compare its `rowVersion` with `If-Match` before checking BR-015. A stale snapshot can never be combined with a newer version, for example an internal task becoming billable.
    - All of these interleavings have deterministic tests (`apps/api/test/core-ops-races.test.ts`).
5. **Foreign or missing IDs in a request body** (`clientId` on project create, `scope.requirementId`, `assigneeUserId`) return **422 `VALIDATION_FAILED`** with a field error. The message is identical whether the ID is missing or belongs to another workspace, so nothing leaks. **Path IDs** keep returning 404 (SEC-004). A malformed path ID is also 404.
6. **Frozen requirements** return **409 `BASELINE_LOCKED`**, a new additive problem code, with a message pointing to change requests (AC-007.2).
7. **Tasks before M3.** The task-scope contract already contains `CHANGE_REQUEST` so clients won't break later. Until Scope Guard exists, no approved version can be found, so such a link is refused with **422 `NOT_ELIGIBLE`**. A `BASELINE` scope always requires a baselined requirement of the same project. A billable `INTERNAL` task is 422 `NOT_ELIGIBLE` on `billable` (AC-016.1). These rules are a pure function (`domain/task-scope.ts`). Task status may move freely between `TODO`, `IN_PROGRESS` and `DONE`, because FR-014 defines no restricted transitions.
8. **Archive** (`POST …/archive`) is idempotent: archiving an archived item returns it unchanged. An unarchive endpoint is not provided, since none is specified. A project is **read-only** when it or its client is archived; the DTO exposes `readOnly`.
9. **Workspace defaults (AC-002.1, projects part).** A new project takes the workspace currency when none is given. `hourlyRateMinor: null` means "use the workspace default rate" (BR-021).
10. **Bounded requirements.** A project holds at most 500 active (not deleted) requirements, and creating the 501st returns 422. This keeps the "freeze **every** draft" rule (BR-004) and the one-page requirement list (data-model §6) true together. Baseline creation also refuses, defensively, if the number of drafts it would freeze differs from the number that exist.
11. **Lists.** Keyset pagination with an opaque base64url cursor:
    - clients by `(name, _id)`;
    - projects by `(updatedAt desc, _id desc)`;
    - tasks by `_id desc`, filterable by `status` and `assigneeUserId`.

    Requirements and baselines of one project return all items, capped at 500 (data-model §6). The client and project indexes include `_id` as the final key so the keyset sort is index-backed.
12. **Deferred again:**
    - **OpenAPI generation** (ADR-0016 §3): it would rewrite every route definition, so it is moved to the start of M3;
    - **`Idempotency-Key` middleware**: baseline creation is naturally retry-safe, because a retry finds nothing to freeze and returns 422;
    - **a Radix dialog dependency**: the UI uses the native `<dialog>` with `showModal()`, which provides the focus trap and Esc without a new package.

## Alternatives considered
- **Snapshot array of the frozen requirements on the baseline.** Rejected by the data model: it is unbounded, and the requirements are already immutable.
- **Project `rowVersion` as the baseline guard (`If-Match` on `POST /baselines`).** This would make every unrelated project edit invalidate an open baseline dialog. The counter write gives the same serialisation without that coupling.
- **404 for foreign body references.** Consistent with path IDs, but the UI could not show which field is wrong. 422 with an identical message for missing and foreign IDs leaks no more information.
- **Reuse `INVALID_STATE_TRANSITION` for frozen requirements.** Too generic for the UI to explain "use a change request".
- **Hide `CHANGE_REQUEST` from the contract until M3.** That would be a breaking contract change later.

## Rationale
Each choice keeps the business rules enforced on the server, inside one transaction where they span documents (BR-028), with tenant scoping through `TenantCollection` (ADR-0012). It also adds no new runtime dependency.

## Consequences
- The data model and API design are updated to match. The client and project indexes differ slightly from the earlier proposal (an `_id` suffix, plus an extra `workspace_project_recent` task index).
- `projects.updatedAt` reflects child activity, not only edits of the project itself.
- Assignees: without the member API (FR-004), the UI can offer only "Unassigned" or "Me". Other members' tasks show as "Another member".
- M3 must:
  - implement `getAuthorisationState` so that `CHANGE_REQUEST` scopes can be accepted;
  - add OpenAPI generation;
  - add idempotency middleware for transition endpoints.

## Security and operational implications
- Every new route is in the TC-SEC-01 cross-workspace matrix. TC-SEC-02 fails if a tenant route is added without a matrix row. TC-SEC-01d checks other workspaces' resource IDs used inside one's own workspace.
- The baseline audit event (`baseline.created`) records only the sequence, count, hash and requirement numbers, never requirement text.
- The M2 security and test reviews found four concurrency and integrity gaps, all fixed with regression tests before release:
  - an update race that bypassed BR-015;
  - a client-archive race for child writes and project edits;
  - a project-create race on archived clients;
  - unbounded requirements escaping a baseline.

  The decisions above describe the fixes. See [test execution report §10](../../quality/test-execution-report.md#10-m2-core-ops-2026-10-17).
- **Residual:** the assignee membership check (AC-016.2) reads `memberships` outside the transaction, so a membership removed at the same moment could still be assigned. No member-removal API exists yet (FR-004). Revisit when it lands.
- Any member can archive a client or project, and archiving is one-way (api-design §4 Auth = M; no unarchive is specified). This is a product decision recorded in the known limitations.
