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
const timestamps = { createdAt: date, updatedAt: date };

export const migration0001: Migration = {
  id: '0001-identity-and-workspaces',
  description: 'users, sessions, workspaces, memberships, auditEvents, idempotencyKeys',
  async up(db: Db) {
    // 4.1 users (global)
    await ensureCollection(db, 'users', {
      bsonType: 'object',
      required: ['_id', 'email', 'name', 'passwordHash', 'createdAt', 'updatedAt'],
      additionalProperties: false,
      properties: {
        _id: str(),
        email: str(3, 254),
        name: str(1, 120),
        passwordHash: { bsonType: 'string', pattern: '^\\$argon2id\\$' },
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'users', [{ key: { email: 1 }, name: 'email_unique', unique: true }]);

    // 4.2 sessions (global): _id is the SHA-256 of the cookie token, never the token itself.
    await ensureCollection(db, 'sessions', {
      bsonType: 'object',
      required: ['_id', 'userId', 'createdAt', 'lastSeenAt', 'expiresAt', 'absoluteExpiresAt'],
      additionalProperties: false,
      properties: {
        _id: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
        userId: str(),
        createdAt: date,
        lastSeenAt: date,
        expiresAt: date,
        absoluteExpiresAt: date,
      },
    });
    await ensureIndexes(db, 'sessions', [
      { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
      { key: { userId: 1 }, name: 'userId' },
    ]);

    // 4.3 workspaces (tenant key is _id)
    await ensureCollection(db, 'workspaces', {
      bsonType: 'object',
      required: [
        '_id',
        'name',
        'defaultCurrency',
        'defaultHourlyRateMinor',
        'taxLabel',
        'taxRateBps',
        'invoicePrefix',
        'timeZone',
        'nextInvoiceNumber',
        'billingDetails',
        'aiEnabled',
        'aiEnabledAt',
        'aiEnabledByUserId',
        'rowVersion',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        name: str(1, 120),
        defaultCurrency: { bsonType: 'string', pattern: '^[A-Z]{3}$' },
        defaultHourlyRateMinor: { bsonType: 'long', minimum: 0 },
        taxLabel: str(1, 20),
        taxRateBps: { bsonType: 'int', minimum: 0, maximum: 10000 },
        invoicePrefix: { bsonType: 'string', pattern: '^[A-Z0-9-]{1,10}$' },
        timeZone: str(1, 64),
        nextInvoiceNumber: { bsonType: 'int', minimum: 1 },
        billingDetails: {
          bsonType: 'object',
          required: ['legalName', 'address', 'taxId'],
          additionalProperties: false,
          properties: { legalName: str(1, 160), address: nullableStr(500), taxId: nullableStr(32) },
        },
        aiEnabled: { bsonType: 'bool' },
        aiEnabledAt: { bsonType: ['date', 'null'] },
        aiEnabledByUserId: { bsonType: ['string', 'null'] },
        rowVersion: { bsonType: 'int', minimum: 1 },
        ...timestamps,
      },
    });

    // 4.4 memberships
    await ensureCollection(db, 'memberships', {
      bsonType: 'object',
      required: ['_id', 'workspaceId', 'userId', 'role', 'createdAt', 'updatedAt'],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        userId: str(),
        role: { enum: ['OWNER', 'MEMBER'] },
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'memberships', [
      { key: { workspaceId: 1, userId: 1 }, name: 'workspace_user_unique', unique: true },
      { key: { userId: 1 }, name: 'userId' },
    ]);

    // 4.15 auditEvents (insert-only)
    await ensureCollection(db, 'auditEvents', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'actorUserId',
        'action',
        'entity',
        'data',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        actorUserId: str(),
        action: str(1, 64),
        entity: {
          bsonType: 'object',
          required: ['type', 'id'],
          additionalProperties: false,
          properties: { type: str(1, 40), id: str(), projectId: { bsonType: ['string', 'null'] } },
        },
        data: { bsonType: 'object' },
        requestId: { bsonType: ['string', 'null'] },
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'auditEvents', [
      {
        key: { workspaceId: 1, 'entity.type': 1, 'entity.id': 1, _id: 1 },
        name: 'workspace_entity_history',
      },
      { key: { workspaceId: 1, _id: -1 }, name: 'workspace_log' },
    ]);

    // 4.16 idempotencyKeys (used from M3 for transition endpoints)
    await ensureCollection(db, 'idempotencyKeys', {
      bsonType: 'object',
      required: [
        '_id',
        'workspaceId',
        'key',
        'userId',
        'route',
        'requestHash',
        'responseStatus',
        'responseBody',
        'expiresAt',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: str(),
        workspaceId: str(),
        key: str(1, 128),
        userId: str(),
        route: str(1, 200),
        requestHash: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
        responseStatus: { bsonType: 'int' },
        responseBody: { bsonType: ['object', 'array', 'null'] },
        expiresAt: date,
        ...timestamps,
      },
    });
    await ensureIndexes(db, 'idempotencyKeys', [
      { key: { workspaceId: 1, key: 1 }, name: 'workspace_key_unique', unique: true },
      { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
    ]);
  },
};
