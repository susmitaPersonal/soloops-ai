import { createHash, randomBytes } from 'node:crypto';

/** SEC-002: 32 random bytes in the cookie; only the SHA-256 is stored (data-model.md §4.2). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sliding idle expiry, capped by the absolute expiry. */
export function nextExpiry(now: Date, idleDays: number, absoluteExpiresAt: Date): Date {
  return new Date(Math.min(now.getTime() + idleDays * DAY_MS, absoluteExpiresAt.getTime()));
}

export function absoluteExpiry(now: Date, absoluteDays: number): Date {
  return new Date(now.getTime() + absoluteDays * DAY_MS);
}

export function isSessionActive(
  session: { expiresAt: Date; absoluteExpiresAt: Date },
  now: Date,
): boolean {
  // TTL deletion is lazy, so expiry is always checked explicitly.
  return now < session.expiresAt && now < session.absoluteExpiresAt;
}
