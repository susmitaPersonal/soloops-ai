import type { CrStatus, VersionState } from '@soloops/contracts';

/**
 * Derived CR status (docs/design/change-request-lifecycle.md, "Derived CR status"), evaluated in
 * the documented order. Cached as `derivedStatus` and written only with the versions (ADR-0015).
 */
export function deriveCrStatus(
  versions: readonly { number: number; state: VersionState }[],
): CrStatus {
  const has = (s: VersionState) => versions.some((v) => v.state === s);
  const latest = [...versions].sort((a, b) => b.number - a.number)[0];
  if (has('DRAFT') && has('APPROVED')) return 'REVISING';
  if (has('DRAFT')) return 'DRAFT';
  if (has('PROPOSED')) return 'AWAITING_DECISION';
  if (latest?.state === 'CLARIFICATION_REQUESTED') return 'NEEDS_REVISION';
  if (has('APPROVED')) return 'APPROVED';
  if (latest?.state === 'REJECTED') return 'REJECTED';
  if (latest?.state === 'WITHDRAWN') return 'WITHDRAWN';
  // Only reachable for histories outside the documented table (e.g. every version superseded).
  return 'APPROVED';
}

/** States that close a version (no further transition except "create new version"). */
export const CLOSED_STATES: ReadonlySet<VersionState> = new Set([
  'APPROVED',
  'REJECTED',
  'CLARIFICATION_REQUESTED',
  'WITHDRAWN',
  'SUPERSEDED',
]);

/** BR-012: only APPROVED versions authorise new work. */
export const authorisesNewWork = (state: VersionState) => state === 'APPROVED';

/**
 * BR-013 / BR-016(a): work already linked stays authorised under a superseded version. Only an
 * APPROVED version can become SUPERSEDED, so SUPERSEDED always means "approved, then replaced".
 */
export const authorisesExistingWork = (state: VersionState) =>
  state === 'APPROVED' || state === 'SUPERSEDED';
