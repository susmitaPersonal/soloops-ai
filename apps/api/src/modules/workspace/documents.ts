import type { Role, WorkspaceSettingsDto } from '@soloops/contracts';

/** Persistence shape of `workspaces` (data-model.md §4.3). Tenant key is `_id`. */
export interface WorkspaceDoc {
  _id: string;
  name: string;
  defaultCurrency: string;
  /** BSON Int64; bigint in the API (BR-019). */
  defaultHourlyRateMinor: bigint;
  taxLabel: string;
  taxRateBps: number;
  invoicePrefix: string;
  timeZone: string;
  /** Changed only by `$inc` inside the invoice-issue transaction (BR-023). */
  nextInvoiceNumber: number;
  billingDetails: { legalName: string; address: string | null; taxId: string | null };
  aiEnabled: boolean;
  aiEnabledAt: Date | null;
  aiEnabledByUserId: string | null;
  /** FR-004: incremented by every membership change so concurrent changes conflict (0007). */
  membershipVersion?: number;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Persistence shape of `memberships` (data-model.md §4.4). */
export interface MembershipDoc {
  _id: string;
  workspaceId: string;
  userId: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export function toSettingsDto(doc: WorkspaceDoc, myRole: Role): WorkspaceSettingsDto {
  return {
    id: doc._id,
    name: doc.name,
    defaultCurrency: doc.defaultCurrency,
    defaultHourlyRateMinor: doc.defaultHourlyRateMinor.toString(),
    taxLabel: doc.taxLabel,
    taxRateBps: doc.taxRateBps,
    invoicePrefix: doc.invoicePrefix,
    timeZone: doc.timeZone,
    billingDetails: {
      legalName: doc.billingDetails.legalName,
      address: doc.billingDetails.address,
      taxId: doc.billingDetails.taxId,
    },
    aiEnabled: doc.aiEnabled,
    rowVersion: doc.rowVersion,
    myRole,
  };
}
