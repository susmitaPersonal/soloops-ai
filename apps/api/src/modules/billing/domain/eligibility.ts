import type { Eligibility } from '@soloops/contracts';

/**
 * BR-016 eligibility, the single source of truth (workflows §4). Pure: the service gathers the
 * authoritative facts (requirement baselined? version state?) and this decides. Eligibility is
 * never stored and never accepted from a client (AC-018.2).
 */
export type ScopeFacts =
  | { type: 'NONE' }
  /** `baselined: null` means the requirement no longer exists (deleted draft). */
  | { type: 'BASELINE'; key: string | null; baselined: boolean | null }
  /** `authorised`: the version is APPROVED or SUPERSEDED-after-approval (BR-013). */
  | { type: 'CHANGE_REQUEST'; key: string | null; state: string | null; authorised: boolean };

export interface EligibilityInput {
  scope: ScopeFacts;
  /** BR-018: `invoiceId` is set while the entry is on a draft or issued invoice. */
  invoiced: boolean;
  entryCurrency: string;
  projectCurrency: string;
}

const no = (reason: Extract<Eligibility, { eligible: false }>['reason'], explanation: string) =>
  ({ eligible: false, reason, explanation }) as const;

/** Checks run in the order of the workflows §4 decision chart; the first failure is reported. */
export function classifyEntry(input: EligibilityInput): Eligibility {
  const { scope } = input;
  if (scope.type === 'NONE') {
    return no(
      'UNSCOPED',
      'This work is not linked to agreed scope. Link it to a task, a baselined requirement or an approved change request.',
    );
  }
  if (scope.type === 'BASELINE' && scope.baselined !== true) {
    return no(
      'REQUIREMENT_NOT_BASELINED',
      scope.baselined === null
        ? 'The linked requirement was deleted, so this work is not part of the agreed scope.'
        : `${scope.key ?? 'The requirement'} is not baselined yet. Create a baseline to agree it as original scope.`,
    );
  }
  if (scope.type === 'CHANGE_REQUEST' && !scope.authorised) {
    return no(
      'CR_NOT_APPROVED',
      `${scope.key ?? 'The change request'} is ${describeState(scope.state)}. Only work on an approved version can be invoiced.`,
    );
  }
  if (input.invoiced) {
    return no('ALREADY_INVOICED', 'This work is already on an invoice.');
  }
  if (input.entryCurrency !== input.projectCurrency) {
    return no(
      'CURRENCY_MISMATCH',
      `This work was logged in ${input.entryCurrency}, but the project bills in ${input.projectCurrency}.`,
    );
  }
  return { eligible: true };
}

function describeState(state: string | null): string {
  switch (state) {
    case 'DRAFT':
      return 'still a draft';
    case 'PROPOSED':
      return 'waiting for the client’s decision';
    case 'REJECTED':
      return 'rejected by the client';
    case 'WITHDRAWN':
      return 'withdrawn';
    case null:
      return 'missing';
    default:
      return 'not approved';
  }
}
