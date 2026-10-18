import {
  requirementKey,
  type BaselineDto,
  type BillingModel,
  type ClientDto,
  type ProjectDto,
  type ProjectStatus,
  type RequirementDto,
  type RequirementPriority,
  type TaskDto,
  type TaskStatus,
} from '@soloops/contracts';

/** Persistence shape of `clients` (data-model.md §4.5). */
export interface ClientDoc {
  _id: string;
  workspaceId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  taxId: string | null;
  /** Non-null means read-only (BR-029). */
  archivedAt: Date | null;
  /** Incremented by project creation so a concurrent archive conflicts (ADR-0017 §4). Not exposed. */
  activityVersion: number;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Persistence shape of `projects` (data-model.md §4.6). */
export interface ProjectDoc {
  _id: string;
  workspaceId: string;
  clientId: string;
  name: string;
  description: string | null;
  billingModel: BillingModel;
  currency: string;
  /** BSON Int64; null = workspace default rate (BR-019, BR-021). */
  hourlyRateMinor: bigint | null;
  startDate: string | null;
  status: ProjectStatus;
  archivedAt: Date | null;
  /** Allocated with `$inc` and `returnDocument: 'after'`; numbers are never reused (AC-006.1). */
  counters: { requirement: number; changeRequest: number; baseline: number };
  /**
   * Incremented by every child write and by a client archive. Guarantees a real write, so
   * concurrent transactions on the project conflict and retry (ADR-0017 §4). Not exposed.
   */
  activityVersion: number;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Persistence shape of `requirements` (data-model.md §4.7). */
export interface RequirementDoc {
  _id: string;
  workspaceId: string;
  projectId: string;
  number: number;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: RequirementPriority;
  /** Set once by a baseline; afterwards the document is immutable (BR-004). */
  baselineId: string | null;
  /** Soft delete, allowed only while `baselineId` is null. */
  deletedAt: Date | null;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Persistence shape of `baselines` (data-model.md §4.8). */
export interface BaselineDoc {
  _id: string;
  workspaceId: string;
  projectId: string;
  sequence: number;
  requirementCount: number;
  contentHash: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskScopeDoc {
  type: 'BASELINE' | 'CHANGE_REQUEST' | 'INTERNAL';
  requirementId: string | null;
  changeRequestId: string | null;
  versionNumber: number | null;
}

/** Persistence shape of `tasks` (data-model.md §4.11). */
export interface TaskDoc {
  _id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
  assigneeUserId: string | null;
  status: TaskStatus;
  billable: boolean;
  scope: TaskScopeDoc;
  /** Set when the task was converted from an approved version's acceptance criterion (FR-030). */
  origin?: { changeRequestId: string; versionNumber: number; criterionIndex: number };
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

export function toClientDto(doc: ClientDoc): ClientDto {
  return {
    id: doc._id,
    name: doc.name,
    contactName: doc.contactName,
    email: doc.email,
    phone: doc.phone,
    billingAddress: doc.billingAddress,
    taxId: doc.taxId,
    archivedAt: isoOrNull(doc.archivedAt),
    rowVersion: doc.rowVersion,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

/** BR-029: a project is read-only when it or its client is archived. */
export function isProjectReadOnly(project: ProjectDoc, client: ClientDoc | null): boolean {
  return project.archivedAt !== null || (client?.archivedAt ?? null) !== null;
}

export function toProjectDto(doc: ProjectDoc, client: ClientDoc | null): ProjectDto {
  return {
    id: doc._id,
    clientId: doc.clientId,
    clientName: client?.name ?? '',
    name: doc.name,
    description: doc.description,
    billingModel: doc.billingModel,
    currency: doc.currency,
    hourlyRateMinor: doc.hourlyRateMinor === null ? null : doc.hourlyRateMinor.toString(),
    startDate: doc.startDate,
    status: doc.status,
    archivedAt: isoOrNull(doc.archivedAt),
    readOnly: isProjectReadOnly(doc, client),
    rowVersion: doc.rowVersion,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

export function toRequirementDto(doc: RequirementDoc): RequirementDto {
  return {
    id: doc._id,
    projectId: doc.projectId,
    number: doc.number,
    key: requirementKey(doc.number),
    title: doc.title,
    description: doc.description,
    acceptanceCriteria: doc.acceptanceCriteria,
    priority: doc.priority,
    baselineId: doc.baselineId,
    rowVersion: doc.rowVersion,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

export function toBaselineDto(doc: BaselineDoc): BaselineDto {
  return {
    id: doc._id,
    projectId: doc.projectId,
    sequence: doc.sequence,
    requirementCount: doc.requirementCount,
    contentHash: doc.contentHash,
    createdByUserId: doc.createdByUserId,
    createdAt: iso(doc.createdAt),
  };
}

export function toTaskDto(doc: TaskDoc): TaskDto {
  return {
    id: doc._id,
    projectId: doc.projectId,
    title: doc.title,
    description: doc.description,
    assigneeUserId: doc.assigneeUserId,
    status: doc.status,
    billable: doc.billable,
    scope: { ...doc.scope },
    rowVersion: doc.rowVersion,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}
