import type { Database, TxSession, UpdateFilter } from '../../platform/db';
import type { MembershipDoc, WorkspaceDoc } from './documents';

/** Workspace and membership persistence. Every call is scoped by `workspaceId` first. */
export function createWorkspaceRepository(db: Database) {
  const workspaces = (workspaceId: string) => db.tenant<WorkspaceDoc>('workspaces', workspaceId);
  const memberships = (workspaceId: string) => db.tenant<MembershipDoc>('memberships', workspaceId);

  return {
    async insertWorkspace(workspaceId: string, doc: Omit<WorkspaceDoc, '_id'>, tx: TxSession) {
      await workspaces(workspaceId).insertOne(doc, { session: tx });
    },
    findWorkspace(workspaceId: string, tx?: TxSession) {
      return workspaces(workspaceId).findOne({}, { session: tx });
    },
    /** Optimistic concurrency: matches only the expected rowVersion; null means stale or missing. */
    updateWorkspaceIfVersion(
      workspaceId: string,
      expectedRowVersion: number,
      set: Partial<Omit<WorkspaceDoc, '_id' | 'rowVersion' | 'nextInvoiceNumber'>>,
      now: Date,
      tx: TxSession,
    ) {
      const update: UpdateFilter<WorkspaceDoc> = {
        $set: { ...set, updatedAt: now },
        $inc: { rowVersion: 1 },
      };
      return workspaces(workspaceId).findOneAndUpdate({ rowVersion: expectedRowVersion }, update, {
        session: tx,
      });
    },
    /** FR-054: AI opt-in fields; bumps rowVersion like any settings change (ERR-005). */
    setAiEnabled(
      workspaceId: string,
      set: { aiEnabled: boolean; aiEnabledAt: Date | null; aiEnabledByUserId: string | null },
      now: Date,
      tx: TxSession,
    ) {
      const update: UpdateFilter<WorkspaceDoc> = {
        $set: { ...set, updatedAt: now },
        $inc: { rowVersion: 1 },
      };
      return workspaces(workspaceId).findOneAndUpdate({}, update, { session: tx });
    },
    /**
     * BR-023: the only write to `nextInvoiceNumber`. Runs inside the issue transaction, so an
     * aborted issue never consumes a number (gapless). `rowVersion` is not bumped: taking a
     * number is not a settings change and must not make an open settings form stale.
     */
    takeInvoiceNumber(workspaceId: string, now: Date, tx: TxSession) {
      return workspaces(workspaceId).findOneAndUpdate(
        {},
        { $inc: { nextInvoiceNumber: 1 }, $set: { updatedAt: now } } as UpdateFilter<WorkspaceDoc>,
        { session: tx },
      );
    },
    async insertMembership(
      workspaceId: string,
      doc: Omit<MembershipDoc, 'workspaceId'>,
      tx?: TxSession,
    ) {
      await memberships(workspaceId).insertOne(doc, { session: tx });
    },
    findMembership(workspaceId: string, userId: string, tx?: TxSession) {
      return memberships(workspaceId).findOne({ userId }, { session: tx });
    },
    /** FR-004 member list, oldest first (index `workspace_user_unique` prefix). */
    listMemberships(workspaceId: string, limit: number) {
      return memberships(workspaceId).find({}, { sort: { createdAt: 1, _id: 1 }, limit });
    },
    countMemberships(workspaceId: string, tx: TxSession, role?: MembershipDoc['role']) {
      return memberships(workspaceId).countDocuments(role ? { role } : {}, { session: tx });
    },
    deleteMembership(workspaceId: string, userId: string, tx: TxSession) {
      return memberships(workspaceId).deleteOne({ userId }, { session: tx });
    },
    /**
     * Increments `membershipVersion` inside a membership transaction, so two concurrent membership
     * changes always write the same document and conflict (MongoDB write conflict → one retries
     * and re-reads). A counter, not a timestamp: setting an unchanged value is a no-op and would not
     * conflict. `rowVersion` is not bumped: membership is not a settings change and must not make
     * an open settings form stale.
     */
    bumpMembershipVersion(workspaceId: string, tx: TxSession) {
      return workspaces(workspaceId).updateOne(
        {},
        { $inc: { membershipVersion: 1 } } as UpdateFilter<WorkspaceDoc>,
        { session: tx },
      );
    },
    /** Cross-tenant read keyed by the authenticated user (workspace switcher). */
    listMembershipsForUser(userId: string) {
      return db
        .userScoped<MembershipDoc>('memberships', userId)
        .find({}, { sort: { _id: 1 }, limit: 100 });
    },
  };
}

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;
