# ADR-0020: M5 invoice drafting implementation choices

- **Status:** Accepted
- **Date:** 2026-10-18
- **Related:** FR-042–FR-046, BR-017–BR-025, BR-028, BR-030, AC-019.x–AC-021.1, ADR-0007, ADR-0012, ADR-0018 §6, ADR-0019

## Context
M5 turns eligible billable work (M4) into invoices: a member drafts, an owner issues and voids. The rules (BR-017–BR-025) and the document shape (data-model §4.13) are fixed. Several details were open:
- where the invoice code lives;
- how entries are reserved;
- what a draft edit looks like over HTTP;
- how numbers stay gapless;
- when tax settings are read;
- what happens to evidence after a void.

## Decision
1. **Module.** Invoices live in `billing` (`invoices.ts`, collection `invoices`, migration `0005-invoices`). The invoice code reuses the M4 entry viewer, so drafting, issuing and the unbilled list run **the same** BR-016 classification and BR-021 rate resolution.
2. **Draft creation** (`POST {ws}/invoices { projectId, entryIds }`, members, optional `Idempotency-Key`). One transaction:
   1. A body project or entry that is missing, foreign or from another project → `422` field errors (ADR-0017 §5).
   2. An entry already on an invoice → `409 ALREADY_INVOICED` (AC-019.4).
   3. Any ineligible entry → `422 NOT_ELIGIBLE` listing each one with its explanation (AC-019.2, BR-017).
   4. Lines are built oldest work first, with the BR-021 rate copied onto TIME lines. Totals come from `domain/invoice-calc.ts` (BR-020).
   5. Entries are reserved with `updateMany({ _id ∈ ids, invoiceId: null })`; a count mismatch → `409`.
   6. `invoice.created` is audited.

   Archived projects remain invoiceable (workflows §4), so no BR-029 lock is taken. Concurrency comes from the entry writes: competing drafts write the same entry documents, conflict and retry, and the retry sees the reservation.
3. **Tax snapshot.** `taxLabel` and `taxRateBps` are copied from the workspace when the draft is created. A later settings change does not alter existing drafts: delete and redraft to pick it up. The rate is shown on the draft, so what the owner reviews is what gets issued.
4. **Draft edits** (`PATCH {ws}/invoices/{id}`, `If-Match`, drafts only). One body may combine three operations, applied in order:
   1. `lineDescriptions` edits;
   2. `removePositions`;
   3. `addAdjustments` (signed, non-zero, with a **reason**, BR-025, AC-019.3).

   Removing an entry line releases that entry. Positions are renumbered. At least one line must remain, at most 200 lines are allowed, and a negative subtotal is refused (`422`). Deleting a draft releases all its entries. Draft edits are not audited, because they are not in the BR-028 list.
5. **Issue** (`POST …/issue`, **owner**, `Idempotency-Key` **required**). One transaction:
   1. Re-check every entry line: the entry must still be reserved by this invoice and eligible, with its own reservation not counted as "already invoiced". Any failure → `409 NOT_ELIGIBLE` with `lines.<position>` errors (AC-020.4).
   2. Recompute TIME amounts from minutes × the copied rate, and recompute the totals.
   3. Take the number with `workspaces.allocateInvoiceNumber`: a `$inc` of `nextInvoiceNumber` inside the same transaction. An abort consumes no number (**gapless**), and concurrent issues conflict on the workspace document and serialise.
   4. Freeze the invoice with a status- and rowVersion-guarded update.
   5. Audit `invoice.issued`.

   `displayNumber` is `<prefix>-<4-digit number>` and never changes afterwards. The unique partial index `workspace_number_unique` backs BR-024. The `$inc` does not bump the workspace `rowVersion`, so an open settings form is not made stale by issuing.
6. **Void** (`POST …/void { reason }`, owner, key required). `ISSUED` → `VOID` with `voidedAt` and the reason. The number is kept, all entries are released, and `invoice.voided` is audited with the count.
7. **Evidence (BR-030).** A void invoice keeps its own copy of every line. A released entry can be invoiced again, but it can no longer be **deleted** once any invoice line references it (`409`, index `workspace_line_entry`).
8. **Role check.** Issue and void check `ctx.role === 'OWNER'` in the service before anything else (`403`, SEC-011). Both are in the TC-SEC-03 owner-only list.
9. **Web.**
   - S-10 has row selection and **Create invoice draft (n)**, with one key per selection that is kept on network errors.
   - S-11 lets members edit, remove, adjust and delete drafts. Owners issue (L4 dialog with a review checkbox) and void (with a reason). Members see a permission notice.
   - Lines that become ineligible are highlighted from the `409` details.
   - The print view has DRAFT / VOID watermarks, and the shell prints only the main content.
   - S-16 lists invoices by status.
10. **AI resilience review (FR-051).** `cr-analysis` is the only AI flow. The M5 review found one gap: `GET /ai/status` probed the provider on every CR and settings page load (bounded at 3 s), so an unreachable endpoint slowed each page. The probe result is now cached for `HEALTH_CACHE_MS` (30 s, injected clock), and concurrent callers share one probe. The UI failure tests were extended to `AI_PROVIDER_ERROR`, `AI_DISABLED` and `INTERNAL_ERROR`.

## Alternatives considered
- **Numbering at draft time:** drafts are deleted often, so this would leave gaps (BR-023).
- **A separate counter collection:** it adds nothing over `$inc` on the workspace document inside the transaction.
- **Re-reading tax at issue:** the owner would issue a total different from the reviewed one without seeing it.
- **Clearing `billableEntryId` on void:** this loses the link between the void invoice and the work.

## Consequences
- **Invoices are drafts with a single tax rate**, not GST-compliant tax invoices (OQ-002). The UI and print view say so.
- No payment tracking, credit notes, partial voids, currencies other than the project's, or e-invoicing. All are out of scope for the MVP.
- Two layered guards in draft creation (the `invoiceId: null` reservation filter and the reserved-count check) are **not independently load-bearing**. The in-transaction read plus MongoDB write-conflict retry already refuses double reservation (mutation checks in execution report §13.4). They are kept as defense in depth.

## Security and operational implications
- The seven invoice routes are in the TC-SEC-01 matrix (now 51 routes), TC-SEC-01d and TC-SEC-03.
- A cross-workspace attempt never consumes an invoice number (asserted in the matrix test).
- Mutation checks confirm that the owner check, ineligible refusal, `409` on already-invoiced work, issue-time re-check, void release, negative-subtotal refusal, subtotal-level tax, TIME recomputation, BR-030 delete guard and the AI health cache are load-bearing.
