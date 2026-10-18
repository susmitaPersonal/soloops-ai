// The ONLY place in apps/api/src that imports `mongodb` (ADR-0012, lint-enforced by TC-ARCH-01).
import {
  MongoClient,
  MongoNetworkError,
  MongoServerSelectionError,
  MongoNotConnectedError,
  MongoTopologyClosedError,
  type Db,
  type Document,
} from 'mongodb';
import {
  GlobalCollection,
  TenantCollection,
  type UserScopedCollection,
  type TxSession,
} from './collections';

export {
  DuplicateKeyError,
  TenantCollection,
  GlobalCollection,
  type UserScopedCollection,
  type TxSession,
  type Filter,
  type UpdateFilter,
  type Sort,
  type QueryOptions,
} from './collections';
export { UnsafeQueryError } from './guards';

/** Collection registry. Every tenant collection carries `workspaceId` except `workspaces` (keyed by `_id`). */
const TENANT_COLLECTIONS = {
  workspaces: '_id',
  memberships: 'workspaceId',
  auditEvents: 'workspaceId',
  idempotencyKeys: 'workspaceId',
  // core-ops (migration 0002, data-model §4.5–4.8, §4.11)
  clients: 'workspaceId',
  projects: 'workspaceId',
  requirements: 'workspaceId',
  baselines: 'workspaceId',
  tasks: 'workspaceId',
  // scope-guard and ai (migration 0003, data-model §4.9, §4.10, §4.14)
  changeRequests: 'workspaceId',
  approvals: 'workspaceId',
  aiGenerations: 'workspaceId',
  // billing (migration 0004, data-model §4.12)
  billableEntries: 'workspaceId',
  // billing (migration 0005, data-model §4.13)
  invoices: 'workspaceId',
} as const;
const GLOBAL_COLLECTIONS = ['users', 'sessions'] as const;
/**
 * User-scoped read-only views: cross-workspace lookups that are always restricted to one user
 * (e.g. "my workspaces"). The `userId` is injected like a tenant key and cannot be overridden.
 */
const USER_SCOPED_COLLECTIONS = ['memberships'] as const;

export type TenantCollectionName = keyof typeof TENANT_COLLECTIONS;
export type GlobalCollectionName = (typeof GLOBAL_COLLECTIONS)[number];
export type UserScopedCollectionName = (typeof USER_SCOPED_COLLECTIONS)[number];

export interface Database {
  tenant<T extends Document>(name: TenantCollectionName, workspaceId: string): TenantCollection<T>;
  global<T extends Document>(name: GlobalCollectionName): GlobalCollection<T>;
  userScoped<T extends Document>(
    name: UserScopedCollectionName,
    userId: string,
  ): UserScopedCollection<T>;
  /**
   * Runs `fn` in a multi-document transaction (majority write concern, snapshot reads).
   * The driver retries transient transaction errors (ADR-0012 §3).
   */
  withTransaction<T>(fn: (tx: TxSession) => Promise<T>): Promise<T>;
  /** Readiness: ping + writable primary (deployment-architecture.md#health-checks). */
  checkReady(): Promise<{ ok: boolean; reason?: string }>;
  appliedMigrationIds(): Promise<string[]>;
  /** Raw handle for the migration runner and test cleanup only. Not for modules. */
  readonly raw: Db;
  close(): Promise<void>;
}

export async function connectDatabase(uri: string, dbName: string): Promise<Database> {
  const client = new MongoClient(uri, {
    // BR-019 / ADR-0012 §6: Int64 money round-trips as bigint.
    useBigInt64: true,
    serverSelectionTimeoutMS: 5000,
    appName: 'soloops-api',
  });
  await client.connect();
  return createDatabase(client, dbName);
}

export function createDatabase(client: MongoClient, dbName: string): Database {
  const db = client.db(dbName);
  return {
    raw: db,
    tenant<T extends Document>(name: TenantCollectionName, workspaceId: string) {
      if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
        throw new Error('A workspaceId is required for tenant collections.');
      }
      return new TenantCollection<T>(db.collection(name), TENANT_COLLECTIONS[name], workspaceId);
    },
    global<T extends Document>(name: GlobalCollectionName) {
      if (!(GLOBAL_COLLECTIONS as readonly string[]).includes(name))
        throw new Error(`${name} is not a global collection.`);
      return new GlobalCollection<T>(db.collection(name));
    },
    userScoped<T extends Document>(name: UserScopedCollectionName, userId: string) {
      if (!(USER_SCOPED_COLLECTIONS as readonly string[]).includes(name)) {
        throw new Error(`${name} has no user-scoped view.`);
      }
      if (typeof userId !== 'string' || userId.length === 0)
        throw new Error('A userId is required.');
      const c = new TenantCollection<T>(db.collection(name), 'userId', userId);
      return { findOne: c.findOne.bind(c), find: c.find.bind(c) };
    },
    async withTransaction<T>(fn: (tx: TxSession) => Promise<T>): Promise<T> {
      return client.withSession((session) =>
        session.withTransaction(() => fn(session), {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        }),
      );
    },
    async checkReady() {
      try {
        const hello = await db.admin().command({ hello: 1 });
        if (!hello.isWritablePrimary) return { ok: false, reason: 'no writable primary' };
        if (!hello.setName) return { ok: false, reason: 'not a replica set' };
        return { ok: true };
      } catch {
        return { ok: false, reason: 'database unreachable' };
      }
    },
    async appliedMigrationIds() {
      const docs = await db.collection<{ _id: string }>('schemaMigrations').find({}).toArray();
      return docs.map((d) => d._id);
    },
    close: () => client.close(),
  };
}

/** ERR-009: errors that mean the database is unavailable (mapped to 503). */
export function isDatabaseUnavailableError(err: unknown): boolean {
  return (
    err instanceof MongoServerSelectionError ||
    err instanceof MongoNetworkError ||
    err instanceof MongoNotConnectedError ||
    err instanceof MongoTopologyClosedError
  );
}
