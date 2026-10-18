# ADR-0011: Monorepo packages and shared-contract boundaries

- **Status:** Accepted
- **Date:** 2026-10-16
- **Supersedes:** the repository-layout part of [ADR-0001](0001-technology-stack.md)
- **Amends:** the code-location clause of [ADR-0007](0007-financial-calculations.md). Money calculation lives in the API, not in a shared package.
- **Related:** ADR-0009, ADR-0010, ADR-0013, NFR-008

## Context
The web and API need the same request/response shapes and validation. However, shared code must never carry server-only concerns (database drivers, secrets, business rules, money calculation) into the browser bundle. ADR-0001 proposed one `packages/shared` that mixed schemas and money logic.

## Decision
Use npm workspaces with these units:

| Workspace | Name | Purpose | May depend on |
| --- | --- | --- | --- |
| `apps/web` | `@soloops/web` | Next.js UI | `@soloops/contracts`, `@soloops/api-client`, `@soloops/config` (dev) |
| `apps/api` | `@soloops/api` | Hono API, business logic, MongoDB access, AI orchestration | `@soloops/contracts`, `@soloops/config` (dev) |
| `packages/contracts` | `@soloops/contracts` | Zod schemas and inferred types for API DTOs, enums, error codes, route paths, minor-unit string helpers (parse/format only) | `zod` only |
| `packages/api-client` | `@soloops/api-client` | Typed `fetch` client: headers, problem+json → `ApiError`, response validation | `@soloops/contracts` only |
| `packages/config` | `@soloops/config` | Shared `tsconfig` bases, ESLint flat config (including boundary rules), Prettier config | dev tooling only |

Rules:
1. **Nothing depends on `apps/*`.** Apps are leaves.
2. `packages/contracts` and `packages/api-client` are **isomorphic**. They must not import `mongodb`, `hono`, `next`, `node:*` built-ins, env variables, or any `apps/*` code. ESLint `no-restricted-imports` and their `package.json` dependency lists enforce this.
3. **Contracts are not persistence models.** MongoDB document types live in `apps/api` and are mapped to contract DTOs (for example `_id` → `id`, `bigint` → decimal string), so database internals never leak.
4. **Business logic is API-only.** This covers state machines, eligibility, money calculation (ADR-0007), hashing and AI prompts. The web only formats values that the server returns.
5. Internal packages are consumed as TypeScript source ("just-in-time" packages): the web via Next.js `transpilePackages`, the API via its build tool. Publishing them to npm is out of scope.

## Alternatives considered
- **A single `packages/shared`:** fewer packages, but it invites server code into the browser bundle.
- **Hono RPC types instead of contracts:** couples the web to API internals (see ADR-0010).
- **Turborepo or Nx:** caching and task graphs are useful later, but another tool now. Revisit if CI time hurts.
- **Compiled (`dist/`) internal packages:** cleaner boundaries, but slower dev loops. Revisit if build issues appear.

## Rationale
Small, explicit packages make the server/client boundary checkable by tooling rather than by convention.

## Consequences
- Any API shape change starts in `packages/contracts`, and both apps are type-checked against it.
- The lint config must forbid the restricted imports listed above. TC-ARCH-01 covers them.

## Security and operational implications
Secrets, database code and pricing logic cannot reach the browser through shared packages. The dependency lists keep the client bundle small.
