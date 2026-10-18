import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  baselineContentHash,
  canonicalBaselineContent,
  type FrozenRequirementContent,
} from './baseline-hash';

const login: FrozenRequirementContent = {
  number: 2,
  title: 'Customer login',
  description: 'Customers log in with email and password.',
  acceptanceCriteria: ['Login with valid credentials'],
  priority: 'MUST',
};
const menu: FrozenRequirementContent = {
  number: 1,
  title: 'Menu browsing',
  description: '',
  acceptanceCriteria: [],
  priority: 'SHOULD',
};

describe('BR-005 baseline content hash', () => {
  it('UT-BLH-01 canonical form: sorted by number, fixed key order, no metadata', () => {
    expect(canonicalBaselineContent([login, menu])).toBe(
      '[{"number":1,"title":"Menu browsing","description":"","acceptanceCriteria":[],"priority":"SHOULD"},' +
        '{"number":2,"title":"Customer login","description":"Customers log in with email and password.",' +
        '"acceptanceCriteria":["Login with valid credentials"],"priority":"MUST"}]',
    );
  });

  it('UT-BLH-02 the hash is SHA-256 hex of the canonical form (recomputable by anyone)', () => {
    // Pinned value, computed independently with `node -e` over the literal string in UT-BLH-01.
    expect(baselineContentHash([login, menu])).toBe(
      '8d121360ea8bd8bd9ab988f7eb348e04fd46e49baa1d5978821e8ca472ebd57c',
    );
    expect(
      createHash('sha256')
        .update(canonicalBaselineContent([menu, login]), 'utf8')
        .digest('hex'),
    ).toBe(baselineContentHash([login, menu]));
  });

  it('UT-BLH-03 input order and extra document fields do not change the hash', () => {
    const withMeta = { ...login, _id: 'x', rowVersion: 7, updatedAt: new Date() };
    expect(baselineContentHash([withMeta, menu])).toBe(baselineContentHash([menu, login]));
  });

  it.each([
    ['title', { title: 'Customer login ' }],
    ['description', { description: 'Customers log in with OTP.' }],
    ['acceptance criteria', { acceptanceCriteria: ['Login with valid credentials', 'Lockout'] }],
    ['criteria removed', { acceptanceCriteria: [] }],
    ['criteria added', { acceptanceCriteria: ['Lockout', 'Login with valid credentials'] }],
    ['priority', { priority: 'COULD' as const }],
    ['number', { number: 3 }],
  ])('UT-BLH-04 any change to %s changes the hash', (_label, change) => {
    expect(baselineContentHash([{ ...login, ...change }, menu])).not.toBe(
      baselineContentHash([login, menu]),
    );
  });

  it('UT-BLH-06 reordering acceptance criteria changes the hash (order is part of the agreement)', () => {
    const a = { ...login, acceptanceCriteria: ['First', 'Second'] };
    const b = { ...login, acceptanceCriteria: ['Second', 'First'] };
    expect(baselineContentHash([a])).not.toBe(baselineContentHash([b]));
  });

  it('UT-BLH-05 the input array is not mutated', () => {
    const input = [login, menu];
    baselineContentHash(input);
    expect(input).toEqual([login, menu]);
  });
});
