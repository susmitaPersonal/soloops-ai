import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against production builds (`npm run build` first). Rewrites in next.config.ts are
 * resolved at build time, so the API runs on the default API_INTERNAL_URL port (4000).
 */
const WEB_PORT = 3100;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'node stack.mjs',
      url: 'http://localhost:4000/readyz',
      timeout: 240_000,
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      command: `npx next start --port ${WEB_PORT}`,
      cwd: '../apps/web',
      url: `http://localhost:${WEB_PORT}/signin`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
