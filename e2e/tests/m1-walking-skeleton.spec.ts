import { expect, test } from '@playwright/test';
import { PASSWORD, uniqueEmail, watchCsp, registerViaUi, seriousAxeViolations } from './support';

test('M1 journey: register → settings saved → sign out → protected redirect → sign in returns', async ({
  page,
}) => {
  const csp = watchCsp(page);
  const email = uniqueEmail('journey');

  // TC-001.1: registration creates the workspace and signs in.
  const workspaceId = await registerViaUi(page, 'Riya Sen', email);
  await expect(page.getByText('Your workspace is ready')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible();
  await expect(page.getByText("Riya Sen's workspace").first()).toBeVisible();

  // TC-002.1: owner saves billing defaults.
  await page.getByLabel(/Tax label/).fill('GST');
  await page.getByLabel(/Tax rate/).fill('18');
  await page.getByLabel(/Default hourly rate/).fill('1500.50');
  await page.getByLabel(/Invoice number prefix/).fill('RS');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toHaveText('Settings saved.');

  await page.reload();
  await expect(page.getByLabel(/Tax rate/)).toHaveValue('18.00');
  await expect(page.getByLabel(/Default hourly rate/)).toHaveValue('1500.50');
  await expect(page.getByLabel(/Tax label/)).toHaveValue('GST');

  // TC-002.3 client-side: out-of-range tax rate never reaches the API.
  await page.getByLabel(/Tax rate/).fill('100.01');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('alert', { name: 'There is a problem' })).toBeFocused();

  // TC-001.4: sign out invalidates the session; protected pages redirect with a return path (ERR-008).
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/signin');
  await page.goto(`/w/${workspaceId}/settings`);
  await page.waitForURL(/\/signin\?returnTo=/);
  await expect(page.getByText(/Your session ended/)).toBeVisible();

  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`**/w/${workspaceId}/settings`);
  await expect(page.getByLabel(/Tax label/)).toHaveValue('GST');

  expect(csp, 'CSP violations').toEqual([]);
});

test('TC-001.3 wrong password shows the generic error', async ({ page }) => {
  const email = uniqueEmail('wrongpw');
  await registerViaUi(page, 'Arjun Das', email);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/signin');
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Password/).fill('not the right password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('form', { name: 'Sign in' }).getByRole('alert')).toContainText(
    'The email or password is incorrect.',
  );
});

test('SEC-004 another workspace URL shows the not-found page', async ({ page, browser }) => {
  const ownerA = await browser.newPage();
  const workspaceA = await registerViaUi(ownerA, 'Owner A', uniqueEmail('owner-a'));
  await ownerA.close();

  await registerViaUi(page, 'Owner B', uniqueEmail('owner-b'));
  const res = await page.goto(`/w/${workspaceA}/settings`);
  expect(res?.status()).toBe(404);
  await expect(page.getByText("This item doesn't exist or isn't in this workspace.")).toBeVisible();
});

test('SEC-010 pages carry a nonce-based CSP and security headers', async ({ page }) => {
  const res = await page.goto('/signin');
  const headers = res?.headers() ?? {};
  expect(headers['content-security-policy']).toMatch(
    /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
  );
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-powered-by']).toBeUndefined();
});

test('A11Y-007 axe: sign-in, register and settings have no serious or critical violations', async ({
  page,
}) => {
  await page.goto('/signin');
  expect(await seriousAxeViolations(page), 'sign-in').toEqual([]);
  await page.goto('/register');
  expect(await seriousAxeViolations(page), 'register').toEqual([]);
  await registerViaUi(page, 'Axe Tester', uniqueEmail('axe'));
  expect(await seriousAxeViolations(page), 'settings').toEqual([]);
});

test('A11Y-002 sign-in is keyboard operable, starting with the skip link', async ({ page }) => {
  await page.goto('/signin');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel(/Email/)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel(/Password/)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
});

test('ERR-008 a tampered or expired session cookie redirects to sign-in with the return path', async ({
  page,
  context,
}) => {
  const workspaceId = await registerViaUi(page, 'Cookie Tamper', uniqueEmail('tamper'));
  // The proxy only checks that a cookie exists; the API rejects the bad signature (401).
  await context.clearCookies();
  await context.addCookies([
    { name: 'soloops_sid', value: 'forged.token-value', url: 'http://localhost:3100' },
  ]);
  await page.goto(`/w/${workspaceId}/settings`);
  await page.waitForURL(/\/signin\?returnTo=/);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(`/w/${workspaceId}/settings`);
});
