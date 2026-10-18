import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import type { Clock } from '../clock';
import { errors } from '../errors';

/**
 * Fixed-window, in-memory rate limiter (SEC-006). State is per API process, so limits are
 * per instance; a shared store is needed before running several API replicas
 * (docs/quality/known-limitations.md). Memory is bounded by `maxKeys`.
 */
export interface RateLimiter {
  /** Records one attempt for `key`; throws 429 when the limit is exceeded. */
  consume(key: string): void;
  size(): number;
  reset(): void;
}

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  clock: Clock;
  maxKeys?: number;
}): RateLimiter {
  const maxKeys = opts.maxKeys ?? 50_000;
  // Map iteration order is insertion order; a key is re-inserted when its window restarts,
  // so the first entries are always the oldest windows.
  const windows = new Map<string, { start: number; count: number }>();

  function evict(now: number) {
    for (const [k, w] of windows) {
      if (now - w.start < opts.windowMs && windows.size < maxKeys) break;
      windows.delete(k);
    }
  }

  return {
    consume(key) {
      const now = opts.clock.now().getTime();
      const w = windows.get(key);
      if (!w || now - w.start >= opts.windowMs) {
        windows.delete(key);
        evict(now);
        windows.set(key, { start: now, count: 1 });
        return;
      }
      w.count += 1;
      if (w.count > opts.limit) {
        const retryAfter = Math.max(1, Math.ceil((w.start + opts.windowMs - now) / 1000));
        throw errors.rateLimited(retryAfter);
      }
    },
    size: () => windows.size,
    reset: () => windows.clear(),
  };
}

/**
 * Client IP for rate-limit keys. With TRUST_PROXY=true the API sits behind exactly one
 * reverse proxy that APPENDS the peer address to X-Forwarded-For, so the RIGHTMOST entry is the
 * only one the client cannot forge. Leftmost entries are client-controlled and ignored.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const hops = (c.req.header('X-Forwarded-For') ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown'; // in-process requests (tests) have no socket
  }
}
