import { serve } from '@hono/node-server';
import { createApp } from './app';
import { systemClock } from './platform/clock';
import { ConfigError, loadConfig } from './platform/config';
import { connectDatabase } from './platform/db';
import { createLogger } from './platform/logging';

async function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    // Names the variables, never their values (SEC-007).
    console.error(err instanceof ConfigError ? err.message : 'Invalid configuration.');
    process.exit(1);
  }
  const logger = createLogger(config.LOG_LEVEL);
  const db = await connectDatabase(config.MONGODB_URI, config.MONGODB_DB);
  const app = createApp({ config, db, clock: systemClock, logger });

  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ port: info.port, env: config.NODE_ENV }, 'api listening');
  });

  // ADR-0010: close the HTTP server first, then the MongoDB client.
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      db.close()
        .catch((err: unknown) => logger.error({ err: String(err) }, 'error closing database'))
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('API failed to start:', err instanceof Error ? err.message : 'unknown error');
  process.exit(1);
});
