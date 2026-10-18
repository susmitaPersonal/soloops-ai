import { describe, expect, it } from 'vitest';
import { decideTaskScope, type ScopeTarget } from './task-scope';

const baselined: ScopeTarget = { type: 'BASELINE', requirement: { baselined: true } };
const draft: ScopeTarget = { type: 'BASELINE', requirement: { baselined: false } };
const missing: ScopeTarget = { type: 'BASELINE', requirement: null };
const internal: ScopeTarget = { type: 'INTERNAL' };
const approvedCr: ScopeTarget = { type: 'CHANGE_REQUEST', approvedVersionFound: true };
const unapprovedCr: ScopeTarget = { type: 'CHANGE_REQUEST', approvedVersionFound: false };

describe('BR-015 task scope decision', () => {
  it.each([
    ['baselined requirement, billable', baselined, true],
    ['baselined requirement, not billable', baselined, false],
    ['approved CR version, billable', approvedCr, true],
    ['internal, not billable', internal, false],
  ])('UT-TSC-01 allows %s', (_label, target, billable) => {
    expect(decideTaskScope(target, billable)).toEqual({ ok: true });
  });

  it('UT-TSC-02 AC-016.1 internal + billable → NOT_ELIGIBLE on billable', () => {
    const d = decideTaskScope(internal, true);
    expect(d).toMatchObject({ ok: false, code: 'NOT_ELIGIBLE' });
    expect(d.ok ? [] : d.errors.map((e) => e.path)).toEqual(['billable']);
  });

  it.each([true, false])(
    'UT-TSC-03 a draft requirement never authorises work (billable=%s) → NOT_ELIGIBLE',
    (billable) => {
      const d = decideTaskScope(draft, billable);
      expect(d).toMatchObject({ ok: false, code: 'NOT_ELIGIBLE' });
      expect(d.ok ? [] : d.errors[0]?.path).toBe('scope.requirementId');
    },
  );

  it.each([true, false])(
    'UT-TSC-04 an unapproved or missing CR version never authorises work (billable=%s)',
    (billable) => {
      expect(decideTaskScope(unapprovedCr, billable)).toMatchObject({
        ok: false,
        code: 'NOT_ELIGIBLE',
      });
    },
  );

  it('UT-TSC-05 a requirement outside the project is a validation error, not eligibility', () => {
    expect(decideTaskScope(missing, true)).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'scope.requirementId', message: 'Choose a requirement of this project.' }],
    });
  });
});
