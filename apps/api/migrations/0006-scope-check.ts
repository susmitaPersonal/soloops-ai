// Migration scripts are schema infrastructure and may use the raw driver (data-model.md §11).
import type { Db, Document } from 'mongodb';
import { ensureCollection, type Migration } from '../src/platform/db/migrations';

/**
 * FR-021 scope check: two OPTIONAL properties on each embedded change-request version, so every
 * existing document stays valid. The current validator is read and extended in place instead of
 * being copied from 0003 (merged migrations are never edited).
 */
export const migration0006: Migration = {
  id: '0006-scope-check',
  description: 'changeRequests.versions: questionsForClient and scopeVerdict (FR-021 scope check)',
  async up(db: Db) {
    const [info] = await db.listCollections({ name: 'changeRequests' }).toArray();
    const current = (info as { options?: { validator?: { $jsonSchema?: Document } } } | undefined)
      ?.options?.validator?.$jsonSchema;
    if (!current)
      throw new Error('0006: changeRequests has no $jsonSchema validator (run 0003 first).');
    const schema = structuredClone(current);
    const version = schema.properties.versions.items;
    version.properties.questionsForClient = {
      bsonType: 'array',
      maxItems: 20,
      items: { bsonType: 'string', minLength: 1, maxLength: 300 },
    };
    version.properties.scopeVerdict = {
      enum: ['NEW_SCOPE', 'CHANGES_AGREED_SCOPE', 'LIKELY_ALREADY_COVERED', 'UNCLEAR', null],
    };
    await ensureCollection(db, 'changeRequests', schema);
  },
};
