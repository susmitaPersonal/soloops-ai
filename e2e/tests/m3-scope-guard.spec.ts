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
 * M3 Scope Guard through the real UI, API and MongoDB (E2E-WF-04…07, 12, 14). AI uses the
 * deterministic `mock` provider configured in stack.mjs — never a real endpoint.
 */

const projectTab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Project' }).getByRole('link', { name, exact: true });

async function enableAiViaUi(page: Page, ws: string) {
  await page.goto(`/w/${ws}/settings`);
  await page.getByRole('button', { name: 'Turn AI on…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Turn on AI assistance?' });
  await expect(
    dialog.getByText(/no client contact details, rates, prices or invoices/),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Turn AI on' })).toBeDisabled();
  await dialog.getByLabel(/I understand what is sent/).check();
  await dialog.getByRole('button', { name: 'Turn AI on' }).click();
  await expect(page.getByText('On for this workspace')).toBeVisible();
}

async function recordCr(page: Page, ws: string, projectId: string, text: string) {
  await page.goto(`/w/${ws}/projects/${projectId}/change-requests/new`);
  await page.getByLabel(/Client’s message/).fill(text);
  await page.getByLabel(/Requested by/).fill('S. Das');
  await page.getByRole('button', { name: 'Record change request' }).click();
  await page.waitForURL(/\/change-requests\/[0-9a-f-]+$/);
  return page.url().split('/').at(-1) as string;
}

async function proposeDraft(page: Page, hours: string) {
  await page.getByLabel(/Confirmed effort to charge/).fill(hours);
  await page.getByLabel('Pricing').selectOption('TIME');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Draft saved/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Propose to client…' }).click();
  const dialog = page.getByRole('dialog', { name: /^Propose v\d+ to the client\?$/ });
  await expect(dialog.getByText(/is frozen/)).toBeVisible();
  await dialog.getByRole('button', { name: /^Propose v\d+$/ }).click();
  await expect(page.getByRole('button', { name: 'Record client decision…' })).toBeVisible();
}

async function recordDecision(
  page: Page,
  option: 'Approved' | 'Rejected' | 'Client asked for changes',
) {
  await page.getByRole('button', { name: 'Record client decision…' }).click();
  const dialog = page.getByRole('dialog', { name: /^Record client decision/ });
  await dialog.getByLabel(option, { exact: true }).check();
  await dialog.getByLabel(/Evidence/).fill('Email "Re: Proposal" 16 Oct');
  await dialog.getByLabel(/I confirm the client made this decision/).check();
  await dialog
    .getByRole('button', { name: /^Record (approval|rejection|change request)$/ })
    .click();
  await expect(dialog).toBeHidden();
}

test('E2E-WF-04…07 change request → AI estimate (mock) → propose → client approval of that exact version', async ({
  page,
}) => {
  const csp = watchCsp(page);
  const ws = await registerViaUi(page, 'Riya Sen', uniqueEmail('m3-journey'));
  const { projectId } = await baselinedProject(page, ws);
  await enableAiViaUi(page, ws);

  // E2E-WF-04 / AC-008.1: record the request as received.
  await page.goto(`/w/${ws}/projects/${projectId}`);
  await projectTab(page, 'Change requests').click();
  await expect(page.getByText('No extra requests yet')).toBeVisible();
  const crId = await recordCr(
    page,
    ws,
    projectId,
    'Can you also add login with WhatsApp OTP? It touches REQ-1.',
  );
  await expect(page.getByText('Not sent to the client yet')).toBeVisible();
  const original = page.locator('details').filter({ hasText: 'Original message (verbatim)' });
  await original.getByText('Original message (verbatim)').click();
  await expect(
    original.getByText('Can you also add login with WhatsApp OTP? It touches REQ-1.'),
  ).toBeVisible();

  // E2E-WF-05 / AC-009.1–.2: AI suggestion (mock), applied by a human; confirmed effort stays empty.
  await page.getByRole('button', { name: 'Analyse with AI' }).click();
  await expect(page.getByText('AI suggestion ready.')).toBeAttached();
  // FR-021 scope check: compared with the AGREED requirements, evidence resolved to REQ-1.
  const scopeCheck = page.getByRole('region', { name: 'Scope check' });
  await expect(scopeCheck).toContainText('Changes agreed scope');
  await expect(scopeCheck).toContainText('REQ-1 Customer login is changed by it');
  await expect(page.getByText(/Indicative cost \(calculated by SoloOps/)).toContainText(
    '₹9,000.00',
  );
  await page.getByRole('button', { name: 'Apply all fields' }).click();
  // The person can still correct the verdict before proposing; it is bound by the version hash.
  await expect(page.getByLabel(/Scope verdict/)).toHaveValue('CHANGES_AGREED_SCOPE');
  await expect(page.getByLabel(/Clarified description/)).toHaveValue(
    /one-time password delivered via WhatsApp/,
  );
  await expect(page.getByText('AI-suggested').first()).toBeVisible();
  await expect(page.getByLabel(/Confirmed effort to charge/)).toHaveValue('');
  // Unsaved changes block proposing.
  await expect(page.getByText('Save the draft first')).toBeVisible();

  // E2E-WF-06 / AC-010.1 / AC-011.2: server price, then propose (frozen, hashed).
  await proposeDraft(page, '9');
  await expect(page.getByText(/Price ₹13,500.00/).first()).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Scope summary' }).getByText('REQ-1'),
  ).toBeVisible();
  await expect(page.getByText('Proposal v1 (frozen)')).toBeVisible();

  // FR-027 summary shows the same reference.
  await page.getByRole('link', { name: 'View client summary' }).click();
  await expect(
    page.getByRole('heading', { name: /Change request CR-1 · Proposal v1/ }),
  ).toBeVisible();
  await expect(page.getByText(/not a guarantee of actual effort/)).toBeVisible();
  await page.goBack();

  // E2E-WF-07 / AC-012.1: record the approval against that exact version and hash.
  await recordDecision(page, 'Approved');
  await expect(page.getByText(/v1 is authorised/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start revision' })).toBeVisible();
  const history = page.getByRole('region', { name: 'History' });
  await expect(history.getByText('Client decision recorded · v1')).toBeVisible();
  await expect(history.getByText(/Approved by S\. Das/)).toBeVisible();

  // Persisted in MongoDB: a reload shows the same state.
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Scope summary' }).getByText(/v1 is authorised/),
  ).toBeVisible();
  expect(crId).toMatch(/^[0-9a-f-]{36}$/);
  expect(csp).toEqual([]);
});

test('E2E-WF-12 BR-011 BR-013 an edited proposal needs a new version and a new decision; rejection keeps v1', async ({
  page,
}) => {
  const ws = await registerViaUi(page, 'Revision Tester', uniqueEmail('m3-revise'));
  const { projectId } = await baselinedProject(page, ws);
  await recordCr(page, ws, projectId, 'Export orders to Excel');
  await page.getByLabel(/Clarified description/).fill('Export the order list as an Excel file.');
  await page.getByLabel(/Acceptance criteria/).fill('Download works for 1,000 orders');
  await page.getByLabel(/^Assumptions/).fill('Existing order data is clean');
  await proposeDraft(page, '4');
  await recordDecision(page, 'Approved');

  // A revision starts as v2 DRAFT; v1 stays authorised (REVISING).
  await page.getByRole('button', { name: 'Start revision' }).click();
  await page.waitForURL(/\?v=2$/);
  await expect(page.getByText('v1 remains authorised; v2 is pending')).toBeVisible();
  await page.getByLabel(/Confirmed effort to charge/).fill('6');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Draft saved/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Propose to client…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Propose v2' }).click();
  await recordDecision(page, 'Rejected');
  await expect(page.getByText(/v1 is authorised/)).toBeVisible();

  // Compare versions shows the price change.
  await page.getByRole('button', { name: 'Compare' }).click();
  const priceRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: /Price.*changed/ }) });
  await expect(priceRow.getByText('₹6,000.00 (time-based)')).toBeVisible();
  await expect(priceRow.getByText('₹9,000.00 (time-based)')).toBeVisible();
});

test('BR-010 a stale decision from a second tab is refused with a reload prompt', async ({
  page,
  context,
}) => {
  const ws = await registerViaUi(page, 'Stale Tester', uniqueEmail('m3-stale'));
  const { projectId } = await baselinedProject(page, ws);
  await recordCr(page, ws, projectId, 'Add loyalty points');
  await page.getByLabel(/Clarified description/).fill('Points per order.');
  await page.getByLabel(/Acceptance criteria/).fill('Points shown on receipt');
  await page.getByLabel(/^Assumptions/).fill('One point per rupee');
  await proposeDraft(page, '5');
  const url = page.url();

  // Tab B withdraws the proposal while tab A has the decision dialog open.
  const tabB = await context.newPage();
  await tabB.goto(url);
  await page.getByRole('button', { name: 'Record client decision…' }).click();
  await tabB.getByRole('button', { name: 'Withdraw proposal' }).click();
  await tabB.getByRole('dialog').getByRole('button', { name: 'Withdraw v1' }).click();
  await expect(tabB.getByRole('button', { name: 'Create new version' })).toBeVisible();

  const dialog = page.getByRole('dialog', { name: /^Record client decision/ });
  await dialog.getByLabel(/I confirm the client made this decision/).check();
  await dialog.getByRole('button', { name: 'Record approval' }).click();
  await expect(
    page.getByText('This proposal changed or was already decided — reload'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByRole('button', { name: 'Create new version' })).toBeVisible();
  await tabB.close();
});

test('E2E-WF-14 FR-051 an AI provider failure leaves the draft unchanged; the manual path still works', async ({
  page,
}) => {
  const ws = await registerViaUi(page, 'AI Failure Tester', uniqueEmail('m3-ai-fail'));
  const { projectId } = await baselinedProject(page, ws);
  await apiAs(page, 'PUT', `/workspaces/${ws}/ai-enablement`, {
    enabled: true,
    acknowledgeDisclosure: true,
  });
  await recordCr(page, ws, projectId, 'Add a dark theme [mock:server-error]');
  await page.getByRole('button', { name: 'Analyse with AI' }).click();
  await expect(page.getByText('The AI could not help this time').first()).toBeVisible();
  await expect(page.getByText(/Your draft is unchanged/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply all fields' })).toHaveCount(0);
  // Manual path.
  await page.getByLabel(/Clarified description/).fill('Dark colour theme across the app.');
  await page.getByLabel(/Acceptance criteria/).fill('Follows the system setting');
  await page.getByLabel(/^Assumptions/).fill('No custom brand colours');
  await proposeDraft(page, '3');
  await expect(page.getByText('Proposal v1 (frozen)')).toBeVisible();
});

test('FR-032 the approvals queue lists change requests awaiting a decision', async ({ page }) => {
  const ws = await registerViaUi(page, 'Queue Tester', uniqueEmail('m3-queue'));
  const { projectId } = await baselinedProject(page, ws);
  await recordCr(page, ws, projectId, 'Add order notes');
  await page.getByLabel(/Clarified description/).fill('Free-text notes on orders.');
  await page.getByLabel(/Acceptance criteria/).fill('Notes are saved');
  await page.getByLabel(/^Assumptions/).fill('Max 500 characters');
  await proposeDraft(page, '2');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('link', { name: 'Approvals', exact: true })
    .click();
  const row = page.getByRole('link', { name: /CR-1 Add order notes/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole('button', { name: 'Record client decision…' })).toBeVisible();
});

test('SEC-004 another workspace’s change request is a not-found page', async ({
  page,
  browser,
}) => {
  const ws = await registerViaUi(page, 'Owner A', uniqueEmail('m3-iso-a'));
  const { projectId } = await baselinedProject(page, ws);
  const crId = await recordCr(page, ws, projectId, 'A private request');
  const other = await browser.newContext();
  const intruder = await other.newPage();
  await registerViaUi(intruder, 'Owner B', uniqueEmail('m3-iso-b'));
  for (const path of [
    `/w/${ws}/projects/${projectId}/change-requests/${crId}`,
    `/w/${ws}/projects/${projectId}/change-requests/${crId}/versions/1/summary`,
    `/w/${ws}/approvals`,
  ]) {
    await intruder.goto(path);
    await expect(
      intruder.getByText("This item doesn't exist or isn't in this workspace"),
    ).toBeVisible();
    await expect(intruder.getByText('A private request')).toHaveCount(0);
  }
  await other.close();
});

test('A11Y-007 axe: change request (draft, AI panel, decision dialog), summary and approvals', async ({
  page,
}) => {
  const ws = await registerViaUi(page, 'Axe Tester', uniqueEmail('m3-axe'));
  const { projectId } = await baselinedProject(page, ws);
  await apiAs(page, 'PUT', `/workspaces/${ws}/ai-enablement`, {
    enabled: true,
    acknowledgeDisclosure: true,
  });
  await recordCr(page, ws, projectId, 'Accessible change');
  await page.getByRole('button', { name: 'Analyse with AI' }).click();
  await expect(page.getByRole('button', { name: 'Apply all fields' })).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Apply all fields' }).click();
  await proposeDraft(page, '2');
  await page.getByRole('button', { name: 'Record client decision…' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'View client summary' }).click();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.goto(`/w/${ws}/approvals`);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.goto(`/w/${ws}/projects/${projectId}/change-requests`);
  expect(await seriousAxeViolations(page)).toEqual([]);
});
