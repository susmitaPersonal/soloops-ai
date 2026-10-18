import type { VersionState } from '@soloops/contracts';
import { describe, expect, it } from 'vitest';
import { authorisesExistingWork, authorisesNewWork, deriveCrStatus } from './lifecycle';

const vs = (...states: VersionState[]) => states.map((state, i) => ({ number: i + 1, state }));

describe('deriveCrStatus (change-request-lifecycle.md, evaluated in order; ADR-0015)', () => {
  it.each([
    [vs('DRAFT'), 'DRAFT'],
    [vs('APPROVED', 'DRAFT'), 'REVISING'],
    [vs('PROPOSED'), 'AWAITING_DECISION'],
    [vs('APPROVED', 'PROPOSED'), 'AWAITING_DECISION'],
    [vs('CLARIFICATION_REQUESTED'), 'NEEDS_REVISION'],
    [vs('APPROVED', 'CLARIFICATION_REQUESTED'), 'NEEDS_REVISION'],
    [vs('APPROVED'), 'APPROVED'],
    [vs('SUPERSEDED', 'APPROVED'), 'APPROVED'],
    [vs('APPROVED', 'REJECTED'), 'APPROVED'], // lifecycle example 4: v1 remains authorised
    [vs('REJECTED'), 'REJECTED'],
    [vs('WITHDRAWN'), 'WITHDRAWN'],
    [vs('REJECTED', 'WITHDRAWN'), 'WITHDRAWN'],
    [vs('WITHDRAWN', 'DRAFT'), 'DRAFT'],
    [vs('CLARIFICATION_REQUESTED', 'PROPOSED'), 'AWAITING_DECISION'],
  ])('UT-LC-01 %j → %s', (versions, status) => {
    expect(deriveCrStatus(versions)).toBe(status);
  });

  it('UT-LC-02 uses the highest version number as "latest", not array order', () => {
    expect(
      deriveCrStatus([
        { number: 2, state: 'REJECTED' },
        { number: 1, state: 'WITHDRAWN' },
      ]),
    ).toBe('REJECTED');
  });
});

describe('BR-012 / BR-013 authorisation by version state', () => {
  it.each([
    ['DRAFT', false, false],
    ['PROPOSED', false, false],
    ['APPROVED', true, true],
    ['REJECTED', false, false],
    ['CLARIFICATION_REQUESTED', false, false],
    ['WITHDRAWN', false, false],
    ['SUPERSEDED', false, true],
  ] as const)('UT-LC-03 %s: new work %s, existing work %s', (state, newWork, existing) => {
    expect(authorisesNewWork(state)).toBe(newWork);
    expect(authorisesExistingWork(state)).toBe(existing);
  });
});
