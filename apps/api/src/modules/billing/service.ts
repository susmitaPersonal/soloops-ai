import {
  crKey,
  ENTRY_LIST_CAP,
  type EntryDto,
  type EntryListResponse,
  type ProjectOverview,
  type createEntryRequestSchema,
  type entryListQuerySchema,
  type updateEntryRequestSchema,
} from '@soloops/contracts';
import type { z } from 'zod';
import type { Clock } from '../../platform/clock';
import { isAfterDay, todayIn } from '../../platform/dates';
import type { Database, TxSession } from '../../platform/db';
import { errors } from '../../platform/errors';
import { runIdempotent, type IdempotentResponse } from '../../platform/http/idempotency';
import type { TenantCtx } from '../../platform/http/types';
import { newId } from '../../platform/ids';
import { resolveHourlyRate, timeAmountMinor } from '../../platform/money';
import type { AuditService } from '../audit';
import type { CoreOpsService } from '../core-ops';
import type { ScopeGuardService } from '../scope-guard';
import type { WorkspaceService } from '../workspace';
import { toEntryDto, type EntryDoc, type EntryView } from './documents';
import { classifyEntry, type ScopeFacts } from './domain/eligibility';
import { createInvoiceOps } from './invoices';
import { createBillingRepository } from './repository';

type In<S extends z.ZodType> = z.output<S>;
type Scope = EntryDoc['scope'];
type CrAuth = Awaited<ReturnType<ScopeGuardService['getAuthorisationState']>>;

const NO_SCOPE: Scope = {
  type: 'NONE',
  requirementId: null,
  changeRequestId: null,
  versionNumber: null,
};

export type EntryViewer = (
  ctx: TenantCtx,
  projectId: string,
  tx?: TxSession,
) => Promise<{
  project: Awaited<ReturnType<CoreOpsService['getProject']>>;
  settings: Awaited<ReturnType<WorkspaceService['getSettings']>>;
  view: (doc: EntryDoc, ownInvoiceId?: string) => Promise<EntryView>;
  dto: (doc: EntryDoc) => Promise<EntryDto>;
}>;

export function createBillingService(deps: {
  db: Database;
  clock: Clock;
  audit: AuditService;
  workspaces: WorkspaceService;
  coreOps: CoreOpsService;
  scopeGuard: ScopeGuardService;
}) {
  const repo = createBillingRepository(deps.db);
  const now = () => deps.clock.now();

  /**
   * Reads the authoritative facts for one project once per request (requirements, the project
   * and workspace rates, CR version states) and turns entries into DTOs with server eligibility.
   */
  async function viewer(ctx: TenantCtx, projectId: string, tx?: TxSession) {
    const [project, settings, requirements] = await Promise.all([
      deps.coreOps.getProject(ctx, projectId),
      deps.workspaces.getSettings(ctx),
      deps.coreOps.listRequirements(ctx, projectId),
    ]);
    const reqs = new Map(requirements.map((r) => [r.id, r]));
    const crs = new Map<string, Promise<CrAuth>>();
    const crAuth = (changeRequestId: string, versionNumber: number) => {
      const key = `${changeRequestId}/${versionNumber}`;
      let p = crs.get(key);
      if (!p) {
        p = deps.scopeGuard.getAuthorisationState(ctx, { changeRequestId, versionNumber }, tx);
        crs.set(key, p);
      }
      return p;
    };
    const projectRate = project.hourlyRateMinor === null ? null : BigInt(project.hourlyRateMinor);
    const workspaceDefault = BigInt(settings.defaultHourlyRateMinor);

    /** `ownInvoiceId`: the invoice re-checking its own lines does not count as "already invoiced". */
    async function view(doc: EntryDoc, ownInvoiceId?: string): Promise<EntryView> {
      let facts: ScopeFacts = { type: 'NONE' };
      let scopeLabel: string | null = null;
      let versionRate: bigint | null = null;
      if (doc.scope.type === 'BASELINE' && doc.scope.requirementId) {
        const r = reqs.get(doc.scope.requirementId);
        scopeLabel = r?.key ?? null;
        facts = { type: 'BASELINE', key: scopeLabel, baselined: r ? r.baselineId !== null : null };
      } else if (
        doc.scope.type === 'CHANGE_REQUEST' &&
        doc.scope.changeRequestId &&
        doc.scope.versionNumber !== null
      ) {
        const auth = await crAuth(doc.scope.changeRequestId, doc.scope.versionNumber);
        const same = auth !== null && auth.projectId === projectId;
        scopeLabel = same ? `${crKey(auth.crNumber)} v${doc.scope.versionNumber}` : null;
        facts = {
          type: 'CHANGE_REQUEST',
          key: scopeLabel,
          state: same ? auth.state : null,
          authorised: same && auth.authorisesExistingWork,
        };
        if (same) versionRate = auth.hourlyRateMinor;
      }
      const eligibility = classifyEntry({
        scope: facts,
        invoiced: doc.invoiceId !== null && doc.invoiceId !== ownInvoiceId,
        entryCurrency: doc.currency,
        projectCurrency: project.currency,
      });
      if (doc.kind === 'FIXED') {
        return {
          scopeLabel,
          eligibility,
          hourlyRateMinor: null,
          billableAmountMinor: doc.amountMinor ?? 0n,
        };
      }
      // BR-021: approved version rate (change-request work), then project, then workspace.
      const rate = resolveHourlyRate({ versionRate, projectRate, workspaceDefault });
      return {
        scopeLabel,
        eligibility,
        hourlyRateMinor: rate,
        billableAmountMinor: timeAmountMinor(doc.minutes ?? 0, rate),
      };
    }

    return {
      project,
      settings,
      view,
      dto: async (doc: EntryDoc) => toEntryDto(doc, await view(doc)),
    };
  }

  /** The work date is a calendar day in the workspace time zone and cannot be in the future. */
  async function checkWorkDate(ctx: TenantCtx, workDate: string) {
    const settings = await deps.workspaces.getSettings(ctx);
    if (isAfterDay(workDate, todayIn(settings.timeZone, now()))) {
      throw errors.validationFailed([
        { path: 'workDate', message: 'The work date cannot be in the future.' },
      ]);
    }
  }

  /**
   * The scope of a new entry: copied from the task, or chosen directly. IDs in the body that are
   * missing, foreign or of another project are 422 field errors (ADR-0017 §5). A change-request
   * version that is not approved is accepted and classified ineligible (AC-017.2).
   */
  async function resolveScope(
    ctx: TenantCtx,
    projectId: string,
    input: In<typeof createEntryRequestSchema>,
    tx: TxSession,
  ): Promise<{ scope: Scope; taskId: string | null }> {
    if (input.taskId !== undefined) {
      const task = await deps.coreOps.findTask(ctx, input.taskId);
      if (!task || task.projectId !== projectId) {
        throw errors.validationFailed([
          { path: 'taskId', message: 'Choose a task of this project.' },
        ]);
      }
      if (!task.billable) {
        throw errors.validationFailed([
          {
            path: 'taskId',
            message: 'This task is not billable. Mark it billable or log the work without a task.',
          },
        ]);
      }
      const s = task.scope;
      const scope: Scope = s.type === 'INTERNAL' ? NO_SCOPE : { ...s, type: s.type };
      return { scope, taskId: task.id };
    }
    const s = input.scope ?? { type: 'NONE' as const };
    if (s.type === 'BASELINE') {
      const r = await deps.coreOps.findRequirement(ctx, s.requirementId);
      if (!r || r.projectId !== projectId) {
        throw errors.validationFailed([
          { path: 'scope.requirementId', message: 'Choose a requirement of this project.' },
        ]);
      }
      return { scope: { ...NO_SCOPE, type: 'BASELINE', requirementId: r.id }, taskId: null };
    }
    if (s.type === 'CHANGE_REQUEST') {
      const auth = await deps.scopeGuard.getAuthorisationState(
        ctx,
        { changeRequestId: s.changeRequestId, versionNumber: s.versionNumber },
        tx,
      );
      if (!auth || auth.projectId !== projectId) {
        throw errors.validationFailed([
          {
            path: 'scope.changeRequestId',
            message: 'Choose a change-request version of this project.',
          },
        ]);
      }
      return {
        scope: {
          ...NO_SCOPE,
          type: 'CHANGE_REQUEST',
          changeRequestId: s.changeRequestId,
          versionNumber: s.versionNumber,
        },
        taskId: null,
      };
    }
    return { scope: NO_SCOPE, taskId: null };
  }

  /** After a guarded write missed: gone (404), invoiced (409) or stale (412). */
  async function explainMissedEntryWrite(ctx: TenantCtx, entryId: string): Promise<never> {
    const current = await repo.findEntry(ctx.workspaceId, entryId);
    if (!current) throw errors.notFound();
    if (current.invoiceId !== null) throw errors.alreadyInvoiced();
    throw errors.preconditionFailed();
  }

  async function list(ctx: TenantCtx, projectId: string, unbilledOnly: boolean) {
    const v = await viewer(ctx, projectId);
    const docs = await repo.listEntries(ctx.workspaceId, projectId, unbilledOnly);
    const truncated = docs.length > ENTRY_LIST_CAP;
    const dtos = await Promise.all(docs.slice(0, ENTRY_LIST_CAP).map(v.dto));
    const eligible = dtos.filter((d) => d.eligibility.eligible);
    const ineligible = dtos.filter((d) => !d.eligibility.eligible);
    const total = eligible.reduce((sum, d) => sum + BigInt(d.billableAmountMinor), 0n);
    return {
      eligible,
      ineligible,
      eligibleTotalMinor: total.toString(),
      currency: v.project.currency,
      truncated,
    } satisfies EntryListResponse;
  }

  const invoices = createInvoiceOps({ ...deps, repo, viewer });

  return {
    ...invoices,

    // ===== FR-040 log billable work ==============================================================

    /**
     * AC-017.1 / AC-017.2. Logged in the project currency; the scope is copied from the task when
     * one is given. The project lock (BR-029), the insert and the idempotency record commit together.
     */
    async createEntry(
      ctx: TenantCtx,
      projectId: string,
      input: In<typeof createEntryRequestSchema>,
      idempotencyKey: string | null,
    ): Promise<IdempotentResponse> {
      await checkWorkDate(ctx, input.workDate);
      return runIdempotent(
        { db: deps.db, clock: deps.clock },
        {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          key: idempotencyKey,
          route: `POST /projects/${projectId}/billable-entries`,
          requestBody: input,
        },
        async (tx) => {
          await deps.coreOps.lockProjectForChildWrite(ctx, projectId, tx);
          const v = await viewer(ctx, projectId, tx);
          const { scope, taskId } = await resolveScope(ctx, projectId, input, tx);
          const at = now();
          const doc: Omit<EntryDoc, 'workspaceId'> = {
            _id: newId(),
            projectId,
            kind: input.kind,
            workDate: input.workDate,
            minutes: input.kind === 'TIME' ? (input.minutes as number) : null,
            amountMinor: input.kind === 'FIXED' ? BigInt(input.amountMinor as string) : null,
            currency: v.project.currency,
            description: input.description,
            taskId,
            scope,
            invoiceId: null,
            createdByUserId: ctx.userId,
            rowVersion: 1,
            createdAt: at,
            updatedAt: at,
          };
          await repo.insertEntry(ctx.workspaceId, doc, tx);
          const dto = await v.dto({ ...doc, workspaceId: ctx.workspaceId });
          return { status: 201, body: dto as unknown as Record<string, unknown> };
        },
      );
    },

    /** FR-041 / AC-018.1: eligible and ineligible separately, with the server total. */
    async listEntries(
      ctx: TenantCtx,
      projectId: string,
      query: In<typeof entryListQuerySchema>,
    ): Promise<EntryListResponse> {
      return list(ctx, projectId, query.state === 'unbilled');
    },

    async getEntry(ctx: TenantCtx, entryId: string): Promise<EntryDto> {
      const doc = await repo.findEntry(ctx.workspaceId, entryId);
      if (!doc) throw errors.notFound();
      return (await viewer(ctx, doc.projectId)).dto(doc);
    },

    /** AC-017.3: unbilled entries only (409 otherwise), If-Match, kind-specific fields. */
    async updateEntry(
      ctx: TenantCtx,
      entryId: string,
      input: In<typeof updateEntryRequestSchema>,
      ifMatch: number,
    ): Promise<EntryDto> {
      const existing = await repo.findEntry(ctx.workspaceId, entryId);
      if (!existing) throw errors.notFound();
      if (existing.invoiceId !== null) throw errors.alreadyInvoiced();
      if (existing.kind === 'TIME' && input.amountMinor !== undefined) {
        throw errors.validationFailed([
          { path: 'amountMinor', message: 'Time entries have no amount.' },
        ]);
      }
      if (existing.kind === 'FIXED' && input.minutes !== undefined) {
        throw errors.validationFailed([
          { path: 'minutes', message: 'Fixed entries have no minutes.' },
        ]);
      }
      if (input.workDate !== undefined) await checkWorkDate(ctx, input.workDate);
      const set: Partial<EntryDoc> = { updatedAt: now() };
      if (input.workDate !== undefined) set.workDate = input.workDate;
      if (input.minutes !== undefined) set.minutes = input.minutes;
      if (input.amountMinor !== undefined) set.amountMinor = BigInt(input.amountMinor);
      if (input.description !== undefined) set.description = input.description;
      const updated = await deps.db.withTransaction(async (tx) => {
        await deps.coreOps.lockProjectForChildWrite(ctx, existing.projectId, tx);
        return repo.updateUnbilledIfVersion(ctx.workspaceId, entryId, ifMatch, set, tx);
      });
      if (!updated) return explainMissedEntryWrite(ctx, entryId);
      return (await viewer(ctx, updated.projectId)).dto(updated);
    },

    /** AC-017.3: unbilled entries can be deleted; invoiced ones are evidence (409). */
    async deleteEntry(ctx: TenantCtx, entryId: string): Promise<void> {
      const existing = await repo.findEntry(ctx.workspaceId, entryId);
      if (!existing) throw errors.notFound();
      if (existing.invoiceId !== null) throw errors.alreadyInvoiced();
      // BR-030: work that was on an issued (now void) invoice stays as evidence for that invoice.
      if (await repo.entryOnAnyInvoice(ctx.workspaceId, entryId)) {
        throw errors.alreadyInvoiced(
          'This work appears on a void invoice and is kept as its record. It can still be invoiced again.',
        );
      }
      const deleted = await deps.db.withTransaction(async (tx) => {
        await deps.coreOps.lockProjectForChildWrite(ctx, existing.projectId, tx);
        return repo.deleteUnbilled(ctx.workspaceId, entryId, tx);
      });
      if (deleted === 0) await explainMissedEntryWrite(ctx, entryId);
    },

    /** Port for core-ops (data-model §4.6): the project currency is fixed once work is logged. */
    async projectHasEntries(ctx: TenantCtx, projectId: string): Promise<boolean> {
      return repo.hasEntries(ctx.workspaceId, projectId);
    },

    // ===== FR-015 project overview ===============================================================

    /** AC-024.1: counts plus the eligible unbilled total, all computed by the server. */
    async overview(ctx: TenantCtx, projectId: string): Promise<ProjectOverview> {
      const project = await deps.coreOps.getProject(ctx, projectId);
      const [requirements, baselines, changeRequests, tasks, unbilled] = await Promise.all([
        deps.coreOps.listRequirements(ctx, projectId),
        deps.coreOps.listBaselines(ctx, projectId),
        deps.scopeGuard.countByStatus(ctx, projectId),
        deps.coreOps.taskCounts(ctx, projectId),
        list(ctx, projectId, true),
      ]);
      const baselined = requirements.filter((r) => r.baselineId !== null).length;
      return {
        projectId,
        currency: project.currency,
        requirements: { draft: requirements.length - baselined, baselined },
        baselines: baselines.length,
        changeRequests,
        tasks,
        unbilled: {
          eligibleTotalMinor: unbilled.eligibleTotalMinor,
          eligibleCount: unbilled.eligible.length,
          ineligibleCount: unbilled.ineligible.length,
        },
      };
    },
  };
}

export type BillingService = ReturnType<typeof createBillingService>;
