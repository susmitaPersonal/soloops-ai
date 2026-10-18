import {
  crKey,
  crStatuses,
  ESTIMATE_DISCLAIMER,
  type AnalysisResponse,
  type ChangeRequestDetail,
  type ChangeRequestDto,
  type ChangeRequestListResponse,
  type ChangeRequestSummary,
  type CrStatus,
  type FieldError,
  type ProposalSummary,
  type VersionDiff,
  type changeRequestListQuerySchema,
  type convertToTasksRequestSchema,
  type createChangeRequestSchema,
  type recordDecisionRequestSchema,
  type updateVersionRequestSchema,
} from '@soloops/contracts';
import type { z } from 'zod';
import type { Clock } from '../../platform/clock';
import { todayIn } from '../../platform/dates';
import { DuplicateKeyError, type Database, type TxSession } from '../../platform/db';
import { errors } from '../../platform/errors';
import { runIdempotent, type IdempotentResponse } from '../../platform/http/idempotency';
import { decodeCursor, toPage } from '../../platform/http/pagination';
import type { TenantCtx } from '../../platform/http/types';
import { newId } from '../../platform/ids';
import { resolveHourlyRate, timeAmountMinor } from '../../platform/money';
import type { AiService } from '../ai';
import type { AuditService } from '../audit';
import type { CoreOpsService } from '../core-ops';
import type { WorkspaceService } from '../workspace';
import {
  toApprovalDto,
  toChangeRequestDto,
  toVersionDto,
  type ChangeRequestDoc,
  type VersionDoc,
} from './documents';
import { authorisesExistingWork, authorisesNewWork } from './domain/lifecycle';
import {
  computePricing,
  diffVersions,
  proposeProblems,
  versionContentHash,
} from './domain/version-rules';
import { createScopeGuardRepository, type VersionWrite } from './repository';

type In<S extends z.ZodType> = z.output<S>;

const MAX_VERSIONS = 50;
const QUEUE_DEFAULT: CrStatus[] = ['AWAITING_DECISION', 'NEEDS_REVISION'];

function emptyVersion(number: number, title: string, now: Date): VersionDoc {
  return {
    number,
    state: 'DRAFT',
    title,
    clarifiedDescription: '',
    inScope: [],
    outOfScope: [],
    acceptanceCriteria: [],
    affectedRequirementIds: [],
    dependencies: [],
    assumptions: [],
    risks: [],
    effort: null,
    confirmedEffortMinutes: null,
    pricing: null,
    timelineImpact: '',
    questionsForClient: [],
    scopeVerdict: null,
    aiFieldProvenance: {},
    contentHash: null,
    proposedAt: null,
    proposedByUserId: null,
    decision: null,
    createdAt: now,
  };
}

/** Pointers derived from the versions themselves, so they can never disagree with them. */
function pointers(versions: VersionDoc[]): Omit<VersionWrite, 'versions'> {
  const open = versions.find((v) => v.state === 'DRAFT' || v.state === 'PROPOSED');
  const approved = versions.find((v) => v.state === 'APPROVED');
  return {
    openVersionNumber: open?.number ?? null,
    approvedVersionNumber: approved?.number ?? null,
    latestVersionNumber: Math.max(...versions.map((v) => v.number)),
  };
}

const versionGuard = (n: number, state: VersionDoc['state'], contentHash?: string) => ({
  versions: { $elemMatch: { number: n, state, ...(contentHash ? { contentHash } : {}) } },
});

export function createScopeGuardService(deps: {
  db: Database;
  clock: Clock;
  audit: AuditService;
  workspaces: WorkspaceService;
  coreOps: CoreOpsService;
  ai: AiService;
}) {
  const repo = createScopeGuardRepository(deps.db);
  const now = () => deps.clock.now();

  async function loadCr(ctx: TenantCtx, crId: string, tx?: TxSession) {
    const cr = await repo.find(ctx.workspaceId, crId, tx);
    if (!cr) throw errors.notFound();
    return cr;
  }

  function versionOf(cr: ChangeRequestDoc, n: number): VersionDoc {
    const v = cr.versions.find((x) => x.number === n);
    if (!v) throw errors.notFound();
    return v;
  }

  async function dto(ctx: TenantCtx, cr: ChangeRequestDoc): Promise<ChangeRequestDto> {
    const project = await deps.coreOps.getProject(ctx, cr.projectId);
    return toChangeRequestDto(cr, project.readOnly);
  }

  /** BR-021 resolution for proposals: project override, then workspace default. */
  async function rateContext(ctx: TenantCtx, projectId: string) {
    const [project, ws] = await Promise.all([
      deps.coreOps.getProject(ctx, projectId),
      deps.workspaces.getSettings(ctx),
    ]);
    return {
      project,
      ws,
      rate: resolveHourlyRate({
        projectRate: project.hourlyRateMinor === null ? null : BigInt(project.hourlyRateMinor),
        workspaceDefault: BigInt(ws.defaultHourlyRateMinor),
      }),
    };
  }

  /** Affected requirements must be live requirements of the same project (data-model §4.9). */
  async function checkAffected(ctx: TenantCtx, projectId: string, ids: string[]) {
    if (ids.length === 0) return;
    const known = new Set((await deps.coreOps.listRequirements(ctx, projectId)).map((r) => r.id));
    const bad = ids.findIndex((id) => !known.has(id));
    if (bad !== -1) {
      throw errors.validationFailed([
        { path: `affectedRequirementIds.${bad}`, message: 'Choose requirements of this project.' },
      ]);
    }
  }

  /** Runs a version transition: idempotency, project lock (BR-029) and audit share one transaction. */
  function transition(
    ctx: TenantCtx,
    idempotencyKey: string | null,
    route: string,
    body: unknown,
    fn: (tx: TxSession) => Promise<IdempotentResponse>,
  ) {
    return runIdempotent(
      { db: deps.db, clock: deps.clock },
      {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        key: idempotencyKey,
        route,
        requestBody: body,
      },
      fn,
    ).catch((err: unknown) => {
      // BR-010 / AC-012.4: the unique approvals index turned a concurrent duplicate into a conflict.
      if (
        err instanceof DuplicateKeyError &&
        err.indexName?.includes('workspace_cr_version_unique')
      ) {
        throw errors.invalidStateTransition('A decision was already recorded for this version.');
      }
      throw err;
    });
  }

  async function summaryOf(ctx: TenantCtx, cr: ChangeRequestDoc): Promise<ChangeRequestSummary> {
    const v =
      cr.versions.find((x) => x.number === cr.openVersionNumber) ??
      versionOf(cr, cr.latestVersionNumber);
    const project = await deps.coreOps.getProject(ctx, cr.projectId);
    const approved =
      cr.approvedVersionNumber === null ? null : versionOf(cr, cr.approvedVersionNumber);
    return {
      id: cr._id,
      projectId: cr.projectId,
      projectName: project.name,
      number: cr.number,
      key: crKey(cr.number),
      title: v.title,
      status: cr.derivedStatus,
      currentVersionNumber: v.number,
      currentVersionState: v.state,
      priceMinor: v.pricing?.priceMinor?.toString() ?? null,
      currency: v.pricing?.currency ?? project.currency,
      proposedAt: v.proposedAt ? v.proposedAt.toISOString() : null,
      updatedAt: cr.updatedAt.toISOString(),
      approvedVersionNumber: approved?.number ?? null,
      approvedVersionTitle: approved?.title ?? null,
    };
  }

  return {
    // ===== FR-020 record a change request ========================================================

    /** AC-008.1–.2: version 1 is a DRAFT; the raw text is stored unchanged; archived → 409. */
    async createChangeRequest(
      ctx: TenantCtx,
      projectId: string,
      input: In<typeof createChangeRequestSchema>,
    ): Promise<ChangeRequestDto> {
      const ws = await deps.workspaces.getSettings(ctx);
      if (input.receivedOn > todayIn(ws.timeZone, now())) {
        throw errors.validationFailed([
          { path: 'receivedOn', message: 'The received date cannot be in the future.' },
        ]);
      }
      const created = await deps.db.withTransaction(async (tx) => {
        const locked = await deps.coreOps.lockProjectForChildWrite(
          ctx,
          projectId,
          tx,
          'changeRequest',
        );
        const at = now();
        const title =
          input.title && input.title.length > 0
            ? input.title
            : (input.rawRequestText.trim().split(/\r?\n/)[0] ?? '').slice(0, 200).trim();
        const versions = [emptyVersion(1, title, at)];
        const doc: Omit<ChangeRequestDoc, 'workspaceId'> = {
          _id: newId(),
          projectId,
          number: locked.counters.changeRequest,
          rawRequestText: input.rawRequestText,
          sourceChannel: input.sourceChannel,
          requestedByName: input.requestedByName,
          receivedOn: input.receivedOn,
          ...pointers(versions),
          derivedStatus: 'DRAFT',
          versions,
          createdByUserId: ctx.userId,
          rowVersion: 1,
          createdAt: at,
          updatedAt: at,
        };
        await repo.insert(ctx.workspaceId, doc, tx);
        await deps.audit.record(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: 'cr.created',
          entity: { type: 'CHANGE_REQUEST', id: doc._id, projectId },
          data: { number: doc.number, sourceChannel: doc.sourceChannel, versionNumber: 1 },
          requestId: ctx.requestId,
        });
        return doc;
      });
      return dto(ctx, { ...created, workspaceId: ctx.workspaceId });
    },

    async listForProject(
      ctx: TenantCtx,
      projectId: string,
      query: In<typeof changeRequestListQuerySchema>,
    ): Promise<ChangeRequestListResponse> {
      await deps.coreOps.getProject(ctx, projectId);
      const rows = await repo.listByProject(ctx.workspaceId, projectId, {
        ...(query.status ? { statuses: query.status } : {}),
        limit: query.limit,
        after: decodeCursor(query.cursor),
      });
      const page = toPage(rows, query.limit, (c) => ({ k: '', id: c._id }));
      return {
        items: await Promise.all(page.items.map((c) => summaryOf(ctx, c))),
        nextCursor: page.nextCursor,
      };
    },

    /** FR-032 / AC-027.1: CRs awaiting a decision or needing revision, oldest activity first. */
    async listQueue(
      ctx: TenantCtx,
      query: In<typeof changeRequestListQuerySchema>,
    ): Promise<ChangeRequestListResponse> {
      const after = decodeCursor(query.cursor);
      if (after && Number.isNaN(Date.parse(after.k))) {
        throw errors.validationFailed([{ path: 'cursor', message: 'The cursor is invalid.' }]);
      }
      const rows = await repo.listQueue(ctx.workspaceId, {
        statuses: query.status?.length ? query.status : QUEUE_DEFAULT,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        limit: query.limit,
        after,
      });
      const page = toPage(rows, query.limit, (c) => ({ k: c.updatedAt.toISOString(), id: c._id }));
      return {
        items: await Promise.all(page.items.map((c) => summaryOf(ctx, c))),
        nextCursor: page.nextCursor,
      };
    },

    /** FR-028 / AC-014.1: versions, immutable decisions and the audit history. */
    async getChangeRequest(ctx: TenantCtx, crId: string): Promise<ChangeRequestDetail> {
      const cr = await loadCr(ctx, crId);
      const [base, approvals, history] = await Promise.all([
        dto(ctx, cr),
        repo.listApprovals(ctx.workspaceId, cr._id),
        deps.audit.listForEntity(ctx.workspaceId, { type: 'CHANGE_REQUEST', id: cr._id }),
      ]);
      return {
        ...base,
        decisions: approvals.map(toApprovalDto),
        history: history.map((e) => ({
          id: e._id,
          action: e.action,
          actorUserId: e.actorUserId,
          data: e.data,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    },

    // ===== FR-022 edit a draft ===================================================================

    /** BR-006: only DRAFT content is editable; If-Match is the CR row version (ERR-005). */
    async updateDraft(
      ctx: TenantCtx,
      crId: string,
      n: number,
      input: In<typeof updateVersionRequestSchema>,
      expectedRowVersion: number,
    ): Promise<ChangeRequestDto> {
      const current = await loadCr(ctx, crId);
      const draft = versionOf(current, n);
      if (draft.state !== 'DRAFT') {
        throw errors.invalidStateTransition(
          'Only a draft can be edited. Create a new version to change a proposal (BR-011).',
        );
      }
      if (input.affectedRequirementIds) {
        await checkAffected(ctx, current.projectId, input.affectedRequirementIds);
      }
      const provenance = { ...draft.aiFieldProvenance };
      for (const [field, generationId] of Object.entries(input.aiFieldProvenance ?? {})) {
        if (generationId === null || generationId === undefined) {
          delete provenance[field];
          continue;
        }
        if (!(await deps.ai.generationBelongsTo(ctx.workspaceId, generationId, crId))) {
          throw errors.validationFailed([
            {
              path: `aiFieldProvenance.${field}`,
              message: 'Unknown AI suggestion for this change request.',
            },
          ]);
        }
        provenance[field] = generationId;
      }
      const { rate, project } = await rateContext(ctx, current.projectId);

      const updated = await deps.db.withTransaction(async (tx) => {
        await deps.coreOps.lockProjectForChildWrite(ctx, current.projectId, tx);
        const cr = await loadCr(ctx, crId, tx);
        if (cr.rowVersion !== expectedRowVersion) throw errors.preconditionFailed();
        const base = versionOf(cr, n);
        if (base.state !== 'DRAFT')
          throw errors.invalidStateTransition('Only a draft can be edited.');
        const next: VersionDoc = { ...base, aiFieldProvenance: provenance };
        if (input.title !== undefined) next.title = input.title;
        if (input.clarifiedDescription !== undefined)
          next.clarifiedDescription = input.clarifiedDescription;
        if (input.inScope !== undefined) next.inScope = input.inScope;
        if (input.outOfScope !== undefined) next.outOfScope = input.outOfScope;
        if (input.acceptanceCriteria !== undefined)
          next.acceptanceCriteria = input.acceptanceCriteria;
        if (input.affectedRequirementIds !== undefined) {
          next.affectedRequirementIds = input.affectedRequirementIds;
        }
        if (input.dependencies !== undefined) next.dependencies = input.dependencies;
        if (input.assumptions !== undefined) next.assumptions = input.assumptions;
        if (input.risks !== undefined) next.risks = input.risks;
        if (input.effort !== undefined) next.effort = input.effort;
        if (input.confirmedEffortMinutes !== undefined) {
          next.confirmedEffortMinutes = input.confirmedEffortMinutes;
        }
        if (input.timelineImpact !== undefined) next.timelineImpact = input.timelineImpact;
        if (input.questionsForClient !== undefined) {
          next.questionsForClient = input.questionsForClient;
        }
        if (input.scopeVerdict !== undefined) next.scopeVerdict = input.scopeVerdict;
        const pricingInput =
          input.pricing !== undefined
            ? input.pricing
            : base.pricing === null
              ? null
              : base.pricing.mode === 'FIXED'
                ? { mode: 'FIXED' as const, priceMinor: (base.pricing.priceMinor ?? 0n).toString() }
                : { mode: 'TIME' as const };
        // AC-010.1: the server computes TIME prices on every save; the UI never does.
        next.pricing = computePricing(
          pricingInput,
          next.confirmedEffortMinutes,
          rate,
          project.currency,
        );
        const versions = cr.versions.map((v) => (v.number === n ? next : v));
        return repo.writeVersions(
          ctx.workspaceId,
          crId,
          cr.rowVersion,
          versionGuard(n, 'DRAFT'),
          { versions, ...pointers(versions) },
          now(),
          tx,
        );
      });
      if (!updated) throw errors.preconditionFailed();
      return dto(ctx, updated);
    },

    /** Discard a never-proposed revision draft (lifecycle "discard draft"). Version 1 stays. */
    async discardDraft(ctx: TenantCtx, crId: string, n: number): Promise<ChangeRequestDto> {
      const result = await deps.db.withTransaction(async (tx) => {
        const cr = await loadCr(ctx, crId, tx);
        await deps.coreOps.lockProjectForChildWrite(ctx, cr.projectId, tx);
        const v = versionOf(cr, n);
        if (v.state !== 'DRAFT' || n === 1) {
          throw errors.invalidStateTransition(
            n === 1
              ? 'The first version cannot be discarded; edit it instead.'
              : 'Only a draft that was never proposed can be discarded.',
          );
        }
        const versions = cr.versions.filter((x) => x.number !== n);
        const updated = await repo.writeVersions(
          ctx.workspaceId,
          crId,
          cr.rowVersion,
          versionGuard(n, 'DRAFT'),
          { versions, ...pointers(versions) },
          now(),
          tx,
        );
        if (!updated) throw errors.preconditionFailed();
        await deps.audit.record(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: 'cr.version.discarded',
          entity: { type: 'CHANGE_REQUEST', id: crId, projectId: cr.projectId },
          data: { versionNumber: n },
          requestId: ctx.requestId,
        });
        return updated;
      });
      return dto(ctx, result);
    },

    // ===== FR-026 new version ====================================================================

    /** AC-013.1–.2 / BR-009: a DRAFT copy of the latest version, only when nothing is open. */
    async createVersion(
      ctx: TenantCtx,
      crId: string,
      idempotencyKey: string | null,
    ): Promise<IdempotentResponse> {
      return transition(
        ctx,
        idempotencyKey,
        `POST /change-requests/${crId}/versions`,
        {},
        async (tx) => {
          const cr = await loadCr(ctx, crId, tx);
          await deps.coreOps.lockProjectForChildWrite(ctx, cr.projectId, tx);
          if (cr.openVersionNumber !== null) {
            throw errors.invalidStateTransition(
              `Version ${cr.openVersionNumber} is still open. Decide, withdraw or discard it first (BR-009).`,
            );
          }
          if (cr.versions.length >= MAX_VERSIONS) {
            throw errors.invalidStateTransition('A change request can have at most 50 versions.');
          }
          const latest = versionOf(cr, cr.latestVersionNumber);
          const at = now();
          const copy: VersionDoc = {
            ...emptyVersion(latest.number + 1, latest.title, at),
            clarifiedDescription: latest.clarifiedDescription,
            inScope: latest.inScope,
            outOfScope: latest.outOfScope,
            acceptanceCriteria: latest.acceptanceCriteria,
            affectedRequirementIds: latest.affectedRequirementIds,
            dependencies: latest.dependencies,
            assumptions: latest.assumptions,
            risks: latest.risks,
            effort: latest.effort,
            confirmedEffortMinutes: latest.confirmedEffortMinutes,
            pricing: latest.pricing,
            timelineImpact: latest.timelineImpact,
            aiFieldProvenance: latest.aiFieldProvenance,
          };
          const versions = [...cr.versions, copy];
          const updated = await repo.writeVersions(
            ctx.workspaceId,
            crId,
            cr.rowVersion,
            { openVersionNumber: null, latestVersionNumber: latest.number },
            { versions, ...pointers(versions) },
            at,
            tx,
          );
          if (!updated)
            throw errors.invalidStateTransition('This change request changed. Reload it.');
          await deps.audit.record(tx, {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            action: 'cr.version.created',
            entity: { type: 'CHANGE_REQUEST', id: crId, projectId: cr.projectId },
            data: { versionNumber: copy.number, copiedFromVersion: latest.number },
            requestId: ctx.requestId,
          });
          return {
            status: 201,
            body: (await dto(ctx, updated)) as unknown as Record<string, unknown>,
          };
        },
      );
    },

    // ===== FR-024 propose ========================================================================

    /** AC-011.1–.2, BR-007, BR-008, BR-028: freeze, hash, audit — atomically. */
    async propose(
      ctx: TenantCtx,
      crId: string,
      n: number,
      expectedRowVersion: number,
      idempotencyKey: string | null,
    ): Promise<IdempotentResponse> {
      const pre = await loadCr(ctx, crId);
      const { rate, project } = await rateContext(ctx, pre.projectId);
      const live = new Set(
        (await deps.coreOps.listRequirements(ctx, pre.projectId)).map((r) => r.id),
      );
      return transition(
        ctx,
        idempotencyKey,
        `POST /change-requests/${crId}/versions/${n}/propose`,
        { expectedRowVersion },
        async (tx) => {
          const cr = await loadCr(ctx, crId, tx);
          await deps.coreOps.lockProjectForChildWrite(ctx, cr.projectId, tx);
          const v = versionOf(cr, n);
          if (v.state !== 'DRAFT') {
            throw errors.invalidStateTransition('Only a draft can be proposed.');
          }
          if (cr.rowVersion !== expectedRowVersion) throw errors.preconditionFailed();
          // The rate is resolved and frozen now, so the price the client sees is the one bound by
          // the hash (BR-021: the version rate later wins for change-request work).
          const pricingInput =
            v.pricing === null
              ? null
              : v.pricing.mode === 'FIXED'
                ? { mode: 'FIXED' as const, priceMinor: (v.pricing.priceMinor ?? 0n).toString() }
                : { mode: 'TIME' as const };
          const frozen: VersionDoc = {
            ...v,
            pricing: computePricing(pricingInput, v.confirmedEffortMinutes, rate, project.currency),
          };
          const problems: FieldError[] = proposeProblems(frozen);
          frozen.affectedRequirementIds.forEach((id, i) => {
            if (!live.has(id)) {
              problems.push({
                path: `affectedRequirementIds.${i}`,
                message: 'This requirement no longer exists. Remove it before proposing.',
              });
            }
          });
          if (problems.length > 0) {
            throw errors.validationFailed(problems, 'The proposal is incomplete.');
          }
          const at = now();
          frozen.state = 'PROPOSED';
          frozen.proposedAt = at;
          frozen.proposedByUserId = ctx.userId;
          frozen.contentHash = versionContentHash(crId, frozen);
          const versions = cr.versions.map((x) => (x.number === n ? frozen : x));
          const updated = await repo.writeVersions(
            ctx.workspaceId,
            crId,
            cr.rowVersion,
            versionGuard(n, 'DRAFT'),
            { versions, ...pointers(versions) },
            at,
            tx,
          );
          if (!updated) throw errors.preconditionFailed();
          await deps.audit.record(tx, {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            action: 'cr.version.proposed',
            entity: { type: 'CHANGE_REQUEST', id: crId, projectId: cr.projectId },
            data: {
              versionNumber: n,
              contentHash: frozen.contentHash,
              pricingMode: frozen.pricing?.mode ?? null,
              priceMinor: frozen.pricing?.priceMinor?.toString() ?? null,
              currency: frozen.pricing?.currency ?? null,
            },
            requestId: ctx.requestId,
          });
          return {
            status: 200,
            body: (await dto(ctx, updated)) as unknown as Record<string, unknown>,
          };
        },
      );
    },

    // ===== FR-029 withdraw =======================================================================

    /** AC-013.3: PROPOSED → WITHDRAWN; it authorises nothing (BR-012). */
    async withdraw(
      ctx: TenantCtx,
      crId: string,
      n: number,
      idempotencyKey: string | null,
    ): Promise<IdempotentResponse> {
      return transition(
        ctx,
        idempotencyKey,
        `POST /change-requests/${crId}/versions/${n}/withdraw`,
        {},
        async (tx) => {
          const cr = await loadCr(ctx, crId, tx);
          await deps.coreOps.lockProjectForChildWrite(ctx, cr.projectId, tx);
          const v = versionOf(cr, n);
          if (v.state !== 'PROPOSED') {
            throw errors.invalidStateTransition('Only a proposed version can be withdrawn.');
          }
          const versions = cr.versions.map((x) =>
            x.number === n ? { ...x, state: 'WITHDRAWN' as const } : x,
          );
          const updated = await repo.writeVersions(
            ctx.workspaceId,
            crId,
            cr.rowVersion,
            versionGuard(n, 'PROPOSED'),
            { versions, ...pointers(versions) },
            now(),
            tx,
          );
          if (!updated) throw errors.invalidStateTransition('This version changed. Reload it.');
          await deps.audit.record(tx, {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            action: 'cr.version.withdrawn',
            entity: { type: 'CHANGE_REQUEST', id: crId, projectId: cr.projectId },
            data: { versionNumber: n, contentHash: v.contentHash },
            requestId: ctx.requestId,
          });
          return {
            status: 200,
            body: (await dto(ctx, updated)) as unknown as Record<string, unknown>,
          };
        },
      );
    },

    // ===== FR-025 record the client's decision ===================================================

    /**
     * AC-012.1–.6, BR-010, BR-013, BR-014, BR-028. One transaction: insert the immutable approval
     * (unique per version), move the version out of PROPOSED only if its hash matches, supersede a
     * previously approved version, write the audit event and the idempotency record.
     */
    async recordDecision(
      ctx: TenantCtx,
      crId: string,
      n: number,
      input: In<typeof recordDecisionRequestSchema>,
      idempotencyKey: string,
    ): Promise<IdempotentResponse> {
      const ws = await deps.workspaces.getSettings(ctx);
      if (input.decidedOn > todayIn(ws.timeZone, now())) {
        throw errors.validationFailed([
          { path: 'decidedOn', message: 'The decision date cannot be in the future.' },
        ]);
      }
      return transition(
        ctx,
        idempotencyKey,
        `POST /change-requests/${crId}/versions/${n}/decisions`,
        input,
        async (tx) => {
          const cr = await loadCr(ctx, crId, tx);
          await deps.coreOps.lockProjectForChildWrite(ctx, cr.projectId, tx);
          const v = versionOf(cr, n);
          if (v.state !== 'PROPOSED') {
            throw errors.invalidStateTransition(
              'A decision can only be recorded for the currently proposed version.',
            );
          }
          if (v.contentHash !== input.contentHash) throw errors.versionHashMismatch();
          const at = now();
          const approvalId = newId();
          await repo.insertApproval(
            ctx.workspaceId,
            {
              _id: approvalId,
              projectId: cr.projectId,
              changeRequestId: crId,
              versionNumber: n,
              decision: input.decision,
              contentHash: input.contentHash,
              clientDecisionMakerName: input.clientDecisionMakerName,
              decidedOn: input.decidedOn,
              channel: input.channel,
              evidenceNote: input.evidenceNote,
              recordedByUserId: ctx.userId,
              recordedAt: at,
              createdAt: at,
              updatedAt: at,
            },
            tx,
          );
          const superseded =
            input.decision === 'APPROVED'
              ? (cr.versions.find((x) => x.state === 'APPROVED')?.number ?? null)
              : null;
          const versions = cr.versions.map((x): VersionDoc => {
            if (x.number === n) {
              return {
                ...x,
                state: input.decision,
                decision: {
                  approvalId,
                  decision: input.decision,
                  decidedOn: input.decidedOn,
                  clientDecisionMakerName: input.clientDecisionMakerName,
                  channel: input.channel,
                },
              };
            }
            // BR-013: the earlier approved version is superseded; its existing work stays valid.
            if (x.number === superseded) return { ...x, state: 'SUPERSEDED' };
            return x;
          });
          const updated = await repo.writeVersions(
            ctx.workspaceId,
            crId,
            cr.rowVersion,
            versionGuard(n, 'PROPOSED', input.contentHash),
            { versions, ...pointers(versions) },
            at,
            tx,
          );
          if (!updated) {
            throw errors.invalidStateTransition(
              'This proposal changed or was already decided. Reload it.',
            );
          }
          await deps.audit.record(tx, {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            action: 'cr.decision.recorded',
            entity: { type: 'CHANGE_REQUEST', id: crId, projectId: cr.projectId },
            data: {
              versionNumber: n,
              decision: input.decision,
              contentHash: input.contentHash,
              approvalId,
              supersededVersionNumber: superseded,
              channel: input.channel,
            },
            requestId: ctx.requestId,
          });
          return {
            status: 201,
            body: {
              approvalId,
              versionState: input.decision,
              supersededVersion: superseded,
              changeRequest: await dto(ctx, updated),
            },
          };
        },
      );
    },

    // ===== FR-021 AI analysis (suggestion only) ==================================================

    /**
     * AC-009.1–.6: returns a suggestion and never modifies the draft. Refused before any provider
     * call when AI is disabled for the workspace (AC-009.4).
     */
    async analyze(ctx: TenantCtx, crId: string, n: number): Promise<AnalysisResponse> {
      const cr = await loadCr(ctx, crId);
      const v = versionOf(cr, n);
      if (v.state !== 'DRAFT') {
        throw errors.invalidStateTransition('AI analysis is available for drafts only.');
      }
      const { rate, project, ws } = await rateContext(ctx, cr.projectId);
      if (project.readOnly) throw errors.archived('This project is archived and read-only.');
      if (!ws.aiEnabled) throw errors.aiDisabled();
      const requirements = (await deps.coreOps.listRequirements(ctx, cr.projectId)).map((r) => ({
        id: r.id,
        key: r.key,
        title: r.title,
        description: r.description,
        acceptanceCriteria: r.acceptanceCriteria,
        // Agreed scope = baselined requirements (BR-004); the scope check compares against these.
        agreed: r.baselineId !== null,
      }));
      const result = await deps.ai.analyzeChangeRequest({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        changeRequestId: crId,
        versionNumber: n,
        projectName: project.name,
        projectDescription: project.description ?? '',
        requirements,
        requestText: cr.rawRequestText,
      });
      const e = result.suggestion.effort;
      return {
        ...result,
        // BR-027: indicative cost = minutes × resolved rate, computed here; never from the model.
        // No estimate (e.g. already covered) → no indicative cost.
        indicativeCost:
          rate > 0n && e
            ? {
                currency: project.currency,
                hourlyRateMinor: rate.toString(),
                lowMinor: timeAmountMinor(e.lowMinutes, rate).toString(),
                likelyMinor: timeAmountMinor(e.likelyMinutes, rate).toString(),
                highMinor: timeAmountMinor(e.highMinutes, rate).toString(),
              }
            : null,
      };
    },

    // ===== FR-027 / FR-028 read models ===========================================================

    async summary(ctx: TenantCtx, crId: string, n: number): Promise<ProposalSummary> {
      const cr = await loadCr(ctx, crId);
      const v = versionOf(cr, n);
      const [project, ws] = await Promise.all([
        deps.coreOps.getProject(ctx, cr.projectId),
        deps.workspaces.getSettings(ctx),
      ]);
      return {
        changeRequestKey: crKey(cr.number),
        projectName: project.name,
        clientName: project.clientName,
        supplier: {
          legalName: ws.billingDetails.legalName,
          address: ws.billingDetails.address,
          taxId: ws.billingDetails.taxId,
        },
        version: toVersionDto(v),
        disclaimer: ESTIMATE_DISCLAIMER,
      };
    },

    async diff(ctx: TenantCtx, crId: string, from: number, to: number): Promise<VersionDiff> {
      const cr = await loadCr(ctx, crId);
      return { from, to, fields: diffVersions(versionOf(cr, from), versionOf(cr, to)) };
    },

    // ===== FR-030 convert an approved version into tasks =========================================

    /**
     * AC-015.1 / AC-015.2: only an APPROVED version converts (SUPERSEDED, PROPOSED… → 409). One
     * billable task per chosen acceptance criterion, linked to the version. Criteria converted
     * before are reported in `alreadyConverted`, never duplicated (unique index, retries).
     * The approval check, the tasks, the project lock and the audit event share one transaction.
     */
    async convertToTasks(
      ctx: TenantCtx,
      crId: string,
      n: number,
      input: In<typeof convertToTasksRequestSchema>,
      idempotencyKey: string | null,
    ): Promise<IdempotentResponse> {
      return transition(
        ctx,
        idempotencyKey,
        `POST /change-requests/${crId}/versions/${n}/tasks`,
        input,
        async (tx) => {
          const cr = await loadCr(ctx, crId, tx);
          const v = versionOf(cr, n);
          if (v.state !== 'APPROVED') {
            throw errors.invalidStateTransition(
              v.state === 'SUPERSEDED'
                ? 'A newer version was approved. Create tasks from the approved version instead.'
                : 'Only an approved version can be turned into tasks.',
            );
          }
          const bad = input.criterionIndexes.findIndex((i) => i >= v.acceptanceCriteria.length);
          if (bad !== -1) {
            throw errors.validationFailed([
              {
                path: `criterionIndexes.${bad}`,
                message: 'Choose acceptance criteria of this version.',
              },
            ]);
          }
          const result = await deps.coreOps.createTasksFromVersion(ctx, tx, {
            projectId: cr.projectId,
            changeRequestId: crId,
            versionNumber: n,
            items: input.criterionIndexes.map((i) => ({
              criterionIndex: i,
              title: v.acceptanceCriteria[i] as string,
            })),
          });
          if (result.created.length > 0) {
            await deps.audit.record(tx, {
              workspaceId: ctx.workspaceId,
              actorUserId: ctx.userId,
              action: 'cr.tasks.created',
              entity: { type: 'CHANGE_REQUEST', id: crId, projectId: cr.projectId },
              data: {
                versionNumber: n,
                contentHash: v.contentHash,
                taskIds: result.created.map((t) => t.id),
                criterionIndexes: input.criterionIndexes.filter(
                  (i) => !result.alreadyConverted.includes(i),
                ),
              },
              requestId: ctx.requestId,
            });
          }
          return {
            status: result.created.length > 0 ? 201 : 200,
            body: result as unknown as Record<string, unknown>,
          };
        },
      );
    },

    // ===== Public read API for core-ops and billing (BR-012, BR-013, BR-016) =====================

    /** FR-015 / AC-024.1: change-request counts by status for one project (zeros included). */
    async countByStatus(ctx: TenantCtx, projectId: string): Promise<Record<CrStatus, number>> {
      const out = Object.fromEntries(crStatuses.map((s) => [s, 0])) as Record<CrStatus, number>;
      for (const r of await repo.countByStatus(ctx.workspaceId, projectId)) out[r._id] = r.n;
      return out;
    },

    /**
     * The authorisation state of one change-request version, read inside the caller's transaction
     * when given. `null` when the CR or version does not exist in this workspace.
     */
    async getAuthorisationState(
      ctx: TenantCtx,
      ref: { changeRequestId: string; versionNumber: number },
      tx?: TxSession,
    ): Promise<{
      projectId: string;
      state: VersionDoc['state'];
      authorisesNewWork: boolean;
      authorisesExistingWork: boolean;
      hourlyRateMinor: bigint | null;
      acceptanceCriteria: string[];
      title: string;
      crNumber: number;
    } | null> {
      const cr = await repo.find(ctx.workspaceId, ref.changeRequestId, tx);
      const v = cr?.versions.find((x) => x.number === ref.versionNumber);
      if (!cr || !v) return null;
      return {
        projectId: cr.projectId,
        state: v.state,
        authorisesNewWork: authorisesNewWork(v.state),
        authorisesExistingWork: authorisesExistingWork(v.state),
        hourlyRateMinor: v.pricing?.mode === 'TIME' ? v.pricing.hourlyRateMinor : null,
        acceptanceCriteria: v.acceptanceCriteria,
        title: v.title,
        crNumber: cr.number,
      };
    },
  };
}

export type ScopeGuardService = ReturnType<typeof createScopeGuardService>;
