import { z } from 'zod';
import { currencyCodeSchema, idSchema, minorUnitsSchema } from './common';

/**
 * Core Ops contracts (FR-010–FR-014): clients, projects, requirements, baselines and tasks.
 * Shapes follow data-model.md §4.5–4.8 and §4.11. Persistence documents stay in apps/api.
 */

/** Optional text that may be cleared: '' and null both mean "no value". */
const nullableText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} must be at most ${max} characters.` })
    .nullable()
    .transform((v) => (v === '' ? null : v));

const requiredText = (max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(max, { error: `${label} must be at most ${max} characters.` });

/** Calendar date `YYYY-MM-DD` (api-design §1). Rejects impossible dates such as 2026-02-30. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Use a date in the form YYYY-MM-DD.', abort: true })
  .refine(
    (v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    },
    { error: 'This date does not exist.' },
  );

/** At least one field must be present in a PATCH body. */
const atLeastOne = { error: 'Provide at least one field to change.' };

// ---------------------------------------------------------------------------------------------
// Pagination (api-design §1): cursor-based, `limit` ≤ 100, `{ items, nextCursor }`.

export const listQuerySchema = z.object({
  limit: z.coerce
    .number({ error: 'limit must be a number.' })
    .int({ error: 'limit must be a whole number.' })
    .min(1, { error: 'limit must be between 1 and 100.' })
    .max(100, { error: 'limit must be between 1 and 100.' })
    .default(50),
  cursor: z.string().max(512, { error: 'cursor is too long.' }).optional(),
});

const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

/** `?archived=true` lists archived records instead of active ones (AC-004.3: hidden by default). */
const archivedFlag = z
  .enum(['true', 'false'], { error: 'archived must be true or false.' })
  .default('false')
  .transform((v) => v === 'true');

// ---------------------------------------------------------------------------------------------
// FR-010 clients (data-model §4.5)

export const clientFieldsSchema = z.object({
  name: requiredText(160, 'Client name'),
  contactName: nullableText(160, 'Contact name'),
  email: z
    .string()
    .trim()
    .max(254, { error: 'Email must be at most 254 characters.' })
    .nullable()
    .transform((v) => (v === '' ? null : v))
    .pipe(z.email({ error: 'Enter a valid email address.' }).nullable()),
  phone: nullableText(32, 'Phone'),
  billingAddress: nullableText(500, 'Billing address'),
  taxId: nullableText(32, 'Tax ID'),
});

export const createClientRequestSchema = clientFieldsSchema.partial().required({ name: true });
export type CreateClientRequest = z.input<typeof createClientRequestSchema>;

export const updateClientRequestSchema = clientFieldsSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, atLeastOne);
export type UpdateClientRequest = z.input<typeof updateClientRequestSchema>;

export const clientDtoSchema = z.object({
  id: idSchema,
  name: z.string(),
  contactName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  billingAddress: z.string().nullable(),
  taxId: z.string().nullable(),
  /** ISO timestamp; non-null means read-only (BR-029). */
  archivedAt: z.string().nullable(),
  rowVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ClientDto = z.infer<typeof clientDtoSchema>;

export const clientListQuerySchema = listQuerySchema.extend({ archived: archivedFlag });
export const clientListResponseSchema = page(clientDtoSchema);
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;

// ---------------------------------------------------------------------------------------------
// FR-011 projects (data-model §4.6)

export const billingModels = ['HOURLY', 'FIXED'] as const;
export const billingModelSchema = z.enum(billingModels, { error: 'Choose hourly or fixed.' });
export type BillingModel = z.infer<typeof billingModelSchema>;

export const projectStatuses = ['ACTIVE', 'ON_HOLD', 'COMPLETED'] as const;
export const projectStatusSchema = z.enum(projectStatuses, {
  error: 'Choose active, on hold or completed.',
});
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

const projectEditableFields = z.object({
  name: requiredText(160, 'Project name'),
  description: nullableText(5000, 'Description'),
  billingModel: billingModelSchema,
  currency: currencyCodeSchema,
  /** null = use the workspace default rate (BR-021). */
  hourlyRateMinor: minorUnitsSchema.nullable(),
  startDate: isoDateSchema.nullable(),
  status: projectStatusSchema,
});

/**
 * POST /projects. `currency` defaults to the workspace currency and `hourlyRateMinor` to null
 * (workspace default rate) — AC-002.1 "settings are used as defaults for new projects".
 */
export const createProjectRequestSchema = projectEditableFields
  .partial()
  .required({ name: true, billingModel: true })
  .extend({ clientId: idSchema });
export type CreateProjectRequest = z.input<typeof createProjectRequestSchema>;

/** PATCH /projects/{id}. The client cannot change after creation. Requires If-Match. */
export const updateProjectRequestSchema = projectEditableFields
  .partial()
  .refine((v) => Object.keys(v).length > 0, atLeastOne);
export type UpdateProjectRequest = z.input<typeof updateProjectRequestSchema>;

export const projectDtoSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  clientName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  billingModel: billingModelSchema,
  currency: z.string(),
  hourlyRateMinor: minorUnitsSchema.nullable(),
  startDate: z.string().nullable(),
  status: projectStatusSchema,
  archivedAt: z.string().nullable(),
  /** True when the project or its client is archived (BR-029): no edits or new work. */
  readOnly: z.boolean(),
  rowVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const projectListQuerySchema = listQuerySchema.extend({
  archived: archivedFlag,
  clientId: idSchema.optional(),
});
export const projectListResponseSchema = page(projectDtoSchema);
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

// ---------------------------------------------------------------------------------------------
// FR-012 requirements and FR-013 baselines (data-model §4.7–4.8)

export const requirementPriorities = ['MUST', 'SHOULD', 'COULD'] as const;
export const requirementPrioritySchema = z.enum(requirementPriorities, {
  error: 'Choose must, should or could.',
});
export type RequirementPriority = z.infer<typeof requirementPrioritySchema>;

const requirementEditableFields = z.object({
  title: requiredText(200, 'Title'),
  description: z
    .string()
    .trim()
    .max(10000, { error: 'Description must be at most 10,000 characters.' }),
  acceptanceCriteria: z
    .array(
      z
        .string()
        .trim()
        .min(1, { error: 'Acceptance criteria cannot be empty.' })
        .max(300, { error: 'Each acceptance criterion must be at most 300 characters.' }),
    )
    .max(30, { error: 'Add at most 30 acceptance criteria.' }),
  priority: requirementPrioritySchema,
});

export const createRequirementRequestSchema = requirementEditableFields
  .partial()
  .required({ title: true, priority: true });
export type CreateRequirementRequest = z.input<typeof createRequirementRequestSchema>;

/** PATCH /requirements/{id}: only while not baselined (BR-004). Requires If-Match. */
export const updateRequirementRequestSchema = requirementEditableFields
  .partial()
  .refine((v) => Object.keys(v).length > 0, atLeastOne);
export type UpdateRequirementRequest = z.input<typeof updateRequirementRequestSchema>;

export const requirementDtoSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  number: z.number().int(),
  /** Display key `REQ-<number>` (AC-006.1). */
  key: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  priority: requirementPrioritySchema,
  /** Non-null once frozen; the requirement is then immutable (BR-004). */
  baselineId: idSchema.nullable(),
  rowVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RequirementDto = z.infer<typeof requirementDtoSchema>;

/** Requirements of one project are small by nature: all of them, capped at 500 (data-model §6). */
export const requirementListResponseSchema = z.object({ items: z.array(requirementDtoSchema) });
export type RequirementListResponse = z.infer<typeof requirementListResponseSchema>;

export const baselineDtoSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  sequence: z.number().int(),
  requirementCount: z.number().int(),
  /** SHA-256 of the canonical JSON of the frozen requirements (BR-005). */
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdByUserId: idSchema,
  createdAt: z.string(),
});
export type BaselineDto = z.infer<typeof baselineDtoSchema>;
export const baselineListResponseSchema = z.object({ items: z.array(baselineDtoSchema) });
export type BaselineListResponse = z.infer<typeof baselineListResponseSchema>;

// ---------------------------------------------------------------------------------------------
// FR-014 tasks (data-model §4.11)

export const taskStatuses = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export const taskStatusSchema = z.enum(taskStatuses, {
  error: 'Choose to do, in progress or done.',
});
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/**
 * BR-015: what authorises the task. `CHANGE_REQUEST` is part of the contract so clients do not
 * break when Scope Guard (M3) lands; until then no version can be APPROVED, so it is refused.
 */
export const taskScopeSchema = z.discriminatedUnion(
  'type',
  [
    z.object({ type: z.literal('BASELINE'), requirementId: idSchema }),
    z.object({
      type: z.literal('CHANGE_REQUEST'),
      changeRequestId: idSchema,
      versionNumber: z.number().int().min(1).max(50),
    }),
    z.object({ type: z.literal('INTERNAL') }),
  ],
  { error: 'Choose what this task belongs to.' },
);
export type TaskScope = z.infer<typeof taskScopeSchema>;

const taskEditableFields = z.object({
  title: requiredText(200, 'Title'),
  description: nullableText(5000, 'Description'),
  assigneeUserId: idSchema.nullable(),
  status: taskStatusSchema,
  billable: z.boolean({ error: 'Billable must be true or false.' }),
  scope: taskScopeSchema,
});

export const createTaskRequestSchema = taskEditableFields
  .partial()
  .required({ title: true, scope: true });
export type CreateTaskRequest = z.input<typeof createTaskRequestSchema>;

/** PATCH /tasks/{id}. BR-015 is re-checked on the merged result. Requires If-Match. */
export const updateTaskRequestSchema = taskEditableFields
  .partial()
  .refine((v) => Object.keys(v).length > 0, atLeastOne);
export type UpdateTaskRequest = z.input<typeof updateTaskRequestSchema>;

export const taskScopeDtoSchema = z.object({
  type: z.enum(['BASELINE', 'CHANGE_REQUEST', 'INTERNAL']),
  requirementId: idSchema.nullable(),
  changeRequestId: idSchema.nullable(),
  versionNumber: z.number().int().nullable(),
});

export const taskDtoSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  assigneeUserId: idSchema.nullable(),
  status: taskStatusSchema,
  billable: z.boolean(),
  scope: taskScopeDtoSchema,
  rowVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskDto = z.infer<typeof taskDtoSchema>;

export const taskListQuerySchema = listQuerySchema.extend({
  status: taskStatusSchema.optional(),
  assigneeUserId: idSchema.optional(),
});
export const taskListResponseSchema = page(taskDtoSchema);
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;

/** `REQ-7` from 7 (AC-006.1). */
export const requirementKey = (n: number) => `REQ-${n}`;
