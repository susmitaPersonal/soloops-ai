import { z } from 'zod';
import { idSchema, minorUnitsSchema } from './common';
import { listQuerySchema } from './core-ops';
import { billingDetailsSchema } from './workspace';

/**
 * Invoice contracts (FR-042–FR-046, data-model §4.13). Every amount is computed by the server
 * (BR-020); requests never carry totals or line amounts except a manual adjustment's own amount.
 */

export const invoiceStatuses = ['DRAFT', 'ISSUED', 'VOID'] as const;
export const invoiceStatusSchema = z.enum(invoiceStatuses);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

/** Signed integer minor units (adjustments and totals may be negative, BR-025). */
const INT64_MAX = 9223372036854775807n;
export const signedMinorUnitsSchema = z
  .string()
  .regex(/^(0|-?[1-9]\d{0,18})$/, { error: 'Must be a whole number of minor units.', abort: true })
  .refine((v) => BigInt(v) <= INT64_MAX && BigInt(v) >= -INT64_MAX, {
    error: 'Amount is too large.',
  });

export const MAX_INVOICE_LINES = 200;

const text = (what: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `${what} is required.` })
    .max(500, { error: `${what} must be at most 500 characters.` });

const uniqueIds = (max: number) =>
  z
    .array(idSchema)
    .min(1, { error: 'Choose at least one entry.' })
    .max(max, { error: `At most ${max} entries per invoice.` })
    .refine((a) => new Set(a).size === a.length, { error: 'Each entry can be chosen once.' });

/** FR-042 / AC-019.1: a draft from selected eligible entries of one project. */
export const createInvoiceRequestSchema = z.object({
  projectId: idSchema,
  entryIds: uniqueIds(MAX_INVOICE_LINES),
});
export type CreateInvoiceRequest = z.input<typeof createInvoiceRequestSchema>;

export const adjustmentRequestSchema = z.object({
  description: text('Description'),
  amountMinor: signedMinorUnitsSchema.refine((v) => v !== '0', {
    error: 'An adjustment cannot be zero.',
  }),
  /** BR-025 / AC-019.3. */
  reason: text('A reason'),
});

/** FR-043: draft edits (If-Match). Operations apply in this order: descriptions, removals, adjustments. */
export const updateInvoiceRequestSchema = z
  .object({
    lineDescriptions: z
      .array(z.object({ position: z.number().int().min(1), description: text('Description') }))
      .max(MAX_INVOICE_LINES),
    removePositions: z
      .array(z.number().int().min(1))
      .max(MAX_INVOICE_LINES)
      .refine((a) => new Set(a).size === a.length, { error: 'Each line can be removed once.' }),
    addAdjustments: z.array(adjustmentRequestSchema).max(20),
  })
  .partial()
  .refine(
    (v) =>
      (v.lineDescriptions?.length ?? 0) +
        (v.removePositions?.length ?? 0) +
        (v.addAdjustments?.length ?? 0) >
      0,
    { error: 'Provide at least one change.' },
  );
export type UpdateInvoiceRequest = z.input<typeof updateInvoiceRequestSchema>;

/** FR-046 / BR-024. */
export const voidInvoiceRequestSchema = z.object({ reason: text('A reason') });
export type VoidInvoiceRequest = z.input<typeof voidInvoiceRequestSchema>;

export const invoiceLineSchema = z.object({
  position: z.number().int(),
  kind: z.enum(['TIME', 'FIXED', 'ADJUSTMENT']),
  billableEntryId: idSchema.nullable(),
  description: z.string(),
  minutes: z.number().int().nullable(),
  /** BR-021: the resolved rate copied onto the line (TIME only). */
  hourlyRateMinor: minorUnitsSchema.nullable(),
  amountMinor: signedMinorUnitsSchema,
  adjustmentReason: z.string().nullable(),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

export const invoiceDtoSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  clientName: z.string(),
  projectId: idSchema,
  projectName: z.string(),
  status: invoiceStatusSchema,
  number: z.number().int().nullable(),
  displayNumber: z.string().nullable(),
  currency: z.string(),
  taxLabel: z.string(),
  taxRateBps: z.number().int(),
  calculationVersion: z.number().int(),
  lines: z.array(invoiceLineSchema),
  subtotalMinor: signedMinorUnitsSchema,
  taxMinor: signedMinorUnitsSchema,
  totalMinor: signedMinorUnitsSchema,
  /** The supplier block printed on the invoice (workspace billing details). */
  supplier: billingDetailsSchema,
  issuedAt: z.string().nullable(),
  issuedByUserId: idSchema.nullable(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
  rowVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InvoiceDto = z.infer<typeof invoiceDtoSchema>;

export const invoiceSummarySchema = invoiceDtoSchema.pick({
  id: true,
  projectId: true,
  projectName: true,
  clientName: true,
  status: true,
  displayNumber: true,
  currency: true,
  totalMinor: true,
  issuedAt: true,
  createdAt: true,
});
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

export const invoiceListQuerySchema = listQuerySchema.extend({
  status: invoiceStatusSchema.optional(),
  projectId: idSchema.optional(),
});
export const invoiceListResponseSchema = z.object({
  items: z.array(invoiceSummarySchema),
  nextCursor: z.string().nullable(),
});
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;
