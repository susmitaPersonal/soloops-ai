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
      // Branch gate is 75%: the uncovered branches are `??` fallbacks required by
      // noUncheckedIndexedAccess on regex captures, which cannot be reached at runtime.
      thresholds: { statements: 90, branches: 75 },
    },
  },
});
