// Migration scripts are schema infrastructure and may use the raw driver (data-model.md §11).
import type { Db } from 'mongodb';
import { ensureCollection, ensureIndexes, type Migration } from '../src/platform/db/migrations';

const str = (min = 1, max?: number) => ({
  bsonType: 'string',
  minLength: min,
  ...(max === undefined ? {} : { maxLength: max }),
});
const date = { bsonType: 'date' };
const nullableDate = { bsonType: ['date', 'null'] };
const long = { bsonType: 'long' };

export const migration0005: Migration = {
  id: '0005-invoices',
  description: 'invoices with embedded lines (FR-042–FR-046, data-model §4.13)',
  async up(db: Db) {
    await ensureCollection(db, 'invoices', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'clientId',
        'projectId',
        'status',
        'number',
        'displayNumber',
        'currency',
        'taxLabel',
        'taxRateBps',
        'calculationVersion',
        'lines',
        'subtotalMinor',
        'taxMinor',
        'totalMinor',
        'issuedAt',
        'issuedByUserId',
        'voidedAt',
        'voidReason',
        'createdByUserId',
        'rowVersion',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        clientId: str(),
        projectId: str(),
        status: { enum: ['DRAFT', 'ISSUED', 'VOID'] },
        number: { bsonType: ['int', 'null'], minimum: 1 },
        displayNumber: { bsonType: ['string', 'null'], maxLength: 32 },
        currency: { bsonType: 'string', pattern: '^[A-Z]{3}$' },
        taxLabel: str(1, 20),
        taxRateBps: { bsonType: 'int', minimum: 0, maximum: 10000 },
        calculationVersion: { bsonType: 'int', minimum: 1 },
        lines: {
          bsonType: 'array',
          minItems: 1,
          maxItems: 200,
          items: {
            bsonType: 'object',
            required: [
              'position',
              'kind',
              'billableEntryId',
              'description',
              'minutes',
              'hourlyRateMinor',
              'amountMinor',
              'adjustmentReason',
            ],
            additionalProperties: false,
            properties: {
              position: { bsonType: 'int', minimum: 1 },
              kind: { enum: ['TIME', 'FIXED', 'ADJUSTMENT'] },
              billableEntryId: { bsonType: ['string', 'null'] },
              description: str(1, 500),
              minutes: { bsonType: ['int', 'null'], minimum: 1, maximum: 1440 },
              hourlyRateMinor: { bsonType: ['long', 'null'], minimum: 0 },
              amountMinor: long,
              adjustmentReason: { bsonType: ['string', 'null'], maxLength: 500 },
            },
          },
        },
        subtotalMinor: long,
        taxMinor: long,
        totalMinor: long,
        issuedAt: nullableDate,
        issuedByUserId: { bsonType: ['string', 'null'] },
        voidedAt: nullableDate,
        voidReason: { bsonType: ['string', 'null'], maxLength: 500 },
        createdByUserId: str(),
        rowVersion: { bsonType: 'int', minimum: 1 },
        createdAt: date,
        updatedAt: date,
      },
    });
    await ensureIndexes(db, 'invoices', [
      // BR-023 / BR-024: a number is assigned once per workspace and never reused.
      {
        key: { workspaceId: 1, number: 1 },
        name: 'workspace_number_unique',
        unique: true,
        partialFilterExpression: { number: { $type: 'int' } },
      },
      { key: { workspaceId: 1, status: 1, _id: -1 }, name: 'workspace_status_recent' },
      { key: { workspaceId: 1, _id: -1 }, name: 'workspace_recent' },
      { key: { workspaceId: 1, projectId: 1, status: 1 }, name: 'workspace_project_status' },
      // BR-030: is this entry referenced by any invoice line (including void invoices)?
      { key: { workspaceId: 1, 'lines.billableEntryId': 1 }, name: 'workspace_line_entry' },
    ]);
  },
};
