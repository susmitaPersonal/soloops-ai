import { describe, expect, it } from 'vitest';
import { AppError, problemType } from '../errors';
import { parseIfMatch, toFieldErrors } from './validate';

describe('ERR-005 If-Match parsing (unit)', () => {
  it.each([
    ['"3"', 3],
    ['3', 3],
    ['W/"12"', 12],
    [' "7" ', 7],
  ])('UT-VAL-01 parses %s → %i', (header, expected) => {
    expect(parseIfMatch(header)).toBe(expected);
  });

  it('UT-VAL-02 missing header → 428 PRECONDITION_REQUIRED', () => {
    expect(() => parseIfMatch(undefined)).toThrow(
      expect.objectContaining({ status: 428, code: 'PRECONDITION_REQUIRED' }),
    );
  });

  it.each(['"abc"', '*', '"-1"', '"1234567890"', '""'])(
    'UT-VAL-03 malformed %s → 412',
    (header) => {
      expect(() => parseIfMatch(header)).toThrow(
        expect.objectContaining({ status: 412, code: 'PRECONDITION_FAILED' }),
      );
    },
  );
});

describe('ERR-010 field error mapping (unit)', () => {
  it('UT-VAL-04 joins nested paths with dots and names root errors "(body)"', () => {
    expect(
      toFieldErrors({
        issues: [
          { path: ['billingDetails', 'legalName'], message: 'Required' },
          { path: ['lines', 0, 'amount'], message: 'Bad' },
          { path: [], message: 'At least one field' },
        ],
      }),
    ).toEqual([
      { path: 'billingDetails.legalName', message: 'Required' },
      { path: 'lines.0.amount', message: 'Bad' },
      { path: '(body)', message: 'At least one field' },
    ]);
  });
});

describe('RFC 9457 problem types (unit)', () => {
  it('UT-ERR-01 every code maps to a stable URN', () => {
    expect(problemType('VALIDATION_FAILED')).toBe('urn:soloops:problem:validation-failed');
    expect(problemType('VERSION_HASH_MISMATCH')).toBe('urn:soloops:problem:version-hash-mismatch');
  });

  it('UT-ERR-02 AppError carries status, code and optional headers', () => {
    const e = new AppError(429, 'RATE_LIMITED', 'Too many', 'Wait', undefined, {
      'Retry-After': '5',
    });
    expect(e).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Wait',
      headers: { 'Retry-After': '5' },
    });
  });
});
