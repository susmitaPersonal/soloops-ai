import { z } from 'zod';
import { currencyCodeSchema, idSchema, minorUnitsSchema, timeZoneSchema } from './common';

export const roles = ['OWNER', 'MEMBER'] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;

const nullableText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} must be at most ${max} characters.` })
    .nullable()
    .transform((v) => (v === '' ? null : v));

export const billingDetailsSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(1, { error: 'Legal name is required.' })
    .max(160, { error: 'Legal name must be at most 160 characters.' }),
  address: nullableText(500, 'Address'),
  taxId: nullableText(32, 'Tax ID'),
});
export type BillingDetails = z.infer<typeof billingDetailsSchema>;

/** FR-005 workspace settings as returned by GET /workspaces/{id}. */
export const workspaceSettingsDtoSchema = z.object({
  id: idSchema,
  name: z.string(),
  defaultCurrency: z.string(),
  defaultHourlyRateMinor: minorUnitsSchema,
  taxLabel: z.string(),
  taxRateBps: z.number().int(),
  invoicePrefix: z.string(),
  timeZone: z.string(),
  billingDetails: z.object({
    legalName: z.string(),
    address: z.string().nullable(),
    taxId: z.string().nullable(),
  }),
  aiEnabled: z.boolean(),
  rowVersion: z.number().int(),
  myRole: roleSchema,
});
export type WorkspaceSettingsDto = z.infer<typeof workspaceSettingsDtoSchema>;

/** Editable settings fields (FR-005). AI enablement has its own endpoint (FR-054). */
export const workspaceSettingsFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Workspace name is required.' })
    .max(120, { error: 'Workspace name must be at most 120 characters.' }),
  defaultCurrency: currencyCodeSchema,
  defaultHourlyRateMinor: minorUnitsSchema,
  taxLabel: z
    .string()
    .trim()
    .min(1, { error: 'Tax label is required.' })
    .max(20, { error: 'Tax label must be at most 20 characters.' }),
  /** Basis points: 1800 = 18.00% (BR-019). AC-002.3: 0–100.00%. */
  taxRateBps: z
    .number({ error: 'Tax rate must be a number.' })
    .int({ error: 'Tax rate must be a whole number of basis points.' })
    .min(0, { error: 'Tax rate must be between 0% and 100%.' })
    .max(10000, { error: 'Tax rate must be between 0% and 100%.' }),
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{1,10}$/, {
      error: 'Use 1–10 characters: capital letters, digits or hyphens.',
    }),
  timeZone: timeZoneSchema,
  billingDetails: billingDetailsSchema,
});
export type WorkspaceSettingsFields = z.input<typeof workspaceSettingsFieldsSchema>;

/** PATCH /workspaces/{id}: any subset of the editable fields, at least one. Requires If-Match. */
export const updateWorkspaceSettingsRequestSchema = workspaceSettingsFieldsSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { error: 'Provide at least one setting to change.' });
export type UpdateWorkspaceSettingsRequest = z.input<typeof updateWorkspaceSettingsRequestSchema>;

/** Defaults applied to a new workspace at registration (FR-003). */
export const WORKSPACE_DEFAULTS = {
  defaultCurrency: 'INR',
  defaultHourlyRateMinor: '0',
  taxLabel: 'Tax',
  taxRateBps: 0,
  invoicePrefix: 'INV',
  timeZone: 'Asia/Kolkata',
} as const;
