import { pino, type DestinationStream, type Logger } from 'pino';

export type { Logger };

/**
 * Paths redacted from every log line (NFR-010, SEC-007, TC-SEC-07). Request bodies are never
 * logged; these paths are defence in depth for objects passed to the logger by mistake.
 */
export const REDACT_PATHS = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'cookie',
  '*.cookie',
  'headers.cookie',
  'headers.authorization',
  '*.headers.cookie',
  '*.headers.authorization',
  'authorization',
  '*.authorization',
  'token',
  '*.token',
  'SESSION_SECRET',
  '*.SESSION_SECRET',
  'AI_API_KEY',
  '*.AI_API_KEY',
  'MONGODB_URI',
  '*.MONGODB_URI',
  'body',
  '*.body',
  // Two levels deep (e.g. err.config.headers), and other credential-bearing headers.
  '*.*.password',
  '*.*.cookie',
  '*.*.authorization',
  '*.*.headers.cookie',
  '*.*.headers.authorization',
  'headers["set-cookie"]',
  '*.headers["set-cookie"]',
  'headers["x-api-key"]',
  '*.headers["x-api-key"]',
  '*.*.AI_API_KEY',
  '*.*.MONGODB_URI',
  // Personal data (PRV-001): never needed in logs.
  'email',
  '*.email',
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: { service: 'soloops-api' },
      redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}
