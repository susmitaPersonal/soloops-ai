import {
  taskStatusSchema,
  type CreateTaskRequest,
  type RequirementDto,
  type TaskDto,
} from '@soloops/contracts';
import { z } from 'zod';

export const INTERNAL = 'INTERNAL';

/** An APPROVED change-request version that can authorise new tasks (BR-012). */
export interface ApprovedVersion {
  changeRequestId: string;
  key: string;
  versionNumber: number;
  title: string;
}

/** Form value of a change-request scope: `cr:<changeRequestId>:<versionNumber>`. */
const crValue = (changeRequestId: string, versionNumber: number) =>
  `cr:${changeRequestId}:${versionNumber}`;

/**
 * S-09 task form (FR-014). `scope` is INTERNAL, a baselined requirement ID or an approved
 * change-request version (`cr:<id>:<n>`). The billable
 * rule (BR-015, AC-016.1) is checked here for immediate feedback; the API enforces it regardless.
 */
export const taskFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, { error: 'Title is required.' })
      .max(200, { error: 'Title must be at most 200 characters.' }),
    description: z
      .string()
      .trim()
      .max(5000, { error: 'Description must be at most 5,000 characters.' }),
    scope: z.string().min(1, { error: 'Choose what this task belongs to.' }),
    billable: z.boolean(),
    assigneeUserId: z.string(),
    status: taskStatusSchema,
  })
  .superRefine((v, ctx) => {
    if (v.billable && v.scope === INTERNAL) {
      ctx.addIssue({
        code: 'custom',
        path: ['billable'],
        message:
          'A billable task must belong to a baselined requirement or an approved change request.',
      });
    }
  });

export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskFormValues = z.output<typeof taskFormSchema>;

export const toTaskFormValues = (t?: TaskDto): TaskFormInput => ({
  title: t?.title ?? '',
  description: t?.description ?? '',
  scope:
    t?.scope.type === 'BASELINE' && t.scope.requirementId
      ? t.scope.requirementId
      : t?.scope.type === 'CHANGE_REQUEST' && t.scope.changeRequestId && t.scope.versionNumber
        ? crValue(t.scope.changeRequestId, t.scope.versionNumber)
        : INTERNAL,
  billable: t?.billable ?? false,
  assigneeUserId: t?.assigneeUserId ?? '',
  status: t?.status ?? 'TODO',
});

export const toTaskRequest = (v: TaskFormValues): CreateTaskRequest => ({
  title: v.title,
  description: v.description === '' ? null : v.description,
  scope: toScope(v.scope),
  billable: v.billable,
  assigneeUserId: v.assigneeUserId === '' ? null : v.assigneeUserId,
  status: v.status,
});

function toScope(value: string): CreateTaskRequest['scope'] {
  if (value === INTERNAL) return { type: 'INTERNAL' };
  const cr = /^cr:([^:]+):(\d+)$/.exec(value);
  if (cr) {
    return {
      type: 'CHANGE_REQUEST',
      changeRequestId: cr[1] as string,
      versionNumber: Number(cr[2]),
    };
  }
  return { type: 'BASELINE', requirementId: value };
}

/** Server field paths (`scope.requirementId`, …) → form fields. */
export function taskFieldFor(path: string): keyof TaskFormInput | null {
  const head = path.split('.')[0] ?? '';
  return head === 'title' ||
    head === 'description' ||
    head === 'scope' ||
    head === 'billable' ||
    head === 'assigneeUserId' ||
    head === 'status'
    ? head
    : null;
}

/**
 * BR-015 / BR-012: only baselined requirements and APPROVED change-request versions are offered
 * (S-09 combobox). A task's existing link stays selectable even if its version was superseded
 * since (BR-013: existing work stays authorised).
 */
export function scopeOptions(
  requirements: RequirementDto[],
  approved: ApprovedVersion[] = [],
  current?: TaskDto,
) {
  const options = [
    { value: INTERNAL, label: 'Internal (not billable)' },
    ...requirements
      .filter((r) => r.baselineId !== null)
      .map((r) => ({ value: r.id, label: `Original scope · ${r.key} ${r.title}` })),
    ...approved.map((v) => ({
      value: crValue(v.changeRequestId, v.versionNumber),
      label: `Additional · ${v.key} v${v.versionNumber} ${v.title}`,
    })),
  ];
  const s = current?.scope;
  if (s?.type === 'CHANGE_REQUEST' && s.changeRequestId && s.versionNumber) {
    const value = crValue(s.changeRequestId, s.versionNumber);
    if (!options.some((o) => o.value === value)) {
      options.push({ value, label: `Additional · CR v${s.versionNumber} (earlier approval)` });
    }
  }
  return options;
}
