# ADR-0007: Integer minor-unit money and server-side calculation

- **Status:** Accepted. Code-location clause amended by [ADR-0011](0011-monorepo-packages-and-contracts.md): calculations live in `apps/api` (billing domain), not in a shared package.
- **Date:** 2026-10-16
- **Related:** NFR-001, BR-016–027, OQ-002, OQ-007

## Context
Invoices must be exact and reproducible. JavaScript `number` floating point cannot represent decimal currency exactly. AI must not influence money.

## Decision
- Store amounts as **integer minor units** (`BigInt` in DB and code). Time is integer minutes, rates are minor units per hour, and tax is integer basis points.
- All calculations live in pure functions in `packages/shared/src/money` and are executed **authoritatively on the server**. The web app only displays server results.
- Rounding: **round half up** at line level (`minutes × rate / 60`) and on invoice-level tax (`subtotal × bps / 10000`). Tax is computed on the subtotal, not per line.
- One currency per invoice, and no conversion.
- The API serialises amounts as decimal strings of minor units.

## Alternatives considered
- **Decimal library (for example decimal.js) with major units:** fine, but adds a dependency, and integer minor units are simpler for sums.
- **Per-line tax:** needed for some tax regimes (possibly GST with mixed rates), but deferred until OQ-002 is resolved.
- **Banker's rounding:** less familiar to users. Round half up matches common invoicing expectations.

## Rationale
Integers make sums exact, and pure functions make property-based testing straightforward. A single implementation avoids divergence.

## Consequences
- Supporting GST splits or per-line tax later means a new ADR and a calculation version stored on the invoice.
- Currencies with non-2-decimal minor units need an exponent table (from `Intl` or ISO 4217 data).

## Security and operational implications
Client-supplied totals are ignored, which prevents tampering. Issued invoices store their computed values, so later code changes do not alter historical invoices.
