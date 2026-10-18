import { describe, expect, it } from 'vitest';
import {
  apiPaths,
  convertToTasksRequestSchema,
  createEntryRequestSchema,
  entryDtoSchema,
  entryListQuerySchema,
  updateEntryRequestSchema,
} from './index';

const T = '0192a000-0000-7000-8000-0000000000a7';
const time = { kind: 'TIME', workDate: '2026-10-15', minutes: 60, description: 'Work' };

describe('billing contracts', () => {
  it('UT-CON-BL-01 FR-030 criterion indexes: 1–20 unique integers in 0–19', () => {
    expect(convertToTasksRequestSchema.safeParse({ criterionIndexes: [0, 19] }).success).toBe(true);
    for (const criterionIndexes of [
      [],
      [0, 0],
      [20],
      [-1],
      [0.5],
      Array.from({ length: 21 }, (_, i) => i),
    ]) {
      expect(convertToTasksRequestSchema.safeParse({ criterionIndexes }).success).toBe(false);
    }
  });

  it('UT-CON-BL-02 AC-017.1 TIME needs 1–1440 whole minutes and no amount', () => {
    expect(createEntryRequestSchema.safeParse(time).success).toBe(true);
    expect(createEntryRequestSchema.safeParse({ ...time, minutes: 1440 }).success).toBe(true);
    for (const bad of [
      { ...time, minutes: 0 },
      { ...time, minutes: 1441 },
      { ...time, minutes: 2.5 },
      { ...time, minutes: undefined },
      { ...time, amountMinor: '5' },
    ]) {
      expect(createEntryRequestSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('UT-CON-BL-03 BR-019 FIXED needs a positive integer amount string and no minutes', () => {
    const fixed = { ...time, kind: 'FIXED', minutes: undefined, amountMinor: '100' };
    expect(createEntryRequestSchema.safeParse(fixed).success).toBe(true);
    for (const amountMinor of ['0', '-1', '1.5', 1, undefined]) {
      expect(createEntryRequestSchema.safeParse({ ...fixed, amountMinor }).success).toBe(false);
    }
    expect(createEntryRequestSchema.safeParse({ ...fixed, minutes: 5 }).success).toBe(false);
  });

  it('UT-CON-BL-04 a task or an explicit scope, not both; description trimmed and bounded', () => {
    expect(createEntryRequestSchema.safeParse({ ...time, taskId: T }).success).toBe(true);
    expect(
      createEntryRequestSchema.safeParse({ ...time, scope: { type: 'BASELINE', requirementId: T } })
        .success,
    ).toBe(true);
    expect(
      createEntryRequestSchema.safeParse({ ...time, taskId: T, scope: { type: 'NONE' } }).success,
    ).toBe(false);
    expect(
      createEntryRequestSchema.safeParse({
        ...time,
        scope: { type: 'CHANGE_REQUEST', changeRequestId: T, versionNumber: 51 },
      }).success,
    ).toBe(false);
    expect(createEntryRequestSchema.parse({ ...time, description: '  x  ' }).description).toBe('x');
    expect(createEntryRequestSchema.safeParse({ ...time, description: '   ' }).success).toBe(false);
  });

  it('UT-CON-BL-05 AC-018.2 eligibility and totals are not part of the request (stripped)', () => {
    const parsed = createEntryRequestSchema.parse({
      ...time,
      eligibility: { eligible: true },
      billableAmountMinor: '1',
    });
    expect(parsed).not.toHaveProperty('eligibility');
    expect(parsed).not.toHaveProperty('billableAmountMinor');
  });

  it('UT-CON-BL-06 PATCH needs at least one field; list state defaults to unbilled', () => {
    expect(updateEntryRequestSchema.safeParse({}).success).toBe(false);
    expect(updateEntryRequestSchema.safeParse({ minutes: 30 }).success).toBe(true);
    expect(entryListQuerySchema.parse({})).toEqual({ state: 'unbilled' });
    expect(entryListQuerySchema.safeParse({ state: 'paid' }).success).toBe(false);
  });

  it('UT-CON-BL-07 an ineligible DTO must carry a reason from the closed set', () => {
    const dto = {
      id: T,
      projectId: T,
      kind: 'TIME',
      workDate: '2026-10-15',
      minutes: 60,
      amountMinor: null,
      currency: 'INR',
      description: 'w',
      taskId: null,
      scope: { type: 'NONE', requirementId: null, changeRequestId: null, versionNumber: null },
      scopeLabel: null,
      scopeKind: 'NONE',
      invoiceId: null,
      eligibility: { eligible: false, reason: 'UNSCOPED', explanation: 'x' },
      hourlyRateMinor: '0',
      billableAmountMinor: '0',
      createdByUserId: T,
      rowVersion: 1,
      createdAt: '2026-10-15T00:00:00.000Z',
    };
    expect(entryDtoSchema.safeParse(dto).success).toBe(true);
    expect(
      entryDtoSchema.safeParse({
        ...dto,
        eligibility: { eligible: false, reason: 'MAYBE', explanation: 'x' },
      }).success,
    ).toBe(false);
  });

  it('UT-CON-BL-08 paths', () => {
    expect(apiPaths.projectEntries('w', 'p')).toBe(
      '/api/v1/workspaces/w/projects/p/billable-entries',
    );
    expect(apiPaths.entry('w', 'e')).toBe('/api/v1/workspaces/w/billable-entries/e');
    expect(apiPaths.projectOverview('w', 'p')).toBe('/api/v1/workspaces/w/projects/p/overview');
    expect(apiPaths.crVersionAction('w', 'c', 2, 'tasks')).toBe(
      '/api/v1/workspaces/w/change-requests/c/versions/2/tasks',
    );
  });
});
