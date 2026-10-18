# ADR-0003: Modular monolith

- **Status:** Accepted
- **Date:** 2026-10-16
- **Related:** NFR-002, NFR-007, NFR-008

## Context
The product has five functional modules, which the community should be able to evolve independently. Key use cases (record decision, issue invoice) span modules and need atomic transactions. The deployment target is a single small server.

## Decision
One deployable API process, organised as modules with explicit public APIs (`index.ts`), one-way dependencies, and lint-enforced import boundaries. The AI module depends on no domain module.

## Alternatives considered
- **Microservices:** independent deploys, but distributed transactions, network failures, and much higher ops cost and contributor complexity. Rejected for MVP.
- **Unstructured monolith:** fastest to start, but boundaries erode and the AI write-isolation guarantee (BR-001) becomes unenforceable. Rejected.

## Rationale
This gives single-database transactions and simple deployment, while still allowing modules to be extracted later if a real need arises.

## Consequences
- Boundary rules must be enforced by lint and review.
- A module needing another's data calls that module's public API, possibly passing a transaction client.

## Security and operational implications
There is one attack surface and one runtime to patch. The blast radius of a bug is the whole app, which is mitigated by tests and tenant-scoping defence in depth.
