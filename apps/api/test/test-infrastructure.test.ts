// Verifies the test infrastructure itself: isolation, cleanup and production-safety guards.
import { MongoClient } from 'mongodb';
import { describe, expect, inject, it } from 'vitest';
import { assertSafeTestUri } from './global-setup';
import { createTestContext } from './helpers';

describe('INF test infrastructure', () => {
  it('INF-01 every context gets its own soloops_test_* database, in NODE_ENV=test', async () => {
    const a = await createTestContext();
    const b = await createTestContext();
    try {
      expect(a.dbName).toMatch(/^soloops_test_[0-9a-f]{16}$/);
      expect(a.dbName).not.toBe(b.dbName);
      expect(a.config.NODE_ENV).toBe('test');
      expect(a.config.MONGODB_DB).toBe(a.dbName);
      // Data written in one context is invisible to another.
      await a.register({ email: 'only-in-a@example.com' });
      expect(
        await b.db.raw.collection('users').countDocuments({ email: 'only-in-a@example.com' }),
      ).toBe(0);
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });

  it('INF-02 cleanup drops the database, so runs are repeatable and leave no data behind', async () => {
    const t = await createTestContext();
    await t.register();
    const name = t.dbName;
    await t.cleanup();
    const client = await MongoClient.connect(inject('mongoUri'));
    try {
      const { databases } = await client.db().admin().listDatabases({ nameOnly: true });
      expect(databases.map((d) => d.name)).not.toContain(name);
    } finally {
      await client.close();
    }
  });

  it('INF-03 the test database runs as a replica set (transactions are real, not mocked)', async () => {
    const t = await createTestContext();
    try {
      expect(await t.db.checkReady()).toEqual({ ok: true });
    } finally {
      await t.cleanup();
    }
  });

  it.each([
    ['mongodb://localhost:27017/?replicaSet=rs0', true],
    ['mongodb://127.0.0.1:55001/', true],
    ['mongodb://user:pw@localhost:27017/', true],
    ['mongodb://mongo:27017/?replicaSet=rs0', true],
    ['mongodb://prod-db.example.com:27017/', false],
    ['mongodb://localhost:27017,prod.example.com:27017/', false],
    ['mongodb+srv://cluster0.example.mongodb.net/', false],
  ])('INF-04 production-safety guard: %s → allowed=%s', (uri, allowed) => {
    if (allowed) expect(() => assertSafeTestUri(uri, false)).not.toThrow();
    else expect(() => assertSafeTestUri(uri, false)).toThrow();
  });

  it('INF-05 remote test databases need an explicit opt-in', () => {
    expect(() => assertSafeTestUri('mongodb://ci-db.internal:27017/', true)).not.toThrow();
  });
});
