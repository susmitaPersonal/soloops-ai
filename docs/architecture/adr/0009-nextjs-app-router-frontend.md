# ADR-0009: Next.js (App Router) frontend

- **Status:** Accepted (stack directed by the maintainer)
- **Date:** 2026-10-16
- **Supersedes:** the web part of [ADR-0001](0001-technology-stack.md)
- **Related:** ADR-0011, ADR-0013, NFR-011–013, A11Y-001–007

## Context
ADR-0001 chose a Vite + React Router SPA. The maintainer has directed a move to Next.js with the App Router. No frontend code exists, so the switch costs only documentation. The frontend must stay a **presentation layer**: business logic and database access belong to the API (ADR-0010, ADR-0012).

## Decision
- `apps/web` is a Next.js application using the **App Router**, React and TypeScript (strict).
- **Reads:** Server Components fetch initial data from the API over HTTP, forwarding the user's session cookie (ADR-0013). Every authenticated fetch is uncached (`cache: 'no-store'` / dynamic rendering).
- **Mutations:** Client Components call the API through `@soloops/api-client`, then call `router.refresh()` to re-render server data. **Server Actions and Route Handlers are not used for business operations in the MVP.**
- Forms use React Hook Form with Zod schemas from `@soloops/contracts`. Accessible primitives come from Radix UI. Styling uses CSS Modules with design tokens. These choices are unchanged from ADR-0001.
- There is no client-side data cache library (TanStack Query) in the MVP. RSC plus `router.refresh()` is sufficient. Revisit if interactive screens need it.
- `apps/web` never depends on `mongodb`, on `apps/api`, or on any server secret. It may hold one server-only variable, `API_INTERNAL_URL`, which is not secret.

## Alternatives considered
- **Keep Vite SPA (ADR-0001):** simpler mental model, but the maintainer prefers Next.js, and server rendering improves first load on slow mobile connections.
- **Next.js as a full-stack BFF (Server Actions/Route Handlers calling MongoDB):** fewer moving parts, but it would duplicate or relocate business logic, break the "AI and money logic only in the API" boundary, and create two auth and CSRF surfaces. Rejected.
- **Pages Router:** mature, but the App Router is the current default for new Next.js projects.

## Rationale
Next.js is widely known by contributors and gives server rendering, layouts and routing. Restricting it to presentation keeps one authoritative backend.

## Consequences
- Contributors must learn the server/client component split. Keep data fetching in server components and interactivity in client components.
- Async Server Components are tested mainly through Playwright (ADR-0014).
- Next.js caching must be explicitly disabled for per-user data. A mistake here could serve one user's data to another.
- The Next.js major version and the name of its request-interception file (`middleware` vs `proxy`) are pinned and verified in M1.

## Security and operational implications
- The web app is a second deployable unit (ADR-0013 topology).
- No secrets are available to it. `NEXT_PUBLIC_*` variables are inlined into the browser bundle, so they must never hold secrets.
- Any redirect done by the request-interception file is UX only. The API enforces authorisation.
