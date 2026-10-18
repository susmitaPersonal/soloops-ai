import { expect, test, type Page } from '@playwright/test';
import { registerViaUi, seriousAxeViolations, uniqueEmail, watchCsp } from './support';

/**
 * M2 Core Ops through the real UI, API and MongoDB: TC-E2E-01 steps 2–3 (E2E-WF-02, E2E-WF-03)
 * plus task planning (FR-014). No seeding and no authorisation bypass.
 */

/** Project tabs (design system §7.3), scoped to their nav landmark so "View requirements" links don't match. */
const projectTab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Project' }).getByRole('link', { name, exact: true });

async function addClient(page: Page, workspaceId: string, name: string) {
  await page.goto(`/w/${workspaceId}/clients`);
  await page.getByRole('button', { name: 'Add client' }).click();
  await page.getByLabel(/Client name/).fill(name);
  await page.getByRole('button', { name: 'Add client' }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]+$/);
  return page.url().split('/').at(-1) as string;
}

async function newProjectForClient(page: Page, name: string) {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel(/Project name/).fill(name);
  await page.getByLabel(/Hourly rate/).fill('1500');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
  return page.url().split('/').at(-1) as string;
}

async function addRequirement(page: Page, title: string, criteria: string) {
  await page.getByRole('button', { name: 'Add requirement' }).first().click();
  const form = page.getByRole('form', { name: 'Add requirement' });
  await form.getByLabel(/Title/).fill(title);
  await form.getByLabel(/Acceptance criteria/).fill(criteria);
  await form.getByRole('button', { name: 'Add requirement' }).click();
  await expect(form).toBeHidden();
}

test('E2E-WF-02/03 client → project → requirements → baseline → billable task', async ({
  page,
}) => {
  const csp = watchCsp(page);
  await registerViaUi(page, 'Riya Sen', uniqueEmail('m2-journey'));

  // E2E-WF-02 / AC-004.1: validation first, then a client and a project for it.
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('link', { name: 'Clients', exact: true })
    .click();
  await expect(page.getByText('Add your first client to start a project')).toBeVisible();
  await page.getByRole('button', { name: 'Add client' }).click();
  await page.getByRole('button', { name: 'Add client' }).click();
  await expect(page.getByRole('alert', { name: /There is a problem/ })).toBeFocused();
  await page.getByLabel(/Client name/).fill('Das Sweets Pvt Ltd');
  await page.getByLabel(/Email/).fill('orders@das-sweets.example.com');
  await page.getByRole('button', { name: 'Add client' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Das Sweets Pvt Ltd' })).toBeVisible();

  // AC-005.1: the project is created for this client with the workspace currency.
  const projectId = await newProjectForClient(page, 'Online ordering app');
  await expect(page.getByRole('heading', { level: 1, name: 'Online ordering app' })).toBeVisible();
  await expect(page.getByText(/Hourly · ₹1,500.00\/h · INR/)).toBeVisible();
  await expect(page.getByText('No baseline yet')).toBeVisible();

  // E2E-WF-03 / AC-006.1: requirements get REQ-1, REQ-2.
  await projectTab(page, 'Requirements').click();
  await expect(page.getByText('Record what the client asked for originally')).toBeVisible();
  await addRequirement(page, 'Menu browsing', 'Shows every item\nShows prices');
  await addRequirement(page, 'Customer login', 'Login with email and password');
  const drafts = page.getByRole('region', { name: /Draft \(not yet agreed\) — 2/ });
  await expect(drafts.getByText('REQ-1')).toBeVisible();
  await expect(drafts.getByText('REQ-2')).toBeVisible();

  // AC-007.1: the L2 dialog states what will be frozen; confirming creates Baseline 1.
  await page.getByRole('button', { name: 'Baseline scope…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Freeze 2 requirements as Baseline 1?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Create Baseline 1' }).click();
  await expect(page.getByRole('status')).toHaveText('Baseline 1 created: 2 requirements frozen.');
  const frozen = page.getByRole('region', { name: /Original scope · Baseline 1/ });
  await expect(frozen.getByText('REQ-1')).toBeVisible();
  // AC-007.2: frozen requirements offer no edit or delete.
  await expect(frozen.getByRole('button')).toHaveCount(0);
  // AC-007.3: nothing left to freeze.
  await expect(page.getByRole('button', { name: 'Baseline scope…' })).toBeDisabled();

  // FR-014 / AC-016.1: an internal billable task is refused; a REQ-1 billable task is created.
  await projectTab(page, 'Tasks').click();
  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel(/Title/).fill('Build menu screen');
  await page.getByLabel('Billable').check();
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByLabel('Billable')).toHaveAttribute('aria-invalid', 'true');
  await page
    .getByLabel(/Belongs to/)
    .selectOption({ label: 'Original scope · REQ-1 Menu browsing' });
  await page.getByLabel(/Assignee/).selectOption({ label: 'Me' });
  await page.getByRole('button', { name: 'Create task' }).click();
  const todo = page.getByRole('region', { name: 'To do' });
  await expect(todo.getByText('Build menu screen', { exact: true })).toBeVisible();
  await expect(todo.getByText('REQ-1')).toBeVisible();
  await expect(todo.getByText('· Billable')).toBeVisible();

  // AC-016.2: status change persists across a reload (real MongoDB).
  await page.getByLabel('Status of Build menu screen').selectOption('DONE');
  await expect(page.getByRole('status')).toHaveText('“Build menu screen” moved to Done.');
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Done' }).getByText('Build menu screen', { exact: true }),
  ).toBeVisible();

  // Overview reflects the baseline and the task counts.
  await projectTab(page, 'Overview').click();
  await expect(page.getByText(/Original scope: 1 baseline, 2 frozen requirements/)).toBeVisible();
  await expect(page.getByText('No baseline yet')).toBeHidden();
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
  expect(csp).toEqual([]);
});

test('BR-029 archiving a project makes it read-only in the UI', async ({ page }) => {
  const workspaceId = await registerViaUi(page, 'Archive Tester', uniqueEmail('m2-archive'));
  await addClient(page, workspaceId, 'Archive Client');
  await newProjectForClient(page, 'Old project');
  await page.getByRole('button', { name: 'Archive project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Archive Old project?' });
  await expect(dialog.getByText(/becomes read-only/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Archive project' }).click();
  await expect(page.getByText('Archived — read-only').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save project' })).toHaveCount(0);
  await projectTab(page, 'Requirements').click();
  await expect(page.getByRole('button', { name: 'Add requirement' })).toHaveCount(0);
  // Hidden from the default list, shown under Archived (AC-004.3 pattern).
  await page.goto(`/w/${workspaceId}/projects`);
  await expect(page.getByRole('link', { name: 'Old project' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Archived' }).click();
  await expect(page.getByRole('link', { name: 'Old project' })).toBeVisible();
});

test('SEC-004 AC-004.2 another workspace’s client and project URLs show the not-found page', async ({
  page,
  browser,
}) => {
  const workspaceId = await registerViaUi(page, 'Owner A', uniqueEmail('m2-iso-a'));
  const clientId = await addClient(page, workspaceId, 'Private Client');
  const projectId = await newProjectForClient(page, 'Private project');

  const other = await browser.newContext();
  const intruder = await other.newPage();
  await registerViaUi(intruder, 'Owner B', uniqueEmail('m2-iso-b'));
  for (const path of [
    `/w/${workspaceId}/clients/${clientId}`,
    `/w/${workspaceId}/projects/${projectId}`,
    `/w/${workspaceId}/projects/${projectId}/requirements`,
    `/w/${workspaceId}/projects/${projectId}/tasks`,
  ]) {
    await intruder.goto(path);
    await expect(
      intruder.getByText("This item doesn't exist or isn't in this workspace"),
    ).toBeVisible();
    await expect(intruder.getByText('Private Client')).toHaveCount(0);
    await expect(intruder.getByText('Private project')).toHaveCount(0);
  }
  await other.close();
});

test('A11Y-007 axe: clients, project overview, requirements and tasks have no serious or critical violations', async ({
  page,
}) => {
  const workspaceId = await registerViaUi(page, 'Axe Tester', uniqueEmail('m2-axe'));
  await addClient(page, workspaceId, 'Axe Client');
  const projectId = await newProjectForClient(page, 'Axe project');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.goto(`/w/${workspaceId}/clients`);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.goto(`/w/${workspaceId}/projects/${projectId}/requirements`);
  await addRequirement(page, 'Accessible requirement', 'Works with a keyboard');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Baseline scope…' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.goto(`/w/${workspaceId}/projects/${projectId}/tasks`);
  await page.getByRole('button', { name: 'New task' }).click();
  expect(await seriousAxeViolations(page)).toEqual([]);
});
