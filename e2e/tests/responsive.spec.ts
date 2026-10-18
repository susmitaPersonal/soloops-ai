import { expect, test } from '@playwright/test';
import {
  apiAs,
  baselinedProject,
  expectNoHorizontalOverflow,
  registerViaUi,
  uniqueEmail,
} from './support';

// NFR-012: usable from 360 px width upward — no horizontal scrolling.
test.use({ viewport: { width: 360, height: 740 } });

test('NFR-012 sign-in, register and settings fit a 360 px viewport', async ({ page }) => {
  await page.goto('/signin');
  await expectNoHorizontalOverflow(page);
  await page.goto('/register');
  await expectNoHorizontalOverflow(page);
  await page.getByLabel(/Your name/).fill('Narrow Screen');
  await page.getByLabel(/Email/).fill(`narrow-${Date.now()}@example.com`);
  await page.getByLabel(/^Password/).fill('correct horse battery');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(/\/settings\?welcome=1$/);
  await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('NFR-012 Core Ops screens (clients, projects, requirements, tasks) fit a 360 px viewport', async ({
  page,
}) => {
  const ws = await registerViaUi(page, 'Narrow Core Ops', uniqueEmail('narrow-m2'));
  const base = `/workspaces/${ws}`;
  const client = await apiAs(page, 'POST', `${base}/clients`, {
    name: 'A client with a rather long name, Pvt Ltd',
    email: 'billing-department@a-long-client-domain.example.com',
  });
  const project = await apiAs(page, 'POST', `${base}/projects`, {
    clientId: client.id,
    name: 'An online ordering app for three outlets',
    billingModel: 'HOURLY',
    hourlyRateMinor: '150000',
  });
  const req = await apiAs(page, 'POST', `${base}/projects/${project.id}/requirements`, {
    title: 'Customers browse the full menu with prices and photos',
    acceptanceCriteria: ['Shows every item', 'Shows prices'],
    priority: 'MUST',
  });
  await apiAs(page, 'POST', `${base}/projects/${project.id}/baselines`, {});
  await apiAs(page, 'POST', `${base}/projects/${project.id}/tasks`, {
    title: 'Build the menu screen with category filters',
    billable: true,
    scope: { type: 'BASELINE', requirementId: req.id },
  });
  for (const path of [
    `/w/${ws}/clients`,
    `/w/${ws}/clients/${client.id}`,
    `/w/${ws}/projects`,
    `/w/${ws}/projects/${project.id}`,
    `/w/${ws}/projects/${project.id}/requirements`,
    `/w/${ws}/projects/${project.id}/tasks`,
  ]) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('NFR-012 Scope Guard screens (change requests, detail, summary, approvals) fit a 360 px viewport', async ({
  page,
}) => {
  const ws = await registerViaUi(page, 'Narrow Scope Guard', uniqueEmail('narrow-m3'));
  const { projectId, requirementId } = await baselinedProject(page, ws);
  const cr = await apiAs(page, 'POST', `/workspaces/${ws}/projects/${projectId}/change-requests`, {
    rawRequestText:
      'A long client message about adding WhatsApp OTP login with a very long sentence',
    sourceChannel: 'CHAT',
    requestedByName: 'A client contact with a long name',
    receivedOn: '2026-10-01',
  });
  await apiAs(
    page,
    'PATCH',
    `/workspaces/${ws}/change-requests/${cr.id}/versions/1`,
    {
      clarifiedDescription: 'Phone login with a one-time password delivered over WhatsApp',
      acceptanceCriteria: ['OTP arrives within 30 seconds on a slow connection'],
      assumptions: ['Phone numbers are already verified'],
      affectedRequirementIds: [requirementId],
      confirmedEffortMinutes: 540,
      pricing: { mode: 'TIME' },
    },
    { 'If-Match': '"1"' },
  );
  await apiAs(
    page,
    'POST',
    `/workspaces/${ws}/change-requests/${cr.id}/versions/1/propose`,
    {},
    {
      'If-Match': '"2"',
    },
  );
  for (const path of [
    `/w/${ws}/projects/${projectId}/change-requests`,
    `/w/${ws}/projects/${projectId}/change-requests/${cr.id}`,
    `/w/${ws}/projects/${projectId}/change-requests/${cr.id}/versions/1/summary`,
    `/w/${ws}/approvals`,
  ]) {
    await page.goto(path);
    await expect(page.locator('main h1, main h2').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('NFR-012 billing and overview screens fit a 360 px viewport', async ({ page }) => {
  const ws = await registerViaUi(page, 'Narrow Billing', uniqueEmail('narrow-m4'));
  const { projectId, requirementId } = await baselinedProject(page, ws);
  const entries = `/workspaces/${ws}/projects/${projectId}/billable-entries`;
  const workDate = new Date().toISOString().slice(0, 10);
  await apiAs(page, 'POST', entries, {
    kind: 'TIME',
    workDate,
    minutes: 135,
    description: 'A long description of OTP verification endpoint work done on a slow day',
    scope: { type: 'BASELINE', requirementId },
  });
  await apiAs(page, 'POST', entries, {
    kind: 'FIXED',
    workDate,
    amountMinor: '123456789',
    description: 'Unlinked fixed-price work that is not billable yet',
  });
  for (const path of [`/w/${ws}/projects/${projectId}/billing`, `/w/${ws}/projects/${projectId}`]) {
    await page.goto(path);
    await expect(page.locator('main h2').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  await page.goto(`/w/${ws}/projects/${projectId}/billing`);
  await page.getByRole('button', { name: 'Log work' }).click();
  await expect(page.getByRole('form', { name: 'Log work' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
