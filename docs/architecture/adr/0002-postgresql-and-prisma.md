# ADR-0002: PostgreSQL with Prisma ORM

- **Status:** Superseded by [ADR-0012](0012-mongodb-and-data-access.md) on 2026-10-16. Kept for history.
- **Date:** 2026-10-16
- **Related:** NFR-001–003, BR-009, BR-018, BR-023, ADR-0007

## Context
The domain is relational (client → project → requirement → CR → version → approval → task → entry → invoice). It needs transactions, row locks, partial unique indexes, check constraints and strict referential integrity.

## Decision
PostgreSQL is the only datastore. Prisma is the ORM and migration tool. Raw SQL migrations are used for features Prisma's schema cannot express (partial unique indexes, check constraints, triggers, grants). `$queryRaw` is used for `SELECT … FOR UPDATE`.

## Alternatives considered
- **SQLite:** simplest self-hosting, but weaker concurrency and fewer constraint features. Rejected for invoice numbering and approval locking.
- **Drizzle / Kysely:** closer to SQL with good TypeScript types. Prisma was chosen for its contributor familiarity and migration workflow. A future ADR may revisit.
- **MongoDB:** a poor fit for relational integrity.

## Rationale
Postgres gives database-level enforcement of key invariants (one open version, one approved version, one non-void invoice per entry, composite tenant FKs), which is defence in depth beyond application code.

## Consequences
- Some invariants live in raw SQL migrations and must be documented in [data model](../data-model.md).
- `BigInt` handling must be explicit in JSON serialisation (amounts are strings in the API).
- Prisma's support for composite relations that share `workspaceId` must be verified in M1.

## Security and operational implications
Use a non-superuser app role with restricted grants on append-only tables. `prisma migrate deploy` runs as a release step. Postgres version is pinned in Docker Compose.
