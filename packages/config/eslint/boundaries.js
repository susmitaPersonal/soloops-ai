// Architecture boundary rules for the API modular monolith (ADR-0003, ADR-0011, TC-ARCH-01).
//
// `module-boundaries` checks relative imports inside `apps/api/src`:
//   1. A module may import another module only through that module's `index.ts` (public API).
//   2. The `ai` module may not import any domain module (BR-001, BR-002).
//   3. `platform/` code may not import any module (dependency direction: modules → platform).
// Package-level restrictions (mongodb, hono, next, node:*) use ESLint's built-in
// `no-restricted-imports`; see ./index.js.
import path from 'node:path';

const MODULES_SEGMENT = ['apps', 'api', 'src', 'modules'];
const PLATFORM_SEGMENT = ['apps', 'api', 'src', 'platform'];

function toPosixParts(p) {
  return path.resolve(p).split(path.sep).join('/').split('/');
}

function indexOfSegment(parts, segment) {
  for (let i = 0; i <= parts.length - segment.length; i += 1) {
    if (segment.every((s, j) => parts[i + j] === s)) return i;
  }
  return -1;
}

/** Returns { area: 'module' | 'platform' | 'other', module?: string, rest?: string[] } */
export function classify(filePath) {
  const parts = toPosixParts(filePath);
  const m = indexOfSegment(parts, MODULES_SEGMENT);
  if (m !== -1 && parts.length > m + MODULES_SEGMENT.length) {
    const start = m + MODULES_SEGMENT.length;
    return { area: 'module', module: parts[start], rest: parts.slice(start + 1) };
  }
  const p = indexOfSegment(parts, PLATFORM_SEGMENT);
  if (p !== -1) return { area: 'platform' };
  return { area: 'other' };
}

function isIndexEntry(rest) {
  if (rest.length === 0) return true; // `../workspace` resolves to its index
  if (rest.length !== 1) return false;
  return /^index(\.(ts|js|mjs|tsx))?$/.test(rest[0]);
}

export function checkImport(importerPath, source) {
  if (!source.startsWith('.')) return null;
  const importer = classify(importerPath);
  if (importer.area === 'other') return null;
  const target = classify(path.resolve(path.dirname(importerPath), source));
  if (target.area !== 'module') return null;

  if (importer.area === 'platform') {
    return `platform code must not import module "${target.module}" (modules depend on platform, never the reverse).`;
  }
  if (target.module === importer.module) return null;
  if (importer.module === 'ai') {
    return `the ai module must not import domain module "${target.module}" (BR-001: AI has no write path to domain modules).`;
  }
  if (!isIndexEntry(target.rest)) {
    return `import module "${target.module}" only through its public API (../${target.module}/index), not its internals.`;
  }
  return null;
}

const moduleBoundariesRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce SoloOps API module boundaries (ADR-0003, ADR-0011).' },
    schema: [],
    messages: { violation: 'Architecture boundary: {{reason}}' },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    function check(node, sourceNode) {
      if (!sourceNode || typeof sourceNode.value !== 'string') return;
      const reason = checkImport(filename, sourceNode.value);
      if (reason) context.report({ node, messageId: 'violation', data: { reason } });
    }
    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
    };
  },
};

export const boundariesPlugin = {
  meta: { name: 'eslint-plugin-soloops' },
  rules: { 'module-boundaries': moduleBoundariesRule },
};
