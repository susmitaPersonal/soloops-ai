import { test } from '@playwright/test';

/**
 * TC-E2E-01 / TC-E2E-02: the principal business workflow (J1 → J4).
 *
 * Steps 1–3 exist and are covered by real tests: sign-in and workspace in
 * m1-walking-skeleton.spec.ts; client, project, requirements and baseline (E2E-WF-02/03) plus
 * task planning in m2-core-ops.spec.ts; change request, AI estimate (mock), propose, approval,
 * revision and AI failure (E2E-WF-04…07, 12, 14) in m3-scope-guard.spec.ts; tasks from the
 * approved version, logged work and eligibility (E2E-WF-08, 09, 11a) in m4-delivery-billing.spec.ts;
 * the complete journey to an issued and voided invoice (TC-E2E-01, E2E-WF-10) and rejected work kept
 * off invoices (E2E-WF-11) in m5-invoices.spec.ts.
 * The steps below
 * need features that are NOT implemented yet. These are `test.fixme` (reported as skipped), never fake passes, and must not
 * be "unblocked" by seeding the database or bypassing authorization.
 * Unblock each test when its milestone lands (docs/quality/test-cases.md, "Blocked").
 */
const blocked = (id: string, title: string, waitsFor: string) =>
  test.fixme(`${id} ${title} — BLOCKED: needs ${waitsFor}`, async () => {});

test.describe('TC-E2E-02 variants (pending implementation)', () => {
  blocked(
    'E2E-WF-13',
    'member cannot issue invoices (owner-only) through the UI',
    'FR-004 member management to add a member without seeding (the API rule is covered by TC-020.2 and TC-SEC-03)',
  );
});
