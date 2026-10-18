import { defineConfig } from 'vitest/config';

/**
 * API tests (ADR-0014):
 * - unit:        src/**\/*.test.ts  (pure functions, no database)
 * - integration: test/**\/*.test.ts (in-process Hono app.request() + real MongoDB replica set)
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // The first run downloads a mongod binary for mongodb-memory-server.
    hookTimeout: 180_000,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'migrations/**/*.ts'],
      // Process entry points only wire dependencies; they are exercised by the E2E suite. The opt-in
      // real-model evaluation runner (eval-ai.ts) needs a real endpoint and never runs in CI.
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/migrate.ts', 'src/eval-ai.ts'],
      reporter: ['text-summary', 'text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        'src/platform/**': { statements: 80, branches: 70 },
        'src/modules/**': { statements: 80, branches: 70 },
      },
    },
  },
});
