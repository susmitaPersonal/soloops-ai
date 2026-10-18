import {
  billingDetailsSchema,
  currencyFractionDigits,
  decimalToMinorUnits,
  minorUnitsToDecimal,
  workspaceSettingsFieldsSchema,
  type UpdateWorkspaceSettingsRequest,
  type WorkspaceSettingsDto,
} from '@soloops/contracts';
import { z } from 'zod';

const f = workspaceSettingsFieldsSchema.shape;

function safeDigits(currency: string): number {
  try {
    return currencyFractionDigits(currency);
  } catch {
    return 2;
  }
}

/**
 * Form values are what people type (decimal rate, percentage). They are converted to the
 * contract's integer units without floating point (BR-019) — the API re-validates everything.
 */
export const settingsFormSchema = z
  .object({
    name: f.name,
    legalName: billingDetailsSchema.shape.legalName,
    address: z.string().trim().max(500, { error: 'Address must be at most 500 characters.' }),
    taxId: z.string().trim().max(32, { error: 'Tax ID must be at most 32 characters.' }),
    defaultCurrency: z.string().trim().toUpperCase().pipe(f.defaultCurrency),
    defaultHourlyRate: z.string(),
    taxLabel: f.taxLabel,
    taxRatePercent: z.string(),
    invoicePrefix: z.string().trim().toUpperCase().pipe(f.invoicePrefix),
    timeZone: f.timeZone,
  })
  .superRefine((v, ctx) => {
    const digits = safeDigits(v.defaultCurrency);
    if (decimalToMinorUnits(v.defaultHourlyRate, digits) === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultHourlyRate'],
        message:
          digits === 0
            ? 'Enter a whole amount, e.g. 1500.'
            : `Enter an amount with up to ${digits} decimals, e.g. 1500.50.`,
      });
    }
    const bps = decimalToMinorUnits(v.taxRatePercent, 2);
    if (bps === null || Number(bps) > 10000) {
      ctx.addIssue({
        code: 'custom',
        path: ['taxRatePercent'],
        message: 'Enter a rate from 0 to 100, with up to 2 decimals, e.g. 18 or 12.5.',
      });
    }
  });

export type SettingsFormInput = z.input<typeof settingsFormSchema>;
export type SettingsFormValues = z.output<typeof settingsFormSchema>;

export function toFormValues(dto: WorkspaceSettingsDto): SettingsFormInput {
  return {
    name: dto.name,
    legalName: dto.billingDetails.legalName,
    address: dto.billingDetails.address ?? '',
    taxId: dto.billingDetails.taxId ?? '',
    defaultCurrency: dto.defaultCurrency,
    defaultHourlyRate: minorUnitsToDecimal(
      dto.defaultHourlyRateMinor,
      safeDigits(dto.defaultCurrency),
    ),
    taxLabel: dto.taxLabel,
    taxRatePercent: minorUnitsToDecimal(String(dto.taxRateBps), 2),
    invoicePrefix: dto.invoicePrefix,
    timeZone: dto.timeZone,
  };
}

export function toUpdateRequest(v: SettingsFormValues): UpdateWorkspaceSettingsRequest {
  return {
    name: v.name,
    defaultCurrency: v.defaultCurrency,
    defaultHourlyRateMinor:
      decimalToMinorUnits(v.defaultHourlyRate, safeDigits(v.defaultCurrency)) ?? '0',
    taxLabel: v.taxLabel,
    taxRateBps: Number(decimalToMinorUnits(v.taxRatePercent, 2) ?? '0'),
    invoicePrefix: v.invoicePrefix,
    timeZone: v.timeZone,
    billingDetails: { legalName: v.legalName, address: v.address || null, taxId: v.taxId || null },
  };
}

/** Maps API field paths (422) to form fields. */
export const API_PATH_TO_FIELD: Record<string, keyof SettingsFormInput> = {
  name: 'name',
  defaultCurrency: 'defaultCurrency',
  defaultHourlyRateMinor: 'defaultHourlyRate',
  taxLabel: 'taxLabel',
  taxRateBps: 'taxRatePercent',
  invoicePrefix: 'invoicePrefix',
  timeZone: 'timeZone',
  'billingDetails.legalName': 'legalName',
  'billingDetails.address': 'address',
  'billingDetails.taxId': 'taxId',
};
