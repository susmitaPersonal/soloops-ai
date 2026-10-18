import type { CrStatus } from '@soloops/contracts';
import type { Database, Filter, TxSession, UpdateFilter } from '../../platform/db';
import type { CursorKey } from '../../platform/http/pagination';
import type { ApprovalDoc, ChangeRequestDoc, VersionDoc } from './documents';
import { deriveCrStatus } from './domain/lifecycle';

export interface VersionWrite {
  versions: VersionDoc[];
  openVersionNumber: number | null;
  approvedVersionNumber: number | null;
  latestVersionNumber: number;
}

/** Scope-guard persistence. Every function takes `workspaceId` first (TenantCollection, SEC-004). */
export function createScopeGuardRepository(db: Database) {
  const crs = (ws: string) => db.tenant<ChangeRequestDoc>('changeRequests', ws);
  const approvals = (ws: string) => db.tenant<ApprovalDoc>('approvals', ws);

  return {
    insert: (ws: string, doc: Omit<ChangeRequestDoc, 'workspaceId'>, tx: TxSession) =>
      crs(ws).insertOne(doc, { session: tx }),
    find: (ws: string, id: string, tx?: TxSession) => crs(ws).findOne({ _id: id }, { session: tx }),

    /**
     * The ONLY way version states change (ADR-0015): versions, pointers and the derived-status
     * cache are written in one single-document update, guarded by the row version read in the
     * same transaction plus a state condition. Null means the guard failed (concurrent change).
     */
    writeVersions(
      ws: string,
      id: string,
      expectedRowVersion: number,
      guard: Filter<ChangeRequestDoc>,
      write: VersionWrite,
      now: Date,
      tx: TxSession,
    ) {
      return crs(ws).findOneAndUpdate(
        { ...guard, _id: id, rowVersion: expectedRowVersion },
        {
          $set: {
            versions: write.versions,
            openVersionNumber: write.openVersionNumber,
            approvedVersionNumber: write.approvedVersionNumber,
            latestVersionNumber: write.latestVersionNumber,
            derivedStatus: deriveCrStatus(write.versions),
            updatedAt: now,
          },
          $inc: { rowVersion: 1 },
        } as UpdateFilter<ChangeRequestDoc>,
        { session: tx },
      );
    },

    /** FR-015 overview: change requests of one project by derived status. */
    countByStatus: (ws: string, projectId: string) =>
      crs(ws).aggregate<{ _id: CrStatus; n: number }>([
        { $match: { projectId } },
        { $group: { _id: '$derivedStatus', n: { $sum: 1 } } },
      ]),

    /** Project CR list, newest first (index `workspace_project_recent`). */
    listByProject(
      ws: string,
      projectId: string,
      opts: { statuses?: CrStatus[]; limit: number; after: CursorKey | null },
    ) {
      const filter: Filter<ChangeRequestDoc> = { projectId };
      if (opts.statuses?.length) filter.derivedStatus = { $in: opts.statuses };
      if (opts.after) filter._id = { $lt: opts.after.id };
      return crs(ws).find(filter, { sort: { _id: -1 }, limit: opts.limit + 1 });
    },

    /** FR-032 approvals queue: oldest activity first (index `workspace_status_recent`). */
    listQueue(
      ws: string,
      opts: { statuses: CrStatus[]; projectId?: string; limit: number; after: CursorKey | null },
    ) {
      const filter: Filter<ChangeRequestDoc> = { derivedStatus: { $in: opts.statuses } };
      if (opts.projectId) filter.projectId = opts.projectId;
      if (opts.after) {
        const at = new Date(opts.after.k);
        Object.assign(filter, {
          $or: [{ updatedAt: { $gt: at } }, { updatedAt: at, _id: { $gt: opts.after.id } }],
        });
      }
      return crs(ws).find(filter, { sort: { updatedAt: 1, _id: 1 }, limit: opts.limit + 1 });
    },

    /** Insert-only: there is deliberately no update or delete for approvals (BR-014). */
    insertApproval: (ws: string, doc: Omit<ApprovalDoc, 'workspaceId'>, tx: TxSession) =>
      approvals(ws).insertOne(doc, { session: tx }),
    listApprovals: (ws: string, changeRequestId: string) =>
      approvals(ws).find({ changeRequestId }, { sort: { versionNumber: 1 } }),
  };
}

export type ScopeGuardRepository = ReturnType<typeof createScopeGuardRepository>;
