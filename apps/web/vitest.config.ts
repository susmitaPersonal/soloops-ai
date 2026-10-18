import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Component and unit tests for Client Components (RTL + jsdom). Server Components are covered by E2E (ADR-0014). */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Async Server Components, the request proxy and the server-only fetch helper run only in
      // Next.js and are covered by Playwright (e2e/).
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/app/**',
        'src/proxy.ts',
        'src/lib/api/server.ts',
      ],
      reporter: ['text-summary', 'text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        'src/features/**': { statements: 80, branches: 70 },
        'src/components/**': { statements: 80, branches: 70 },
        'src/lib/**': { statements: 80, branches: 70 },
      },
    },
  },
});
