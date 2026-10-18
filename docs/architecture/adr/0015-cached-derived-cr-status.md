# ADR-0015: Store derived change-request status as an atomically maintained cache

- **Status:** Accepted
- **Date:** 2026-10-16
- **Amends:** the "CR-level status is derived, never stored" clause of [ADR-0006](0006-versioned-approvals.md)
- **Related:** ADR-0012, FR-017, FR-032, [data model §4.9](../data-model.md#49-changerequests-aggregate-with-embedded-versions)

## Context
ADR-0006 derives a change request's overall status (`AWAITING_DECISION`, `APPROVED`, …) from its versions, so it can never disagree with them. The new dashboard (FR-017) and approvals queue (FR-032) must list CRs **across all projects** filtered by that status. Computing it on read means scanning every CR in the workspace.

## Decision
- Persist `derivedStatus` on the `changeRequests` document as a **cache**.
- It is recomputed by the pure domain function `deriveCrStatus(versions)` and written **in the same `updateOne`** as every version-state change. That update is a single document, so it is atomic.
- It is never accepted from clients and never updated on its own.
- Index it as `{ workspaceId, derivedStatus, updatedAt }`.
- A consistency test asserts `derivedStatus === deriveCrStatus(versions)` after every transition. The planned integrity job (data model §9) checks it again.

## Alternatives considered
- **Compute on read with an aggregation pipeline:** always correct, but each dashboard load would scan all CRs. Acceptable at MVP scale, but wasteful and harder to page.
- **A separate status collection:** needs a transaction and can drift.

## Rationale
Single-document atomic updates make the cache as trustworthy as the versions themselves, at negligible cost.

## Consequences
Every code path that changes version states must go through the repository function that recomputes `derivedStatus`.

## Security and operational implications
None beyond the rule that clients can never write the field. If a bug ever made the cache drift, the integrity job would detect it, and recomputing it is safe.
