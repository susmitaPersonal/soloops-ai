import { expect, test } from '@playwright/test';
import {
  apiAs,
  baselinedProject,
  registerViaUi,
  seriousAxeViolations,
  uniqueEmail,
} from './support';

/**
 * TC-E2E-01 / TC-E2E-02: the principal business workflow (J1 → J4).
 *
 * Steps 1–3 are covered by real tests: sign-in and workspace in m1-walking-skeleton.spec.ts;
 * client, project, requirements and baseline (E2E-WF-02/03) plus task planning in
 * m2-core-ops.spec.ts; change request, AI estimate (mock), propose, approval, revision and AI
 * failure (E2E-WF-04…07, 12, 14) in m3-scope-guard.spec.ts; tasks from the approved version, logged
 * work and eligibility (E2E-WF-08, 09, 11a) in m4-delivery-billing.spec.ts; the complete journey to
 * an issued and voided invoice (TC-E2E-01, E2E-WF-10) and rejected work kept off invoices
 * (E2E-WF-11) in m5-invoices.spec.ts. E2E-WF-13 (team member, owner-only invoicing) is below; it
 * was blocked until FR-004 member management existed and now runs without any database seeding.
 */
const today = () => new Date().toISOString().slice(0, 10);

test('E2E-WF-13 FR-004 BR-023 a member added in Settings drafts work but cannot issue invoices; removal ends access', async ({
  page,
  browser,
}) => {
  // The colleague registers in their own browser session (own workspace, own cookie).
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  const memberEmail = uniqueEmail('wf13-member');
  await registerViaUi(memberPage, 'Arjun Das', memberEmail);

  // The owner sets up billable work and a draft invoice (real API, every server rule applies).
  const ws = await registerViaUi(page, 'Riya Sen', uniqueEmail('wf13-owner'));
  const { projectId, requirementId } = await baselinedProject(page, ws);
  const base = `/workspaces/${ws}`;
  const entry = await apiAs(page, 'POST', `${base}/projects/${projectId}/billable-entries`, {
    kind: 'TIME',
    workDate: today(),
    minutes: 120,
    description: 'Login screen',
    scope: { type: 'BASELINE', requirementId },
  });
  const draft = await apiAs(page, 'POST', `${base}/invoices`, { projectId, entryIds: [entry.id] });

  // AC-003.1: the owner adds the colleague through Settings → Members.
  await page.goto(`/w/${ws}/settings`);
  const members = page.getByRole('region', { name: 'Members' });
  await members.getByLabel(/Add a member by email/).fill(memberEmail);
  await members.getByRole('button', { name: 'Add member' }).click();
  await expect(members.getByText('Arjun Das was added as a member.')).toBeVisible();
  await expect(members.getByRole('list', { name: 'Workspace members' })).toContainText('Arjun Das');
  expect(await seriousAxeViolations(page), 'settings with members').toEqual([]);

  // The member opens the owner's draft invoice: no Issue control, a permission notice instead.
  await memberPage.goto(`/w/${ws}/billing/invoices/${draft.id}`);
  await expect(memberPage.getByText('Only owners can issue or void invoices')).toBeVisible();
  await expect(memberPage.getByRole('button', { name: /Issue invoice/ })).toHaveCount(0);
  // …and the server refuses it even when asked directly (BR-023, AC-020.2).
  const origin = new URL(memberPage.url()).origin;
  const issue = await memberPage.request.post(
    `${origin}/api/v1${base}/invoices/${draft.id}/issue`,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'soloops',
        Origin: origin,
        'Idempotency-Key': `wf13-${Date.now()}`,
      },
      data: '{}',
    },
  );
  expect(issue.status()).toBe(403);

  // The owner removes the member; the member's next request finds nothing (SEC-004).
  await page.reload();
  await members.getByRole('button', { name: 'Remove Arjun Das' }).click();
  await page
    .getByRole('dialog', { name: 'Remove Arjun Das?' })
    .getByRole('button', { name: 'Remove member' })
    .click();
  await expect(members.getByText('Arjun Das was removed from this workspace.')).toBeVisible();
  const after = await memberPage.goto(`/w/${ws}/billing/invoices/${draft.id}`);
  expect(after?.status()).toBe(404);
  await expect(memberPage.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await memberContext.close();
});
