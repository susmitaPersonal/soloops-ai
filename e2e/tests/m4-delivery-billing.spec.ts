import { expect, test, type Page } from '@playwright/test';
import {
  apiAs,
  baselinedProject,
  registerViaUi,
  seriousAxeViolations,
  uniqueEmail,
  watchCsp,
} from './support';

/**
 * M4 Delivery and billable work through the real UI, API and MongoDB (E2E-WF-08, WF-09, WF-11a).
 * Change requests are prepared through the real API (every server rule applies, nothing is seeded
 * into the database); converting, logging work and reading eligibility happen in the UI.
 */

const projectTab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Project' }).getByRole('link', { name, exact: true });

const today = () => new Date().toISOString().slice(0, 10); // UTC date ≤ the IST workspace date

/** A change request whose v1 is proposed (and optionally decided) via the API. */
async function crViaApi(
  page: Page,
  ws: string,
  projectId: string,
  decision: 'APPROVED' | 'REJECTED' | null,
) {
  const base = `/workspaces/${ws}`;
  const cr = await apiAs(page, 'POST', `${base}/projects/${projectId}/change-requests`, {
    rawRequestText: 'Please add WhatsApp OTP login.',
    sourceChannel: 'EMAIL',
    requestedByName: 'S. Das',
    receivedOn: today(),
  });
  const edited = await apiAs(
    page,
    'PATCH',
    `${base}/change-requests/${cr.id}/versions/1`,
    {
      title: 'WhatsApp OTP login',
      clarifiedDescription: 'Phone login with a one-time password over WhatsApp.',
      inScope: ['OTP endpoints'],
      outOfScope: ['SMS fallback'],
      acceptanceCriteria: ['OTP arrives within 30 s', 'OTP expires after 5 min'],
      dependencies: [],
      assumptions: ['Phone numbers already verified'],
      risks: [],
      effort: { lowMinutes: 300, likelyMinutes: 360, highMinutes: 480 },
      confirmedEffortMinutes: 360,
      pricing: { mode: 'TIME' },
      timelineImpact: '2 days',
    },
    { 'If-Match': `"${cr.rowVersion}"` },
  );
  const proposed = await apiAs(
    page,
    'POST',
    `${base}/change-requests/${cr.id}/versions/1/propose`,
    undefined,
    { 'If-Match': `"${edited.rowVersion}"` },
  );
  if (decision) {
    await apiAs(
      page,
      'POST',
      `${base}/change-requests/${cr.id}/versions/1/decisions`,
      {
        decision,
        contentHash: proposed.versions[0].contentHash,
        clientDecisionMakerName: 'S. Das',
        decidedOn: today(),
        channel: 'EMAIL',
      },
      { 'Idempotency-Key': `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    );
  }
  return cr.id as string;
}

async function logWork(
  page: Page,
  opts: { hours?: string; minutes?: string; link: string | RegExp | null; description: string },
) {
  await page.getByRole('button', { name: 'Log work' }).first().click();
  const form = page.getByRole('form', { name: 'Log work' });
  if (opts.hours) await form.getByLabel('Hours').fill(opts.hours);
  if (opts.minutes) await form.getByLabel('Minutes').fill(opts.minutes);
  if (opts.link) {
    const select = form.getByLabel(/Belongs to/);
    const options = await select.locator('option').allTextContents();
    const label = options.find((o) =>
      typeof opts.link === 'string' ? o === opts.link : (opts.link as RegExp).test(o),
    );
    expect(label, `option ${String(opts.link)} in ${options.join(' | ')}`).toBeTruthy();
    await select.selectOption({ label: label as string });
  }
  await form.getByLabel(/Description/).fill(opts.description);
  await form.getByRole('button', { name: 'Log work' }).click();
  await expect(form).toBeHidden();
}

test('E2E-WF-08/09 approved version → tasks (no duplicates) → logged work with server eligibility', async ({
  page,
}) => {
  const csp = watchCsp(page);
  const ws = await registerViaUi(page, 'Riya Sen', uniqueEmail('m4-journey'));
  const { projectId } = await baselinedProject(page, ws);
  const crId = await crViaApi(page, ws, projectId, 'APPROVED');

  // E2E-WF-08 / AC-015.1: convert the approved version's acceptance criteria into tasks.
  await page.goto(`/w/${ws}/projects/${projectId}/change-requests/${crId}`);
  await page.getByRole('button', { name: 'Create tasks from this version…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create tasks from CR-1 v1?' });
  await expect(dialog.getByRole('checkbox', { name: 'OTP arrives within 30 s' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Create 2 tasks' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: '2 tasks created from v1.' }),
  ).toBeAttached();

  // Processing the same approval again creates no duplicates (FR-030).
  await page.getByRole('button', { name: 'Create tasks from this version…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create 2 tasks' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /2 criteria already had tasks, so no duplicates/ }),
  ).toBeAttached();

  await page.getByRole('link', { name: 'View tasks' }).click();
  await expect(page.getByText('OTP arrives within 30 s')).toBeVisible();
  await expect(page.getByText('OTP expires after 5 min')).toBeVisible();
  await expect(page.getByText(/Additional · CR-1 v1/)).toHaveCount(2);

  // E2E-WF-09 / AC-017.1 / AC-018.1: log work and read the server classification.
  await projectTab(page, 'Billing').click();
  await expect(page.getByText('No unbilled work')).toBeVisible();
  await logWork(page, {
    hours: '2',
    link: 'Task · OTP arrives within 30 s',
    description: 'OTP verification endpoint',
  });
  await expect(page.getByText('Work logged. It is ready to invoice.')).toBeVisible();
  await logWork(page, {
    minutes: '30',
    link: /^Original scope · REQ-1/,
    description: 'Login API fix',
  });
  await logWork(page, { hours: '1', link: null, description: 'Misc fixes' });
  await expect(
    page.getByText(/not billable yet: This work is not linked to agreed scope/),
  ).toBeVisible();

  const ready = page.getByRole('region', { name: 'Ready to invoice (2)' });
  await expect(ready.getByText('₹3,750.00')).toBeVisible(); // 2 h + 30 min at ₹1,500/h
  await expect(ready.getByText(/2 h × ₹1,500.00\/h = ₹3,000.00/)).toBeVisible();
  const notBillable = page.getByRole('region', { name: 'Not billable yet (1)' });
  await expect(notBillable.getByText('Not linked to agreed scope', { exact: true })).toBeVisible();
  await expect(notBillable.getByText('Misc fixes')).toBeVisible();

  // Delete the unlinked entry.
  await page.getByRole('button', { name: 'Delete “Misc fixes”' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete entry' }).click();
  await expect(page.getByRole('region', { name: /Not billable yet/ })).toHaveCount(0);

  // FR-015 / AC-024.1: the overview shows the same server totals; a reload proves persistence.
  await projectTab(page, 'Overview').click();
  const unbilled = page.getByRole('region', { name: 'Unbilled work' });
  await expect(unbilled.getByText('₹3,750.00')).toBeVisible();
  const crs = page.getByRole('region', { name: 'Change requests' });
  await expect(crs.getByText('Approved')).toBeVisible();
  expect(csp).toEqual([]);
});

test('E2E-WF-11a BR-016 work on a rejected proposal stays ineligible with the reason shown', async ({
  page,
}) => {
  const ws = await registerViaUi(page, 'Riya Sen', uniqueEmail('m4-rejected'));
  const { projectId } = await baselinedProject(page, ws);
  const crId = await crViaApi(page, ws, projectId, 'REJECTED');
  // The UI offers only approved versions, so this link is made through the API (still validated).
  await apiAs(page, 'POST', `/workspaces/${ws}/projects/${projectId}/billable-entries`, {
    kind: 'TIME',
    workDate: today(),
    minutes: 90,
    description: 'Started OTP work early',
    scope: { type: 'CHANGE_REQUEST', changeRequestId: crId, versionNumber: 1 },
  });
  await page.goto(`/w/${ws}/projects/${projectId}/billing`);
  await expect(page.getByText('Nothing can be invoiced yet')).toBeVisible();
  const section = page.getByRole('region', { name: 'Not billable yet (1)' });
  await expect(section.getByText('Change request not approved')).toBeVisible();
  await expect(section.getByText(/CR-1 v1 is rejected by the client/)).toBeVisible();
  await section.getByRole('link', { name: 'Open change request' }).click();
  await expect(page).toHaveURL(new RegExp(`/change-requests/${crId}$`));
  // A rejected version offers no task conversion.
  await expect(page.getByRole('button', { name: 'Create tasks from this version…' })).toHaveCount(
    0,
  );
});

test('SEC-004 another workspace’s billing page is a not-found page', async ({ page, browser }) => {
  const ws = await registerViaUi(page, 'Owner A', uniqueEmail('m4-iso-a'));
  const { projectId } = await baselinedProject(page, ws);
  await apiAs(page, 'POST', `/workspaces/${ws}/projects/${projectId}/billable-entries`, {
    kind: 'TIME',
    workDate: today(),
    minutes: 30,
    description: 'A private work entry',
  });
  const other = await browser.newContext();
  const intruder = await other.newPage();
  await registerViaUi(intruder, 'Owner B', uniqueEmail('m4-iso-b'));
  for (const path of [`/w/${ws}/projects/${projectId}/billing`, `/w/${ws}/projects/${projectId}`]) {
    await intruder.goto(path);
    await expect(
      intruder.getByText("This item doesn't exist or isn't in this workspace"),
    ).toBeVisible();
    await expect(intruder.getByText('A private work entry')).toHaveCount(0);
  }
  await other.close();
});

test('A11Y-007 axe: billing (lists and log-work form), overview and the convert dialog', async ({
  page,
}) => {
  const ws = await registerViaUi(page, 'Riya Sen', uniqueEmail('m4-axe'));
  const { projectId, requirementId } = await baselinedProject(page, ws);
  const crId = await crViaApi(page, ws, projectId, 'APPROVED');
  const base = `/workspaces/${ws}/projects/${projectId}/billable-entries`;
  await apiAs(page, 'POST', base, {
    kind: 'TIME',
    workDate: today(),
    minutes: 60,
    description: 'Eligible work',
    scope: { type: 'BASELINE', requirementId },
  });
  await apiAs(page, 'POST', base, {
    kind: 'TIME',
    workDate: today(),
    minutes: 30,
    description: 'Unlinked work',
  });
  await page.goto(`/w/${ws}/projects/${projectId}/billing`);
  await expect(page.getByRole('region', { name: 'Ready to invoice (1)' })).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Log work' }).click();
  await expect(page.getByRole('form', { name: 'Log work' })).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.goto(`/w/${ws}/projects/${projectId}`);
  await expect(page.getByRole('region', { name: 'Unbilled work' })).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.goto(`/w/${ws}/projects/${projectId}/change-requests/${crId}`);
  await page.getByRole('button', { name: 'Create tasks from this version…' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
});
