import type { TestProject } from 'vitest/node';

/** Hosts an external test database may live on. Anything else needs ALLOW_REMOTE_TEST_DB=true. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'mongo']);

/**
 * Safety: automated tests must never point at a production database. An external URI is accepted
 * only for local hosts (or with an explicit opt-in), and every test file still uses its own
 * throw-away `soloops_test_*` database (see helpers.ts).
 */
export function assertSafeTestUri(
  uri: string,
  allowRemote = process.env.ALLOW_REMOTE_TEST_DB === 'true',
) {
  const hosts =
    uri
      .replace(/^mongodb(\+srv)?:\/\//, '')
      .replace(/^[^@/]*@/, '')
      .split('/')[0]
      ?.split(',')
      .map((h) => h.replace(/:\d+$/, '')) ?? [];
  if (uri.startsWith('mongodb+srv://') && !allowRemote) {
    throw new Error(
      'MONGODB_URI_TEST: mongodb+srv URIs are refused (likely a hosted cluster). Set ALLOW_REMOTE_TEST_DB=true to override.',
    );
  }
  const remote = hosts.filter((h) => !LOCAL_HOSTS.has(h));
  if (remote.length > 0 && !allowRemote) {
    throw new Error(
      `MONGODB_URI_TEST points at non-local host(s) ${remote.join(', ')}. Tests only run against local databases unless ALLOW_REMOTE_TEST_DB=true.`,
    );
  }
}

/**
 * ADR-0014: integration tests run against a REAL MongoDB replica set, never a mocked driver.
 * Uses MONGODB_URI_TEST when set (e.g. `docker compose up -d mongo`), otherwise starts a
 * single-node replica set with mongodb-memory-server (real `mongod` binary).
 */
export default async function setup(project: TestProject) {
  const external = process.env.MONGODB_URI_TEST;
  if (external) {
    assertSafeTestUri(external);
    project.provide('mongoUri', external);
    return;
  }
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await replSet.waitUntilRunning();
  project.provide('mongoUri', replSet.getUri());
  return async () => {
    await replSet.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
