import {
  billingModelSchema,
  currencyCodeSchema,
  isoDateSchema,
  projectStatusSchema,
  type CreateProjectRequest,
  type ProjectDto,
} from '@soloops/contracts';
import { z } from 'zod';
import { minorToRateInput, rateInputToMinor } from '@/features/core-ops/money';

/**
 * What people type on the project form. The rate is a decimal and converted to minor units
 * without floating point (BR-019); the API re-validates everything (AC-005.1).
 */
export const projectFormSchema = z
  .object({
    clientId: z.string().min(1, { error: 'Choose a client.' }),
    name: z
      .string()
      .trim()
      .min(1, { error: 'Project name is required.' })
      .max(160, { error: 'Project name must be at most 160 characters.' }),
    description: z
      .string()
      .trim()
      .max(5000, { error: 'Description must be at most 5,000 characters.' }),
    billingModel: billingModelSchema,
    currency: z.string().trim().toUpperCase().pipe(currencyCodeSchema),
    hourlyRate: z.string(),
    startDate: z.string(),
    status: projectStatusSchema,
  })
  .superRefine((v, ctx) => {
    if (rateInputToMinor(v.hourlyRate, v.currency) === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['hourlyRate'],
        message: 'Enter an amount such as 1500 or 1500.50, or leave it empty.',
      });
    }
    if (v.startDate !== '' && !isoDateSchema.safeParse(v.startDate).success) {
      ctx.addIssue({ code: 'custom', path: ['startDate'], message: 'Enter a valid date.' });
    }
  });

export type ProjectFormInput = z.input<typeof projectFormSchema>;
export type ProjectFormValues = z.output<typeof projectFormSchema>;

export function toProjectFormValues(
  defaults: { clientId: string; currency: string },
  p?: ProjectDto,
): ProjectFormInput {
  return {
    clientId: p?.clientId ?? defaults.clientId,
    name: p?.name ?? '',
    description: p?.description ?? '',
    billingModel: p?.billingModel ?? 'HOURLY',
    currency: p?.currency ?? defaults.currency,
    hourlyRate: p ? minorToRateInput(p.hourlyRateMinor, p.currency) : '',
    startDate: p?.startDate ?? '',
    status: p?.status ?? 'ACTIVE',
  };
}

/** Converts form values to the API body. An empty rate means "use the workspace default" (null). */
export function toProjectRequest(v: ProjectFormValues): CreateProjectRequest {
  return {
    clientId: v.clientId,
    name: v.name,
    description: v.description === '' ? null : v.description,
    billingModel: v.billingModel,
    currency: v.currency,
    hourlyRateMinor: rateInputToMinor(v.hourlyRate, v.currency) ?? null,
    startDate: v.startDate === '' ? null : v.startDate,
    status: v.status,
  };
}

/** Server field paths → form fields. */
export const PROJECT_API_PATH_TO_FIELD: Record<string, keyof ProjectFormInput> = {
  clientId: 'clientId',
  name: 'name',
  description: 'description',
  billingModel: 'billingModel',
  currency: 'currency',
  hourlyRateMinor: 'hourlyRate',
  startDate: 'startDate',
  status: 'status',
};
