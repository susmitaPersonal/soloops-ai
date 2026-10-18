---
name: soloops-architecture
description: Enforce SoloOps AI architecture — modular-monolith boundaries, dependency direction, tenant scoping, transactions, ADR practice. Use when adding a module, endpoint, table, dependency or cross-module call, when changing data model or API conventions, or when any change might contradict an accepted ADR.
---

# SoloOps architecture

## Purpose
Keep the codebase consistent with documented architecture, and require explicit justification (ADR) for material changes.

## When to use
- New module, new dependency, or new cross-module interaction.
- Schema or API convention changes.
- Considering a pattern not used elsewhere in the codebase.

## Required inputs
The proposed change and the files or modules it touches.

## Procedure
1. Read:
   - [architecture-overview.md](../../../docs/architecture/architecture-overview.md)
   - [monorepo-structure.md](../../../docs/architecture/monorepo-structure.md)
   - [backend-architecture.md](../../../docs/architecture/backend-architecture.md) or [frontend-architecture.md](../../../docs/architecture/frontend-architecture.md)
   - [data-model.md](../../../docs/architecture/data-model.md)
   - [api-design.md](../../../docs/architecture/api-design.md)
   - the [ADR index](../../../docs/architecture/adr/README.md)
2. Check the change against these rules:
   - Modules import each other only via `index.ts`, and dependencies are one-way. `ai` imports no domain module.
   - Only `apps/api/src/platform/db` imports `mongodb`. Repositories use `TenantCollection`, which injects `workspaceId` into every filter and insert.
   - `apps/web` and `packages/*` never import `mongodb`, `hono`, `apps/api` or server-only code. Contracts are DTOs, not persistence models. Next.js runs no business mutations and never caches per-user data.
   - Tenant documents carry `workspaceId`, and every index starts with it. Referenced documents are loaded through the same workspace scope before linking (MongoDB has no FKs).
   - Multi-write use cases run in one MongoDB transaction (`withTransaction`), with audit events inside it. Races are resolved by state-conditional updates and unique indexes (see the ADR-0012 invariant table).
   - Money uses the API billing domain pure functions with `bigint` minor units (never in web or packages).
   - Transition endpoints support `Idempotency-Key`. `PATCH` uses `If-Match`.
   - Errors are problem+json with stable `code`s.
3. Decide whether the change is **material**: it is hard to reverse, crosses modules, alters an invariant, or adds a significant dependency or infrastructure.
   - If it is material, draft an ADR from the template in the ADR README (next number, status `Proposed`) with alternatives, rationale, consequences and security/ops implications.
   - Never edit an accepted ADR's decision. Supersede it instead.
4. Prefer the simplest design that satisfies the requirements. Reject premature microservices, queues or caches without measured need.
5. Update the affected architecture docs in the same change.

## Output
- An approval or the list of violations, each with a file reference and the rule broken.
- An ADR draft when the change is material.
- The list of doc updates required.

## Quality checklist
- [ ] No boundary violations.
- [ ] Tenant scoping is present on every new query.
- [ ] Transactions and locks are identified for state transitions.
- [ ] An ADR exists for material decisions.
- [ ] The docs match the design.
