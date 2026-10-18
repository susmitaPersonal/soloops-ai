import {
  requirementPrioritySchema,
  type CreateRequirementRequest,
  type RequirementDto,
} from '@soloops/contracts';
import { z } from 'zod';

/** Acceptance criteria are typed one per line; blank lines are ignored. */
export const criteriaLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

/** S-05 add/edit requirement (FR-012). Limits mirror the contract (data-model §4.7). */
export const requirementFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, { error: 'Title is required.' })
      .max(200, { error: 'Title must be at most 200 characters.' }),
    description: z
      .string()
      .trim()
      .max(10000, { error: 'Description must be at most 10,000 characters.' }),
    acceptanceCriteria: z.string(),
    priority: requirementPrioritySchema,
  })
  .superRefine((v, ctx) => {
    const lines = criteriaLines(v.acceptanceCriteria);
    if (lines.length > 30) {
      ctx.addIssue({
        code: 'custom',
        path: ['acceptanceCriteria'],
        message: 'Add at most 30 acceptance criteria.',
      });
    } else if (lines.some((l) => l.length > 300)) {
      ctx.addIssue({
        code: 'custom',
        path: ['acceptanceCriteria'],
        message: 'Each acceptance criterion must be at most 300 characters.',
      });
    }
  });

export type RequirementFormInput = z.input<typeof requirementFormSchema>;
export type RequirementFormValues = z.output<typeof requirementFormSchema>;

export const toRequirementFormValues = (r?: RequirementDto): RequirementFormInput => ({
  title: r?.title ?? '',
  description: r?.description ?? '',
  acceptanceCriteria: (r?.acceptanceCriteria ?? []).join('\n'),
  priority: r?.priority ?? 'MUST',
});

export const toRequirementRequest = (v: RequirementFormValues): CreateRequirementRequest => ({
  title: v.title,
  description: v.description,
  acceptanceCriteria: criteriaLines(v.acceptanceCriteria),
  priority: v.priority,
});

/** Server field paths (including `acceptanceCriteria.3`) → form fields. */
export function requirementFieldFor(path: string): keyof RequirementFormInput | null {
  const head = path.split('.')[0] ?? '';
  return head === 'title' ||
    head === 'description' ||
    head === 'acceptanceCriteria' ||
    head === 'priority'
    ? head
    : null;
}
