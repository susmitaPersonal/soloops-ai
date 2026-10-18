# Coding Standards

## General
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any` without an explaining comment.
- Prettier formats the code. Do not hand-format or argue style in reviews.
- Prefer small, pure functions in `domain/`. Keep side effects at the edges (routes, repositories).
- Names: `camelCase` for values and functions, `PascalCase` for types and components, `SCREAMING_SNAKE` for enum members (matching DB enums), `kebab-case` for file names except React components (`PascalCase.tsx`).
- Comments explain *why*, not *what*. Reference rule IDs where code enforces them: `// BR-010: decision must match hash`.

## Backend
- Follow the module layout in [backend architecture](../architecture/backend-architecture.md#source-layout). Import other modules only via `index.ts`.
- Repositories use `TenantCollection` (from `platform/db`), never raw collections. Only `platform/db` imports `mongodb`. Never build a filter from an unvalidated request object.
- Services take a `ctx` object (`userId`, `workspaceId`, `role`) and plain DTOs, never `req` or `res`.
- Throw typed domain errors. Never `res.status()` inside services.
- Wrap multi-write use cases in a transaction, and write audit events inside it.
- Money is `bigint` minor units. Never `number` for money. Never `parseFloat` on amounts.
- Time comes from an injected `clock.now()`, never `new Date()` in domain logic.

## Frontend
- Server Components fetch through `lib/api/server.ts` only, with no caching of per-user data. Client Components mutate through `@soloops/api-client`, then call `router.refresh()`. No Server Actions or Route Handlers for business operations (ADR-0009).
- Forms use React Hook Form with schemas from `@soloops/contracts`. Never import `mongodb`, `@soloops/api` or server secrets in `apps/web`.
- Components must render loading, empty, error and populated states.
- Never compute money or eligibility client-side. Display server values.
- Use semantic HTML and accessible primitives. Every interactive element is keyboard-operable.

## Validation and schemas
- API contract schemas live in `packages/contracts/src/<module>.ts` and are shared by API and web. Persistence document types stay in `apps/api` (`documents.ts`) and are mapped to contracts, never exported (ADR-0011).
- Export inferred types (`z.infer`) instead of duplicating interfaces.

## AI code
- Prompts are versioned files. Changing text means a new version (see [AI architecture](../architecture/ai-architecture.md#5-prompt-design-and-versioning)).
- Validate all model output. Never trust, execute or render model output as HTML.

## Git and PRs
- Branch names: `feat/<short>`, `fix/<short>`, `docs/<short>`, `chore/<short>`.
- Use Conventional Commits (`feat(scope-guard): record client decision`).
- Keep PRs small and focused (aim < 400 changed lines excluding generated files and lockfiles). Link requirement IDs.
- Follow the [PR checklist](../contributing/pull-request-checklist.md) and the [definition of done](definition-of-done.md).
