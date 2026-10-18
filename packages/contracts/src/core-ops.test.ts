import { describe, expect, it } from 'vitest';
import {
  apiPaths,
  clientListQuerySchema,
  createClientRequestSchema,
  createProjectRequestSchema,
  createTaskRequestSchema,
  isoDateSchema,
  requirementKey,
  updateClientRequestSchema,
  updateProjectRequestSchema,
  updateRequirementRequestSchema,
  updateTaskRequestSchema,
} from './index';

const ID = '0192a000-0000-7000-8000-0000000000c1';

describe('core-ops contracts', () => {
  it.each(['2026-10-01', '2024-02-29', '2026-12-31'])('UT-CON-CO-01 accepts real date %s', (d) => {
    expect(isoDateSchema.safeParse(d).success).toBe(true);
  });

  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-1', '01/10/2026', '2026-10-01T00:00'])(
    'UT-CON-CO-02 rejects %s',
    (d) => {
      expect(isoDateSchema.safeParse(d).success).toBe(false);
    },
  );

  it('UT-CON-CO-03 client: name trimmed and required; "" email clears to null; bad email rejected', () => {
    expect(createClientRequestSchema.parse({ name: '  Das  ', email: '' })).toEqual({
      name: 'Das',
      email: null,
    });
    expect(createClientRequestSchema.safeParse({ name: 'Das', email: 'x@' }).success).toBe(false);
    expect(createClientRequestSchema.safeParse({}).success).toBe(false);
    expect(updateClientRequestSchema.safeParse({}).success).toBe(false);
  });

  it('UT-CON-CO-04 project: integer minor-unit rate only (BR-019); clientId must be an ID', () => {
    const base = { clientId: ID, name: 'P', billingModel: 'HOURLY' };
    expect(
      createProjectRequestSchema.safeParse({ ...base, hourlyRateMinor: '150000' }).success,
    ).toBe(true);
    for (const bad of ['1500.5', '-1', 1500, '01']) {
      expect(createProjectRequestSchema.safeParse({ ...base, hourlyRateMinor: bad }).success).toBe(
        false,
      );
    }
    expect(createProjectRequestSchema.safeParse({ ...base, clientId: 'x' }).success).toBe(false);
  });

  it('UT-CON-CO-05 task scope is a closed discriminated union', () => {
    const ok = (scope: unknown) => createTaskRequestSchema.safeParse({ title: 'T', scope }).success;
    expect(ok({ type: 'INTERNAL' })).toBe(true);
    expect(ok({ type: 'BASELINE', requirementId: ID })).toBe(true);
    expect(ok({ type: 'CHANGE_REQUEST', changeRequestId: ID, versionNumber: 1 })).toBe(true);
    expect(ok({ type: 'CHANGE_REQUEST', changeRequestId: ID, versionNumber: 51 })).toBe(false);
    expect(ok({ type: 'BASELINE' })).toBe(false);
    expect(ok({ type: 'OTHER' })).toBe(false);
  });

  it('UT-CON-CO-06 list query: limit defaults to 50 and is bounded to 1–100; archived defaults to false', () => {
    expect(clientListQuerySchema.parse({})).toEqual({ limit: 50, archived: false });
    expect(clientListQuerySchema.parse({ limit: '100', archived: 'true' })).toEqual({
      limit: 100,
      archived: true,
    });
    for (const limit of ['0', '101', '1.5']) {
      expect(clientListQuerySchema.safeParse({ limit }).success).toBe(false);
    }
  });

  it('UT-CON-CO-07 requirement update needs at least one field; keys are REQ-n', () => {
    expect(updateRequirementRequestSchema.safeParse({}).success).toBe(false);
    expect(requirementKey(12)).toBe('REQ-12');
  });
});

describe('core-ops contracts: updates and paths', () => {
  it('UT-CON-CO-08 updates need at least one field; nullable text clears with "" or null', () => {
    expect(updateProjectRequestSchema.safeParse({}).success).toBe(false);
    expect(updateTaskRequestSchema.safeParse({}).success).toBe(false);
    expect(updateProjectRequestSchema.parse({ description: '' })).toEqual({ description: null });
    expect(updateProjectRequestSchema.parse({ description: null })).toEqual({ description: null });
    expect(updateTaskRequestSchema.parse({ status: 'DONE' })).toEqual({ status: 'DONE' });
  });

  it('UT-CON-CO-09 apiPaths build tenant URLs and encode every ID (no path injection)', () => {
    const ws = 'w/1';
    const id = '../x';
    expect(apiPaths.clients(ws)).toBe('/api/v1/workspaces/w%2F1/clients');
    expect(apiPaths.client(ws, id)).toBe('/api/v1/workspaces/w%2F1/clients/..%2Fx');
    expect(apiPaths.clientArchive(ws, id)).toBe('/api/v1/workspaces/w%2F1/clients/..%2Fx/archive');
    expect(apiPaths.projects(ws)).toBe('/api/v1/workspaces/w%2F1/projects');
    expect(apiPaths.project(ws, id)).toBe('/api/v1/workspaces/w%2F1/projects/..%2Fx');
    expect(apiPaths.projectArchive(ws, id)).toMatch(/projects\/\.\.%2Fx\/archive$/);
    expect(apiPaths.projectRequirements(ws, id)).toMatch(/projects\/\.\.%2Fx\/requirements$/);
    expect(apiPaths.requirement(ws, id)).toMatch(/\/requirements\/\.\.%2Fx$/);
    expect(apiPaths.projectBaselines(ws, id)).toMatch(/projects\/\.\.%2Fx\/baselines$/);
    expect(apiPaths.projectTasks(ws, id)).toMatch(/projects\/\.\.%2Fx\/tasks$/);
    expect(apiPaths.task(ws, id)).toMatch(/\/tasks\/\.\.%2Fx$/);
  });
});
