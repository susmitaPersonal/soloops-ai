# ADR-0001: Technology stack and monorepo layout

- **Status:** Superseded by [ADR-0009](0009-nextjs-app-router-frontend.md) (web), [ADR-0010](0010-hono-api-on-node.md) (API) and [ADR-0011](0011-monorepo-packages-and-contracts.md) (layout) on 2026-10-16. Kept for history.
- **Date:** 2026-10-16
- **Related:** NFR-008, NFR-014, NFR-015, ADR-0002, ADR-0003

## Context
The repository was empty ([assessment](../../repository-assessment.md)), so no existing code constrains the stack. Contributors are Hacktoberfest participants with mixed experience. The brief proposes React/TypeScript/Vite on the frontend and Node/TypeScript/Express on the backend.

## Decision
- **Language:** TypeScript (strict) end to end.
- **Web:** React + Vite + React Router + TanStack Query + React Hook Form + Radix UI primitives + CSS Modules.
- **API:** Node.js (active LTS line) + Express + Zod + pino.
- **Monorepo:** npm workspaces: `apps/web`, `apps/api`, `packages/shared`. No extra monorepo tool.
- **Tooling:** ESLint, Prettier, `tsc --noEmit`, GitHub Actions CI.

## Alternatives considered
- **Next.js full-stack:** fewer moving parts, but couples UI and API runtime and its server-component model adds learning load. Rejected for clarity of the API boundary.
- **NestJS:** strong module system, but heavier abstractions (decorators, DI) for contributors. Express plus conventions is enough.
- **pnpm + Turborepo:** faster, but an extra tool to install. npm workspaces ships with Node. Revisit if CI gets slow.
- **Tailwind:** popular but adds a styling dialect. CSS Modules are a lower barrier. Contributors may propose a change via ADR.

## Rationale
This is a mainstream, well-documented stack that maximises the contributor pool, shares Zod schemas between client and server, and has no proprietary dependencies.

## Consequences
- Shared validation lives in `packages/shared`.
- Express needs explicit conventions (module layout, error mapping) that a framework would otherwise impose. These are documented in [backend architecture](../backend-architecture.md).

## Security and operational implications
Use a small dependency surface and keep the lockfile committed. One Node runtime to patch. The Node version is pinned in `.nvmrc` and `engines` during M1.
