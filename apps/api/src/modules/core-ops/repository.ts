import type { Database, Filter, TxSession, UpdateFilter } from '../../platform/db';
import type { CursorKey } from '../../platform/http/pagination';
import type { BaselineDoc, ClientDoc, ProjectDoc, RequirementDoc, TaskDoc } from './documents';

/** Max requirements per project returned in one list (data-model §6: small by nature). */
export const REQUIREMENT_LIST_CAP = 500;

/**
 * Core Ops persistence. Every function takes `workspaceId` first and goes through
 * `TenantCollection`, so a foreign ID simply matches nothing (SEC-004).
 */
export function createCoreOpsRepository(db: Database) {
  const clients = (ws: string) => db.tenant<ClientDoc>('clients', ws);
  const projects = (ws: string) => db.tenant<ProjectDoc>('projects', ws);
  const requirements = (ws: string) => db.tenant<RequirementDoc>('requirements', ws);
  const baselines = (ws: string) => db.tenant<BaselineDoc>('baselines', ws);
  const tasks = (ws: string) => db.tenant<TaskDoc>('tasks', ws);

  /** Optimistic concurrency (ERR-005): `$inc rowVersion` only when the expected version matches. */
  const versioned = <T>(set: Partial<T>, now: Date): UpdateFilter<T> =>
    ({ $set: { ...set, updatedAt: now }, $inc: { rowVersion: 1 } }) as unknown as UpdateFilter<T>;

  return {
    // --- clients -------------------------------------------------------------------------------
    insertClient: (ws: string, doc: Omit<ClientDoc, 'workspaceId'>) => clients(ws).insertOne(doc),
    findClient: (ws: string, id: string, tx?: TxSession) =>
      clients(ws).findOne({ _id: id }, { session: tx }),
    findClients: (ws: string, ids: string[]) =>
      ids.length === 0 ? Promise.resolve([]) : clients(ws).find({ _id: { $in: ids } }),
    /** Alphabetical keyset page (index `workspace_archived_name`). */
    listClients(ws: string, opts: { archived: boolean; limit: number; after: CursorKey | null }) {
      const filter: Filter<ClientDoc> = opts.archived
        ? { archivedAt: { $ne: null } }
        : { archivedAt: null };
      if (opts.after) {
        Object.assign(filter, {
          $or: [
            { name: { $gt: opts.after.k } },
            { name: opts.after.k, _id: { $gt: opts.after.id } },
          ],
        });
      }
      return clients(ws).find(filter, { sort: { name: 1, _id: 1 }, limit: opts.limit + 1 });
    },
    updateClientIfVersion: (
      ws: string,
      id: string,
      expected: number,
      set: Partial<ClientDoc>,
      now: Date,
    ) =>
      clients(ws).findOneAndUpdate(
        { _id: id, rowVersion: expected, archivedAt: null },
        versioned<ClientDoc>(set, now),
      ),
    archiveClient: (ws: string, id: string, now: Date, tx: TxSession) =>
      clients(ws).findOneAndUpdate(
        { _id: id, archivedAt: null },
        versioned<ClientDoc>({ archivedAt: now }, now),
        { session: tx },
      ),

    // --- projects ------------------------------------------------------------------------------
    insertProject: (ws: string, doc: Omit<ProjectDoc, 'workspaceId'>, tx: TxSession) =>
      projects(ws).insertOne(doc, { session: tx }),
    /** BR-029: a real write to the client inside the project-create transaction (see touchProject). */
    touchClient: (ws: string, id: string, now: Date, tx: TxSession) =>
      clients(ws).findOneAndUpdate(
        { _id: id, archivedAt: null },
        { $set: { updatedAt: now }, $inc: { activityVersion: 1 } } as UpdateFilter<ClientDoc>,
        { session: tx },
      ),
    findProject: (ws: string, id: string, tx?: TxSession) =>
      projects(ws).findOne({ _id: id }, { session: tx }),
    /** Most recently active first (index `workspace_archived_recent`). */
    listProjects(
      ws: string,
      opts: { archived: boolean; clientId?: string; limit: number; after: CursorKey | null },
    ) {
      const filter: Filter<ProjectDoc> = opts.archived
        ? { archivedAt: { $ne: null } }
        : { archivedAt: null };
      if (opts.clientId) filter.clientId = opts.clientId;
      if (opts.after) {
        const at = new Date(opts.after.k);
        Object.assign(filter, {
          $or: [{ updatedAt: { $lt: at } }, { updatedAt: at, _id: { $lt: opts.after.id } }],
        });
      }
      return projects(ws).find(filter, { sort: { updatedAt: -1, _id: -1 }, limit: opts.limit + 1 });
    },
    updateProjectIfVersion: (
      ws: string,
      id: string,
      expected: number,
      set: Partial<ProjectDoc>,
      now: Date,
      tx: TxSession,
    ) =>
      projects(ws).findOneAndUpdate(
        { _id: id, rowVersion: expected, archivedAt: null },
        versioned<ProjectDoc>(set, now),
        { session: tx },
      ),
    /**
     * BR-029: archiving a client writes each of its active projects in the same transaction, so a
     * concurrent child write (which touches its project) conflicts and retries instead of racing.
     */
    touchClientProjects: (ws: string, clientId: string, now: Date, tx: TxSession) =>
      projects(ws).updateMany(
        { clientId, archivedAt: null },
        { $set: { updatedAt: now }, $inc: { activityVersion: 1 } } as UpdateFilter<ProjectDoc>,
        { session: tx },
      ),
    archiveProject: (ws: string, id: string, now: Date) =>
      projects(ws).findOneAndUpdate(
        { _id: id, archivedAt: null },
        versioned<ProjectDoc>({ archivedAt: now }, now),
      ),
    /**
     * Writes to a project's children "touch" the project inside the same transaction, guarded by
     * `archivedAt: null`. A concurrent archive then conflicts instead of racing (BR-029), and the
     * project list stays ordered by recent activity. Optionally allocates a counter number.
     */
    touchProject: (
      ws: string,
      id: string,
      now: Date,
      tx: TxSession,
      counter?: keyof ProjectDoc['counters'],
    ) =>
      projects(ws).findOneAndUpdate(
        { _id: id, archivedAt: null },
        {
          $set: { updatedAt: now },
          // Always a real write: a `$set` of an unchanged value would not raise a write conflict.
          $inc: { activityVersion: 1, ...(counter ? { [`counters.${counter}`]: 1 } : {}) },
        } as UpdateFilter<ProjectDoc>,
        { session: tx },
      ),

    // --- requirements --------------------------------------------------------------------------
    insertRequirement: (ws: string, doc: Omit<RequirementDoc, 'workspaceId'>, tx: TxSession) =>
      requirements(ws).insertOne(doc, { session: tx }),
    findRequirement: (ws: string, id: string, tx?: TxSession) =>
      requirements(ws).findOne({ _id: id }, { session: tx }),
    listRequirements: (ws: string, projectId: string) =>
      requirements(ws).find(
        { projectId, deletedAt: null },
        { sort: { number: 1 }, limit: REQUIREMENT_LIST_CAP },
      ),
    /** Active (not deleted) requirements of a project; bounded by REQUIREMENT_LIST_CAP. */
    countActiveRequirements: (ws: string, projectId: string, tx: TxSession) =>
      requirements(ws).countDocuments({ projectId, deletedAt: null }, { session: tx }),
    countUnbaselined: (ws: string, projectId: string, tx: TxSession) =>
      requirements(ws).countDocuments(
        { projectId, baselineId: null, deletedAt: null },
        { session: tx },
      ),
    listUnbaselined: (ws: string, projectId: string, tx: TxSession) =>
      requirements(ws).find(
        { projectId, baselineId: null, deletedAt: null },
        { sort: { number: 1 }, limit: REQUIREMENT_LIST_CAP, session: tx },
      ),
    /** BR-004: the filter only matches drafts, so a baselined requirement can never change. */
    updateDraftRequirement: (
      ws: string,
      id: string,
      expected: number,
      set: Partial<RequirementDoc>,
      now: Date,
      tx: TxSession,
    ) =>
      requirements(ws).findOneAndUpdate(
        { _id: id, rowVersion: expected, baselineId: null, deletedAt: null },
        versioned<RequirementDoc>(set, now),
        { session: tx },
      ),
    softDeleteDraftRequirement: (ws: string, id: string, now: Date, tx: TxSession) =>
      requirements(ws).updateOne(
        { _id: id, baselineId: null, deletedAt: null },
        versioned<RequirementDoc>({ deletedAt: now }, now),
        { session: tx },
      ),
    freezeRequirements: (ws: string, ids: string[], baselineId: string, now: Date, tx: TxSession) =>
      requirements(ws).updateMany(
        { _id: { $in: ids }, baselineId: null, deletedAt: null },
        versioned<RequirementDoc>({ baselineId }, now),
        { session: tx },
      ),

    // --- baselines -----------------------------------------------------------------------------
    insertBaseline: (ws: string, doc: Omit<BaselineDoc, 'workspaceId'>, tx: TxSession) =>
      baselines(ws).insertOne(doc, { session: tx }),
    listBaselines: (ws: string, projectId: string) =>
      baselines(ws).find({ projectId }, { sort: { sequence: 1 } }),

    // --- tasks ---------------------------------------------------------------------------------
    insertTask: (ws: string, doc: Omit<TaskDoc, 'workspaceId'>, tx: TxSession) =>
      tasks(ws).insertOne(doc, { session: tx }),
    findTask: (ws: string, id: string, tx?: TxSession) =>
      tasks(ws).findOne({ _id: id }, { session: tx }),
    /** FR-030: tasks already converted from these criteria of one version (duplicate guard). */
    findConvertedTasks: (
      ws: string,
      changeRequestId: string,
      versionNumber: number,
      criterionIndexes: number[],
      tx: TxSession,
    ) =>
      tasks(ws).find(
        {
          'origin.changeRequestId': changeRequestId,
          'origin.versionNumber': versionNumber,
          'origin.criterionIndex': { $in: criterionIndexes },
        } as Filter<TaskDoc>,
        { session: tx },
      ),
    countTasksByProject: (ws: string, projectId: string) =>
      tasks(ws).aggregate<{ _id: { status: string; type: string }; n: number }>([
        { $match: { projectId } },
        { $group: { _id: { status: '$status', type: '$scope.type' }, n: { $sum: 1 } } },
      ]),
    /** Newest first (index `workspace_project_status` / `workspace_project_recent`). */
    listTasks(
      ws: string,
      projectId: string,
      opts: { status?: string; assigneeUserId?: string; limit: number; after: CursorKey | null },
    ) {
      const filter: Filter<TaskDoc> = { projectId };
      if (opts.status) filter.status = opts.status as TaskDoc['status'];
      if (opts.assigneeUserId) filter.assigneeUserId = opts.assigneeUserId;
      if (opts.after) filter._id = { $lt: opts.after.id };
      return tasks(ws).find(filter, { sort: { _id: -1 }, limit: opts.limit + 1 });
    },
    updateTaskIfVersion: (
      ws: string,
      id: string,
      expected: number,
      set: Partial<TaskDoc>,
      now: Date,
      tx: TxSession,
    ) =>
      tasks(ws).findOneAndUpdate({ _id: id, rowVersion: expected }, versioned<TaskDoc>(set, now), {
        session: tx,
      }),
  };
}

export type CoreOpsRepository = ReturnType<typeof createCoreOpsRepository>;
