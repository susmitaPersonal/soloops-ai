import {
  AI_DISCLOSURE,
  WORKSPACE_DEFAULTS,
  type AiStatus,
  type updateWorkspaceSettingsRequestSchema,
  type WorkspaceSettingsDto,
  type WorkspaceSummary,
} from '@soloops/contracts';
import type { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { Database, TxSession } from '../../platform/db';
import { errors } from '../../platform/errors';
import type { TenantCtx } from '../../platform/http/types';
import { newId } from '../../platform/ids';
import type { AuditService } from '../audit';
import { toSettingsDto, type WorkspaceDoc } from './documents';
import { createWorkspaceRepository } from './repository';

export type UpdateSettingsInput = z.output<typeof updateWorkspaceSettingsRequestSchema>;

/** What the workspace module needs to know about the configured AI provider (FR-053). */
export interface AiProviderInfo {
  providerId: AiStatus['provider'];
  model: string | null;
  health(): Promise<AiStatus['health']>;
}

export function createWorkspaceService(deps: {
  db: Database;
  clock: Clock;
  audit: AuditService;
  ai: AiProviderInfo;
}) {
  const repo = createWorkspaceRepository(deps.db);

  return {
    /** FR-003: called inside the registration transaction; the registering user becomes OWNER. */
    async createWorkspaceForOwner(
      tx: TxSession,
      input: { ownerUserId: string; name: string; legalName: string },
    ): Promise<{ workspaceId: string }> {
      const now = deps.clock.now();
      const workspaceId = newId();
      await repo.insertWorkspace(
        workspaceId,
        {
          name: input.name,
          defaultCurrency: WORKSPACE_DEFAULTS.defaultCurrency,
          defaultHourlyRateMinor: BigInt(WORKSPACE_DEFAULTS.defaultHourlyRateMinor),
          taxLabel: WORKSPACE_DEFAULTS.taxLabel,
          taxRateBps: WORKSPACE_DEFAULTS.taxRateBps,
          invoicePrefix: WORKSPACE_DEFAULTS.invoicePrefix,
          timeZone: WORKSPACE_DEFAULTS.timeZone,
          nextInvoiceNumber: 1,
          billingDetails: { legalName: input.legalName, address: null, taxId: null },
          aiEnabled: false, // FR-054: AI is off until an owner opts in
          aiEnabledAt: null,
          aiEnabledByUserId: null,
          rowVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
        tx,
      );
      const membershipId = newId();
      await repo.insertMembership(
        workspaceId,
        {
          _id: membershipId,
          userId: input.ownerUserId,
          role: 'OWNER',
          createdAt: now,
          updatedAt: now,
        },
        tx,
      );
      // BR-028: member and role changes are audited, including the founding OWNER.
      await deps.audit.record(tx, {
        workspaceId,
        actorUserId: input.ownerUserId,
        action: 'member.added',
        entity: { type: 'MEMBERSHIP', id: membershipId },
        data: { userId: input.ownerUserId, role: 'OWNER', reason: 'registration' },
      });
      return { workspaceId };
    },

    async listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
      const memberships = await repo.listMembershipsForUser(userId);
      const summaries: WorkspaceSummary[] = [];
      for (const m of memberships) {
        const ws = await repo.findWorkspace(m.workspaceId);
        if (ws) summaries.push({ id: ws._id, name: ws.name, role: m.role });
      }
      return summaries;
    },

    /** Membership lookup used by `requireMembership` (SEC-004). */
    findMembership(workspaceId: string, userId: string) {
      return repo.findMembership(workspaceId, userId);
    },

    /**
     * BR-023: the next invoice number and its display form (`<prefix>-0007`), taken inside the
     * caller's issue transaction. The prefix is read from the same document in that transaction.
     */
    async allocateInvoiceNumber(
      ctx: TenantCtx,
      tx: TxSession,
    ): Promise<{ number: number; displayNumber: string }> {
      const after = await repo.takeInvoiceNumber(ctx.workspaceId, deps.clock.now(), tx);
      if (!after) throw errors.notFound();
      const number = after.nextInvoiceNumber - 1;
      return { number, displayNumber: `${after.invoicePrefix}-${String(number).padStart(4, '0')}` };
    },

    async getSettings(ctx: TenantCtx): Promise<WorkspaceSettingsDto> {
      const ws = await repo.findWorkspace(ctx.workspaceId);
      if (!ws) throw errors.notFound();
      return toSettingsDto(ws, ctx.role);
    },

    /** FR-053: provider type, model and reachability. Never the URL or the key (SEC-007). */
    async aiStatus(ctx: TenantCtx): Promise<AiStatus> {
      const ws = await repo.findWorkspace(ctx.workspaceId);
      if (!ws) throw errors.notFound();
      return {
        provider: deps.ai.providerId,
        model: deps.ai.model,
        health: await deps.ai.health(),
        workspaceEnabled: ws.aiEnabled,
        disclosure: AI_DISCLOSURE,
      };
    },

    /**
     * FR-054 / AC-022.3: owner only; enabling requires the acknowledged disclosure (checked by the
     * contract) and a configured provider. Audited in the same transaction (BR-028).
     */
    async setAiEnablement(ctx: TenantCtx, enabled: boolean): Promise<WorkspaceSettingsDto> {
      if (ctx.role !== 'OWNER')
        throw errors.forbidden('Only workspace owners can change AI settings.');
      if (enabled && (await deps.ai.health()) === 'unconfigured') {
        throw errors.aiDisabled(
          'Your administrator hasn’t configured an AI endpoint, so AI cannot be enabled.',
        );
      }
      const at = deps.clock.now();
      const updated = await deps.db.withTransaction(async (tx) => {
        const doc = await repo.setAiEnabled(
          ctx.workspaceId,
          enabled
            ? { aiEnabled: true, aiEnabledAt: at, aiEnabledByUserId: ctx.userId }
            : { aiEnabled: false, aiEnabledAt: null, aiEnabledByUserId: null },
          at,
          tx,
        );
        if (!doc) throw errors.notFound();
        await deps.audit.record(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: enabled ? 'workspace.ai_enabled' : 'workspace.ai_disabled',
          entity: { type: 'WORKSPACE', id: ctx.workspaceId },
          data: { provider: deps.ai.providerId, disclosureAcknowledged: enabled },
          requestId: ctx.requestId,
        });
        return doc;
      });
      return toSettingsDto(updated, ctx.role);
    },

    /** FR-005 / AC-002.1–.3. Owner only (SEC-011); optimistic concurrency via rowVersion (ERR-005). */
    async updateSettings(
      ctx: TenantCtx,
      input: UpdateSettingsInput,
      expectedRowVersion: number,
    ): Promise<WorkspaceSettingsDto> {
      if (ctx.role !== 'OWNER')
        throw errors.forbidden('Only workspace owners can change settings.');
      const set: Partial<Omit<WorkspaceDoc, '_id' | 'rowVersion' | 'nextInvoiceNumber'>> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.defaultCurrency !== undefined) set.defaultCurrency = input.defaultCurrency;
      if (input.defaultHourlyRateMinor !== undefined) {
        set.defaultHourlyRateMinor = BigInt(input.defaultHourlyRateMinor);
      }
      if (input.taxLabel !== undefined) set.taxLabel = input.taxLabel;
      if (input.taxRateBps !== undefined) set.taxRateBps = input.taxRateBps;
      if (input.invoicePrefix !== undefined) set.invoicePrefix = input.invoicePrefix;
      if (input.timeZone !== undefined) set.timeZone = input.timeZone;
      if (input.billingDetails !== undefined) set.billingDetails = input.billingDetails;
      const changedFields = Object.keys(set).sort();

      const updated = await deps.db.withTransaction(async (tx) => {
        const doc = await repo.updateWorkspaceIfVersion(
          ctx.workspaceId,
          expectedRowVersion,
          set,
          deps.clock.now(),
          tx,
        );
        if (!doc) return null;
        await deps.audit.record(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: 'workspace.settings_changed',
          entity: { type: 'WORKSPACE', id: ctx.workspaceId },
          data: { changedFields, rowVersion: doc.rowVersion },
          requestId: ctx.requestId,
        });
        return doc;
      });

      if (!updated) {
        const exists = await repo.findWorkspace(ctx.workspaceId);
        throw exists ? errors.preconditionFailed() : errors.notFound();
      }
      return toSettingsDto(updated, ctx.role);
    },
  };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;
