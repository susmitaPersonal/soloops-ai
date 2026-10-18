import { describe, expect, it } from 'vitest';
import { classifyEntry, type EligibilityInput } from './eligibility';

const base: EligibilityInput = {
  scope: { type: 'BASELINE', key: 'REQ-1', baselined: true },
  invoiced: false,
  entryCurrency: 'INR',
  projectCurrency: 'INR',
};
const reason = (input: Partial<EligibilityInput>) => {
  const r = classifyEntry({ ...base, ...input });
  return r.eligible ? 'ELIGIBLE' : r.reason;
};

describe('BR-016 classifyEntry (workflows §4)', () => {
  it('UT-ELIG-01 baselined requirement, unbilled, same currency → eligible', () => {
    expect(classifyEntry(base)).toEqual({ eligible: true });
  });

  it('UT-ELIG-02 BR-016(a) every scope outcome', () => {
    expect(reason({ scope: { type: 'NONE' } })).toBe('UNSCOPED');
    expect(reason({ scope: { type: 'BASELINE', key: 'REQ-2', baselined: false } })).toBe(
      'REQUIREMENT_NOT_BASELINED',
    );
    expect(reason({ scope: { type: 'BASELINE', key: null, baselined: null } })).toBe(
      'REQUIREMENT_NOT_BASELINED',
    );
    for (const state of ['DRAFT', 'PROPOSED', 'REJECTED', 'WITHDRAWN', null]) {
      expect(
        reason({ scope: { type: 'CHANGE_REQUEST', key: 'CR-1 v1', state, authorised: false } }),
      ).toBe('CR_NOT_APPROVED');
    }
    for (const state of ['APPROVED', 'SUPERSEDED']) {
      expect(
        reason({ scope: { type: 'CHANGE_REQUEST', key: 'CR-1 v1', state, authorised: true } }),
      ).toBe('ELIGIBLE');
    }
  });

  it('UT-ELIG-03 BR-016(b) and (c): invoiced, then currency', () => {
    expect(reason({ invoiced: true })).toBe('ALREADY_INVOICED');
    expect(reason({ entryCurrency: 'USD' })).toBe('CURRENCY_MISMATCH');
  });

  it('UT-ELIG-04 the first failing check in chart order is reported', () => {
    expect(reason({ scope: { type: 'NONE' }, invoiced: true, entryCurrency: 'USD' })).toBe(
      'UNSCOPED',
    );
    expect(reason({ invoiced: true, entryCurrency: 'USD' })).toBe('ALREADY_INVOICED');
  });

  it('UT-ELIG-05 explanations are readable and name the scope (AC-018.1)', () => {
    const r = classifyEntry({
      ...base,
      scope: { type: 'CHANGE_REQUEST', key: 'CR-3 v2', state: 'REJECTED', authorised: false },
    });
    expect(r).toMatchObject({ explanation: expect.stringContaining('CR-3 v2 is rejected') });
    const d = classifyEntry({ ...base, scope: { type: 'BASELINE', key: null, baselined: null } });
    expect(d).toMatchObject({ explanation: expect.stringContaining('deleted') });
    const c = classifyEntry({ ...base, entryCurrency: 'USD' });
    expect(c).toMatchObject({ explanation: expect.stringContaining('USD') });
  });
});
