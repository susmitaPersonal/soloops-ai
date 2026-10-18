// Shared ESLint flat config for the SoloOps monorepo.
// Boundary rules implement the "Boundary enforcement" table in docs/architecture/monorepo-structure.md
// and are verified by TC-ARCH-01 (packages/config/test/boundaries.test.ts).
import tseslint from 'typescript-eslint';
import { boundariesPlugin } from './boundaries.js';

const NODE_BUILTINS = [
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'crypto',
  'dns',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'net',
  'os',
  'path',
  'process',
  'stream',
  'tls',
  'url',
  'util',
  'worker_threads',
  'zlib',
];

const isomorphicMessage =
  'packages/contracts and packages/api-client are isomorphic: no server, framework, Node built-in or apps/* imports (ADR-0011).';

export const isomorphicRestrictions = {
  patterns: [
    {
      group: [
        'node:*',
        ...NODE_BUILTINS,
        'mongodb',
        'mongodb/*',
        'hono',
        'hono/*',
        '@hono/*',
        'next',
        'next/*',
        'react',
        'react/*',
        '@soloops/api',
        '@soloops/api/*',
        '@soloops/web',
        '@soloops/web/*',
        '**/apps/**',
      ],
      message: isomorphicMessage,
    },
  ],
};

export const webRestrictions = {
  patterns: [
    {
      group: [
        'mongodb',
        'mongodb/*',
        'hono',
        'hono/*',
        '@hono/*',
        '@soloops/api',
        '@soloops/api/*',
        '**/apps/api/**',
      ],
      message:
        'apps/web is presentation only: no database, API internals or server framework imports (ADR-0009, ADR-0011).',
    },
  ],
};

export const apiRestrictions = {
  patterns: [
    {
      group: ['mongodb', 'mongodb/*'],
      message:
        'Only apps/api/src/platform/db may import mongodb. Use TenantCollection / GlobalCollection from platform/db (ADR-0012).',
    },
    {
      group: [
        'next',
        'next/*',
        'react',
        'react/*',
        '@soloops/web',
        '@soloops/web/*',
        '@soloops/api-client',
      ],
      message: 'apps/api must not depend on UI code or the browser API client (ADR-0011).',
    },
  ],
};

/** @returns {import('eslint').Linter.Config[]} */
export function soloopsConfig() {
  return [
    {
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.next/**',
        '**/coverage/**',
        '**/playwright-report/**',
        '**/test-results/**',
        '**/next-env.d.ts',
      ],
    },
    ...tseslint.configs.recommended,
    {
      files: ['**/*.{ts,tsx,mts,js,mjs}'],
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': 'error',
        eqeqeq: ['error', 'always'],
        'no-eval': 'error',
      },
    },
    {
      files: ['packages/contracts/src/**/*.ts', 'packages/api-client/src/**/*.ts'],
      rules: { 'no-restricted-imports': ['error', isomorphicRestrictions] },
    },
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      rules: { 'no-restricted-imports': ['error', webRestrictions] },
    },
    {
      files: ['apps/api/src/**/*.ts'],
      ignores: ['apps/api/src/platform/db/**'],
      rules: { 'no-restricted-imports': ['error', apiRestrictions] },
    },
    {
      files: ['apps/api/src/**/*.ts'],
      plugins: { soloops: boundariesPlugin },
      rules: { 'soloops/module-boundaries': 'error' },
    },
  ];
}
