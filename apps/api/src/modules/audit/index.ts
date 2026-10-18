import type { AuditAction, AuditEntityType } from '@soloops/contracts';
import type { Clock } from '../../platform/clock';
import type { Database, TxSession } from '../../platform/db';
import { newId } from '../../platform/ids';

/** Persistence shape of `auditEvents` (data-model.md §4.15). Insert-only: no update or delete path exists. */
export interface AuditEventDoc {
  _id: string;
  workspaceId: string;
  actorUserId: string;
  action: AuditAction;
  entity: { type: AuditEntityType; id: string; projectId: string | null };
  /** Key facts only — never secrets or raw client text. */
  data: Record<string, unknown>;
  requestId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditEventInput {
  workspaceId: string;
  actorUserId: string;
  action: AuditAction;
  entity: { type: AuditEntityType; id: string; projectId?: string | null };
  data: Record<string, unknown>;
  requestId?: string | null;
}

export function createAuditService(deps: { db: Database; clock: Clock }) {
  return {
    /** BR-028: callers pass their transaction so the event commits or rolls back with the change. */
    async record(tx: TxSession, event: AuditEventInput): Promise<void> {
      const now = deps.clock.now();
      await deps.db.tenant<AuditEventDoc>('auditEvents', event.workspaceId).insertOne(
        {
          _id: newId(),
          actorUserId: event.actorUserId,
          action: event.action,
          entity: {
            type: event.entity.type,
            id: event.entity.id,
            projectId: event.entity.projectId ?? null,
          },
          data: event.data,
          requestId: event.requestId ?? null,
          createdAt: now,
          updatedAt: now,
        },
        { session: tx },
      );
    },
    /** Read access for tests and the future audit log (FR-016). */
    async listForEntity(
      workspaceId: string,
      entity: { type: AuditEntityType; id: string },
    ): Promise<AuditEventDoc[]> {
      return deps.db
        .tenant<AuditEventDoc>('auditEvents', workspaceId)
        .find({ 'entity.type': entity.type, 'entity.id': entity.id }, { sort: { _id: 1 } });
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
