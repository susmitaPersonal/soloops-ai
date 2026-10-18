import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'correct horse battery';
export const uniqueEmail = (tag: string) =>
  `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** Collects CSP violations reported by the browser (scripts must carry the nonce, SEC-010). */
export function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text()))
      violations.push(msg.text());
  });
  return violations;
}

/** Registers through the real UI and returns the new workspace ID. */
export async function registerViaUi(page: Page, name: string, email: string) {
  await page.goto('/register');
  await page.getByLabel(/Your name/).fill(name);
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(/\/w\/[0-9a-f-]+\/settings\?welcome=1$/);
  return page.url().match(/\/w\/([0-9a-f-]+)\//)?.[1] as string;
}

/** axe with the WCAG 2.2 AA tag set; only serious and critical issues fail (A11Y-007). */
export async function seriousAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * Calls the real API as the signed-in browser user (same cookie, CSRF header and Origin as the
 * app). Used only to set up data for layout checks; it goes through every server-side rule.
 */
export async function apiAs(
  page: Page,
  method: 'POST' | 'PUT' | 'PATCH',
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const origin = new URL(page.url()).origin;
  const res = await page.request.fetch(`${origin}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'soloops',
      Origin: origin,
      ...headers,
    },
    data: JSON.stringify(body),
  });
  expect(res.status(), `${method} ${path}`).toBeLessThan(300);
  return res.json();
}

/**
 * A client and a project (₹1,500/h) with REQ-1 baselined, created through the real API as the
 * signed-in user. Returns the IDs. Used where the M2 steps are not what the test is about.
 */
export async function baselinedProject(page: Page, ws: string) {
  const base = `/workspaces/${ws}`;
  const client = await apiAs(page, 'POST', `${base}/clients`, { name: 'Das Sweets Pvt Ltd' });
  const project = await apiAs(page, 'POST', `${base}/projects`, {
    clientId: client.id,
    name: 'Online ordering app',
    billingModel: 'HOURLY',
    hourlyRateMinor: '150000',
  });
  const requirement = await apiAs(page, 'POST', `${base}/projects/${project.id}/requirements`, {
    title: 'Customer login',
    priority: 'MUST',
  });
  await apiAs(page, 'POST', `${base}/projects/${project.id}/baselines`, {});
  return {
    clientId: client.id as string,
    projectId: project.id as string,
    requirementId: requirement.id as string,
  };
}
