import { z } from 'zod';

/**
 * API configuration, loaded once at startup and validated with Zod
 * (docs/engineering/environment-configuration.md). Error messages name the variable,
 * never its value (SEC-007).
 */
const boolString = z
  .enum(['true', 'false'], { error: 'must be "true" or "false"' })
  .transform((v) => v === 'true');

const intString = (min: number, max: number) =>
  z.coerce
    .number({ error: 'must be a number' })
    .int({ error: 'must be a whole number' })
    .min(min, { error: `must be at least ${min}` })
    .max(max, { error: `must be at most ${max}` });

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: intString(1, 65535).default(4000),
    APP_ORIGIN: z
      .url({ error: 'must be an absolute URL such as http://localhost:3000' })
      .transform((v) => new URL(v).origin),
    MONGODB_URI: z
      .string({ error: 'is required' })
      .regex(/^mongodb(\+srv)?:\/\//, { error: 'must be a mongodb:// or mongodb+srv:// URI' }),
    MONGODB_DB: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,63}$/, { error: 'must be a valid database name' })
      .default('soloops'),
    SESSION_SECRET: z
      .string({ error: 'is required' })
      .min(32, { error: 'must be at least 32 characters' }),
    COOKIE_SECURE: boolString.default(false),
    SESSION_IDLE_DAYS: intString(1, 365).default(7),
    SESSION_ABSOLUTE_DAYS: intString(1, 365).default(30),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    ARGON2_MEMORY_KIB: intString(8, 4_194_304).default(19456),
    ARGON2_ITERATIONS: intString(1, 20).default(2),
    /** Trust the first X-Forwarded-For hop for client IPs (set when behind the reverse proxy). */
    TRUST_PROXY: boolString.default(false),
    /** SEC-006: sign-in attempts per client IP per 15 minutes, across all emails (anti-spraying). */
    RATE_LIMIT_AUTH_PER_IP: intString(1, 100_000).default(30),
    /** SEC-006: registrations per client IP per hour. */
    RATE_LIMIT_REGISTER_PER_IP: intString(1, 100_000).default(10),
    /** Concurrent argon2id computations; excess requests wait in a short queue, then get 503. */
    ARGON2_MAX_CONCURRENCY: intString(1, 64).default(4),
    // AI (FR-050, environment-configuration.md). Off unless a provider is configured.
    AI_PROVIDER: z
      .enum(['none', 'mock', 'openai-compatible'], {
        error: 'must be none, mock or openai-compatible',
      })
      .default('none'),
    /** Not validated as a URL on purpose: a bad endpoint must not stop startup (AC-022.2). */
    AI_BASE_URL: z.string().max(2000).optional(),
    AI_API_KEY: z.string().max(4000).optional(),
    AI_MODEL: z.string().max(200).optional(),
    AI_STRUCTURED_OUTPUT: z
      .enum(['json_schema', 'json_object', 'prompt'], {
        error: 'must be json_schema, json_object or prompt',
      })
      .default('prompt'),
    AI_TIMEOUT_MS: intString(1000, 600_000).default(60_000),
    AI_MAX_RETRIES: intString(0, 5).default(1),
    AI_MAX_INPUT_CHARS: intString(1000, 200_000).default(12_000),
    AI_MAX_OUTPUT_TOKENS: intString(100, 32_000).default(1500),
    AI_STORE_PROMPTS: boolString.default(false),
    RATE_LIMIT_AI_PER_HOUR: intString(1, 100_000).default(20),
    AI_GENERATION_RETENTION_DAYS: intString(1, 3650).default(365),
  })
  .superRefine((c, ctx) => {
    if (c.SESSION_ABSOLUTE_DAYS < c.SESSION_IDLE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_ABSOLUTE_DAYS'],
        message: 'must be greater than or equal to SESSION_IDLE_DAYS',
      });
    }
    if (c.NODE_ENV !== 'production') return;
    if (c.AI_PROVIDER === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_PROVIDER'],
        message: 'mock is for tests only and must not be used in production',
      });
    }
    // Secure deployment defaults (security-architecture.md).
    if (!c.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
    if (Buffer.from(c.SESSION_SECRET, 'base64').length < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'must be at least 32 random bytes, base64-encoded, in production',
      });
    }
    if (!c.MONGODB_URI.startsWith('mongodb+srv://') && !/[?&]replicaSet=/.test(c.MONGODB_URI)) {
      ctx.addIssue({
        code: 'custom',
        path: ['MONGODB_URI'],
        message: 'must target a replica set (replicaSet=… or mongodb+srv://) in production',
      });
    }
    if (c.ARGON2_MEMORY_KIB < 19456 || c.ARGON2_ITERATIONS < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['ARGON2_MEMORY_KIB'],
        message: 'argon2id cost must be at least 19456 KiB and 2 iterations in production',
      });
    }
  });

export type AppConfig = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  // Treat empty strings as unset so `.env` placeholders fall back to defaults.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const result = configSchema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((i) => `${i.path.join('.') || '(config)'} ${i.message}`),
    );
  }
  return result.data;
}
