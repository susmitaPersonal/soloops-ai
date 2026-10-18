import { createHash } from 'node:crypto';
import type { Db, Document, IndexDescription } from 'mongodb';
import type { Database } from './index';

/**
 * Versioned migration (data-model.md §11). Scripts live in apps/api/migrations, are
 * idempotent, and are never edited after merge: add a new script instead.
 */
export interface Migration {
  id: string;
  description: string;
  up(db: Db): Promise<void>;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  /** IDs whose recorded checksum differs from the current script (edited after being applied). */
  changed: string[];
}

function checksum(m: Migration): string {
  return createHash('sha256').update(m.up.toString()).digest('hex');
}

export async function runMigrations(
  database: Database,
  migrations: Migration[],
): Promise<MigrationResult> {
  const db = database.raw;
  const ids = migrations.map((m) => m.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate migration IDs.');
  const sorted = [...migrations].sort((a, b) => a.id.localeCompare(b.id));
  const records = db.collection<{
    _id: string;
    appliedAt: Date;
    checksum: string;
    description: string;
  }>('schemaMigrations');
  const result: MigrationResult = { applied: [], skipped: [], changed: [] };
  for (const m of sorted) {
    const existing = await records.findOne({ _id: m.id });
    const sum = checksum(m);
    if (existing) {
      result.skipped.push(m.id);
      if (existing.checksum !== sum) result.changed.push(m.id);
      continue;
    }
    await m.up(db);
    await records.insertOne({
      _id: m.id,
      appliedAt: new Date(),
      checksum: sum,
      description: m.description,
    });
    result.applied.push(m.id);
  }
  return result;
}

/** Creates the collection with a strict `$jsonSchema` validator, or updates the validator if it exists. */
export async function ensureCollection(db: Db, name: string, jsonSchema: Document): Promise<void> {
  const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
  const validator = { $jsonSchema: jsonSchema };
  if (exists) {
    await db.command({
      collMod: name,
      validator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await db.createCollection(name, {
      validator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }
}

export async function ensureIndexes(
  db: Db,
  name: string,
  indexes: IndexDescription[],
): Promise<void> {
  if (indexes.length > 0) await db.collection(name).createIndexes(indexes);
}
