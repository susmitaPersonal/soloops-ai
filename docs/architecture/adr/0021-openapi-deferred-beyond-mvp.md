# ADR-0021: OpenAPI document deferred beyond the MVP release

- **Status:** Accepted
- **Date:** 2026-10-19
- **Amends:** the OpenAPI clause of [ADR-0010](0010-hono-api-on-node.md) ("generated from the same Zod contracts and served at `/api/v1/openapi.json`"), already deferred by [ADR-0016](0016-m1-implementation-choices.md) §3 (to M2) and [ADR-0017](0017-m2-core-ops-implementation-choices.md) §12 (to the start of M3)
- **Related:** ADR-0011, ADR-0013, [api-design.md](../api-design.md), [release readiness audit §13](../../quality/release-readiness-audit.md#13-final-release-closure-2026-10-19)

## Context
ADR-0010 said the API would serve an OpenAPI 3.1 document generated from the Zod contracts. M1 chose `@hono/zod-validator` and deferred generation (ADR-0016 §3). M2 deferred it again to the start of M3 (ADR-0017 §12). M3, M4 and M5 shipped without it, and no ADR recorded that. The 2026-10-19 release audit found that the accepted ADR-0010 no longer matched the code (finding B15/M05).

Current state of the code: there is no `/api/v1/openapi.json` route, and no OpenAPI generator is a dependency. Every route validates its input with the Zod schemas in `@soloops/contracts`. The web app calls the API only through the typed `@soloops/api-client`. The route inventory test (TC-SEC-02) fails when a tenant route is added without being listed.

## Decision
- The MVP release ships **without an OpenAPI document**. No release-scope requirement (FR, NFR or SEC) needs one.
- Until one exists, the API reference is:
  - [api-design.md](../api-design.md) for conventions and the route inventory;
  - the Zod schemas in `packages/contracts` for request and response shapes.
- OpenAPI generation is **post-MVP work**. When it is built, it must be generated from the same Zod contracts (the intent of ADR-0010 still holds). It must also add a test that compares the served document with the registered routes.
- The rest of ADR-0010 is unchanged.

## Alternatives considered
- **Add `@hono/zod-openapi` now.** That rewrites every route definition (about 50 routes across five modules) just before a release, for a feature no requirement depends on. Rejected under the release rule of the smallest justified change.
- **Hand-write an OpenAPI file.** It would drift from the contracts with nothing to detect the drift. Rejected.
- **Leave ADR-0010 as it is.** An accepted ADR would keep promising an endpoint that does not exist. Rejected.

## Rationale
The contracts package already gives both sides one source of truth for shapes, which is the property OpenAPI was meant to provide inside this monorepo. External API consumers are not an MVP audience.

## Consequences
- Third-party clients have no machine-readable API description; they must read `api-design.md` and the contracts.
- `api-design.md` no longer promises `/api/v1/openapi.json` for the release.
- Known limitations list the missing OpenAPI document with this ADR as the reference.

## Security and operational implications
None: no route is added or removed. Not serving an OpenAPI document also avoids publishing the route inventory to anonymous callers.
