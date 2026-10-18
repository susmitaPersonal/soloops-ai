import { migrations } from '../migrations';
import { ConfigError, loadConfig } from './platform/config';
import { connectDatabase } from './platform/db';
import { runMigrations } from './platform/db/migrations';

/** `npm run db:migrate`: applies pending scripts from apps/api/migrations (data-model.md §11). */
async function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    console.error(err instanceof ConfigError ? err.message : 'Invalid configuration.');
    process.exit(1);
  }
  const db = await connectDatabase(config.MONGODB_URI, config.MONGODB_DB);
  try {
    const result = await runMigrations(db, migrations);
    console.log(`Applied: ${result.applied.join(', ') || 'none'}`);
    console.log(`Already applied: ${result.skipped.join(', ') || 'none'}`);
    if (result.changed.length > 0) {
      console.warn(
        `WARNING: edited after being applied (never edit merged migrations): ${result.changed.join(', ')}`,
      );
    }
  } finally {
    await db.close();
  }
}

main().catch((err: unknown) => {
  console.error('Migration failed:', err instanceof Error ? err.message : 'unknown error');
  process.exit(1);
});
