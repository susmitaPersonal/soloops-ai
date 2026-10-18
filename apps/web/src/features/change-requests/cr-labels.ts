import type {
  Channel,
  CrStatus,
  Decision,
  AskRelation,
  AskStatus,
  ScopeCoverage,
  ScopeVerdict,
  VersionState,
} from '@soloops/contracts';
import type { BadgeTone } from '@/components/StatusBadge';

/** FR-021 scope check: plain-language verdicts (text always shown, never colour alone). */
export const SCOPE_VERDICT: Record<ScopeVerdict, { label: string; help: string; tone: BadgeTone }> =
  {
    NEW_SCOPE: {
      label: 'New scope',
      help: 'No agreed requirement describes this. It is extra work to propose and price.',
      tone: 'warning',
    },
    CHANGES_AGREED_SCOPE: {
      label: 'Changes agreed scope',
      help: 'It modifies or extends an agreed requirement, so it needs a new decision.',
      tone: 'warning',
    },
    LIKELY_ALREADY_COVERED: {
      label: 'Likely already covered',
      help: 'Agreed requirements seem to cover it. Check the evidence before treating it as free.',
      tone: 'info',
    },
    UNCLEAR: {
      label: 'Unclear',
      help: 'Not enough information to decide. Ask the client the questions below.',
      tone: 'neutral',
    },
  };

/** How the confirmed verdict reads on the client-facing proposal (S-08). */
export const SCOPE_VERDICT_CLIENT: Record<ScopeVerdict, string> = {
  NEW_SCOPE: 'This is new work beyond the agreed scope.',
  CHANGES_AGREED_SCOPE: 'This changes work that was already agreed.',
  LIKELY_ALREADY_COVERED: 'This appears to be covered by the agreed scope.',
  UNCLEAR: 'The scope still needs to be clarified (see the questions below).',
};

/** How a verified citation bears on one ask, as a sentence start: "Covered by REQ-2: …". */
export const ASK_RELATION: Record<AskRelation, string> = {
  COVERS: 'Covered by',
  CHANGES: 'Changes',
  CONFLICTS: 'Conflicts with',
  RELATED: 'Related to (does not cover it)',
};

/** Per-ask result after SoloOps checked the quotes, in plain words (never colour alone). */
export const ASK_STATUS: Record<AskStatus, string> = {
  COVERED: 'In the agreed scope',
  CHANGES: 'Changes the agreed scope',
  CONFLICT: 'Conflicting agreed requirements',
  NOT_COVERED: 'Not in the agreed scope',
};

/** Coverage of the whole request, computed by SoloOps from verified quotes only (BR-031). */
export const SCOPE_COVERAGE: Record<ScopeCoverage, string> = {
  FULL: 'Every part of the request is backed by a quote from an agreed requirement.',
  PARTIAL: 'Only part of the request is backed by agreed requirements.',
  NONE: 'No part of the request is backed by an agreed requirement.',
  CONFLICT: 'Agreed requirements conflict about this request.',
};

/** Design system §6 status mapping for change requests. */
export const VERSION_STATE: Record<VersionState, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PROPOSED: { label: 'Proposed · awaiting client', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'error' },
  CLARIFICATION_REQUESTED: { label: 'Client asked for changes', tone: 'warning' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
  SUPERSEDED: { label: 'Superseded', tone: 'neutral' },
};

export const CR_STATUS: Record<CrStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  REVISING: { label: 'Revising (earlier version still approved)', tone: 'neutral' },
  AWAITING_DECISION: { label: 'Awaiting client decision', tone: 'info' },
  NEEDS_REVISION: { label: 'Needs revision', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'error' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  EMAIL: 'Email',
  CHAT: 'Chat',
  CALL: 'Call',
  MEETING: 'Meeting',
  IN_PERSON: 'In person',
  OTHER: 'Other',
};

export const DECISION_LABEL: Record<Decision, { option: string; confirm: string }> = {
  APPROVED: { option: 'Approved', confirm: 'Record approval' },
  REJECTED: { option: 'Rejected', confirm: 'Record rejection' },
  CLARIFICATION_REQUESTED: { option: 'Client asked for changes', confirm: 'Record change request' },
};

export const HISTORY_LABEL: Record<string, string> = {
  'cr.created': 'Change request recorded',
  'cr.version.created': 'New version created',
  'cr.version.proposed': 'Version proposed to the client',
  'cr.version.withdrawn': 'Proposal withdrawn',
  'cr.version.discarded': 'Draft version discarded',
  'cr.decision.recorded': 'Client decision recorded',
  'cr.tasks.created': 'Tasks created from the approved version',
};

/** "1 h 30 min" from minutes (display only). */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const shortHash = (hash: string | null) =>
  hash ? `${hash.slice(0, 4)}…${hash.slice(-2)}` : '';

/** Days between an ISO timestamp and now, for "waiting N days". */
export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}
