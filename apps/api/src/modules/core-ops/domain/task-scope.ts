import type { FieldError } from '@soloops/contracts';

/** What the service found for the task's scope link, resolved within the same project. */
export type ScopeTarget =
  | { type: 'INTERNAL' }
  | { type: 'BASELINE'; requirement: { baselined: boolean } | null }
  /** Resolved through the scope-guard port: an APPROVED version of the same project (BR-012). */
  | { type: 'CHANGE_REQUEST'; approvedVersionFound: boolean };

export type ScopeDecision =
  | { ok: true }
  | { ok: false; code: 'VALIDATION_FAILED' | 'NOT_ELIGIBLE'; errors: FieldError[]; detail: string };

/**
 * BR-015 / AC-016.1: a billable task must link to a baselined requirement or an APPROVED
 * change-request version of the same project; a task with neither link is internal and cannot
 * be billable. A BASELINE link always needs a baselined requirement (data-model §4.11).
 */
export function decideTaskScope(target: ScopeTarget, billable: boolean): ScopeDecision {
  switch (target.type) {
    case 'INTERNAL':
      return billable
        ? {
            ok: false,
            code: 'NOT_ELIGIBLE',
            detail: 'Internal tasks cannot be billable.',
            errors: [
              {
                path: 'billable',
                message:
                  'A billable task must belong to a baselined requirement or an approved change request.',
              },
            ],
          }
        : { ok: true };
    case 'BASELINE':
      if (target.requirement === null) {
        return {
          ok: false,
          code: 'VALIDATION_FAILED',
          detail: 'Some fields need attention.',
          errors: [
            { path: 'scope.requirementId', message: 'Choose a requirement of this project.' },
          ],
        };
      }
      return target.requirement.baselined
        ? { ok: true }
        : {
            ok: false,
            code: 'NOT_ELIGIBLE',
            detail: 'Only baselined requirements can authorise work.',
            errors: [
              {
                path: 'scope.requirementId',
                message: 'This requirement is not baselined yet. Baseline the scope first.',
              },
            ],
          };
    case 'CHANGE_REQUEST':
      return target.approvedVersionFound
        ? { ok: true }
        : {
            ok: false,
            code: 'NOT_ELIGIBLE',
            detail: 'Only approved change-request versions can authorise work.',
            errors: [
              {
                path: 'scope',
                message: 'There is no approved change-request version to link this task to.',
              },
            ],
          };
  }
}
