import type { BillingDetails, Eligibility, EntryDto, InvoiceDto } from '@soloops/contracts';

/** data-model §4.12. Eligibility is computed on read and never stored. */
export interface EntryDoc {
  _id: string;
  workspaceId: string;
  projectId: string;
  kind: 'TIME' | 'FIXED';
  workDate: string;
  minutes: number | null;
  amountMinor: bigint | null;
  currency: string;
  description: string;
  taskId: string | null;
  scope: {
    type: 'BASELINE' | 'CHANGE_REQUEST' | 'NONE';
    requirementId: string | null;
    changeRequestId: string | null;
    versionNumber: number | null;
  };
  invoiceId: string | null;
  createdByUserId: string;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntryView {
  scopeLabel: string | null;
  eligibility: Eligibility;
  hourlyRateMinor: bigint | null;
  billableAmountMinor: bigint;
}

export function toEntryDto(doc: EntryDoc, view: EntryView): EntryDto {
  return {
    id: doc._id,
    projectId: doc.projectId,
    kind: doc.kind,
    workDate: doc.workDate,
    minutes: doc.minutes,
    amountMinor: doc.amountMinor === null ? null : doc.amountMinor.toString(),
    currency: doc.currency,
    description: doc.description,
    taskId: doc.taskId,
    scope: { ...doc.scope },
    scopeLabel: view.scopeLabel,
    scopeKind:
      doc.scope.type === 'BASELINE'
        ? 'ORIGINAL'
        : doc.scope.type === 'CHANGE_REQUEST'
          ? 'ADDITIONAL'
          : 'NONE',
    invoiceId: doc.invoiceId,
    eligibility: view.eligibility,
    hourlyRateMinor: view.hourlyRateMinor === null ? null : view.hourlyRateMinor.toString(),
    billableAmountMinor: view.billableAmountMinor.toString(),
    createdByUserId: doc.createdByUserId,
    rowVersion: doc.rowVersion,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** data-model §4.13: one invoice with its bounded embedded lines (≤ 200). */
export interface InvoiceLineDoc {
  position: number;
  kind: 'TIME' | 'FIXED' | 'ADJUSTMENT';
  billableEntryId: string | null;
  description: string;
  minutes: number | null;
  hourlyRateMinor: bigint | null;
  amountMinor: bigint;
  adjustmentReason: string | null;
}

export interface InvoiceDoc {
  _id: string;
  workspaceId: string;
  clientId: string;
  projectId: string;
  status: 'DRAFT' | 'ISSUED' | 'VOID';
  number: number | null;
  displayNumber: string | null;
  currency: string;
  taxLabel: string;
  taxRateBps: number;
  calculationVersion: number;
  lines: InvoiceLineDoc[];
  subtotalMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  issuedAt: Date | null;
  issuedByUserId: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdByUserId: string;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toInvoiceDto(
  doc: InvoiceDoc,
  names: { clientName: string; projectName: string },
  supplier: BillingDetails,
): InvoiceDto {
  return {
    id: doc._id,
    clientId: doc.clientId,
    clientName: names.clientName,
    projectId: doc.projectId,
    projectName: names.projectName,
    status: doc.status,
    number: doc.number,
    displayNumber: doc.displayNumber,
    currency: doc.currency,
    taxLabel: doc.taxLabel,
    taxRateBps: doc.taxRateBps,
    calculationVersion: doc.calculationVersion,
    lines: doc.lines.map((l) => ({
      position: l.position,
      kind: l.kind,
      billableEntryId: l.billableEntryId,
      description: l.description,
      minutes: l.minutes,
      hourlyRateMinor: l.hourlyRateMinor === null ? null : l.hourlyRateMinor.toString(),
      amountMinor: l.amountMinor.toString(),
      adjustmentReason: l.adjustmentReason,
    })),
    subtotalMinor: doc.subtotalMinor.toString(),
    taxMinor: doc.taxMinor.toString(),
    totalMinor: doc.totalMinor.toString(),
    supplier,
    issuedAt: doc.issuedAt ? doc.issuedAt.toISOString() : null,
    issuedByUserId: doc.issuedByUserId,
    voidedAt: doc.voidedAt ? doc.voidedAt.toISOString() : null,
    voidReason: doc.voidReason,
    rowVersion: doc.rowVersion,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
