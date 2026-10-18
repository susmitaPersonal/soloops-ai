import {
  MongoServerError,
  type ClientSession,
  type Collection,
  type Document,
  type Filter,
  type FindOptions,
  type OptionalUnlessRequiredId,
  type Sort,
  type UpdateFilter,
} from 'mongodb';
import {
  assertNoTenantKeyInDocument,
  assertSafeFilter,
  assertSafePipeline,
  assertSafeUpdate,
} from './guards';

/** Opaque transaction handle passed from services to repositories. */
export type TxSession = ClientSession;
export type { Filter, Sort, UpdateFilter, Document };

export interface QueryOptions {
  session?: TxSession;
}
export interface FindManyOptions extends QueryOptions {
  sort?: Sort;
  limit?: number;
  projection?: FindOptions['projection'];
}

/** Thrown when a unique index rejects a write; repositories map it to a domain error. */
export class DuplicateKeyError extends Error {
  constructor(readonly indexName: string | undefined) {
    super(`Duplicate key${indexName ? ` on index ${indexName}` : ''}`);
    this.name = 'DuplicateKeyError';
  }
}

async function mapWriteErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      const match = /index: (\S+)/.exec(err.message);
      throw new DuplicateKeyError(match?.[1]);
    }
    throw err;
  }
}

const MAX_LIMIT = 500;

/** Insert shape: no tenant key; `_id` is required at runtime except for `workspaces`. */
export type TenantInsert<T> = Omit<T, 'workspaceId' | '_id'> & { _id?: string };

/**
 * Tenant-scoped collection (ADR-0012 §3). Every filter, insert, update and aggregation is
 * restricted to one workspace; callers cannot set or override the tenant key (SEC-004).
 * For `workspaces` the tenant key is `_id`; for every other tenant collection it is `workspaceId`.
 */
export class TenantCollection<T extends Document> {
  constructor(
    private readonly collection: Collection<Document>,
    private readonly tenantKey: 'workspaceId' | '_id' | 'userId',
    private readonly workspaceId: string,
  ) {}

  private scope(filter: Filter<T>): Filter<Document> {
    assertSafeFilter(filter, this.tenantKey);
    return { ...(filter as Filter<Document>), [this.tenantKey]: this.workspaceId };
  }

  async findOne(filter: Filter<T>, options: QueryOptions = {}): Promise<T | null> {
    return (await this.collection.findOne(this.scope(filter), {
      session: options.session,
    })) as T | null;
  }

  async find(filter: Filter<T>, options: FindManyOptions = {}): Promise<T[]> {
    const limit = Math.min(options.limit ?? MAX_LIMIT, MAX_LIMIT);
    const cursor = this.collection.find(this.scope(filter), {
      session: options.session,
      sort: options.sort,
      projection: options.projection,
      limit,
    });
    return (await cursor.toArray()) as unknown as T[];
  }

  async countDocuments(filter: Filter<T>, options: QueryOptions = {}): Promise<number> {
    return this.collection.countDocuments(this.scope(filter), { session: options.session });
  }

  /**
   * Inserts a document; the tenant key is added here and must not be supplied. For
   * `workspaces` the tenant key is `_id`; every other collection needs an application `_id`.
   */
  async insertOne(doc: TenantInsert<T>, options: QueryOptions = {}): Promise<void> {
    assertNoTenantKeyInDocument(doc, this.tenantKey);
    if (this.tenantKey === 'workspaceId' && typeof (doc as { _id?: unknown })._id !== 'string') {
      throw new Error('Tenant documents need an application-generated _id (ADR-0012 §5).');
    }
    const scoped = { ...doc, [this.tenantKey]: this.workspaceId } as Document;
    await mapWriteErrors(() => this.collection.insertOne(scoped, { session: options.session }));
  }

  /** Conditional update. Returns how many documents matched (0 means the guard failed). */
  async updateOne(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options: QueryOptions = {},
  ): Promise<{ matched: number; modified: number }> {
    assertSafeUpdate(update, this.tenantKey);
    const res = await mapWriteErrors(() =>
      this.collection.updateOne(this.scope(filter), update as UpdateFilter<Document>, {
        session: options.session,
      }),
    );
    return { matched: res.matchedCount, modified: res.modifiedCount };
  }

  /** Multi-document update within the tenant (e.g. freezing requirements into a baseline, BR-004). */
  async updateMany(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options: QueryOptions = {},
  ): Promise<{ matched: number; modified: number }> {
    assertSafeUpdate(update, this.tenantKey);
    const res = await mapWriteErrors(() =>
      this.collection.updateMany(this.scope(filter), update as UpdateFilter<Document>, {
        session: options.session,
      }),
    );
    return { matched: res.matchedCount, modified: res.modifiedCount };
  }

  /** Conditional update that returns the updated document, or null if the guard failed. */
  async findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options: QueryOptions = {},
  ): Promise<T | null> {
    assertSafeUpdate(update, this.tenantKey);
    const res = await mapWriteErrors(() =>
      this.collection.findOneAndUpdate(this.scope(filter), update as UpdateFilter<Document>, {
        session: options.session,
        returnDocument: 'after',
      }),
    );
    return res as T | null;
  }

  /** Conditional delete of one tenant document. Returns how many were deleted (0 = guard failed). */
  async deleteOne(filter: Filter<T>, options: QueryOptions = {}): Promise<number> {
    const res = await this.collection.deleteOne(this.scope(filter), { session: options.session });
    return res.deletedCount;
  }

  /** Aggregation with a leading tenant `$match` that cannot be bypassed. */
  async aggregate<R = Document>(pipeline: Document[], options: QueryOptions = {}): Promise<R[]> {
    assertSafePipeline(pipeline, this.tenantKey);
    const scoped = [{ $match: { [this.tenantKey]: this.workspaceId } }, ...pipeline];
    return (await this.collection.aggregate(scoped, { session: options.session }).toArray()) as R[];
  }
}

/**
 * Collection wrapper for global (non-tenant) collections such as `users` and `sessions`.
 * Filters are still guarded against server-side JavaScript operators.
 */
export class GlobalCollection<T extends Document> {
  constructor(private readonly collection: Collection<Document>) {}

  private guard(filter: Filter<T>): Filter<Document> {
    assertSafeFilter(filter, '\u0000no-tenant-key');
    return filter as Filter<Document>;
  }

  async findOne(filter: Filter<T>, options: QueryOptions = {}): Promise<T | null> {
    return (await this.collection.findOne(this.guard(filter), {
      session: options.session,
    })) as T | null;
  }

  async find(filter: Filter<T>, options: FindManyOptions = {}): Promise<T[]> {
    const limit = Math.min(options.limit ?? MAX_LIMIT, MAX_LIMIT);
    return (await this.collection
      .find(this.guard(filter), { session: options.session, sort: options.sort, limit })
      .toArray()) as unknown as T[];
  }

  async insertOne(doc: OptionalUnlessRequiredId<T>, options: QueryOptions = {}): Promise<void> {
    await mapWriteErrors(() =>
      this.collection.insertOne(doc as Document, { session: options.session }),
    );
  }

  async updateOne(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options: QueryOptions = {},
  ): Promise<{ matched: number; modified: number }> {
    assertSafeUpdate(update, '\u0000no-tenant-key');
    const res = await mapWriteErrors(() =>
      this.collection.updateOne(this.guard(filter), update as UpdateFilter<Document>, {
        session: options.session,
      }),
    );
    return { matched: res.matchedCount, modified: res.modifiedCount };
  }

  async deleteOne(filter: Filter<T>, options: QueryOptions = {}): Promise<number> {
    const res = await this.collection.deleteOne(this.guard(filter), { session: options.session });
    return res.deletedCount;
  }

  async deleteMany(filter: Filter<T>, options: QueryOptions = {}): Promise<number> {
    const res = await this.collection.deleteMany(this.guard(filter), { session: options.session });
    return res.deletedCount;
  }
}

/** Read-only view restricted to one user (see `Database.userScoped`). */
export type UserScopedCollection<T extends Document> = Pick<
  TenantCollection<T>,
  'findOne' | 'find'
>;
