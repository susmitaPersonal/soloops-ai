import type {
  BillingModel,
  ProjectStatus,
  RequirementPriority,
  TaskStatus,
} from '@soloops/contracts';
import type { BadgeTone } from '@/components/StatusBadge';

/** Design system §6 status mapping: one source for labels and tones. */
export const TASK_STATUS: Record<TaskStatus, { label: string; tone: BadgeTone }> = {
  TODO: { label: 'To do', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  DONE: { label: 'Done', tone: 'success' },
};

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  ON_HOLD: { label: 'On hold', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
};

export const PRIORITY_LABEL: Record<RequirementPriority, string> = {
  MUST: 'Must',
  SHOULD: 'Should',
  COULD: 'Could',
};

export const BILLING_MODEL_LABEL: Record<BillingModel, string> = {
  HOURLY: 'Hourly',
  FIXED: 'Fixed price',
};

export const options = <K extends string>(labels: Record<K, string | { label: string }>) =>
  (Object.keys(labels) as K[]).map((value) => {
    const l = labels[value];
    return { value, label: typeof l === 'string' ? l : l.label };
  });

/** "3 Oct 2026" in the default locale (NFR-013: Intl formatting). */
/**
 * A calendar day (`YYYY-MM-DD`, e.g. a work or decision date) has no time zone: format it as the
 * same day everywhere. `formatDate` on such a string would shift it west of UTC.
 */
export function formatDay(isoDate: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
