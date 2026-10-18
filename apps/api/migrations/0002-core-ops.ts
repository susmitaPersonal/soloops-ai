// Migration scripts are schema infrastructure and may use the raw driver (data-model.md §11).
import type { Db } from 'mongodb';
import { ensureCollection, ensureIndexes, type Migration } from '../src/platform/db/migrations';

const str = (min = 1, max?: number) => ({
  bsonType: 'string',
  minLength: min,
  ...(max === undefined ? {} : { maxLength: max }),
});
const nullableStr = (max: number) => ({ bsonType: ['string', 'null'], maxLength: max });
const date = { bsonType: 'date' };
const nullableDate = { bsonType: ['date', 'null'] };
const timestamps = { createdAt: date, updatedAt: date };
const rowVersion = { bsonType: 'int', minimum: 1 };

export const migration0002: Migration = {
  id: '0002-core-ops',
  description: 'clients, projects, requirements, baselines, tasks (FR-010–FR-014)',
  async up(db: Db) {
    // 4.5 clients
    await ensureCollection(db, 'clients', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'name',
        'contactName',
        'email',
        'phone',
        'billingAddress',
        'taxId',
        'archivedAt',
        'activityVersion',
        'rowVersion',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        name: str(1, 160),
        contactName: nullableStr(160),
        email: nullableStr(254),
        phone: nullableStr(32),
        billingAddress: nullableStr(500),
        taxId: nullableStr(32),
        archivedAt: nullableDate,
        // Incremented when a project is created for the client, so a concurrent client archive
        // always conflicts (ADR-0017 §4).
        activityVersion: { bsonType: 'int', minimum: 0 },
        rowVersion,
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'clients', [
      // Active clients alphabetically; `_id` breaks ties for keyset pagination.
      { key: { workspaceId: 1, archivedAt: 1, name: 1, _id: 1 }, name: 'workspace_archived_name' },
    ]);

    // 4.6 projects
    await ensureCollection(db, 'projects', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'clientId',
        'name',
        'description',
        'billingModel',
        'currency',
        'hourlyRateMinor',
        'startDate',
        'status',
        'archivedAt',
        'counters',
        'activityVersion',
        'rowVersion',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        clientId: str(),
        name: str(1, 160),
        description: nullableStr(5000),
        billingModel: { enum: ['HOURLY', 'FIXED'] },
        currency: { bsonType: 'string', pattern: '^[A-Z]{3}$' },
        hourlyRateMinor: { bsonType: ['long', 'null'], minimum: 0 },
        startDate: { bsonType: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        status: { enum: ['ACTIVE', 'ON_HOLD', 'COMPLETED'] },
        archivedAt: nullableDate,
        counters: {
          bsonType: 'object',
          required: ['requirement', 'changeRequest', 'baseline'],
          additionalProperties: false,
          properties: {
            requirement: { bsonType: 'int', minimum: 0 },
            changeRequest: { bsonType: 'int', minimum: 0 },
            baseline: { bsonType: 'int', minimum: 0 },
          },
        },
        // Incremented by every write to a child of the project, so concurrent transactions on the
        // same project always conflict (a no-op `$set` would not, ADR-0017 §4).
        activityVersion: { bsonType: 'int', minimum: 0 },
        rowVersion,
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'projects', [
      {
        key: { workspaceId: 1, archivedAt: 1, updatedAt: -1, _id: -1 },
        name: 'workspace_archived_recent',
      },
      { key: { workspaceId: 1, clientId: 1 }, name: 'workspace_client' },
    ]);

    // 4.7 requirements
    await ensureCollection(db, 'requirements', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'projectId',
        'number',
        'title',
        'description',
        'acceptanceCriteria',
        'priority',
        'baselineId',
        'deletedAt',
        'rowVersion',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        projectId: str(),
        number: { bsonType: 'int', minimum: 1 },
        title: str(1, 200),
        description: str(0, 10000),
        acceptanceCriteria: { bsonType: 'array', maxItems: 30, items: str(1, 300) },
        priority: { enum: ['MUST', 'SHOULD', 'COULD'] },
        baselineId: { bsonType: ['string', 'null'] },
        deletedAt: nullableDate,
        rowVersion,
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'requirements', [
      // AC-006.1: project-scoped numbers are never reused.
      {
        key: { workspaceId: 1, projectId: 1, number: 1 },
        name: 'workspace_project_number_unique',
        unique: true,
      },
      { key: { workspaceId: 1, projectId: 1, baselineId: 1 }, name: 'workspace_project_baseline' },
    ]);

    // 4.8 baselines
    await ensureCollection(db, 'baselines', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'projectId',
        'sequence',
        'requirementCount',
        'contentHash',
        'createdByUserId',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        projectId: str(),
        sequence: { bsonType: 'int', minimum: 1 },
        requirementCount: { bsonType: 'int', minimum: 1 },
        contentHash: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
        createdByUserId: str(),
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'baselines', [
      {
        key: { workspaceId: 1, projectId: 1, sequence: 1 },
        name: 'workspace_project_sequence_unique',
        unique: true,
      },
    ]);

    // 4.11 tasks
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
        description: nullableStr(5000),
        assigneeUserId: { bsonType: ['string', 'null'] },
        status: { enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
        billable: { bsonType: 'bool' },
        scope: {
          bsonType: 'object',
          required: ['type', 'requirementId', 'changeRequestId', 'versionNumber'],
          additionalProperties: false,
          properties: {
            type: { enum: ['BASELINE', 'CHANGE_REQUEST', 'INTERNAL'] },
            requirementId: { bsonType: ['string', 'null'] },
            changeRequestId: { bsonType: ['string', 'null'] },
            versionNumber: { bsonType: ['int', 'null'], minimum: 1, maximum: 50 },
          },
        },
        rowVersion,
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'tasks', [
      {
        key: { workspaceId: 1, projectId: 1, status: 1, _id: -1 },
        name: 'workspace_project_status',
      },
      { key: { workspaceId: 1, projectId: 1, _id: -1 }, name: 'workspace_project_recent' },
      {
        key: { workspaceId: 1, 'scope.changeRequestId': 1, 'scope.versionNumber': 1 },
        name: 'workspace_cr_version',
      },
    ]);
  },
};
