// TC-ARCH-01: architecture boundary rules (ADR-0003, ADR-0011, ADR-0012) are enforced by lint.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { soloopsConfig } from '../eslint/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: soloopsConfig() });

async function lint(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return (result?.messages ?? []).map((m) => `${m.ruleId}: ${m.message}`);
}

const boundaryErrors = (msgs: string[]) =>
  msgs.filter(
    (m) => m.startsWith('no-restricted-imports') || m.startsWith('soloops/module-boundaries'),
  );

describe('TC-ARCH-01 lint boundaries', () => {
  it('only apps/api/src/platform/db may import mongodb', async () => {
    expect(
      boundaryErrors(
        await lint(
          'apps/api/src/modules/workspace/x.ts',
          "import { MongoClient } from 'mongodb';\nexport const c = MongoClient;",
        ),
      ),
    ).toHaveLength(1);
    expect(
      boundaryErrors(
        await lint(
          'apps/api/src/platform/db/x.ts',
          "import { MongoClient } from 'mongodb';\nexport const c = MongoClient;",
        ),
      ),
    ).toHaveLength(0);
  });

  it('modules import each other only through index.ts', async () => {
    const file = 'apps/api/src/modules/identity/service.ts';
    expect(
      boundaryErrors(
        await lint(file, "import { a } from '../workspace/repository';\nexport const x = a;"),
      ),
    ).toHaveLength(1);
    expect(
      boundaryErrors(
        await lint(file, "import { a } from '../workspace/index';\nexport const x = a;"),
      ),
    ).toHaveLength(0);
    expect(
      boundaryErrors(await lint(file, "import { a } from '../workspace';\nexport const x = a;")),
    ).toHaveLength(0);
    expect(
      boundaryErrors(
        await lint(file, "import { a } from './domain/password';\nexport const x = a;"),
      ),
    ).toHaveLength(0);
  });

  it('BR-001 the ai module cannot import any domain module, even via index.ts', async () => {
    const msgs = boundaryErrors(
      await lint(
        'apps/api/src/modules/ai/service.ts',
        "import { a } from '../scope-guard/index';\nexport const x = a;",
      ),
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('BR-001');
  });

  it('platform code cannot import modules', async () => {
    expect(
      boundaryErrors(
        await lint(
          'apps/api/src/platform/http/x.ts',
          "import { a } from '../../modules/identity';\nexport const x = a;",
        ),
      ),
    ).toHaveLength(1);
  });

  it.each([
    ["import { MongoClient } from 'mongodb';"],
    ["import { Hono } from 'hono';"],
    ["import { redirect } from 'next/navigation';"],
    ["import { readFileSync } from 'node:fs';"],
    ["import { readFileSync } from 'fs';"],
    ["import { createApp } from '@soloops/api';"],
    ["import { x } from '../../../apps/api/src/app';"],
  ])(
    'packages/contracts and packages/api-client are isomorphic: %s is refused',
    async (statement) => {
      const code = `${statement}\nexport const used = 1;`;
      expect(
        boundaryErrors(await lint('packages/contracts/src/x.ts', code)).length,
      ).toBeGreaterThan(0);
      expect(
        boundaryErrors(await lint('packages/api-client/src/x.ts', code)).length,
      ).toBeGreaterThan(0);
    },
  );

  it('apps/web cannot import mongodb, hono or API internals', async () => {
    for (const statement of [
      "import { MongoClient } from 'mongodb';",
      "import { Hono } from 'hono';",
      "import { createApp } from '@soloops/api';",
    ]) {
      expect(
        boundaryErrors(
          await lint('apps/web/src/app/page.tsx', `${statement}\nexport const used = 1;`),
        ),
        statement,
      ).toHaveLength(1);
    }
    expect(
      boundaryErrors(
        await lint(
          'apps/web/src/app/page.tsx',
          "import { apiPaths } from '@soloops/contracts';\nexport const p = apiPaths;",
        ),
      ),
    ).toHaveLength(0);
  });

  it('apps/api cannot import UI code or the browser client', async () => {
    expect(
      boundaryErrors(
        await lint(
          'apps/api/src/modules/workspace/x.ts',
          "import { createApiClient } from '@soloops/api-client';\nexport const c = createApiClient;",
        ),
      ),
    ).toHaveLength(1);
  });
});

describe('TC-ARCH-01 boundary rule edge cases', () => {
  it('re-exports and dynamic imports are checked too', async () => {
    const file = 'apps/api/src/modules/identity/x.ts';
    expect(boundaryErrors(await lint(file, "export * from '../workspace/service';"))).toHaveLength(
      1,
    );
    expect(
      boundaryErrors(await lint(file, "export { a } from '../workspace/repository';")),
    ).toHaveLength(1);
    expect(
      boundaryErrors(
        await lint(file, "export async function f() { return import('../workspace/service'); }"),
      ),
    ).toHaveLength(1);
  });

  it('package imports and files outside apps/api are not affected by the module rule', async () => {
    expect(
      boundaryErrors(
        await lint(
          'apps/api/src/modules/identity/x.ts',
          "import { z } from 'zod';\nexport const s = z;",
        ),
      ),
    ).toHaveLength(0);
    expect(
      boundaryErrors(
        await lint(
          'scripts/tool.mjs',
          "import x from '../apps/api/src/modules/ai/index.js';\nexport default x;",
        ),
      ),
    ).toHaveLength(0);
  });
});
