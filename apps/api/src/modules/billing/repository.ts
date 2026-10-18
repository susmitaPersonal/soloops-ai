import { ENTRY_LIST_CAP } from '@soloops/contracts';
import type { Database, Filter, TxSession, UpdateFilter } from '../../platform/db';
import type { EntryDoc, InvoiceDoc } from './documents';

/** Billing persistence. Every function takes `workspaceId` first (TenantCollection, SEC-004). */
export function createBillingRepository(db: Database) {
  const entries = (ws: string) => db.tenant<EntryDoc>('billableEntries', ws);
  const invoices = (ws: string) => db.tenant<InvoiceDoc>('invoices', ws);

  return {
    insertEntry: (ws: string, doc: Omit<EntryDoc, 'workspaceId'>, tx: TxSession) =>
      entries(ws).insertOne(doc, { session: tx }),
    findEntry: (ws: string, id: string, tx?: TxSession) =>
      entries(ws).findOne({ _id: id }, { session: tx }),

    /** Newest work first (index `workspace_project_unbilled`); one more than the cap. */
    listEntries: (ws: string, projectId: string, unbilledOnly: boolean) => {
      const filter: Filter<EntryDoc> = { projectId };
      if (unbilledOnly) filter.invoiceId = null;
      return entries(ws).find(filter, {
        sort: { workDate: -1, _id: -1 },
        limit: ENTRY_LIST_CAP + 1,
      });
    },

    hasEntries: async (ws: string, projectId: string) =>
      (await entries(ws).findOne({ projectId })) !== null,

    /** AC-017.3: only unbilled entries change, and only at the expected row version. */
    updateUnbilledIfVersion: (
      ws: string,
      id: string,
      rowVersion: number,
      set: Partial<EntryDoc>,
      tx: TxSession,
    ) =>
      entries(ws).findOneAndUpdate(
        { _id: id, rowVersion, invoiceId: null },
        { $set: set, $inc: { rowVersion: 1 } } as UpdateFilter<EntryDoc>,
        { session: tx },
      ),

    deleteUnbilled: (ws: string, id: string, tx: TxSession) =>
      entries(ws).deleteOne({ _id: id, invoiceId: null }, { session: tx }),

    // ----- invoices (data-model §4.13) -------------------------------------------------------

    findEntriesByIds: (ws: string, ids: string[], tx: TxSession) =>
      entries(ws).find({ _id: { $in: ids } }, { session: tx, limit: ids.length }),

    /**
     * BR-018: reserves unbilled entries for one invoice. Only entries still unbilled match, so the
     * caller compares the count and aborts when another invoice took one first.
     */
    reserveEntries: async (
      ws: string,
      ids: string[],
      invoiceId: string,
      now: Date,
      tx: TxSession,
    ) =>
      (
        await entries(ws).updateMany(
          { _id: { $in: ids }, invoiceId: null },
          {
            $set: { invoiceId, updatedAt: now },
            $inc: { rowVersion: 1 },
          } as UpdateFilter<EntryDoc>,
          { session: tx },
        )
      ).modified,

    /** Returns entries of this invoice (all, or the given ones) to unbilled work (BR-024, FR-043). */
    releaseEntries: async (
      ws: string,
      invoiceId: string,
      ids: string[] | null,
      now: Date,
      tx: TxSession,
    ) =>
      (
        await entries(ws).updateMany(
          ids === null ? { invoiceId } : { invoiceId, _id: { $in: ids } },
          {
            $set: { invoiceId: null, updatedAt: now },
            $inc: { rowVersion: 1 },
          } as UpdateFilter<EntryDoc>,
          { session: tx },
        )
      ).modified,

    /** BR-030: an entry that appears on any invoice line (even a void one) is kept as evidence. */
    entryOnAnyInvoice: async (ws: string, entryId: string) =>
      (await invoices(ws).findOne({ 'lines.billableEntryId': entryId })) !== null,

    insertInvoice: (ws: string, doc: Omit<InvoiceDoc, 'workspaceId'>, tx: TxSession) =>
      invoices(ws).insertOne(doc, { session: tx }),
    findInvoice: (ws: string, id: string, tx?: TxSession) =>
      invoices(ws).findOne({ _id: id }, { session: tx }),

    /** Newest first (indexes `workspace_recent` / `workspace_status_recent`). */
    listInvoices: (
      ws: string,
      opts: {
        status?: InvoiceDoc['status'];
        projectId?: string;
        limit: number;
        afterId: string | null;
      },
    ) => {
      const filter: Filter<InvoiceDoc> = {};
      if (opts.status) filter.status = opts.status;
      if (opts.projectId) filter.projectId = opts.projectId;
      if (opts.afterId) filter._id = { $lt: opts.afterId };
      return invoices(ws).find(filter, { sort: { _id: -1 }, limit: opts.limit + 1 });
    },

    /** The only way an invoice changes: guarded by its status and row version. */
    updateInvoiceIf: (
      ws: string,
      id: string,
      guard: { status: InvoiceDoc['status']; rowVersion: number },
      set: Partial<InvoiceDoc>,
      tx: TxSession,
    ) =>
      invoices(ws).findOneAndUpdate(
        { _id: id, status: guard.status, rowVersion: guard.rowVersion },
        { $set: set, $inc: { rowVersion: 1 } } as UpdateFilter<InvoiceDoc>,
        { session: tx },
      ),

    deleteDraftInvoice: (ws: string, id: string, rowVersion: number, tx: TxSession) =>
      invoices(ws).deleteOne({ _id: id, status: 'DRAFT', rowVersion }, { session: tx }),
  };
}

export type BillingRepository = ReturnType<typeof createBillingRepository>;
