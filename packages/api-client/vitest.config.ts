import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text-summary', 'text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { statements: 90, branches: 80 },
    },
  },
});
