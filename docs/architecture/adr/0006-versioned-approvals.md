# ADR-0006: Immutable proposal versions with hash-bound approvals

- **Status:** Accepted. Enforcement mechanisms (partial unique indexes, table grants) amended by [ADR-0012](0012-mongodb-and-data-access.md). The "derived status is never stored" clause is amended by [ADR-0015](0015-cached-derived-cr-status.md), which keeps an atomically maintained cache. The approval decision itself is unchanged.
- **Date:** 2026-10-16
- **Related:** FR-024–030, BR-006–014, BR-028, OQ-003, OQ-008

## Context
The core value is proving *what exactly* the client approved, and ensuring that changing terms requires re-approval. Clients do not log in (OQ-003). The freelancer records the decision.

## Decision
- A change request has numbered **versions**. Content is editable only in `DRAFT`.
- **Propose** freezes the content and stores a SHA-256 hash of canonical JSON.
- A **decision** is a separate immutable record that references the version and must carry the matching hash. Only one decision per version is allowed.
- **Every** content change after propose requires a new version (no materiality judgement in MVP, OQ-008).
- At most one open (`DRAFT` or `PROPOSED`) version and at most one `APPROVED` version per CR, enforced by partial unique indexes. A newly approved version supersedes the old one.
- CR-level status is derived, never stored.

## Alternatives considered
- **Mutable proposal with an edit log:** simpler UI, but "what was approved" must be reconstructed from logs, which is error-prone in disputes.
- **Materiality rules (minor edits allowed):** friendlier, but subjective and hard to enforce or test. Deferred.
- **Cryptographic client signatures:** strongest evidence, but clients have no accounts. A signed approval link (FR-031) is a later step.

## Rationale
Immutable versions plus hash binding make approvals unambiguous and easy to test. Decisions recorded by the freelancer with channel and evidence reflect how small freelancers actually work today.

## Consequences
- The UI must make "create new version" easy and show diffs.
- Approval evidence is only as strong as the recorded note (not cryptographic proof). This is documented in [known limitations](../../quality/known-limitations.md).

## Security and operational implications
No update or delete paths for approvals. The DB role is restricted to insert/select on that table. Audit events are written in the same transaction.
