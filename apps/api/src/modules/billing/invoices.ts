import {
  MAX_INVOICE_LINES,
  type FieldError,
  type InvoiceDto,
  type InvoiceListResponse,
  type createInvoiceRequestSchema,
  type invoiceListQuerySchema,
  type updateInvoiceRequestSchema,
  type voidInvoiceRequestSchema,
} from '@soloops/contracts';
import type { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { Database, TxSession } from '../../platform/db';
import { AppError, errors } from '../../platform/errors';
import { runIdempotent, type IdempotentResponse } from '../../platform/http/idempotency';
import { decodeCursor, toPage } from '../../platform/http/pagination';
import type { TenantCtx } from '../../platform/http/types';
import { newId } from '../../platform/ids';
import type { AuditService } from '../audit';
import type { CoreOpsService } from '../core-ops';
import type { WorkspaceService } from '../workspace';
import { toInvoiceDto, type InvoiceDoc, type InvoiceLineDoc } from './documents';
import { CALCULATION_VERSION, invoiceTotals, lineAmountMinor } from './domain/invoice-calc';
import type { BillingRepository } from './repository';
import type { EntryViewer } from './service';

type In<S extends z.ZodType> = z.output<S>;

const asBody = (dto: InvoiceDto) => dto as unknown as Record<string, unknown>;

/**
 * FR-042–FR-046 invoices (ADR-0020). Members draft and edit; only owners issue and void
 * (BR-023). Every amount is computed here with the pure calculation (BR-020); eligibility is the
 * same BR-016 classification the unbilled list shows, re-run inside each transaction (BR-017).
 */
export function createInvoiceOps(deps: {
  db: Database;
  clock: Clock;
  audit: AuditService;
  workspaces: WorkspaceService;
  coreOps: CoreOpsService;
  repo: BillingRepository;
  viewer: EntryViewer;
}) {
  const { repo } = deps;
  const now = () => deps.clock.now();

  async function dto(ctx: TenantCtx, doc: InvoiceDoc): Promise<InvoiceDto> {
    const [project, settings] = await Promise.all([
      deps.coreOps.getProject(ctx, doc.projectId),
      deps.workspaces.getSettings(ctx),
    ]);
    return toInvoiceDto(
      doc,
      { clientName: project.clientName, projectName: project.name },
      settings.billingDetails,
    );
  }

  async function load(ctx: TenantCtx, id: string, tx?: TxSession) {
    const doc = await repo.findInvoice(ctx.workspaceId, id, tx);
    if (!doc) throw errors.notFound();
    return doc;
  }

  const requireOwner = (ctx: TenantCtx, what: string) => {
    if (ctx.role !== 'OWNER') throw errors.forbidden(`Only workspace owners can ${what} invoices.`);
  };

  /** Totals from the lines; a negative subtotal is refused (adjustments cannot exceed the work). */
  function withTotals(lines: InvoiceLineDoc[], taxRateBps: number) {
    const totals = invoiceTotals(lines, taxRateBps);
    if (totals.subtotalMinor < 0n) {
      throw errors.validationFailed([
        { path: 'addAdjustments', message: 'Adjustments cannot make the subtotal negative.' },
      ]);
    }
    return totals;
  }

  const renumber = (lines: InvoiceLineDoc[]) => lines.map((l, i) => ({ ...l, position: i + 1 }));

  /** After a guarded write missed: gone (404), no longer a draft (409) or stale (412). */
  async function explainMissedDraftWrite(ctx: TenantCtx, id: string): Promise<never> {
    const current = await repo.findInvoice(ctx.workspaceId, id);
    if (!current) throw errors.notFound();
    if (current.status !== 'DRAFT') {
      throw errors.invalidStateTransition('This invoice was issued or voided. Reload it.');
    }
    throw errors.preconditionFailed();
  }

  return {
    // ===== FR-042 create a draft ===============================================================

    /**
     * AC-019.1, .2, .4. One transaction: classify every selected entry (422 listing ineligible
     * ones, 409 when one is already on an invoice), compute the lines and totals, reserve the
     * entries with a guarded update (BR-018) and write `invoice.created`.
     */
    async createInvoice(
      ctx: TenantCtx,
      input: In<typeof createInvoiceRequestSchema>,
      idempotencyKey: string | null,
    ): Promise<IdempotentResponse> {
      return runIdempotent(
        { db: deps.db, clock: deps.clock },
        {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          key: idempotencyKey,
          route: 'POST /invoices',
          requestBody: input,
        },
        async (tx) => {
          // A project ID in the body that is missing or foreign is a field error (ADR-0017 §5).
          const v = await deps.viewer(ctx, input.projectId, tx).catch((err: unknown) => {
            if (err instanceof AppError && err.status === 404) {
              throw errors.validationFailed([
                { path: 'projectId', message: 'Choose a project of this workspace.' },
              ]);
            }
            throw err;
          });
          const found = await repo.findEntriesByIds(ctx.workspaceId, input.entryIds, tx);
          const byId = new Map(found.map((e) => [e._id, e]));
          const missing: FieldError[] = [];
          input.entryIds.forEach((id, i) => {
            const e = byId.get(id);
            if (!e || e.projectId !== input.projectId) {
              missing.push({ path: `entryIds.${i}`, message: 'Choose work of this project.' });
            }
          });
          if (missing.length > 0) throw errors.validationFailed(missing);
          const entries = input.entryIds.map(
            (id) => byId.get(id) as NonNullable<ReturnType<typeof byId.get>>,
          );
          if (entries.some((e) => e.invoiceId !== null)) {
            throw errors.alreadyInvoiced(
              'Some of this work is already on another invoice. Reload.',
            );
          }
          const views = await Promise.all(entries.map((e) => v.view(e)));
          const ineligible: FieldError[] = [];
          views.forEach((view, i) => {
            if (!view.eligibility.eligible) {
              ineligible.push({
                path: `entryIds.${i}`,
                message: `${entries[i]?.description}: ${view.eligibility.explanation}`,
              });
            }
          });
          if (ineligible.length > 0) {
            throw errors.notEligible(ineligible, 'Some selected work cannot be invoiced (BR-017).');
          }

          // Oldest work first; the rate resolved by BR-021 is copied onto each TIME line.
          const ordered = entries
            .map((e, i) => ({ e, view: views[i] as NonNullable<(typeof views)[number]> }))
            .sort((a, b) =>
              a.e.workDate === b.e.workDate
                ? a.e.createdAt.getTime() - b.e.createdAt.getTime()
                : a.e.workDate < b.e.workDate
                  ? -1
                  : 1,
            );
          const lines: InvoiceLineDoc[] = ordered.map(({ e, view }, i) => ({
            position: i + 1,
            kind: e.kind,
            billableEntryId: e._id,
            description: `${e.description}${view.scopeLabel ? ` (${view.scopeLabel})` : ''}`.slice(
              0,
              500,
            ),
            minutes: e.kind === 'TIME' ? e.minutes : null,
            hourlyRateMinor: e.kind === 'TIME' ? view.hourlyRateMinor : null,
            amountMinor: view.billableAmountMinor,
            adjustmentReason: null,
          }));
          const totals = withTotals(lines, v.settings.taxRateBps);
          const at = now();
          const id = newId();
          const reserved = await repo.reserveEntries(ctx.workspaceId, input.entryIds, id, at, tx);
          if (reserved !== input.entryIds.length) {
            throw errors.alreadyInvoiced(
              'Some of this work is already on another invoice. Reload.',
            );
          }
          const doc: Omit<InvoiceDoc, 'workspaceId'> = {
            _id: id,
            clientId: v.project.clientId,
            projectId: input.projectId,
            status: 'DRAFT',
            number: null,
            displayNumber: null,
            currency: v.project.currency,
            taxLabel: v.settings.taxLabel,
            taxRateBps: v.settings.taxRateBps,
            calculationVersion: CALCULATION_VERSION,
            lines,
            ...totals,
            issuedAt: null,
            issuedByUserId: null,
            voidedAt: null,
            voidReason: null,
            createdByUserId: ctx.userId,
            rowVersion: 1,
            createdAt: at,
            updatedAt: at,
          };
          await repo.insertInvoice(ctx.workspaceId, doc, tx);
          await deps.audit.record(tx, {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            action: 'invoice.created',
            entity: { type: 'INVOICE', id, projectId: input.projectId },
            data: { entryIds: input.entryIds, totalMinor: totals.totalMinor.toString() },
            requestId: ctx.requestId,
          });
          const full: InvoiceDoc = { ...doc, workspaceId: ctx.workspaceId };
          return {
            status: 201,
            body: asBody(
              toInvoiceDto(
                full,
                { clientName: v.project.clientName, projectName: v.project.name },
                v.settings.billingDetails,
              ),
            ),
          };
        },
      );
    },

    async listInvoices(
      ctx: TenantCtx,
      query: In<typeof invoiceListQuerySchema>,
    ): Promise<InvoiceListResponse> {
      const after = decodeCursor(query.cursor);
      const rows = await repo.listInvoices(ctx.workspaceId, {
        ...(query.status ? { status: query.status } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        limit: query.limit,
        afterId: after?.id ?? null,
      });
      const page = toPage(rows, query.limit, (r) => ({ k: '', id: r._id }));
      const names = new Map<string, Promise<{ clientName: string; projectName: string }>>();
      const nameOf = (projectId: string) => {
        let p = names.get(projectId);
        if (!p) {
          p = deps.coreOps
            .getProject(ctx, projectId)
            .then((pr) => ({ clientName: pr.clientName, projectName: pr.name }));
          names.set(projectId, p);
        }
        return p;
      };
      return {
        items: await Promise.all(
          page.items.map(async (r) => ({
            id: r._id,
            projectId: r.projectId,
            ...(await nameOf(r.projectId)),
            status: r.status,
            displayNumber: r.displayNumber,
            currency: r.currency,
            totalMinor: r.totalMinor.toString(),
            issuedAt: r.issuedAt ? r.issuedAt.toISOString() : null,
            createdAt: r.createdAt.toISOString(),
          })),
        ),
        nextCursor: page.nextCursor,
      };
    },

    async getInvoice(ctx: TenantCtx, id: string): Promise<InvoiceDto> {
      return dto(ctx, await load(ctx, id));
    },

    // ===== FR-043 edit a draft =================================================================

    /**
     * Drafts only (If-Match). Descriptions, then removals (the removed entries return to unbilled
     * work), then adjustments with a reason (BR-025, AC-019.3). Totals are recomputed.
     */
    async updateDraft(
      ctx: TenantCtx,
      id: string,
      input: In<typeof updateInvoiceRequestSchema>,
      ifMatch: number,
    ): Promise<InvoiceDto> {
      const updated = await deps.db.withTransaction(async (tx) => {
        const inv = await load(ctx, id, tx);
        if (inv.status !== 'DRAFT') {
          throw errors.invalidStateTransition('Issued and void invoices cannot be edited.');
        }
        if (inv.rowVersion !== ifMatch) throw errors.preconditionFailed();
        const positions = new Set(inv.lines.map((l) => l.position));
        const bad: FieldError[] = [];
        input.lineDescriptions?.forEach((d, i) => {
          if (!positions.has(d.position)) {
            bad.push({ path: `lineDescriptions.${i}.position`, message: 'No such line.' });
          }
        });
        input.removePositions?.forEach((p, i) => {
          if (!positions.has(p))
            bad.push({ path: `removePositions.${i}`, message: 'No such line.' });
        });
        if (bad.length > 0) throw errors.validationFailed(bad);

        const descriptions = new Map(
          (input.lineDescriptions ?? []).map((d) => [d.position, d.description]),
        );
        const removed = new Set(input.removePositions ?? []);
        let lines = inv.lines
          .map((l) => ({ ...l, description: descriptions.get(l.position) ?? l.description }))
          .filter((l) => !removed.has(l.position));
        for (const a of input.addAdjustments ?? []) {
          lines.push({
            position: 0,
            kind: 'ADJUSTMENT',
            billableEntryId: null,
            description: a.description,
            minutes: null,
            hourlyRateMinor: null,
            amountMinor: BigInt(a.amountMinor),
            adjustmentReason: a.reason,
          });
        }
        lines = renumber(lines);
        if (lines.length === 0) {
          throw errors.validationFailed([
            {
              path: 'removePositions',
              message: 'An invoice needs at least one line. Delete the draft instead.',
            },
          ]);
        }
        if (lines.length > MAX_INVOICE_LINES) {
          throw errors.validationFailed([
            { path: 'addAdjustments', message: `At most ${MAX_INVOICE_LINES} lines.` },
          ]);
        }
        const totals = withTotals(lines, inv.taxRateBps);
        const at = now();
        const releasedIds = inv.lines
          .filter((l) => removed.has(l.position) && l.billableEntryId !== null)
          .map((l) => l.billableEntryId as string);
        if (releasedIds.length > 0) {
          await repo.releaseEntries(ctx.workspaceId, id, releasedIds, at, tx);
        }
        return repo.updateInvoiceIf(
          ctx.workspaceId,
          id,
          { status: 'DRAFT', rowVersion: ifMatch },
          { lines, ...totals, updatedAt: at },
          tx,
        );
      });
      if (!updated) return explainMissedDraftWrite(ctx, id);
      return dto(ctx, updated);
    },

    /** Deleting a draft returns all its entries to unbilled work. Issued invoices stay forever. */
    async deleteDraft(ctx: TenantCtx, id: string): Promise<void> {
      const deleted = await deps.db.withTransaction(async (tx) => {
        const inv = await load(ctx, id, tx);
        if (inv.status !== 'DRAFT') {
          throw errors.invalidStateTransition(
            'Issued invoices cannot be deleted. Void the invoice instead.',
          );
        }
        await repo.releaseEntries(ctx.workspaceId, id, null, now(), tx);
        return repo.deleteDraftInvoice(ctx.workspaceId, id, inv.rowVersion, tx);
      });
      if (deleted === 0) await explainMissedDraftWrite(ctx, id);
    },

    // ===== FR-044 issue (owner) ================================================================

    /**
     * AC-020.1–.4, BR-017, BR-023, BR-028. One transaction: re-check every line's eligibility,
     * recompute the totals, take the next workspace number, freeze the invoice and audit. An abort
     * consumes no number (gapless); the Idempotency-Key makes a retry return the same number.
     */
    async issue(ctx: TenantCtx, id: string, idempotencyKey: string): Promise<IdempotentResponse> {
      requireOwner(ctx, 'issue');
      return runIdempotent(
        { db: deps.db, clock: deps.clock },
        {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          key: idempotencyKey,
          route: `POST /invoices/${id}/issue`,
          requestBody: {},
        },
        async (tx) => {
          const inv = await load(ctx, id, tx);
          if (inv.status !== 'DRAFT') {
            throw errors.invalidStateTransition('Only a draft can be issued.');
          }
          const v = await deps.viewer(ctx, inv.projectId, tx);
          const entryIds = inv.lines.flatMap((l) => (l.billableEntryId ? [l.billableEntryId] : []));
          const entries = new Map(
            (await repo.findEntriesByIds(ctx.workspaceId, entryIds, tx)).map((e) => [e._id, e]),
          );
          const offending: FieldError[] = [];
          for (const line of inv.lines) {
            if (!line.billableEntryId) continue;
            const e = entries.get(line.billableEntryId);
            if (!e || e.invoiceId !== id) {
              offending.push({
                path: `lines.${line.position}`,
                message: 'This work no longer exists.',
              });
              continue;
            }
            const view = await v.view(e, id);
            if (!view.eligibility.eligible) {
              offending.push({
                path: `lines.${line.position}`,
                message: view.eligibility.explanation,
              });
            }
          }
          if (offending.length > 0) throw errors.linesNotEligible(offending);
          if (inv.currency !== v.project.currency) {
            throw errors.invalidStateTransition(
              'The invoice currency no longer matches the project.',
            );
          }
          // BR-020: authoritative amounts are recomputed, never trusted from the stored draft.
          const lines = inv.lines.map((l) => ({ ...l, amountMinor: lineAmountMinor(l) }));
          const totals = withTotals(lines, inv.taxRateBps);
          const { number, displayNumber } = await deps.workspaces.allocateInvoiceNumber(ctx, tx);
          const at = now();
          const issued = await repo.updateInvoiceIf(
            ctx.workspaceId,
            id,
            { status: 'DRAFT', rowVersion: inv.rowVersion },
            {
              status: 'ISSUED',
              number,
              displayNumber,
              lines,
              ...totals,
              issuedAt: at,
              issuedByUserId: ctx.userId,
              updatedAt: at,
            },
            tx,
          );
          if (!issued) throw errors.invalidStateTransition('This draft changed. Reload it.');
          await deps.audit.record(tx, {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            action: 'invoice.issued',
            entity: { type: 'INVOICE', id, projectId: inv.projectId },
            data: { number, displayNumber, totalMinor: totals.totalMinor.toString() },
            requestId: ctx.requestId,
          });
          return { status: 200, body: asBody(await dto(ctx, issued)) };
        },
      );
    },

    // ===== FR-046 void (owner) =================================================================

    /** AC-021.1, BR-024: keeps the number, records the reason, releases the entries; audited. */
    async void(
      ctx: TenantCtx,
      id: string,
      input: In<typeof voidInvoiceRequestSchema>,
      idempotencyKey: string,
    ): Promise<IdempotentResponse> {
      requireOwner(ctx, 'void');
      return runIdempotent(
        { db: deps.db, clock: deps.clock },
        {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          key: idempotencyKey,
          route: `POST /invoices/${id}/void`,
          requestBody: input,
        },
        async (tx) => {
          const inv = await load(ctx, id, tx);
          if (inv.status !== 'ISSUED') {
            throw errors.invalidStateTransition(
              inv.status === 'DRAFT'
                ? 'A draft is not issued yet. Delete it instead.'
                : 'This invoice is already void.',
            );
          }
          const at = now();
          const voided = await repo.updateInvoiceIf(
            ctx.workspaceId,
            id,
            { status: 'ISSUED', rowVersion: inv.rowVersion },
            { status: 'VOID', voidedAt: at, voidReason: input.reason, updatedAt: at },
            tx,
          );
          if (!voided) throw errors.invalidStateTransition('This invoice changed. Reload it.');
          const released = await repo.releaseEntries(ctx.workspaceId, id, null, at, tx);
          await deps.audit.record(tx, {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            action: 'invoice.voided',
            entity: { type: 'INVOICE', id, projectId: inv.projectId },
            data: {
              number: inv.number,
              displayNumber: inv.displayNumber,
              reason: input.reason,
              releasedEntries: released,
            },
            requestId: ctx.requestId,
          });
          return { status: 200, body: asBody(await dto(ctx, voided)) };
        },
      );
    },
  };
}
