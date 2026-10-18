# Architecture Decision Records

ADRs record **material** decisions: those that are hard to reverse, affect several modules, or change business invariants. Don't write ADRs for trivial choices such as a utility library or naming.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-technology-stack.md) | Technology stack and monorepo layout | Superseded by 0009, 0010, 0011 |
| [0002](0002-postgresql-and-prisma.md) | PostgreSQL with Prisma ORM | Superseded by 0012 |
| [0003](0003-modular-monolith.md) | Modular monolith | Accepted |
| [0004](0004-authentication-and-sessions.md) | Server-side sessions with argon2id | Accepted (storage amended by 0012) |
| [0005](0005-ai-provider-abstraction.md) | Provider-independent AI integration | Accepted |
| [0006](0006-versioned-approvals.md) | Immutable proposal versions with hash-bound approvals | Accepted (amended by 0012, 0015) |
| [0007](0007-financial-calculations.md) | Integer minor-unit money and server-side calculation | Accepted (code location amended by 0011) |
| [0008](0008-testing-strategy.md) | Testing strategy (Express/Postgres) | Superseded by 0014 |
| [0009](0009-nextjs-app-router-frontend.md) | Next.js (App Router) frontend | Accepted |
| [0010](0010-hono-api-on-node.md) | Hono API on Node.js | Accepted (OpenAPI clause amended by 0021) |
| [0011](0011-monorepo-packages-and-contracts.md) | Monorepo packages and shared-contract boundaries | Accepted |
| [0012](0012-mongodb-and-data-access.md) | MongoDB with the native driver and a tenant-scoped data-access layer | Accepted |
| [0013](0013-web-api-communication.md) | Web-to-API communication over a same-origin `/api` path | Accepted |
| [0014](0014-testing-strategy-for-next-hono-mongodb.md) | Testing strategy for Next.js, Hono and MongoDB | Accepted |
| [0015](0015-cached-derived-cr-status.md) | Store derived CR status as an atomically maintained cache | Accepted |
| [0016](0016-m1-implementation-choices.md) | M1 implementation choices (versions, validation, CSP, sessions, tooling) | Accepted |
| [0017](0017-m2-core-ops-implementation-choices.md) | M2 Core Ops implementation choices (baseline hash and concurrency, body references, task scopes before M3) | Accepted |
| [0018](0018-m3-scope-guard-and-ai-implementation-choices.md) | M3 Scope Guard and AI implementation choices (version write path, hash, idempotency, AI failure mapping, mock provider) | Accepted |
| [0019](0019-m4-delivery-and-billable-work-implementation-choices.md) | M4 delivery and billable work implementation choices (core-ops ports, duplicate-safe conversion, computed eligibility, entry scope, rates) | Accepted |
| [0020](0020-m5-invoice-implementation-choices.md) | M5 invoice drafting implementation choices (reservation, tax snapshot, draft edits, gapless issue, void evidence, AI status cache) | Accepted |
| [0021](0021-openapi-deferred-beyond-mvp.md) | OpenAPI document deferred beyond the MVP release | Accepted |
| [0022](0022-scope-check-and-members.md) | Evidence-bound AI scope check and workspace members | Accepted (scope-check rules partly superseded by 0023) |
| [0023](0023-evidence-gated-scope-check.md) | Evidence-gated scope check (server-decided coverage) | Accepted |

"Accepted" means accepted for the MVP design. ADRs 0001–0008 were accepted by the foundation work on 2026-10-16. ADRs 0009–0014 record the stack the maintainer directed later that day. ADR-0015 records a data-model refinement made during the design pass. ADR-0016 records the choices that ADR-0009, ADR-0010 and ADR-0012 deferred to milestone M1. ADR-0017 records the open implementation details of milestone M2 (Core Ops). ADR-0018 does the same for M3 (Scope Guard with AI analysis), ADR-0019 for M4 (delivery and billable work), and ADR-0020 for M5 (invoices). ADR-0021 records, at release closure, that the OpenAPI document promised by ADR-0010 is deferred beyond the MVP. ADR-0022 records the evidence-bound AI scope check and workspace members (FR-021, FR-004). ADR-0023 replaces the scope check's evidence rules with server-decided coverage from verbatim quotes (BR-031). Maintainers may revisit any ADR before implementation starts by adding a superseding ADR.

**Current stack in one line:** Next.js App Router (web) · Hono on Node.js (API) · MongoDB replica set via the native driver · Zod contracts in `@soloops/contracts` · npm workspaces.

## Process

1. Copy the template below to `NNNN-short-title.md` using the next number.
2. Open a PR with status `Proposed`, and link it from the affected docs.
3. On merge, set the status to `Accepted`. Never edit an accepted ADR's decision. Supersede it with a new ADR and set the old one to `Superseded by NNNN`.

## Template

```markdown
# ADR-NNNN: Title

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- **Date:** YYYY-MM-DD
- **Related:** FR-/BR-/NFR- IDs, other ADRs

## Context
## Decision
## Alternatives considered
## Rationale
## Consequences
## Security and operational implications
```
