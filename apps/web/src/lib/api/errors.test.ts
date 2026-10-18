import { ApiError, ClientError } from '@soloops/api-client';
import { describe, expect, it } from 'vitest';
import { describeError } from './errors';

describe('describeError (frontend error mapping)', () => {
  it('UT-ERRW-01 problem+json → message, field errors, status, code and request ID', () => {
    const d = describeError(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        title: 'Validation failed',
        detail: 'Some fields need attention.',
        errors: [{ path: 'taxRateBps', message: 'Too high' }],
        requestId: 'r-1',
      }),
    );
    expect(d).toEqual({
      message: 'Some fields need attention.',
      fieldErrors: [{ path: 'taxRateBps', message: 'Too high' }],
      status: 422,
      code: 'VALIDATION_FAILED',
      requestId: 'r-1',
    });
  });

  it('UT-ERRW-02 falls back to the title when there is no detail', () => {
    expect(
      describeError(new ApiError(404, { code: 'NOT_FOUND', title: 'Not found' })).message,
    ).toBe('Not found');
  });

  it('UT-ERRW-03 network failures keep a readable message', () => {
    expect(
      describeError(new ClientError('NETWORK_ERROR', 'Could not reach the server.')),
    ).toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
      message: 'Could not reach the server.',
    });
  });

  it('UT-ERRW-04 unknown errors never leak internals', () => {
    const d = describeError(new Error('TypeError: x is undefined at secret/path.ts:12'));
    expect(d.message).toBe('Something went wrong. Try again.');
    expect(d.code).toBe('UNKNOWN');
  });
});
