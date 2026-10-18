import { expect, test, type Page } from '@playwright/test';
import {
  apiAs,
  baselinedProject,
  expectNoHorizontalOverflow,
  registerViaUi,
  seriousAxeViolations,
  uniqueEmail,
  watchCsp,
} from './support';

/**
 * M5 invoices and the complete principal workflow (TC-E2E-01, E2E-WF-10, E2E-WF-11) through the
 * real UI, API and MongoDB. The journey test uses the UI only — no API set-up, no seeding. AI is
 * the deterministic `mock` provider from stack.mjs.
 */

const projectTab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Project' }).getByRole('link', { name, exact: true });
const today = () => new Date().toISOString().slice(0, 10);

async function chooseOption(page: Page, label: RegExp, match: RegExp) {
  const select = page.getByLabel(label);
  const options = await select.locator('option').allTextContents();
  const found = options.find((o) => match.test(o));
  expect(found, `${String(match)} in ${options.join(' | ')}`).toBeTruthy();
  await select.selectOption({ label: found as string });
}

test('TC-E2E-01 principal workflow: request → AI estimate → approval → tasks → work → invoice issued → void', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const csp = watchCsp(page);
  const ws = await registerViaUi(page, 'Riya Sen', uniqueEmail('journey-full'));

  // 1. Workspace billing settings (FR-005) and AI opt-in (FR-054).
  await page.getByLabel(/Tax label/).fill('GST');
  await page.getByLabel(/Tax rate/).fill('18');
  await page.getByLabel(/Invoice number prefix/).fill('RS');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toHaveText('Settings saved.');
  await page.getByRole('button', { name: 'Turn AI on…' }).click();
  const ai = page.getByRole('dialog', { name: 'Turn on AI assistance?' });
  await ai.getByLabel(/I understand what is sent/).check();
  await ai.getByRole('button', { name: 'Turn AI on' }).click();
  await expect(page.getByText('On for this workspace')).toBeVisible();

  // 2. Client and project (FR-010, FR-011).
  await page.goto(`/w/${ws}/clients`);
  await page.getByRole('button', { name: 'Add client' }).click();
  await page.getByLabel(/Client name/).fill('Das Sweets Pvt Ltd');
  await page.getByRole('button', { name: 'Add client' }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]+$/);
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel(/Project name/).fill('Online ordering app');
  await page.getByLabel(/Hourly rate/).fill('1500');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
  const projectId = page.url().split('/').at(-1) as string;

  // 3. Original scope: a requirement, baselined (FR-012, FR-013).
  await projectTab(page, 'Requirements').click();
  await page.getByRole('button', { name: 'Add requirement' }).first().click();
  const reqForm = page.getByRole('form', { name: 'Add requirement' });
  await reqForm.getByLabel(/Title/).fill('Customer login');
  await reqForm.getByLabel(/Acceptance criteria/).fill('Login with email and password');
  await reqForm.getByRole('button', { name: 'Add requirement' }).click();
  await expect(reqForm).toBeHidden();
  await page.getByRole('button', { name: 'Baseline scope…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create Baseline 1' }).click();
  await expect(page.getByRole('status')).toHaveText(/Baseline 1 created/);

  // 4. A change request, AI analysis (mock, advisory), human-confirmed effort, propose (FR-020–024).
  await projectTab(page, 'Change requests').click();
  await page.goto(`/w/${ws}/projects/${projectId}/change-requests/new`);
  await page.getByLabel(/Client’s message/).fill('Can you also add login with WhatsApp OTP?');
  await page.getByLabel(/Requested by/).fill('S. Das');
  await page.getByRole('button', { name: 'Record change request' }).click();
  await page.waitForURL(/\/change-requests\/[0-9a-f-]+$/);
  await page.getByRole('button', { name: 'Analyse with AI' }).click();
  await expect(page.getByText('AI suggestion ready.')).toBeAttached();
  await page.getByRole('button', { name: 'Apply all fields' }).click();
  await page.getByLabel(/Confirmed effort to charge/).fill('9');
  await page.getByLabel('Pricing').selectOption('TIME');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Draft saved/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Propose to client…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Propose v1' }).click();

  // 5. The client's approval of that exact version (FR-025, BR-010).
  await page.getByRole('button', { name: 'Record client decision…' }).click();
  const decision = page.getByRole('dialog', { name: /^Record client decision/ });
  await decision.getByLabel('Approved', { exact: true }).check();
  await decision.getByLabel(/I confirm the client made this decision/).check();
  await decision.getByRole('button', { name: 'Record approval' }).click();
  await expect(decision).toBeHidden();

  // 6. Delivery tasks from the approved version (FR-030).
  await page.getByRole('button', { name: 'Create tasks from this version…' }).click();
  const convert = page.getByRole('dialog', { name: /^Create tasks from CR-1 v1/ });
  await convert.getByRole('button', { name: /^Create \d+ tasks?$/ }).click();
  await expect(convert).toBeHidden();

  // 7. Billable work on one of those tasks (FR-040, FR-041).
  await page.goto(`/w/${ws}/projects/${projectId}/billing`);
  await page.getByRole('button', { name: 'Log work' }).click();
  const form = page.getByRole('form', { name: 'Log work' });
  await form.getByLabel('Hours').fill('2');
  await chooseOption(page, /Belongs to/, /^Task · /);
  await form.getByLabel(/Description/).fill('OTP verification endpoint');
  await form.getByRole('button', { name: 'Log work' }).click();
  await expect(page.getByText('Work logged. It is ready to invoice.')).toBeVisible();

  // 8. Invoice draft from the eligible work, with a manual adjustment (FR-042, FR-043, BR-025).
  await page.getByRole('checkbox', { name: 'Select “OTP verification endpoint”' }).check();
  await page.getByRole('button', { name: 'Create invoice draft (1)' }).click();
  await page.waitForURL(/\/billing\/invoices\/[0-9a-f-]+$/);
  const invoiceUrl = page.url();
  await expect(page.getByRole('heading', { name: 'Invoice draft' })).toBeVisible();
  await page.getByRole('button', { name: '+ Adjustment' }).click();
  await page.getByLabel(/^Description/).fill('Goodwill discount');
  await page.getByLabel(/^Amount/).fill('-500');
  await page.getByLabel(/^Reason/).fill('Agreed on call');
  await page.getByRole('button', { name: 'Add adjustment' }).click();
  const lines = page.getByRole('region', { name: 'Lines' });
  await expect(lines.getByText('Manual')).toBeVisible();
  // BR-020: 2 h × ₹1,500 = ₹3,000; − ₹500 = ₹2,500; GST 18% = ₹450; total ₹2,950.
  await expect(lines.getByText('₹2,950.00')).toBeVisible();
  await expect(lines.getByText('₹450.00')).toBeVisible();

  // The draft print view is watermarked (AC-020.5).
  await page.getByRole('link', { name: /Preview print/ }).click();
  await page.waitForURL(/\/print$/);
  await expect(page.getByText(/^DRAFT — not issued/)).toBeVisible();
  await page.goto(invoiceUrl);

  // 9. The owner issues it: number RS-0001, frozen (FR-044, AC-020.1).
  await page.getByRole('button', { name: 'Issue invoice…' }).click();
  const issueDialog = page.getByRole('dialog', { name: 'Issue this invoice?' });
  await issueDialog.getByLabel('I have reviewed this invoice.').check();
  await issueDialog.getByRole('button', { name: 'Issue invoice' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Invoice RS-0001' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Remove line/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Print', exact: true }).click();
  await page.waitForURL(/\/print$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Invoice RS-0001' })).toBeVisible();
  await expect(page.getByText(/^DRAFT/)).toHaveCount(0);
  await expect(page.getByText('₹2,950.00')).toBeVisible();
  await page.goto(invoiceUrl);

  // The billed work is no longer offered as ready to invoice.
  await page.goto(`/w/${ws}/projects/${projectId}/billing`);
  await expect(page.getByText('No unbilled work')).toBeVisible();

  // 10. Void with a reason: number kept, work back to unbilled (FR-046, AC-021.1).
  await page.goto(invoiceUrl);
  await page.getByRole('button', { name: 'Void…' }).click();
  const voidDialog = page.getByRole('dialog', { name: 'Void RS-0001?' });
  await voidDialog.getByLabel(/Reason/).fill('Issued to the wrong contact');
  await voidDialog.getByRole('button', { name: 'Void invoice' }).click();
  await expect(page.getByText('This invoice is void')).toBeVisible();
  await page.goto(`/w/${ws}/billing?status=VOID`);
  await expect(page.getByRole('link', { name: 'RS-0001 · Das Sweets Pvt Ltd' })).toBeVisible();
  await page.goto(`/w/${ws}/projects/${projectId}/billing`);
  await expect(page.getByRole('region', { name: 'Ready to invoice (1)' })).toBeVisible();
  expect(csp).toEqual([]);
});

test('E2E-WF-11 BR-017 work on a rejected proposal cannot be put on an invoice draft', async ({
  page,
}) => {
  const ws = await registerViaUi(page, 'Riya Sen', uniqueEmail('m5-rejected'));
  const { projectId } = await baselinedProject(page, ws);
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
      clarifiedDescription: 'OTP login',
      acceptanceCriteria: ['OTP arrives'],
      assumptions: ['Verified phones'],
      confirmedEffortMinutes: 60,
      pricing: { mode: 'TIME' },
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
  await apiAs(
    page,
    'POST',
    `${base}/change-requests/${cr.id}/versions/1/decisions`,
    {
      decision: 'REJECTED',
      contentHash: proposed.versions[0].contentHash,
      clientDecisionMakerName: 'S. Das',
      decidedOn: today(),
      channel: 'EMAIL',
    },
    { 'Idempotency-Key': `e2e-rej-${Date.now()}` },
  );
  const entry = await apiAs(page, 'POST', `${base}/projects/${projectId}/billable-entries`, {
    kind: 'TIME',
    workDate: today(),
    minutes: 90,
    description: 'Started OTP work early',
    scope: { type: 'CHANGE_REQUEST', changeRequestId: cr.id, versionNumber: 1 },
  });

  // The UI offers no way to select it…
  await page.goto(`/w/${ws}/projects/${projectId}/billing`);
  await expect(page.getByRole('region', { name: 'Not billable yet (1)' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Started OTP work early/ })).toHaveCount(0);
  // …and the API refuses it even when asked directly (BR-017, AC-019.2).
  const origin = new URL(page.url()).origin;
  const res = await page.request.post(`${origin}/api/v1${base}/invoices`, {
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'soloops', Origin: origin },
    data: JSON.stringify({ projectId, entryIds: [entry.id] }),
  });
  expect(res.status()).toBe(422);
  expect((await res.json()).code).toBe('NOT_ELIGIBLE');
});

test('A11Y-007 and NFR-012 invoice draft, issued invoice, print view and billing list', async ({
  page,
}) => {
  const ws = await registerViaUi(page, 'Riya Sen', uniqueEmail('m5-axe'));
  const { projectId, requirementId } = await baselinedProject(page, ws);
  const base = `/workspaces/${ws}`;
  const entry = await apiAs(page, 'POST', `${base}/projects/${projectId}/billable-entries`, {
    kind: 'TIME',
    workDate: today(),
    minutes: 135,
    description: 'A long description of the OTP verification endpoint work on a slow day',
    scope: { type: 'BASELINE', requirementId },
  });
  const inv = await apiAs(page, 'POST', `${base}/invoices`, { projectId, entryIds: [entry.id] });
  const url = `/w/${ws}/billing/invoices/${inv.id}`;
  for (const path of [url, `${url}/print`, `/w/${ws}/billing`]) {
    await page.goto(path);
    await expect(page.locator('main h1').first()).toBeVisible();
    expect(await seriousAxeViolations(page), path).toEqual([]);
    await page.setViewportSize({ width: 360, height: 800 });
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 1280, height: 800 });
  }
  await page.goto(url);
  await page.getByRole('button', { name: 'Issue invoice…' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
});
