import { z } from 'zod';
import { idSchema, minorUnitsSchema } from './common';
import { isoDateSchema, taskDtoSchema } from './core-ops';
import { crStatusSchema } from './scope-guard';

/**
 * Delivery and billable-work contracts (FR-030, FR-040, FR-041, FR-015). Eligibility is computed
 * by the server only (BR-016, AC-018.2); the client never sends it.
 */

// ---------------------------------------------------------------------------------------------
// FR-030 convert an approved version into tasks

export const convertToTasksRequestSchema = z.object({
  /** Indexes into the approved version's acceptance criteria (one task each, AC-015.1). */
  criterionIndexes: z
    .array(z.number().int().min(0).max(19))
    .min(1, { error: 'Choose at least one acceptance criterion.' })
    .max(20)
    .refine((a) => new Set(a).size === a.length, { error: 'Each criterion can be chosen once.' }),
});
export type ConvertToTasksRequest = z.input<typeof convertToTasksRequestSchema>;

export const convertToTasksResponseSchema = z.object({
  created: z.array(taskDtoSchema),
  /** Criteria that already had a task from this version (duplicate conversion is a no-op). */
  alreadyConverted: z.array(z.number().int()),
});
export type ConvertToTasksResponse = z.infer<typeof convertToTasksResponseSchema>;

// ---------------------------------------------------------------------------------------------
// FR-040 billable entries (data-model §4.12)

export const entryKinds = ['TIME', 'FIXED'] as const;
export const entryKindSchema = z.enum(entryKinds, { error: 'Choose time or a fixed amount.' });

/** Reason codes are a closed enum shared by API and UI (workflows §4). */
export const ineligibilityReasons = [
  'UNSCOPED',
  'REQUIREMENT_NOT_BASELINED',
  'CR_NOT_APPROVED',
  'ALREADY_INVOICED',
  'CURRENCY_MISMATCH',
] as const;
export const ineligibilityReasonSchema = z.enum(ineligibilityReasons);
export type IneligibilityReason = z.infer<typeof ineligibilityReasonSchema>;

/** What authorises the work (the task's scope is copied when `taskId` is given). */
export const entryScopeSchema = z.discriminatedUnion(
  'type',
  [
    z.object({ type: z.literal('BASELINE'), requirementId: idSchema }),
    z.object({
      type: z.literal('CHANGE_REQUEST'),
      changeRequestId: idSchema,
      versionNumber: z.number().int().min(1).max(50),
    }),
    z.object({ type: z.literal('NONE') }),
  ],
  { error: 'Choose what this work belongs to.' },
);

const description = z
  .string()
  .trim()
  .min(1, { error: 'Describe the work.' })
  .max(500, { error: 'Description must be at most 500 characters.' });

/**
 * POST billable entry. Either `taskId` (scope copied from the task) or an explicit `scope`.
 * `minutes` for TIME (1–1440, AC-017.1), `amountMinor` > 0 for FIXED.
 */
export const createEntryRequestSchema = z
  .object({
    kind: entryKindSchema,
    workDate: isoDateSchema,
    minutes: z
      .number({ error: 'Enter whole minutes.' })
      .int({ error: 'Enter whole minutes.' })
      .min(1, { error: 'Log at least 1 minute.' })
      .max(1440, { error: 'One entry can be at most 24 hours.' })
      .optional(),
    amountMinor: minorUnitsSchema
      .refine((v) => BigInt(v) > 0n, { error: 'The amount must be more than zero.' })
      .optional(),
    description,
    taskId: idSchema.optional(),
    scope: entryScopeSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'TIME' && v.minutes === undefined) {
      ctx.addIssue({ code: 'custom', path: ['minutes'], message: 'Enter the time spent.' });
    }
    if (v.kind === 'FIXED' && v.amountMinor === undefined) {
      ctx.addIssue({ code: 'custom', path: ['amountMinor'], message: 'Enter the amount.' });
    }
    if (v.kind === 'TIME' && v.amountMinor !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountMinor'],
        message: 'Time entries have no amount.',
      });
    }
    if (v.kind === 'FIXED' && v.minutes !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['minutes'],
        message: 'Fixed entries have no minutes.',
      });
    }
    if (v.taskId !== undefined && v.scope !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['scope'],
        message: 'Link a task or a scope, not both.',
      });
    }
  });
export type CreateEntryRequest = z.input<typeof createEntryRequestSchema>;

/** PATCH an unbilled entry (If-Match). Kind, task and scope are fixed after creation. */
export const updateEntryRequestSchema = z
  .object({
    workDate: isoDateSchema,
    minutes: z.number().int().min(1).max(1440),
    amountMinor: minorUnitsSchema.refine((v) => BigInt(v) > 0n, {
      error: 'The amount must be more than zero.',
    }),
    description,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { error: 'Provide at least one field to change.' });
export type UpdateEntryRequest = z.input<typeof updateEntryRequestSchema>;

export const eligibilitySchema = z.discriminatedUnion('eligible', [
  z.object({ eligible: z.literal(true) }),
  z.object({
    eligible: z.literal(false),
    reason: ineligibilityReasonSchema,
    /** Human-readable explanation (AC-018.1). */
    explanation: z.string(),
  }),
]);
export type Eligibility = z.infer<typeof eligibilitySchema>;

export const entryDtoSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  kind: entryKindSchema,
  workDate: z.string(),
  minutes: z.number().int().nullable(),
  amountMinor: minorUnitsSchema.nullable(),
  currency: z.string(),
  description: z.string(),
  taskId: idSchema.nullable(),
  scope: z.object({
    type: z.enum(['BASELINE', 'CHANGE_REQUEST', 'NONE']),
    requirementId: idSchema.nullable(),
    changeRequestId: idSchema.nullable(),
    versionNumber: z.number().int().nullable(),
  }),
  /** Short label of the authorising scope, e.g. `REQ-2` or `CR-3 v2` (server-resolved). */
  scopeLabel: z.string().nullable(),
  /** Original agreed scope vs additional (change-request) scope. */
  scopeKind: z.enum(['ORIGINAL', 'ADDITIONAL', 'NONE']),
  invoiceId: idSchema.nullable(),
  /** BR-016, computed now by the server; never stored, never accepted from clients. */
  eligibility: eligibilitySchema,
  /** BR-021 rate applied for TIME entries (null for FIXED). */
  hourlyRateMinor: minorUnitsSchema.nullable(),
  /** BR-020 line amount the server would invoice: TIME = roundHalfUp(min × rate / 60). */
  billableAmountMinor: minorUnitsSchema,
  createdByUserId: idSchema,
  rowVersion: z.number().int(),
  createdAt: z.string(),
});
export type EntryDto = z.infer<typeof entryDtoSchema>;

export const entryListQuerySchema = z.object({
  state: z
    .enum(['unbilled', 'all'], { error: 'state must be unbilled or all.' })
    .default('unbilled'),
});

/** FR-041 / AC-018.1: eligible and ineligible listed separately, with server totals. */
export const entryListResponseSchema = z.object({
  eligible: z.array(entryDtoSchema),
  ineligible: z.array(entryDtoSchema),
  eligibleTotalMinor: minorUnitsSchema,
  currency: z.string(),
  /** True when the project has more entries than one list returns (ENTRY_LIST_CAP). */
  truncated: z.boolean(),
});
export const ENTRY_LIST_CAP = 500;
export type EntryListResponse = z.infer<typeof entryListResponseSchema>;

// ---------------------------------------------------------------------------------------------
// FR-015 project overview (AC-024.1)

export const projectOverviewSchema = z.object({
  projectId: idSchema,
  currency: z.string(),
  requirements: z.object({ draft: z.number().int(), baselined: z.number().int() }),
  baselines: z.number().int(),
  changeRequests: z.record(crStatusSchema, z.number().int()),
  tasks: z.object({
    TODO: z.number().int(),
    IN_PROGRESS: z.number().int(),
    DONE: z.number().int(),
    total: z.number().int(),
    /** Tasks linked to the original scope vs approved change requests vs internal. */
    original: z.number().int(),
    additional: z.number().int(),
    internal: z.number().int(),
  }),
  unbilled: z.object({
    eligibleTotalMinor: minorUnitsSchema,
    eligibleCount: z.number().int(),
    ineligibleCount: z.number().int(),
  }),
});
export type ProjectOverview = z.infer<typeof projectOverviewSchema>;
