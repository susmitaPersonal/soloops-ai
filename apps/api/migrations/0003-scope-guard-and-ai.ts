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
const timestamps = { createdAt: date, updatedAt: date };
const isoDate = { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const channel = { enum: ['EMAIL', 'CHAT', 'CALL', 'MEETING', 'IN_PERSON', 'OTHER'] };
const strList = { bsonType: 'array', maxItems: 20, items: str(1, 300) };
const minutes = { bsonType: 'int', minimum: 1, maximum: 120000 };
const nullableLong = { bsonType: ['long', 'null'] };

const versionSchema = {
  bsonType: 'object',
  required: [
    'number',
    'state',
    'title',
    'clarifiedDescription',
    'inScope',
    'outOfScope',
    'acceptanceCriteria',
    'affectedRequirementIds',
    'dependencies',
    'assumptions',
    'risks',
    'effort',
    'confirmedEffortMinutes',
    'pricing',
    'timelineImpact',
    'aiFieldProvenance',
    'contentHash',
    'proposedAt',
    'proposedByUserId',
    'decision',
    'createdAt',
  ],
  additionalProperties: false,
  properties: {
    number: { bsonType: 'int', minimum: 1, maximum: 50 },
    state: {
      enum: [
        'DRAFT',
        'PROPOSED',
        'APPROVED',
        'REJECTED',
        'CLARIFICATION_REQUESTED',
        'WITHDRAWN',
        'SUPERSEDED',
      ],
    },
    title: str(0, 200),
    clarifiedDescription: str(0, 4000),
    inScope: strList,
    outOfScope: strList,
    acceptanceCriteria: strList,
    affectedRequirementIds: { bsonType: 'array', maxItems: 50, items: str() },
    dependencies: strList,
    assumptions: strList,
    risks: {
      bsonType: 'array',
      maxItems: 10,
      items: {
        bsonType: 'object',
        required: ['description', 'severity'],
        additionalProperties: false,
        properties: { description: str(1, 300), severity: { enum: ['LOW', 'MEDIUM', 'HIGH'] } },
      },
    },
    effort: {
      bsonType: ['object', 'null'],
      required: ['lowMinutes', 'likelyMinutes', 'highMinutes'],
      additionalProperties: false,
      properties: { lowMinutes: minutes, likelyMinutes: minutes, highMinutes: minutes },
    },
    confirmedEffortMinutes: { bsonType: ['int', 'null'], minimum: 1, maximum: 120000 },
    pricing: {
      bsonType: ['object', 'null'],
      required: ['mode', 'hourlyRateMinor', 'priceMinor', 'currency'],
      additionalProperties: false,
      properties: {
        mode: { enum: ['TIME', 'FIXED'] },
        hourlyRateMinor: nullableLong,
        priceMinor: nullableLong,
        currency: { bsonType: 'string', pattern: '^[A-Z]{3}$' },
      },
    },
    timelineImpact: str(0, 500),
    aiFieldProvenance: { bsonType: 'object' },
    contentHash: { bsonType: ['string', 'null'], pattern: '^[0-9a-f]{64}$' },
    proposedAt: nullableDate,
    proposedByUserId: { bsonType: ['string', 'null'] },
    decision: {
      bsonType: ['object', 'null'],
      required: ['approvalId', 'decision', 'decidedOn', 'clientDecisionMakerName', 'channel'],
      additionalProperties: false,
      properties: {
        approvalId: str(),
        decision: { enum: ['APPROVED', 'REJECTED', 'CLARIFICATION_REQUESTED'] },
        decidedOn: isoDate,
        clientDecisionMakerName: str(1, 120),
        channel,
      },
    },
    createdAt: date,
  },
};

export const migration0003: Migration = {
  id: '0003-scope-guard-and-ai',
  description:
    'changeRequests (embedded versions), approvals, aiGenerations (FR-020–FR-032, FR-050–FR-054)',
  async up(db: Db) {
    // 4.9 changeRequests
    await ensureCollection(db, 'changeRequests', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'projectId',
        'number',
        'rawRequestText',
        'sourceChannel',
        'requestedByName',
        'receivedOn',
        'openVersionNumber',
        'approvedVersionNumber',
        'latestVersionNumber',
        'derivedStatus',
        'versions',
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
        number: { bsonType: 'int', minimum: 1 },
        rawRequestText: str(1, 20000),
        sourceChannel: channel,
        requestedByName: str(1, 120),
        receivedOn: isoDate,
        openVersionNumber: { bsonType: ['int', 'null'] },
        approvedVersionNumber: { bsonType: ['int', 'null'] },
        latestVersionNumber: { bsonType: 'int', minimum: 1, maximum: 50 },
        derivedStatus: {
          enum: [
            'DRAFT',
            'REVISING',
            'AWAITING_DECISION',
            'NEEDS_REVISION',
            'APPROVED',
            'REJECTED',
            'WITHDRAWN',
          ],
        },
        versions: { bsonType: 'array', minItems: 1, maxItems: 50, items: versionSchema },
        createdByUserId: str(),
        rowVersion: { bsonType: 'int', minimum: 1 },
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'changeRequests', [
      {
        key: { workspaceId: 1, projectId: 1, number: 1 },
        name: 'workspace_project_number_unique',
        unique: true,
      },
      { key: { workspaceId: 1, projectId: 1, _id: -1 }, name: 'workspace_project_recent' },
      // Approvals queue and dashboard (ADR-0015); `_id` makes keyset pagination index-backed.
      {
        key: { workspaceId: 1, derivedStatus: 1, updatedAt: -1, _id: -1 },
        name: 'workspace_status_recent',
      },
    ]);

    // 4.10 approvals (insert-only)
    await ensureCollection(db, 'approvals', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'projectId',
        'changeRequestId',
        'versionNumber',
        'decision',
        'contentHash',
        'clientDecisionMakerName',
        'decidedOn',
        'channel',
        'evidenceNote',
        'recordedByUserId',
        'recordedAt',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        projectId: str(),
        changeRequestId: str(),
        versionNumber: { bsonType: 'int', minimum: 1, maximum: 50 },
        decision: { enum: ['APPROVED', 'REJECTED', 'CLARIFICATION_REQUESTED'] },
        contentHash: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
        clientDecisionMakerName: str(1, 120),
        decidedOn: isoDate,
        channel,
        evidenceNote: { bsonType: ['string', 'null'], maxLength: 5000 },
        recordedByUserId: str(),
        recordedAt: date,
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'approvals', [
      // BR-010 / AC-012.4: exactly one decision per version, also under concurrency.
      {
        key: { workspaceId: 1, changeRequestId: 1, versionNumber: 1 },
        name: 'workspace_cr_version_unique',
        unique: true,
      },
      { key: { workspaceId: 1, decidedOn: -1 }, name: 'workspace_decided' },
    ]);

    // 4.14 aiGenerations
    await ensureCollection(db, 'aiGenerations', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'feature',
        'promptVersion',
        'schemaVersion',
        'provider',
        'model',
        'status',
        'errorCode',
        'latencyMs',
        'inputTokens',
        'outputTokens',
        'inputHash',
        'output',
        'prompt',
        'subject',
        'requestedByUserId',
        'expiresAt',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        feature: { enum: ['cr-analysis'] },
        promptVersion: str(1, 64),
        schemaVersion: str(1, 64),
        provider: { enum: ['none', 'mock', 'openai-compatible'] },
        model: str(0, 200),
        status: { enum: ['SUCCEEDED', 'FAILED'] },
        errorCode: { bsonType: ['string', 'null'], maxLength: 64 },
        latencyMs: { bsonType: 'int', minimum: 0 },
        inputTokens: { bsonType: ['int', 'null'], minimum: 0 },
        outputTokens: { bsonType: ['int', 'null'], minimum: 0 },
        inputHash: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
        output: { bsonType: ['object', 'null'] },
        prompt: { bsonType: ['object', 'null'] },
        subject: {
          bsonType: 'object',
          required: ['type', 'changeRequestId', 'versionNumber'],
          additionalProperties: false,
          properties: {
            type: { enum: ['CHANGE_REQUEST_VERSION'] },
            changeRequestId: str(),
            versionNumber: { bsonType: 'int', minimum: 1 },
          },
        },
        requestedByUserId: str(),
        expiresAt: date,
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'aiGenerations', [
      {
        key: { workspaceId: 1, 'subject.changeRequestId': 1, createdAt: -1 },
        name: 'workspace_subject_recent',
      },
      { key: { workspaceId: 1, createdAt: -1 }, name: 'workspace_recent' },
      { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
    ]);
  },
};
