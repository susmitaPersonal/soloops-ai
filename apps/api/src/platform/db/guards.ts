/**
 * Filter, update and pipeline guards used by the collection wrappers (ADR-0012, security-architecture.md).
 * - The tenant key can never be set or overridden by callers: it is always injected.
 * - Server-side JavaScript operators are refused, so a filter can never execute code.
 * - Aggregations cannot read other collections or write output (cross-tenant escape hatches).
 */
const FORBIDDEN_OPERATORS = new Set(['$where', '$function', '$accumulator']);
const FORBIDDEN_PIPELINE_STAGES = new Set([
  '$lookup',
  '$unionWith',
  '$graphLookup',
  '$out',
  '$merge',
]);

export class UnsafeQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeQueryError';
  }
}

function walk(value: unknown, visit: (key: string) => void, depth = 0): void {
  if (depth > 32) throw new UnsafeQueryError('Query is nested too deeply.');
  if (Array.isArray(value)) {
    for (const v of value) walk(v, visit, depth + 1);
    return;
  }
  if (value === null || typeof value !== 'object' || value instanceof Date) return;
  // Only plain objects are traversed (bigint, Buffer and similar values are leaves).
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return;
  for (const [key, v] of Object.entries(value)) {
    visit(key);
    walk(v, visit, depth + 1);
  }
}

export function assertSafeFilter(filter: object, tenantKey: string): void {
  walk(filter, (key) => {
    if (key === tenantKey) {
      throw new UnsafeQueryError(
        `Filters must not set "${tenantKey}"; it is injected by the tenant scope.`,
      );
    }
    if (FORBIDDEN_OPERATORS.has(key)) {
      throw new UnsafeQueryError(`Operator ${key} is not allowed.`);
    }
  });
}

/** Pipelines: filter rules everywhere, plus no stage that reads other collections or writes. */
export function assertSafePipeline(pipeline: object[], tenantKey: string): void {
  for (const stage of pipeline) {
    assertSafeFilter(stage, tenantKey);
    walk(stage, (key) => {
      if (FORBIDDEN_PIPELINE_STAGES.has(key)) {
        throw new UnsafeQueryError(
          `Aggregation stage ${key} is not allowed through a scoped collection.`,
        );
      }
    });
  }
}

export function assertSafeUpdate(update: object, tenantKey: string): void {
  const protectedField = (field: string) =>
    field === tenantKey || field === '_id' || field.startsWith(`${tenantKey}.`);
  for (const [op, fields] of Object.entries(update)) {
    if (!op.startsWith('$')) {
      throw new UnsafeQueryError('Updates must use update operators such as $set.');
    }
    if (fields && typeof fields === 'object') {
      for (const [field, value] of Object.entries(fields)) {
        if (protectedField(field))
          throw new UnsafeQueryError(`Updates must not change "${field}".`);
        // `$rename: { x: 'workspaceId' }` would write the tenant key through the value side.
        if (op === '$rename' && typeof value === 'string' && protectedField(value)) {
          throw new UnsafeQueryError(`Updates must not rename a field to "${value}".`);
        }
      }
    }
  }
}

export function assertNoTenantKeyInDocument(doc: object, tenantKey: string): void {
  if (Object.prototype.hasOwnProperty.call(doc, tenantKey)) {
    throw new UnsafeQueryError(
      `Documents must not set "${tenantKey}"; it is injected by the tenant scope.`,
    );
  }
}
