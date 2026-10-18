import {
  decimalToMinorUnits,
  isoDateSchema,
  type CreateEntryRequest,
  type RequirementDto,
  type TaskDto,
} from '@soloops/contracts';
import { z } from 'zod';
import { fractionDigits } from '@/features/core-ops/money';
import type { ApprovedVersion } from '@/features/tasks/task-form';

export const NOT_LINKED = 'NONE';

const wholeNumber = (label: string, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= max), {
      error: `${label} must be a whole number from 0 to ${max}.`,
    });

/**
 * S-10 "Log work" (FR-040, AC-017.1). The form only shapes the request: duration and amount
 * limits are checked here for quick feedback, and the API decides validity and eligibility
 * (AC-018.2). `link` is `NONE`, `task:<id>`, `req:<id>` or `cr:<id>:<n>`.
 */
export function makeLogWorkSchema(currency: string, today: string) {
  return z
    .object({
      kind: z.enum(['TIME', 'FIXED']),
      workDate: isoDateSchema.refine((d) => d <= today, {
        error: 'The work date cannot be in the future.',
      }),
      hours: wholeNumber('Hours', 24),
      minutes: wholeNumber('Minutes', 59),
      amount: z.string().trim(),
      description: z
        .string()
        .trim()
        .min(1, { error: 'Describe the work.' })
        .max(500, { error: 'Description must be at most 500 characters.' }),
      link: z.string().min(1),
    })
    .superRefine((v, ctx) => {
      if (v.kind === 'TIME') {
        const total = totalMinutes(v.hours, v.minutes);
        if (total < 1 || total > 1440) {
          ctx.addIssue({
            code: 'custom',
            path: ['hours'],
            message: 'Enter a duration from 1 minute to 24 hours.',
          });
        }
      } else {
        const minor = decimalToMinorUnits(v.amount, fractionDigits(currency));
        if (minor === null || BigInt(minor) <= 0n) {
          ctx.addIssue({
            code: 'custom',
            path: ['amount'],
            message: `Enter an amount above zero, e.g. 1500 or 1500.50 (${currency}).`,
          });
        }
      }
    });
}

export type LogWorkInput = z.input<ReturnType<typeof makeLogWorkSchema>>;
export type LogWorkValues = z.output<ReturnType<typeof makeLogWorkSchema>>;

const totalMinutes = (hours: string, minutes: string) =>
  Number(hours === '' ? 0 : hours) * 60 + Number(minutes === '' ? 0 : minutes);

export const emptyLogWork = (today: string): LogWorkInput => ({
  kind: 'TIME',
  workDate: today,
  hours: '',
  minutes: '',
  amount: '',
  description: '',
  link: NOT_LINKED,
});

export function toEntryRequest(v: LogWorkValues, currency: string): CreateEntryRequest {
  const base = {
    workDate: v.workDate,
    description: v.description,
    ...linkToRequest(v.link),
  };
  return v.kind === 'TIME'
    ? { kind: 'TIME', minutes: totalMinutes(v.hours, v.minutes), ...base }
    : {
        kind: 'FIXED',
        amountMinor: decimalToMinorUnits(v.amount, fractionDigits(currency)) as string,
        ...base,
      };
}

function linkToRequest(link: string): Pick<CreateEntryRequest, 'taskId' | 'scope'> {
  const [type, id, n] = link.split(':');
  if (type === 'task' && id) return { taskId: id };
  if (type === 'req' && id) return { scope: { type: 'BASELINE', requirementId: id } };
  if (type === 'cr' && id && n) {
    return { scope: { type: 'CHANGE_REQUEST', changeRequestId: id, versionNumber: Number(n) } };
  }
  return { scope: { type: 'NONE' } };
}

/**
 * What the work can belong to: billable tasks, requirements (baselined ones authorise billing;
 * drafts are labelled) and approved change-request versions. "Not linked" is allowed and is
 * shown as not billable (UNSCOPED).
 */
export function linkOptions(
  tasks: TaskDto[],
  requirements: RequirementDto[],
  approved: ApprovedVersion[],
) {
  return [
    { value: NOT_LINKED, label: 'Not linked to agreed scope (not billable)' },
    ...tasks
      .filter((t) => t.billable)
      .map((t) => ({ value: `task:${t.id}`, label: `Task · ${t.title}` })),
    ...requirements.map((r) => ({
      value: `req:${r.id}`,
      label: `Original scope · ${r.key} ${r.title}${r.baselineId ? '' : ' (not baselined)'}`,
    })),
    ...approved.map((v) => ({
      value: `cr:${v.changeRequestId}:${v.versionNumber}`,
      label: `Additional · ${v.key} v${v.versionNumber} ${v.title}`,
    })),
  ];
}

/** Server field paths → form fields. */
export function logWorkFieldFor(path: string): keyof LogWorkInput | null {
  const head = path.split('.')[0] ?? '';
  if (head === 'minutes') return 'hours';
  if (head === 'amountMinor') return 'amount';
  if (head === 'taskId' || head === 'scope') return 'link';
  return head === 'kind' || head === 'workDate' || head === 'description' ? head : null;
}
