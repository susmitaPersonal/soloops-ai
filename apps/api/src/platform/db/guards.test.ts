import { describe, expect, it } from 'vitest';
import {
  assertNoTenantKeyInDocument,
  assertSafeFilter,
  assertSafePipeline,
  assertSafeUpdate,
  UnsafeQueryError,
} from './guards';

const T = 'workspaceId';

describe('SEC-004 / ADR-0012 query guards (unit)', () => {
  it.each([
    ['plain equality', { userId: 'u1' }],
    ['operators on other fields', { rowVersion: { $gte: 1 }, $or: [{ a: 1 }, { b: 2 }] }],
    ['Date and bigint values are leaves', { createdAt: new Date(), amount: 5n }],
  ])('UT-GRD-01 accepts a safe filter: %s', (_l, filter) => {
    expect(() => assertSafeFilter(filter, T)).not.toThrow();
  });

  it.each([
    ['top-level tenant key', { workspaceId: 'other' }],
    ['tenant key inside $or', { $or: [{ workspaceId: 'other' }] }],
    ['tenant key inside $and/$nor', { $and: [{ $nor: [{ workspaceId: 'x' }] }] }],
    ['$where', { $where: 'sleep(1000)' }],
    ['nested $function', { a: { $expr: { $function: { body: 'x', args: [], lang: 'js' } } } }],
    ['$accumulator', { $accumulator: {} }],
  ])('UT-GRD-02 refuses an unsafe filter: %s', (_l, filter) => {
    expect(() => assertSafeFilter(filter, T)).toThrow(UnsafeQueryError);
  });

  it('UT-GRD-03 refuses filters nested deeper than 32 levels (DoS guard)', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 40; i += 1) deep = { a: deep };
    expect(() => assertSafeFilter(deep, T)).toThrow(/nested too deeply/);
  });

  it.each([
    ['$set of the tenant key', { $set: { workspaceId: 'x' } }],
    ['$set of a tenant sub-path', { $set: { 'workspaceId.a': 'x' } }],
    ['$set of _id', { $set: { _id: 'x' } }],
    ['$unset of the tenant key', { $unset: { workspaceId: '' } }],
    ['$rename into the tenant key', { $rename: { name: 'workspaceId' } }],
    ['$rename into _id', { $rename: { name: '_id' } }],
    ['a replacement document (no operators)', { name: 'replaced' }],
  ])('UT-GRD-04 refuses an unsafe update: %s', (_l, update) => {
    expect(() => assertSafeUpdate(update, T)).toThrow(UnsafeQueryError);
  });

  it('UT-GRD-05 accepts normal operator updates', () => {
    expect(() =>
      assertSafeUpdate({ $set: { name: 'x' }, $inc: { rowVersion: 1 }, $rename: { a: 'b' } }, T),
    ).not.toThrow();
  });

  it.each(['$lookup', '$unionWith', '$graphLookup', '$out', '$merge'])(
    'UT-GRD-06 refuses pipeline stage %s, also when nested in $facet',
    (stage) => {
      expect(() => assertSafePipeline([{ [stage]: {} }], T)).toThrow(UnsafeQueryError);
      expect(() => assertSafePipeline([{ $facet: { x: [{ [stage]: {} }] } }], T)).toThrow(
        UnsafeQueryError,
      );
    },
  );

  it('UT-GRD-07 accepts read-only pipelines on the scoped collection', () => {
    expect(() =>
      assertSafePipeline(
        [{ $match: { status: 'A' } }, { $group: { _id: '$projectId', n: { $sum: 1 } } }],
        T,
      ),
    ).not.toThrow();
  });

  it('UT-GRD-08 documents may not carry the tenant key', () => {
    expect(() => assertNoTenantKeyInDocument({ workspaceId: 'x', a: 1 }, T)).toThrow(
      UnsafeQueryError,
    );
    expect(() => assertNoTenantKeyInDocument({ a: 1 }, T)).not.toThrow();
  });
});
