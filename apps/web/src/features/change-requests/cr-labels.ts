import type { Channel, CrStatus, Decision, VersionState } from '@soloops/contracts';
import type { BadgeTone } from '@/components/StatusBadge';

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
