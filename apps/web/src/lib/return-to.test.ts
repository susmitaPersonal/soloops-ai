import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './return-to';

describe('ERR-008 safeReturnTo (no open redirects)', () => {
  it.each([
    ['/w/0192a000-0000-7000-8000-000000000001', true],
    ['/w/0192a000-0000-7000-8000-000000000001/settings', true],
    ['/w/abc/settings?welcome=1', true],
    ['https://evil.example.com', false],
    ['//evil.example.com', false],
    ['/w//evil.example.com', false],
    ['/\\evil.example.com', false],
    ['/signin', false],
    ['javascript:alert(1)', false],
    ['', false],
    [null, false],
  ])('%s → allowed=%s', (value, allowed) => {
    expect(safeReturnTo(value) !== null).toBe(allowed);
  });
});
