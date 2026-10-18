import { hash, verify, type Algorithm } from '@node-rs/argon2';
import { errors } from '../../../platform/errors';

// `Algorithm` is an ambient const enum; 2 is Argon2id in @node-rs/argon2.
const ARGON2ID = 2 as Algorithm;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
  /** AC-001.3: equalise timing when the email is unknown by verifying against a dummy hash. */
  verifyDummy(password: string): Promise<void>;
}

/**
 * Bounds concurrent memory-hard hashing so a burst of auth requests cannot exhaust CPU/RAM.
 * Up to `max` run at once, up to `max * 8` wait; beyond that the request fails fast with 503.
 */
function createSemaphore(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) {
      if (waiting.length >= max * 8) throw errors.serviceUnavailable();
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

/** SEC-001: argon2id with configurable memory/iterations, parallelism 1. */
export function createPasswordHasher(opts: {
  memoryKiB: number;
  iterations: number;
  maxConcurrency?: number;
}): PasswordHasher {
  const params = {
    algorithm: ARGON2ID,
    memoryCost: opts.memoryKiB,
    timeCost: opts.iterations,
    parallelism: 1,
  };
  const limit = createSemaphore(opts.maxConcurrency ?? 4);
  // Computed up front so the first unknown-email login is not measurably slower.
  const dummy = hash('soloops-timing-equaliser-not-a-password', params);
  return {
    hash: (password) => limit(() => hash(password, params)),
    verify: (passwordHash, password) =>
      limit(async () => {
        try {
          return await verify(passwordHash, password);
        } catch {
          return false;
        }
      }),
    async verifyDummy(password) {
      const dummyHash = await dummy;
      await limit(() => verify(dummyHash, password).catch(() => false));
    },
  };
}
