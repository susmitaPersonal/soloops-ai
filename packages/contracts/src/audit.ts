import { z } from 'zod';

/** Closed set of audit actions (data-model.md §4.15, BR-028). */
export const auditActions = [
  'baseline.created',
  'cr.created',
  'cr.version.created',
  'cr.version.proposed',
  'cr.version.withdrawn',
  'cr.version.discarded',
  'cr.decision.recorded',
  'cr.tasks.created',
  'invoice.created',
  'invoice.issued',
  'invoice.voided',
  'member.added',
  'member.removed',
  'workspace.ai_enabled',
  'workspace.ai_disabled',
  'workspace.settings_changed',
] as const;
export const auditActionSchema = z.enum(auditActions);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEntityTypes = [
  'WORKSPACE',
  'MEMBERSHIP',
  'BASELINE',
  'CHANGE_REQUEST',
  'INVOICE',
] as const;
export const auditEntityTypeSchema = z.enum(auditEntityTypes);
export type AuditEntityType = z.infer<typeof auditEntityTypeSchema>;
