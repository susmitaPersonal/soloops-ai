import { describe, expect, it } from 'vitest';
import {
  apiPaths,
  createInvoiceRequestSchema,
  signedMinorUnitsSchema,
  updateInvoiceRequestSchema,
  voidInvoiceRequestSchema,
} from './index';

const ID = '0192a000-0000-7000-8000-0000000000e9';

describe('invoice contracts', () => {
  it('UT-CON-INV-01 FR-042 a draft needs 1–200 unique entries of one project', () => {
    expect(createInvoiceRequestSchema.safeParse({ projectId: ID, entryIds: [ID] }).success).toBe(
      true,
    );
    expect(createInvoiceRequestSchema.safeParse({ projectId: ID, entryIds: [] }).success).toBe(
      false,
    );
    expect(
      createInvoiceRequestSchema.safeParse({ projectId: ID, entryIds: [ID, ID] }).success,
    ).toBe(false);
    const many = Array.from(
      { length: 201 },
      (_, i) => ID.slice(0, -3) + String(i).padStart(3, '0'),
    );
    expect(createInvoiceRequestSchema.safeParse({ projectId: ID, entryIds: many }).success).toBe(
      false,
    );
    // BR-020: totals cannot be sent (stripped).
    expect(
      createInvoiceRequestSchema.parse({ projectId: ID, entryIds: [ID], totalMinor: '1' }),
    ).not.toHaveProperty('totalMinor');
  });

  it('UT-CON-INV-02 BR-025 adjustments: signed, non-zero, with a reason', () => {
    const adj = (over: object) =>
      updateInvoiceRequestSchema.safeParse({
        addAdjustments: [
          { description: 'Discount', amountMinor: '-500', reason: 'Agreed', ...over },
        ],
      }).success;
    expect(adj({})).toBe(true);
    expect(adj({ amountMinor: '500' })).toBe(true);
    expect(adj({ amountMinor: '0' })).toBe(false);
    expect(adj({ amountMinor: '-5.5' })).toBe(false);
    expect(adj({ reason: '  ' })).toBe(false);
    expect(updateInvoiceRequestSchema.safeParse({}).success).toBe(false);
    expect(updateInvoiceRequestSchema.safeParse({ removePositions: [1, 1] }).success).toBe(false);
  });

  it('UT-CON-INV-03 signed minor units stay within Int64; void needs a reason', () => {
    expect(signedMinorUnitsSchema.safeParse('-9223372036854775807').success).toBe(true);
    expect(signedMinorUnitsSchema.safeParse('9223372036854775808').success).toBe(false);
    expect(signedMinorUnitsSchema.safeParse('-0').success).toBe(false);
    expect(voidInvoiceRequestSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  it('UT-CON-INV-04 paths', () => {
    expect(apiPaths.invoices('w')).toBe('/api/v1/workspaces/w/invoices');
    expect(apiPaths.invoiceAction('w', 'i', 'issue')).toBe('/api/v1/workspaces/w/invoices/i/issue');
  });
});
