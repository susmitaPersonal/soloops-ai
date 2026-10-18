// Starts the E2E backend: a real single-node MongoDB replica set (mongodb-memory-server), or an
// existing local one when E2E_MONGODB_URI is set (e.g. `docker compose up -d mongo`), applies
// migrations, then runs the BUILT API (apps/api/dist). Used by playwright.config.ts.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const apiDir = fileURLToPath(new URL('../apps/api/', import.meta.url));
const external = process.env.E2E_MONGODB_URI;
// Same rule as the API test setup: only local databases, unless explicitly allowed.
if (external && process.env.ALLOW_REMOTE_TEST_DB !== 'true') {
  const hosts = external
    .replace(/^mongodb:\/\//, '')
    .split(/[/?]/)[0]
    .replace(/^.*@/, '')
    .split(',')
    .map((h) => h.replace(/:\d+$/, ''));
  if (
    external.startsWith('mongodb+srv:') ||
    hosts.some((h) => !['localhost', '127.0.0.1', '::1', '[::1]'].includes(h))
  ) {
    throw new Error(
      'E2E_MONGODB_URI must point at a local MongoDB (set ALLOW_REMOTE_TEST_DB=true to override).',
    );
  }
}
const replSet = external
  ? null
  : await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
if (replSet) await replSet.waitUntilRunning();
// A fresh database per run on an external server, dropped on exit: never reuse or touch other data.
const PREFIX = 'soloops_e2e_';
const dbName = external
  ? `${PREFIX}${Date.now()}_${randomBytes(4).toString('hex')}`
  : 'soloops_e2e';
if (external) {
  // Playwright may kill this process without a catchable signal (notably on Windows), so also
  // remove databases that earlier runs left behind: only `soloops_e2e_<ms>_…`, older than 1 hour.
  const client = new MongoClient(external);
  try {
    const { databases } = await client.db('admin').admin().listDatabases({ nameOnly: true });
    for (const { name } of databases) {
      const m = /^soloops_e2e_(\d{13})_[0-9a-f]{8}$/.exec(name);
      if (m && Date.now() - Number(m[1]) > 60 * 60 * 1000) await client.db(name).dropDatabase();
    }
  } finally {
    await client.close();
  }
}
const uri = external ?? replSet.getUri();

async function shutdownDb() {
  if (replSet) return replSet.stop();
  const client = new MongoClient(uri);
  try {
    await client.db(dbName).dropDatabase();
  } finally {
    await client.close();
  }
}

const env = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: process.env.E2E_API_PORT ?? '4000',
  APP_ORIGIN: process.env.E2E_APP_ORIGIN ?? 'http://localhost:3100',
  MONGODB_URI: uri,
  MONGODB_DB: dbName,
  SESSION_SECRET: randomBytes(32).toString('base64'),
  COOKIE_SECURE: 'false',
  LOG_LEVEL: 'warn',
  // Every E2E user registers from localhost. Per-IP limits (SEC-006) are verified by the API
  // integration suite; here they are raised so repeated runs are not throttled. The per-IP+email
  // and per-email limits stay at their production values.
  RATE_LIMIT_REGISTER_PER_IP: '10000',
  RATE_LIMIT_AUTH_PER_IP: '10000',
  // AI in E2E: the deterministic `mock` provider only (never a real endpoint, and refused in
  // production by config). Scenarios are chosen with [mock:<name>] tags in the client text.
  AI_PROVIDER: 'mock',
  AI_TIMEOUT_MS: '3000',
  RATE_LIMIT_AI_PER_HOUR: '10000',
};

function run(args) {
  return spawn(process.execPath, args, { cwd: apiDir, env, stdio: 'inherit' });
}

await new Promise((resolve, reject) => {
  run(['dist/migrate.js']).on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error(`migrate exited ${code}`)),
  );
});
const api = run(['dist/main.js']);

const stop = async () => {
  api.kill();
  await shutdownDb().catch(() => undefined);
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
api.on('exit', async (code) => {
  await shutdownDb().catch(() => undefined);
  process.exit(code ?? 1);
});
