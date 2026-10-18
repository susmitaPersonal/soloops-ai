// Migration scripts are schema infrastructure and may use the raw driver (data-model.md §11).
import type { Db, Document } from 'mongodb';
import { ensureCollection, type Migration } from '../src/platform/db/migrations';

/**
 * FR-004: an OPTIONAL `membershipVersion` counter on `workspaces`, incremented inside every
 * membership change. Two concurrent changes therefore write the same document and conflict, so
 * "a workspace keeps at least one OWNER" cannot be broken by two owners removing each other at
 * once (a counter, not a timestamp: an unchanged value is a no-op and would not conflict).
 * The current validator is extended in place (merged migrations are never edited).
 */
export const migration0007: Migration = {
  id: '0007-membership-version',
  description: 'workspaces.membershipVersion for serialised membership changes (FR-004)',
  async up(db: Db) {
    const [info] = await db.listCollections({ name: 'workspaces' }).toArray();
    const current = (info as { options?: { validator?: { $jsonSchema?: Document } } } | undefined)
      ?.options?.validator?.$jsonSchema;
    if (!current)
      throw new Error('0007: workspaces has no $jsonSchema validator (run 0001 first).');
    const schema = structuredClone(current);
    schema.properties.membershipVersion = { bsonType: ['int', 'long'], minimum: 0 };
    await ensureCollection(db, 'workspaces', schema);
  },
};
