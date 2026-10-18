// Migration scripts are schema infrastructure and may use the raw driver (data-model.md §11).
import type { Db } from 'mongodb';
import { ensureCollection, ensureIndexes, type Migration } from '../src/platform/db/migrations';

const str = (min = 1, max?: number) => ({
  bsonType: 'string',
  minLength: min,
  ...(max === undefined ? {} : { maxLength: max }),
});
const date = { bsonType: 'date' };
const timestamps = { createdAt: date, updatedAt: date };
const scope = (types: string[]) => ({
  bsonType: 'object',
  required: ['type', 'requirementId', 'changeRequestId', 'versionNumber'],
  additionalProperties: false,
  properties: {
    type: { enum: types },
    requirementId: { bsonType: ['string', 'null'] },
    changeRequestId: { bsonType: ['string', 'null'] },
    versionNumber: { bsonType: ['int', 'null'], minimum: 1, maximum: 50 },
  },
});

export const migration0004: Migration = {
  id: '0004-delivery-and-billable-work',
  description:
    'tasks.origin for conversion from approved versions; billableEntries (FR-030, FR-040)',
  async up(db: Db) {
    // 4.11 tasks: same validator as 0002, plus the optional `origin` of converted tasks (FR-030).
    await ensureCollection(db, 'tasks', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'projectId',
        'title',
        'description',
        'assigneeUserId',
        'status',
        'billable',
        'scope',
        'rowVersion',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        projectId: str(),
        title: str(1, 200),
        description: { bsonType: ['string', 'null'], maxLength: 5000 },
        assigneeUserId: { bsonType: ['string', 'null'] },
        status: { enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
        billable: { bsonType: 'bool' },
        scope: scope(['BASELINE', 'CHANGE_REQUEST', 'INTERNAL']),
        origin: {
          bsonType: 'object',
          required: ['changeRequestId', 'versionNumber', 'criterionIndex'],
          additionalProperties: false,
          properties: {
            changeRequestId: str(),
            versionNumber: { bsonType: 'int', minimum: 1, maximum: 50 },
            criterionIndex: { bsonType: 'int', minimum: 0, maximum: 19 },
          },
        },
        rowVersion: { bsonType: 'int', minimum: 1 },
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'tasks', [
      // "Process the same approved request twice" can never create a second task per criterion.
      {
        key: {
          workspaceId: 1,
          'origin.changeRequestId': 1,
          'origin.versionNumber': 1,
          'origin.criterionIndex': 1,
        },
        name: 'workspace_origin_unique',
        unique: true,
        partialFilterExpression: { origin: { $exists: true } },
      },
    ]);

    // 4.12 billableEntries
    await ensureCollection(db, 'billableEntries', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'projectId',
        'kind',
        'workDate',
        'minutes',
        'amountMinor',
        'currency',
        'description',
        'taskId',
        'scope',
        'invoiceId',
        'createdByUserId',
        'rowVersion',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        projectId: str(),
        kind: { enum: ['TIME', 'FIXED'] },
        workDate: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        minutes: { bsonType: ['int', 'null'], minimum: 1, maximum: 1440 },
        amountMinor: { bsonType: ['long', 'null'], minimum: 1 },
        currency: { bsonType: 'string', pattern: '^[A-Z]{3}$' },
        description: str(1, 500),
        taskId: { bsonType: ['string', 'null'] },
        scope: scope(['BASELINE', 'CHANGE_REQUEST', 'NONE']),
        invoiceId: { bsonType: ['string', 'null'] },
        createdByUserId: str(),
        rowVersion: { bsonType: 'int', minimum: 1 },
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'billableEntries', [
      {
        key: { workspaceId: 1, projectId: 1, invoiceId: 1, workDate: -1, _id: -1 },
        name: 'workspace_project_unbilled',
      },
      { key: { workspaceId: 1, taskId: 1 }, name: 'workspace_task' },
      {
        key: { workspaceId: 1, 'scope.changeRequestId': 1, 'scope.versionNumber': 1 },
        name: 'workspace_cr_version',
      },
    ]);
  },
};
