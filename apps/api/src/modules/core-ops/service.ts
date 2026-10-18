import type {
  BaselineDto,
  ClientDto,
  ClientListResponse,
  ProjectDto,
  ProjectListResponse,
  RequirementDto,
  TaskDto,
  TaskListResponse,
  clientListQuerySchema,
  createClientRequestSchema,
  createProjectRequestSchema,
  createRequirementRequestSchema,
  createTaskRequestSchema,
  projectListQuerySchema,
  taskListQuerySchema,
  updateClientRequestSchema,
  updateProjectRequestSchema,
  updateRequirementRequestSchema,
  updateTaskRequestSchema,
} from '@soloops/contracts';
import type { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { Database, TxSession } from '../../platform/db';
import { errors } from '../../platform/errors';
import { decodeCursor, toPage } from '../../platform/http/pagination';
import type { TenantCtx } from '../../platform/http/types';
import { newId } from '../../platform/ids';
import type { AuditService } from '../audit';
import type { WorkspaceService } from '../workspace';
import {
  isProjectReadOnly,
  toBaselineDto,
  toClientDto,
  toProjectDto,
  toRequirementDto,
  toTaskDto,
  type ClientDoc,
  type ProjectDoc,
  type RequirementDoc,
  type TaskDoc,
  type TaskScopeDoc,
} from './documents';
import { baselineContentHash } from './domain/baseline-hash';
import { decideTaskScope, type ScopeTarget } from './domain/task-scope';
import { createCoreOpsRepository, REQUIREMENT_LIST_CAP } from './repository';

type In<S extends z.ZodType> = z.output<S>;

/** Body references (client, requirement, assignee) that are missing or foreign get one message. */
const fieldError = (path: string, message: string) => errors.validationFailed([{ path, message }]);

/**
 * Ports implemented by modules that depend on core-ops (scope-guard, billing). Injected after
 * construction (app.ts) so core-ops never imports them: no module cycle (ADR-0003, ADR-0019).
 */
export interface CoreOpsPorts {
  /** BR-012 / BR-013: authorisation state of a change-request version in this workspace. */
  changeRequestAuthorisation?: (
    ctx: TenantCtx,
    ref: { changeRequestId: string; versionNumber: number },
    tx?: TxSession,
  ) => Promise<{
    projectId: string;
    authorisesNewWork: boolean;
    authorisesExistingWork: boolean;
  } | null>;
  /** data-model §4.6: the currency is fixed once billable work was logged. */
  projectHasBillableEntries?: (ctx: TenantCtx, projectId: string) => Promise<boolean>;
}

export function createCoreOpsService(deps: {
  db: Database;
  clock: Clock;
  audit: AuditService;
  workspaces: WorkspaceService;
  ports?: CoreOpsPorts;
}) {
  const ports: CoreOpsPorts = deps.ports ?? {};
  const repo = createCoreOpsRepository(deps.db);
  const now = () => deps.clock.now();

  /** Loads a project and its client; a foreign or missing ID is 404 (SEC-004, AC-004.2). */
  async function loadProject(ctx: TenantCtx, projectId: string, tx?: TxSession) {
    const project = await repo.findProject(ctx.workspaceId, projectId, tx);
    if (!project) throw errors.notFound();
    const client = await repo.findClient(ctx.workspaceId, project.clientId, tx);
    return { project, client };
  }

  /**
   * BR-029: children of an archived project or client cannot be added or changed. Touching the
   * project inside the caller's transaction makes a concurrent archive conflict and retry.
   */
  async function lockWritableProject(
    ctx: TenantCtx,
    projectId: string,
    tx: TxSession,
    counter?: keyof ProjectDoc['counters'],
  ): Promise<ProjectDoc> {
    const { project, client } = await loadProject(ctx, projectId, tx);
    if (isProjectReadOnly(project, client)) {
      throw errors.archived('This project is archived and read-only.');
    }
    const touched = await repo.touchProject(ctx.workspaceId, projectId, now(), tx, counter);
    if (!touched) throw errors.archived('This project is archived and read-only.');
    return touched;
  }

  async function projectDto(ctx: TenantCtx, project: ProjectDoc): Promise<ProjectDto> {
    return toProjectDto(project, await repo.findClient(ctx.workspaceId, project.clientId));
  }

  /** Distinguishes stale (412) from gone (404) and archived (409) after a guarded update missed. */
  async function explainMissedClientUpdate(ctx: TenantCtx, clientId: string): Promise<never> {
    const current = await repo.findClient(ctx.workspaceId, clientId);
    if (!current) throw errors.notFound();
    if (current.archivedAt) throw errors.archived('This client is archived and read-only.');
    throw errors.preconditionFailed();
  }

  /** BR-015: resolve the scope link within the same project, then apply the pure rule. */
  async function checkScope(
    ctx: TenantCtx,
    projectId: string,
    scope: TaskScopeDoc,
    billable: boolean,
    tx: TxSession,
    /** A link that already existed (only billable changed): SUPERSEDED still authorises it (BR-013). */
    existingLink = false,
  ) {
    let target: ScopeTarget;
    if (scope.type === 'BASELINE') {
      const req = scope.requirementId
        ? await repo.findRequirement(ctx.workspaceId, scope.requirementId, tx)
        : null;
      const sameProject = req && req.projectId === projectId && req.deletedAt === null;
      target = {
        type: 'BASELINE',
        requirement: sameProject ? { baselined: req.baselineId !== null } : null,
      };
    } else if (scope.type === 'CHANGE_REQUEST') {
      // BR-012 / BR-015: only an APPROVED version of the same project authorises a new link.
      const auth =
        scope.changeRequestId && scope.versionNumber !== null && ports.changeRequestAuthorisation
          ? await ports.changeRequestAuthorisation(
              ctx,
              { changeRequestId: scope.changeRequestId, versionNumber: scope.versionNumber },
              tx,
            )
          : null;
      const ok =
        auth !== null &&
        auth.projectId === projectId &&
        (existingLink ? auth.authorisesExistingWork : auth.authorisesNewWork);
      target = { type: 'CHANGE_REQUEST', approvedVersionFound: ok };
    } else {
      target = { type: 'INTERNAL' };
    }
    const decision = decideTaskScope(target, billable);
    if (!decision.ok) {
      throw decision.code === 'NOT_ELIGIBLE'
        ? errors.notEligible(decision.errors, decision.detail)
        : errors.validationFailed(decision.errors);
    }
  }

  /** AC-016.2: the assignee must be a member of this workspace. */
  async function checkAssignee(ctx: TenantCtx, assigneeUserId: string | null) {
    if (assigneeUserId === null) return;
    const membership = await deps.workspaces.findMembership(ctx.workspaceId, assigneeUserId);
    if (!membership) {
      throw fieldError('assigneeUserId', 'The assignee must be a member of this workspace.');
    }
  }

  const toScopeDoc = (scope: In<typeof createTaskRequestSchema>['scope']): TaskScopeDoc => ({
    type: scope.type,
    requirementId: scope.type === 'BASELINE' ? scope.requirementId : null,
    changeRequestId: scope.type === 'CHANGE_REQUEST' ? scope.changeRequestId : null,
    versionNumber: scope.type === 'CHANGE_REQUEST' ? scope.versionNumber : null,
  });

  return {
    /**
     * Public for scope-guard and billing: the BR-029 guard (archived project or client → 409) and a
     * real write to the project inside the caller's transaction, so concurrent archives conflict
     * (ADR-0017 §4). Optionally allocates the next number of a project counter.
     */
    async lockProjectForChildWrite(
      ctx: TenantCtx,
      projectId: string,
      tx: TxSession,
      counter?: keyof ProjectDoc['counters'],
    ): Promise<{ projectId: string; counters: ProjectDoc['counters'] }> {
      const p = await lockWritableProject(ctx, projectId, tx, counter);
      return { projectId: p._id, counters: { ...p.counters } };
    },

    /**
     * FR-030 (called by scope-guard inside its transaction, after it verified the version is
     * APPROVED): one billable task per acceptance criterion, linked to the version. Criteria that
     * were converted before are reported, not duplicated (unique `workspace_origin_unique`).
     */
    async createTasksFromVersion(
      ctx: TenantCtx,
      tx: TxSession,
      input: {
        projectId: string;
        changeRequestId: string;
        versionNumber: number;
        items: { criterionIndex: number; title: string }[];
      },
    ): Promise<{ created: TaskDto[]; alreadyConverted: number[] }> {
      await lockWritableProject(ctx, input.projectId, tx);
      const existing = await repo.findConvertedTasks(
        ctx.workspaceId,
        input.changeRequestId,
        input.versionNumber,
        input.items.map((i) => i.criterionIndex),
        tx,
      );
      const done = new Set(existing.map((t) => t.origin?.criterionIndex));
      const created: TaskDto[] = [];
      for (const item of input.items) {
        if (done.has(item.criterionIndex)) continue;
        const at = now();
        const doc: Omit<TaskDoc, 'workspaceId'> = {
          _id: newId(),
          projectId: input.projectId,
          title: item.title.slice(0, 200),
          description: null,
          assigneeUserId: null,
          status: 'TODO',
          billable: true,
          scope: {
            type: 'CHANGE_REQUEST',
            requirementId: null,
            changeRequestId: input.changeRequestId,
            versionNumber: input.versionNumber,
          },
          origin: {
            changeRequestId: input.changeRequestId,
            versionNumber: input.versionNumber,
            criterionIndex: item.criterionIndex,
          },
          rowVersion: 1,
          createdAt: at,
          updatedAt: at,
        };
        await repo.insertTask(ctx.workspaceId, doc, tx);
        created.push(toTaskDto({ ...doc, workspaceId: ctx.workspaceId }));
      }
      return {
        created,
        alreadyConverted: input.items.map((i) => i.criterionIndex).filter((i) => done.has(i)),
      };
    },

    /** Public read for billing: one live requirement of this workspace, or null. */
    async findRequirement(ctx: TenantCtx, requirementId: string): Promise<RequirementDto | null> {
      const r = await repo.findRequirement(ctx.workspaceId, requirementId);
      return r && r.deletedAt === null ? toRequirementDto(r) : null;
    },

    /** Public read for billing: one task of this workspace, or null. */
    async findTask(ctx: TenantCtx, taskId: string): Promise<TaskDto | null> {
      const t = await repo.findTask(ctx.workspaceId, taskId);
      return t ? toTaskDto(t) : null;
    },

    /** FR-015: task counts by status and by scope kind. */
    async taskCounts(ctx: TenantCtx, projectId: string) {
      const rows = await repo.countTasksByProject(ctx.workspaceId, projectId);
      const out = {
        TODO: 0,
        IN_PROGRESS: 0,
        DONE: 0,
        total: 0,
        original: 0,
        additional: 0,
        internal: 0,
      };
      for (const r of rows) {
        out[r._id.status as 'TODO' | 'IN_PROGRESS' | 'DONE'] += r.n;
        out.total += r.n;
        if (r._id.type === 'BASELINE') out.original += r.n;
        else if (r._id.type === 'CHANGE_REQUEST') out.additional += r.n;
        else out.internal += r.n;
      }
      return out;
    },

    // ===== FR-010 clients =======================================================================

    /** AC-004.1. */
    async createClient(
      ctx: TenantCtx,
      input: In<typeof createClientRequestSchema>,
    ): Promise<ClientDto> {
      const at = now();
      const doc: Omit<ClientDoc, 'workspaceId'> = {
        _id: newId(),
        name: input.name,
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        billingAddress: input.billingAddress ?? null,
        taxId: input.taxId ?? null,
        archivedAt: null,
        activityVersion: 0,
        rowVersion: 1,
        createdAt: at,
        updatedAt: at,
      };
      await repo.insertClient(ctx.workspaceId, doc);
      return toClientDto({ ...doc, workspaceId: ctx.workspaceId });
    },

    /** AC-004.1, AC-004.3: archived clients are hidden unless `archived=true`. */
    async listClients(
      ctx: TenantCtx,
      query: In<typeof clientListQuerySchema>,
    ): Promise<ClientListResponse> {
      const rows = await repo.listClients(ctx.workspaceId, {
        archived: query.archived,
        limit: query.limit,
        after: decodeCursor(query.cursor),
      });
      const pageOf = toPage(rows, query.limit, (c) => ({ k: c.name, id: c._id }));
      return { items: pageOf.items.map(toClientDto), nextCursor: pageOf.nextCursor };
    },

    /** AC-004.2: a foreign or missing client is 404. */
    async getClient(ctx: TenantCtx, clientId: string): Promise<ClientDto> {
      const client = await repo.findClient(ctx.workspaceId, clientId);
      if (!client) throw errors.notFound();
      return toClientDto(client);
    },

    /** FR-010 edit. BR-029: archived → 409. ERR-005: stale If-Match → 412. */
    async updateClient(
      ctx: TenantCtx,
      clientId: string,
      input: In<typeof updateClientRequestSchema>,
      expectedRowVersion: number,
    ): Promise<ClientDto> {
      const set: Partial<ClientDoc> = {};
      for (const key of [
        'name',
        'contactName',
        'email',
        'phone',
        'billingAddress',
        'taxId',
      ] as const) {
        if (input[key] !== undefined) (set as Record<string, unknown>)[key] = input[key];
      }
      const updated = await repo.updateClientIfVersion(
        ctx.workspaceId,
        clientId,
        expectedRowVersion,
        set,
        now(),
      );
      if (!updated) return explainMissedClientUpdate(ctx, clientId);
      return toClientDto(updated);
    },

    /** AC-004.3. Idempotent: archiving an archived client returns it unchanged. */
    async archiveClient(ctx: TenantCtx, clientId: string): Promise<ClientDto> {
      const archived = await deps.db.withTransaction(async (tx) => {
        const at = now();
        const doc = await repo.archiveClient(ctx.workspaceId, clientId, at, tx);
        if (doc) await repo.touchClientProjects(ctx.workspaceId, clientId, at, tx);
        return doc;
      });
      if (archived) return toClientDto(archived);
      const current = await repo.findClient(ctx.workspaceId, clientId);
      if (!current) throw errors.notFound();
      return toClientDto(current);
    },

    // ===== FR-011 projects ======================================================================

    /** AC-005.1, AC-005.2. Currency defaults to the workspace currency (AC-002.1). */
    async createProject(
      ctx: TenantCtx,
      input: In<typeof createProjectRequestSchema>,
    ): Promise<ProjectDto> {
      const settings = await deps.workspaces.getSettings(ctx);
      const archivedClient = () =>
        errors.archived('This client is archived. New projects cannot be added to it.');
      const at = now();
      const doc: Omit<ProjectDoc, 'workspaceId'> = {
        _id: newId(),
        clientId: input.clientId,
        name: input.name,
        description: input.description ?? null,
        billingModel: input.billingModel,
        currency: input.currency ?? settings.defaultCurrency,
        hourlyRateMinor:
          input.hourlyRateMinor === undefined || input.hourlyRateMinor === null
            ? null
            : BigInt(input.hourlyRateMinor),
        startDate: input.startDate ?? null,
        status: input.status ?? 'ACTIVE',
        archivedAt: null,
        counters: { requirement: 0, changeRequest: 0, baseline: 0 },
        activityVersion: 0,
        rowVersion: 1,
        createdAt: at,
        updatedAt: at,
      };
      // AC-005.2 / BR-029: check and write the client in one transaction, so a concurrent client
      // archive conflicts with this create instead of racing it.
      const client = await deps.db.withTransaction(async (tx) => {
        const found = await repo.findClient(ctx.workspaceId, input.clientId, tx);
        if (!found) throw fieldError('clientId', 'Choose a client from this workspace.');
        if (found.archivedAt) throw archivedClient();
        const touched = await repo.touchClient(ctx.workspaceId, found._id, at, tx);
        if (!touched) throw archivedClient();
        await repo.insertProject(ctx.workspaceId, { ...doc, clientId: found._id }, tx);
        return touched;
      });
      return toProjectDto({ ...doc, workspaceId: ctx.workspaceId }, client);
    },

    async listProjects(
      ctx: TenantCtx,
      query: In<typeof projectListQuerySchema>,
    ): Promise<ProjectListResponse> {
      const after = decodeCursor(query.cursor);
      // The project cursor carries a timestamp; a tampered value must not reach the filter.
      if (after && Number.isNaN(Date.parse(after.k))) {
        throw fieldError('cursor', 'The cursor is invalid.');
      }
      const rows = await repo.listProjects(ctx.workspaceId, {
        archived: query.archived,
        ...(query.clientId ? { clientId: query.clientId } : {}),
        limit: query.limit,
        after,
      });
      const pageOf = toPage(rows, query.limit, (p) => ({
        k: p.updatedAt.toISOString(),
        id: p._id,
      }));
      const clients = await repo.findClients(ctx.workspaceId, [
        ...new Set(pageOf.items.map((p) => p.clientId)),
      ]);
      const byId = new Map(clients.map((c) => [c._id, c]));
      return {
        items: pageOf.items.map((p) => toProjectDto(p, byId.get(p.clientId) ?? null)),
        nextCursor: pageOf.nextCursor,
      };
    },

    async getProject(ctx: TenantCtx, projectId: string): Promise<ProjectDto> {
      const { project, client } = await loadProject(ctx, projectId);
      return toProjectDto(project, client);
    },

    /** FR-011 edit. The client is fixed. BR-029: archived project or client → 409. */
    async updateProject(
      ctx: TenantCtx,
      projectId: string,
      input: In<typeof updateProjectRequestSchema>,
      expectedRowVersion: number,
    ): Promise<ProjectDto> {
      const set: Partial<ProjectDoc> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.description !== undefined) set.description = input.description;
      if (input.billingModel !== undefined) set.billingModel = input.billingModel;
      if (input.currency !== undefined) set.currency = input.currency;
      if (input.hourlyRateMinor !== undefined) {
        set.hourlyRateMinor = input.hourlyRateMinor === null ? null : BigInt(input.hourlyRateMinor);
      }
      if (input.startDate !== undefined) set.startDate = input.startDate;
      if (input.status !== undefined) set.status = input.status;
      // BR-029: the client is read in the same transaction as the write, so a concurrent client
      // archive (which writes this project) conflicts and the retry sees the archive.
      const result = await deps.db.withTransaction(async (tx) => {
        const { project, client } = await loadProject(ctx, projectId, tx);
        if (isProjectReadOnly(project, client)) {
          throw errors.archived('This project is archived and read-only.');
        }
        // data-model §4.6: the currency is immutable after the first billable entry.
        if (
          set.currency !== undefined &&
          set.currency !== project.currency &&
          ports.projectHasBillableEntries &&
          (await ports.projectHasBillableEntries(ctx, projectId))
        ) {
          throw errors.invalidStateTransition(
            'The currency cannot change after billable work was logged for this project.',
          );
        }
        const doc = await repo.updateProjectIfVersion(
          ctx.workspaceId,
          projectId,
          expectedRowVersion,
          set,
          now(),
          tx,
        );
        return { doc, client };
      });
      const { doc: updated, client } = result;
      if (!updated) {
        const current = await repo.findProject(ctx.workspaceId, projectId);
        if (!current) throw errors.notFound();
        if (current.archivedAt) throw errors.archived('This project is archived and read-only.');
        throw errors.preconditionFailed();
      }
      return toProjectDto(updated, client);
    },

    /** BR-029. Idempotent like client archive. */
    async archiveProject(ctx: TenantCtx, projectId: string): Promise<ProjectDto> {
      const archived = await repo.archiveProject(ctx.workspaceId, projectId, now());
      if (archived) return projectDto(ctx, archived);
      const current = await repo.findProject(ctx.workspaceId, projectId);
      if (!current) throw errors.notFound();
      return projectDto(ctx, current);
    },

    // ===== FR-012 requirements ==================================================================

    async listRequirements(ctx: TenantCtx, projectId: string): Promise<RequirementDto[]> {
      await loadProject(ctx, projectId);
      return (await repo.listRequirements(ctx.workspaceId, projectId)).map(toRequirementDto);
    },

    /** AC-006.1: `$inc` on the project counter allocates REQ-n; numbers are never reused. */
    async createRequirement(
      ctx: TenantCtx,
      projectId: string,
      input: In<typeof createRequirementRequestSchema>,
    ): Promise<RequirementDto> {
      const doc = await deps.db.withTransaction(async (tx) => {
        const project = await lockWritableProject(ctx, projectId, tx, 'requirement');
        // BR-004: a baseline must freeze *every* draft, and lists return at most the cap, so the
        // number of active requirements per project is bounded (data-model §6).
        if (
          (await repo.countActiveRequirements(ctx.workspaceId, projectId, tx)) >=
          REQUIREMENT_LIST_CAP
        ) {
          throw errors.validationFailed(
            [
              {
                path: '(body)',
                message: `A project can have at most ${REQUIREMENT_LIST_CAP} requirements.`,
              },
            ],
            `A project can have at most ${REQUIREMENT_LIST_CAP} requirements.`,
          );
        }
        const at = now();
        const created: Omit<RequirementDoc, 'workspaceId'> = {
          _id: newId(),
          projectId,
          number: project.counters.requirement,
          title: input.title,
          description: input.description ?? '',
          acceptanceCriteria: input.acceptanceCriteria ?? [],
          priority: input.priority,
          baselineId: null,
          deletedAt: null,
          rowVersion: 1,
          createdAt: at,
          updatedAt: at,
        };
        await repo.insertRequirement(ctx.workspaceId, created, tx);
        return created;
      });
      return toRequirementDto({ ...doc, workspaceId: ctx.workspaceId });
    },

    /** AC-006.2 / AC-007.2: drafts are editable; baselined → 409 BASELINE_LOCKED. */
    async updateRequirement(
      ctx: TenantCtx,
      requirementId: string,
      input: In<typeof updateRequirementRequestSchema>,
      expectedRowVersion: number,
    ): Promise<RequirementDto> {
      const existing = await repo.findRequirement(ctx.workspaceId, requirementId);
      if (!existing || existing.deletedAt) throw errors.notFound();
      if (existing.baselineId) throw errors.baselineLocked();
      const set: Partial<RequirementDoc> = {};
      if (input.title !== undefined) set.title = input.title;
      if (input.description !== undefined) set.description = input.description;
      if (input.acceptanceCriteria !== undefined) set.acceptanceCriteria = input.acceptanceCriteria;
      if (input.priority !== undefined) set.priority = input.priority;
      const updated = await deps.db.withTransaction(async (tx) => {
        await lockWritableProject(ctx, existing.projectId, tx);
        return repo.updateDraftRequirement(
          ctx.workspaceId,
          requirementId,
          expectedRowVersion,
          set,
          now(),
          tx,
        );
      });
      if (!updated) {
        // The guard missed: frozen by a concurrent baseline, deleted, or a stale version.
        const current = await repo.findRequirement(ctx.workspaceId, requirementId);
        if (!current || current.deletedAt) throw errors.notFound();
        if (current.baselineId) throw errors.baselineLocked();
        throw errors.preconditionFailed();
      }
      return toRequirementDto(updated);
    },

    /** FR-012 / AC-007.2: soft delete for drafts only; the number is never reused. */
    async deleteRequirement(ctx: TenantCtx, requirementId: string): Promise<void> {
      const existing = await repo.findRequirement(ctx.workspaceId, requirementId);
      if (!existing || existing.deletedAt) throw errors.notFound();
      if (existing.baselineId) throw errors.baselineLocked();
      const res = await deps.db.withTransaction(async (tx) => {
        await lockWritableProject(ctx, existing.projectId, tx);
        return repo.softDeleteDraftRequirement(ctx.workspaceId, requirementId, now(), tx);
      });
      if (res.matched === 0) {
        const current = await repo.findRequirement(ctx.workspaceId, requirementId);
        if (current?.baselineId) throw errors.baselineLocked();
        throw errors.notFound();
      }
    },

    // ===== FR-013 baselines =====================================================================

    async listBaselines(ctx: TenantCtx, projectId: string): Promise<BaselineDto[]> {
      await loadProject(ctx, projectId);
      return (await repo.listBaselines(ctx.workspaceId, projectId)).map(toBaselineDto);
    },

    /**
     * AC-007.1, BR-004, BR-005, BR-028: one transaction allocates the sequence, freezes every
     * draft requirement, stores their content hash and writes the audit event. The project
     * counter write makes concurrent baselines (or requirement creation) conflict and retry.
     */
    async createBaseline(ctx: TenantCtx, projectId: string): Promise<BaselineDto> {
      const created = await deps.db.withTransaction(async (tx) => {
        const project = await lockWritableProject(ctx, projectId, tx, 'baseline');
        const drafts = await repo.listUnbaselined(ctx.workspaceId, projectId, tx);
        if ((await repo.countUnbaselined(ctx.workspaceId, projectId, tx)) !== drafts.length) {
          // Defensive (BR-004): never baseline a partial set of drafts.
          throw new Error('Baseline would not freeze every draft requirement.');
        }
        if (drafts.length === 0) {
          // AC-007.3. Throwing aborts the transaction, so the sequence number is not consumed.
          throw errors.validationFailed(
            [{ path: '(body)', message: 'There are no draft requirements to baseline.' }],
            'Add at least one requirement before creating a baseline.',
          );
        }
        const at = now();
        const baseline = {
          _id: newId(),
          projectId,
          sequence: project.counters.baseline,
          requirementCount: drafts.length,
          contentHash: baselineContentHash(drafts),
          createdByUserId: ctx.userId,
          createdAt: at,
          updatedAt: at,
        };
        await repo.insertBaseline(ctx.workspaceId, baseline, tx);
        const frozen = await repo.freezeRequirements(
          ctx.workspaceId,
          drafts.map((d) => d._id),
          baseline._id,
          at,
          tx,
        );
        if (frozen.modified !== drafts.length) {
          // Defensive: the snapshot read and the write disagree; never store a wrong hash.
          throw new Error('Baseline freeze matched a different set of requirements.');
        }
        await deps.audit.record(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: 'baseline.created',
          entity: { type: 'BASELINE', id: baseline._id, projectId },
          data: {
            sequence: baseline.sequence,
            requirementCount: baseline.requirementCount,
            contentHash: baseline.contentHash,
            requirementNumbers: drafts.map((d) => d.number),
          },
          requestId: ctx.requestId,
        });
        return baseline;
      });
      return toBaselineDto({ ...created, workspaceId: ctx.workspaceId });
    },

    // ===== FR-014 tasks =========================================================================

    async listTasks(
      ctx: TenantCtx,
      projectId: string,
      query: In<typeof taskListQuerySchema>,
    ): Promise<TaskListResponse> {
      await loadProject(ctx, projectId);
      const rows = await repo.listTasks(ctx.workspaceId, projectId, {
        ...(query.status ? { status: query.status } : {}),
        ...(query.assigneeUserId ? { assigneeUserId: query.assigneeUserId } : {}),
        limit: query.limit,
        after: decodeCursor(query.cursor),
      });
      const pageOf = toPage(rows, query.limit, (t) => ({ k: '', id: t._id }));
      return { items: pageOf.items.map(toTaskDto), nextCursor: pageOf.nextCursor };
    },

    async getTask(ctx: TenantCtx, taskId: string): Promise<TaskDto> {
      const task = await repo.findTask(ctx.workspaceId, taskId);
      if (!task) throw errors.notFound();
      return toTaskDto(task);
    },

    /** FR-014, BR-015, AC-016.1–.2. */
    async createTask(
      ctx: TenantCtx,
      projectId: string,
      input: In<typeof createTaskRequestSchema>,
    ): Promise<TaskDto> {
      const scope = toScopeDoc(input.scope);
      const billable = input.billable ?? false;
      const assigneeUserId = input.assigneeUserId ?? null;
      const doc = await deps.db.withTransaction(async (tx) => {
        await lockWritableProject(ctx, projectId, tx);
        await checkScope(ctx, projectId, scope, billable, tx);
        await checkAssignee(ctx, assigneeUserId);
        const at = now();
        const created: Omit<TaskDoc, 'workspaceId'> = {
          _id: newId(),
          projectId,
          title: input.title,
          description: input.description ?? null,
          assigneeUserId,
          status: input.status ?? 'TODO',
          billable,
          scope,
          rowVersion: 1,
          createdAt: at,
          updatedAt: at,
        };
        await repo.insertTask(ctx.workspaceId, created, tx);
        return created;
      });
      return toTaskDto({ ...doc, workspaceId: ctx.workspaceId });
    },

    /** FR-014 / AC-016.2. BR-015 is re-checked whenever the scope or billable flag changes. */
    async updateTask(
      ctx: TenantCtx,
      taskId: string,
      input: In<typeof updateTaskRequestSchema>,
      expectedRowVersion: number,
    ): Promise<TaskDto> {
      const set: Partial<TaskDoc> = {};
      if (input.title !== undefined) set.title = input.title;
      if (input.description !== undefined) set.description = input.description;
      if (input.status !== undefined) set.status = input.status;
      if (input.assigneeUserId !== undefined) set.assigneeUserId = input.assigneeUserId;
      if (input.billable !== undefined) set.billable = input.billable;
      if (input.scope !== undefined) set.scope = toScopeDoc(input.scope);
      const updated = await deps.db.withTransaction(async (tx) => {
        // BR-015: the rule is checked against the version being replaced, read in this
        // transaction. A stale If-Match is refused before any check, so a concurrent edit can't
        // combine an old snapshot with a new version (e.g. INTERNAL + billable).
        const existing = await repo.findTask(ctx.workspaceId, taskId, tx);
        if (!existing) throw errors.notFound();
        if (existing.rowVersion !== expectedRowVersion) throw errors.preconditionFailed();
        await lockWritableProject(ctx, existing.projectId, tx);
        if (input.scope !== undefined || input.billable !== undefined) {
          const sameLink =
            input.scope === undefined ||
            JSON.stringify(toScopeDoc(input.scope)) === JSON.stringify(existing.scope);
          await checkScope(
            ctx,
            existing.projectId,
            set.scope ?? existing.scope,
            set.billable ?? existing.billable,
            tx,
            sameLink,
          );
        }
        if (input.assigneeUserId !== undefined) await checkAssignee(ctx, input.assigneeUserId);
        return repo.updateTaskIfVersion(
          ctx.workspaceId,
          taskId,
          expectedRowVersion,
          set,
          now(),
          tx,
        );
      });
      if (!updated) throw errors.preconditionFailed();
      return toTaskDto(updated);
    },
  };
}

export type CoreOpsService = ReturnType<typeof createCoreOpsService>;
