import { describe, expect, it } from 'vitest';
import {
  absoluteExpiry,
  generateSessionToken,
  hashSessionToken,
  isSessionActive,
  nextExpiry,
} from './session-token';

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-10-16T00:00:00.000Z');

describe('SEC-002 session token domain', () => {
  it('UT-SES-01 tokens are 32 random bytes, base64url, unique', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateSessionToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes → 43 base64url chars, no padding
    }
  });

  it('UT-SES-02 the stored ID is a deterministic SHA-256 hex digest, never the token', () => {
    const token = generateSessionToken();
    const id = hashSessionToken(token);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(id);
    expect(id).not.toContain(token);
    expect(hashSessionToken(`${token}x`)).not.toBe(id);
  });

  it('UT-SES-03 idle expiry slides by the idle period', () => {
    const absolute = absoluteExpiry(t0, 30);
    expect(nextExpiry(t0, 7, absolute).getTime()).toBe(t0.getTime() + 7 * DAY);
  });

  it('UT-SES-04 idle expiry never passes the absolute expiry', () => {
    const absolute = absoluteExpiry(t0, 30);
    const late = new Date(t0.getTime() + 28 * DAY);
    expect(nextExpiry(late, 7, absolute)).toEqual(absolute);
  });

  it.each([
    ['1 ms before idle expiry', -1, true],
    ['exactly at idle expiry', 0, false],
    ['after idle expiry', 1, false],
  ])('UT-SES-05 boundary: %s → active=%s', (_label, offsetMs, active) => {
    const session = {
      expiresAt: new Date(t0.getTime() + DAY),
      absoluteExpiresAt: new Date(t0.getTime() + 30 * DAY),
    };
    expect(isSessionActive(session, new Date(session.expiresAt.getTime() + offsetMs))).toBe(active);
  });

  it('UT-SES-06 a session past its absolute expiry is inactive even if idle expiry is later', () => {
    const session = {
      expiresAt: new Date(t0.getTime() + 40 * DAY),
      absoluteExpiresAt: new Date(t0.getTime() + 30 * DAY),
    };
    expect(isSessionActive(session, new Date(t0.getTime() + 30 * DAY))).toBe(false);
  });
});
