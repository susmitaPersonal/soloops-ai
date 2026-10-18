import {
  crKey,
  type ApprovalDto,
  type Channel,
  type ChangeRequestDto,
  type CrStatus,
  type Decision,
  type ScopeVerdict,
  type VersionDto,
  type VersionState,
} from '@soloops/contracts';

export interface PricingDoc {
  mode: 'TIME' | 'FIXED';
  /** BSON Int64. Resolved rate for TIME (BR-021); null for FIXED. */
  hourlyRateMinor: bigint | null;
  /** BSON Int64. Computed for TIME (BR-020), entered for FIXED; null while not computable. */
  priceMinor: bigint | null;
  currency: string;
}

export interface EffortDoc {
  lowMinutes: number;
  likelyMinutes: number;
  highMinutes: number;
}

/** Embedded version (data-model.md §4.9). Content is frozen once the state leaves DRAFT. */
export interface VersionDoc {
  number: number;
  state: VersionState;
  title: string;
  clarifiedDescription: string;
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  affectedRequirementIds: string[];
  dependencies: string[];
  assumptions: string[];
  risks: { description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }[];
  effort: EffortDoc | null;
  confirmedEffortMinutes: number | null;
  pricing: PricingDoc | null;
  timelineImpact: string;
  /**
   * Clarification questions and the person-confirmed scope verdict (FR-021 scope check). Optional:
   * versions written before migration 0006 lack them and read as `[]` / `null`.
   */
  questionsForClient?: string[];
  scopeVerdict?: ScopeVerdict | null;
  /** Field → AI generation ID (FR-022 provenance). */
  aiFieldProvenance: Record<string, string>;
  contentHash: string | null;
  proposedAt: Date | null;
  proposedByUserId: string | null;
  /** Immutable summary copy of the approvals record. */
  decision: {
    approvalId: string;
    decision: Decision;
    decidedOn: string;
    clientDecisionMakerName: string;
    channel: Channel;
  } | null;
  createdAt: Date;
}

/** Persistence shape of `changeRequests` (data-model.md §4.9). */
export interface ChangeRequestDoc {
  _id: string;
  workspaceId: string;
  projectId: string;
  number: number;
  /** Immutable evidence (AC-008.1). */
  rawRequestText: string;
  sourceChannel: Channel;
  requestedByName: string;
  receivedOn: string;
  openVersionNumber: number | null;
  approvedVersionNumber: number | null;
  latestVersionNumber: number;
  /** Cache of deriveCrStatus(versions), written only with the versions (ADR-0015). */
  derivedStatus: CrStatus;
  versions: VersionDoc[];
  createdByUserId: string;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Persistence shape of `approvals` (data-model.md §4.10). Insert-only. */
export interface ApprovalDoc {
  _id: string;
  workspaceId: string;
  projectId: string;
  changeRequestId: string;
  versionNumber: number;
  decision: Decision;
  contentHash: string;
  clientDecisionMakerName: string;
  decidedOn: string;
  channel: Channel;
  evidenceNote: string | null;
  recordedByUserId: string;
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toVersionDto(v: VersionDoc): VersionDto {
  return {
    number: v.number,
    state: v.state,
    title: v.title,
    clarifiedDescription: v.clarifiedDescription,
    inScope: v.inScope,
    outOfScope: v.outOfScope,
    acceptanceCriteria: v.acceptanceCriteria,
    affectedRequirementIds: v.affectedRequirementIds,
    dependencies: v.dependencies,
    assumptions: v.assumptions,
    risks: v.risks,
    effort: v.effort,
    confirmedEffortMinutes: v.confirmedEffortMinutes,
    pricing: v.pricing
      ? {
          mode: v.pricing.mode,
          hourlyRateMinor: v.pricing.hourlyRateMinor?.toString() ?? null,
          priceMinor: v.pricing.priceMinor?.toString() ?? null,
          currency: v.pricing.currency,
        }
      : null,
    timelineImpact: v.timelineImpact,
    questionsForClient: v.questionsForClient ?? [],
    scopeVerdict: v.scopeVerdict ?? null,
    aiFieldProvenance: { ...v.aiFieldProvenance },
    contentHash: v.contentHash,
    proposedAt: iso(v.proposedAt),
    proposedByUserId: v.proposedByUserId,
    decision: v.decision ? { ...v.decision } : null,
  };
}

export function toChangeRequestDto(doc: ChangeRequestDoc, readOnly: boolean): ChangeRequestDto {
  return {
    id: doc._id,
    projectId: doc.projectId,
    number: doc.number,
    key: crKey(doc.number),
    rawRequestText: doc.rawRequestText,
    sourceChannel: doc.sourceChannel,
    requestedByName: doc.requestedByName,
    receivedOn: doc.receivedOn,
    status: doc.derivedStatus,
    openVersionNumber: doc.openVersionNumber,
    approvedVersionNumber: doc.approvedVersionNumber,
    latestVersionNumber: doc.latestVersionNumber,
    versions: doc.versions.map(toVersionDto),
    readOnly,
    rowVersion: doc.rowVersion,
    createdByUserId: doc.createdByUserId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toApprovalDto(a: ApprovalDoc): ApprovalDto {
  return {
    id: a._id,
    versionNumber: a.versionNumber,
    decision: a.decision,
    contentHash: a.contentHash,
    clientDecisionMakerName: a.clientDecisionMakerName,
    decidedOn: a.decidedOn,
    channel: a.channel,
    evidenceNote: a.evidenceNote,
    recordedByUserId: a.recordedByUserId,
    recordedAt: a.recordedAt.toISOString(),
  };
}
