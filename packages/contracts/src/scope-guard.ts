import { z } from 'zod';
import { idSchema, minorUnitsSchema } from './common';
import { isoDateSchema, listQuerySchema } from './core-ops';

/**
 * Scope Guard contracts (FR-020–FR-029, FR-032): change requests, immutable versions and
 * hash-bound client decisions. States follow docs/design/change-request-lifecycle.md exactly.
 */

export const channels = ['EMAIL', 'CHAT', 'CALL', 'MEETING', 'IN_PERSON', 'OTHER'] as const;
export const channelSchema = z.enum(channels, { error: 'Choose how the client contacted you.' });
export type Channel = z.infer<typeof channelSchema>;

export const versionStates = [
  'DRAFT',
  'PROPOSED',
  'APPROVED',
  'REJECTED',
  'CLARIFICATION_REQUESTED',
  'WITHDRAWN',
  'SUPERSEDED',
] as const;
export const versionStateSchema = z.enum(versionStates);
export type VersionState = z.infer<typeof versionStateSchema>;

/** Derived CR status (lifecycle doc "Derived CR status"); cached as `derivedStatus` (ADR-0015). */
export const crStatuses = [
  'DRAFT',
  'REVISING',
  'AWAITING_DECISION',
  'NEEDS_REVISION',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export const crStatusSchema = z.enum(crStatuses);
export type CrStatus = z.infer<typeof crStatusSchema>;

export const decisions = ['APPROVED', 'REJECTED', 'CLARIFICATION_REQUESTED'] as const;
export const decisionSchema = z.enum(decisions, { error: 'Choose the client’s decision.' });
export type Decision = z.infer<typeof decisionSchema>;

export const riskSeverities = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const riskSeveritySchema = z.enum(riskSeverities);

export const contentHashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, { error: 'Must be a 64-character content hash.' });

const MAX_MINUTES = 120_000; // 2,000 h (BR-026)

const item = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `${label} cannot be empty.` })
    .max(300, { error: `${label} must be at most 300 characters.` });
const list = (label: string) =>
  z.array(item(label)).max(20, { error: `Add at most 20 ${label.toLowerCase()} items.` });

const minutesSchema = z
  .number({ error: 'Enter a number of minutes.' })
  .int({ error: 'Use whole minutes.' })
  .min(1, { error: 'Must be at least 1 minute.' })
  .max(MAX_MINUTES, { error: 'Must be at most 2,000 hours.' });

/** BR-026: low ≤ likely ≤ high, each 1 min – 2,000 h. */
export const effortRangeSchema = z
  .object({ lowMinutes: minutesSchema, likelyMinutes: minutesSchema, highMinutes: minutesSchema })
  .refine((e) => e.lowMinutes <= e.likelyMinutes && e.likelyMinutes <= e.highMinutes, {
    error: 'The range must satisfy low ≤ likely ≤ high.',
  });
export type EffortRange = z.infer<typeof effortRangeSchema>;

export const riskSchema = z.object({
  description: item('Risk'),
  severity: riskSeveritySchema,
});

/** Pricing as entered by a human (FR-023). TIME prices are computed by the server (BR-020). */
export const pricingInputSchema = z.discriminatedUnion(
  'mode',
  [
    z.object({ mode: z.literal('TIME') }),
    z.object({ mode: z.literal('FIXED'), priceMinor: minorUnitsSchema }),
  ],
  { error: 'Choose time-based or fixed pricing.' },
);

/** Fields of a version that the AI may suggest and that carry provenance (FR-022). */
export const aiSuggestableFields = [
  'clarifiedDescription',
  'inScope',
  'outOfScope',
  'acceptanceCriteria',
  'affectedRequirementIds',
  'dependencies',
  'assumptions',
  'risks',
  'effort',
  'timelineImpact',
] as const;
export const aiSuggestableFieldSchema = z.enum(aiSuggestableFields);
export type AiSuggestableField = z.infer<typeof aiSuggestableFieldSchema>;

/** Editable draft content (data-model §4.9). Everything is optional while drafting. */
export const versionContentSchema = z.object({
  title: z.string().trim().max(200, { error: 'Title must be at most 200 characters.' }),
  clarifiedDescription: z
    .string()
    .trim()
    .max(4000, { error: 'Description must be at most 4,000 characters.' }),
  inScope: list('In scope'),
  outOfScope: list('Out of scope'),
  acceptanceCriteria: list('Acceptance criteria'),
  affectedRequirementIds: z.array(idSchema).max(50, { error: 'Link at most 50 requirements.' }),
  dependencies: list('Dependencies'),
  assumptions: list('Assumptions'),
  risks: z.array(riskSchema).max(10, { error: 'Add at most 10 risks.' }),
  effort: effortRangeSchema.nullable(),
  confirmedEffortMinutes: minutesSchema.nullable(),
  pricing: pricingInputSchema.nullable(),
  timelineImpact: z
    .string()
    .trim()
    .max(500, { error: 'Timeline impact must be at most 500 characters.' }),
});

/** PATCH a DRAFT version (FR-022). Requires If-Match (the CR rowVersion). */
export const updateVersionRequestSchema = versionContentSchema
  .partial()
  .extend({
    /** Field → AI generation ID it came from, or null once a human edits it (AC-009.2). */
    aiFieldProvenance: z.partialRecord(aiSuggestableFieldSchema, idSchema.nullable()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: 'Provide at least one field to change.' });
export type UpdateVersionRequest = z.input<typeof updateVersionRequestSchema>;

/** FR-020 / AC-008.1: record the request exactly as received. */
export const createChangeRequestSchema = z.object({
  rawRequestText: z
    .string({ error: 'Paste the client’s message.' })
    .min(1, { error: 'Paste the client’s message.' })
    .max(20000, { error: 'The message must be at most 20,000 characters.' })
    .refine((v) => v.trim().length > 0, { error: 'Paste the client’s message.' }),
  sourceChannel: channelSchema,
  requestedByName: z
    .string()
    .trim()
    .min(1, { error: 'Who asked for it?' })
    .max(120, { error: 'Name must be at most 120 characters.' }),
  /** Not in the future (workspace time zone), checked by the server. */
  receivedOn: isoDateSchema,
  title: z.string().trim().max(200, { error: 'Title must be at most 200 characters.' }).optional(),
});
export type CreateChangeRequest = z.input<typeof createChangeRequestSchema>;

/** FR-025 / BR-014: a decision bound to the exact proposed version and its hash (BR-010). */
export const recordDecisionRequestSchema = z.object({
  decision: decisionSchema,
  contentHash: contentHashSchema,
  clientDecisionMakerName: z
    .string()
    .trim()
    .min(1, { error: 'Enter the client decision-maker’s name.' })
    .max(120, { error: 'Name must be at most 120 characters.' }),
  /** Not in the future (workspace time zone), checked by the server (AC-012.5). */
  decidedOn: isoDateSchema,
  channel: channelSchema,
  evidenceNote: z
    .string()
    .trim()
    .max(5000, { error: 'Evidence must be at most 5,000 characters.' })
    .nullable()
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
});
export type RecordDecisionRequest = z.input<typeof recordDecisionRequestSchema>;

export const pricingDtoSchema = z.object({
  mode: z.enum(['TIME', 'FIXED']),
  /** Resolved rate (BR-021) for TIME pricing; null for FIXED. */
  hourlyRateMinor: minorUnitsSchema.nullable(),
  /** Server-computed for TIME (BR-020); null when it can't be computed yet. */
  priceMinor: minorUnitsSchema.nullable(),
  currency: z.string(),
});
export type PricingDto = z.infer<typeof pricingDtoSchema>;

export const decisionSummarySchema = z.object({
  approvalId: idSchema,
  decision: decisionSchema,
  decidedOn: z.string(),
  clientDecisionMakerName: z.string(),
  channel: channelSchema,
});

export const versionDtoSchema = versionContentSchema.extend({
  number: z.number().int(),
  state: versionStateSchema,
  pricing: pricingDtoSchema.nullable(),
  aiFieldProvenance: z.record(z.string(), idSchema),
  contentHash: z.string().nullable(),
  proposedAt: z.string().nullable(),
  proposedByUserId: idSchema.nullable(),
  decision: decisionSummarySchema.nullable(),
});
export type VersionDto = z.infer<typeof versionDtoSchema>;

export const approvalDtoSchema = z.object({
  id: idSchema,
  versionNumber: z.number().int(),
  decision: decisionSchema,
  contentHash: z.string(),
  clientDecisionMakerName: z.string(),
  decidedOn: z.string(),
  channel: channelSchema,
  evidenceNote: z.string().nullable(),
  recordedByUserId: idSchema,
  recordedAt: z.string(),
});
export type ApprovalDto = z.infer<typeof approvalDtoSchema>;

export const historyEventSchema = z.object({
  id: idSchema,
  action: z.string(),
  actorUserId: idSchema,
  data: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type HistoryEvent = z.infer<typeof historyEventSchema>;

export const changeRequestDtoSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  number: z.number().int(),
  /** `CR-<number>` */
  key: z.string(),
  rawRequestText: z.string(),
  sourceChannel: channelSchema,
  requestedByName: z.string(),
  receivedOn: z.string(),
  status: crStatusSchema,
  openVersionNumber: z.number().int().nullable(),
  approvedVersionNumber: z.number().int().nullable(),
  latestVersionNumber: z.number().int(),
  versions: z.array(versionDtoSchema),
  /** True when the project or client is archived (BR-029). */
  readOnly: z.boolean(),
  rowVersion: z.number().int(),
  createdByUserId: idSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChangeRequestDto = z.infer<typeof changeRequestDtoSchema>;

/** GET one CR: the aggregate plus its immutable decisions and audit history (FR-028). */
export const changeRequestDetailSchema = changeRequestDtoSchema.extend({
  decisions: z.array(approvalDtoSchema),
  history: z.array(historyEventSchema),
});
export type ChangeRequestDetail = z.infer<typeof changeRequestDetailSchema>;

export const changeRequestSummarySchema = z.object({
  id: idSchema,
  projectId: idSchema,
  projectName: z.string(),
  number: z.number().int(),
  key: z.string(),
  title: z.string(),
  status: crStatusSchema,
  /** The version a reader should look at: the open one, else the latest. */
  currentVersionNumber: z.number().int(),
  currentVersionState: versionStateSchema,
  priceMinor: minorUnitsSchema.nullable(),
  currency: z.string(),
  /** When the open version was proposed (approvals queue "waiting"). */
  proposedAt: z.string().nullable(),
  /** The single APPROVED version, if any (BR-012: the only one that authorises new work). */
  approvedVersionNumber: z.number().int().nullable(),
  approvedVersionTitle: z.string().nullable(),
  updatedAt: z.string(),
});
export type ChangeRequestSummary = z.infer<typeof changeRequestSummarySchema>;

const statusFilter = z
  .string()
  .max(200)
  .transform((v, ctx) => {
    const parts = v.split(',').filter(Boolean);
    for (const p of parts) {
      if (!(crStatuses as readonly string[]).includes(p)) {
        ctx.addIssue({ code: 'custom', message: `Unknown status ${p}.` });
        return z.NEVER;
      }
    }
    return parts as CrStatus[];
  });

export const changeRequestListQuerySchema = listQuerySchema.extend({
  status: statusFilter.optional(),
  projectId: idSchema.optional(),
});
export const changeRequestListResponseSchema = z.object({
  items: z.array(changeRequestSummarySchema),
  nextCursor: z.string().nullable(),
});
export type ChangeRequestListResponse = z.infer<typeof changeRequestListResponseSchema>;

export const recordDecisionResponseSchema = z.object({
  approvalId: idSchema,
  versionState: versionStateSchema,
  supersededVersion: z.number().int().nullable(),
  changeRequest: changeRequestDtoSchema,
});
export type RecordDecisionResponse = z.infer<typeof recordDecisionResponseSchema>;

/** FR-028 / AC-014.2: field-level differences between two versions. */
export const versionDiffSchema = z.object({
  from: z.number().int(),
  to: z.number().int(),
  fields: z.array(
    z.object({ field: z.string(), from: z.unknown(), to: z.unknown(), changed: z.boolean() }),
  ),
});
export type VersionDiff = z.infer<typeof versionDiffSchema>;

/** FR-027 / S-08: everything the client-facing summary shows. */
export const proposalSummarySchema = z.object({
  changeRequestKey: z.string(),
  projectName: z.string(),
  clientName: z.string(),
  supplier: z.object({
    legalName: z.string(),
    address: z.string().nullable(),
    taxId: z.string().nullable(),
  }),
  version: versionDtoSchema,
  /** Mandatory BR-026 wording. */
  disclaimer: z.string(),
});
export type ProposalSummary = z.infer<typeof proposalSummarySchema>;

/** BR-026: shown with every effort figure. */
export const ESTIMATE_DISCLAIMER =
  'This is an estimate based on the listed assumptions, not a guarantee of actual effort.';

export const crKey = (n: number) => `CR-${n}`;
