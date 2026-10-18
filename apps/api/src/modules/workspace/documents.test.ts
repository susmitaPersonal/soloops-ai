import { describe, expect, it } from 'vitest';
import { toSettingsDto, type WorkspaceDoc } from './documents';

const doc: WorkspaceDoc = {
  _id: '0192a000-0000-7000-8000-000000000001',
  name: 'Studio',
  defaultCurrency: 'INR',
  defaultHourlyRateMinor: 9_007_199_254_740_993n,
  taxLabel: 'GST',
  taxRateBps: 1800,
  invoicePrefix: 'RS',
  timeZone: 'Asia/Kolkata',
  nextInvoiceNumber: 8,
  billingDetails: { legalName: 'R', address: null, taxId: null },
  aiEnabled: true,
  aiEnabledAt: new Date(),
  aiEnabledByUserId: 'u',
  rowVersion: 4,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ADR-0011 persistence → DTO mapping (unit)', () => {
  it('UT-MAP-01 BR-019 money leaves as an exact decimal string (no number precision loss)', () => {
    expect(toSettingsDto(doc, 'OWNER').defaultHourlyRateMinor).toBe('9007199254740993');
  });

  it('UT-MAP-02 internal fields never leave the API', () => {
    const dto = toSettingsDto(doc, 'MEMBER');
    expect(Object.keys(dto)).not.toEqual(
      expect.arrayContaining([
        '_id',
        'nextInvoiceNumber',
        'aiEnabledByUserId',
        'aiEnabledAt',
        'createdAt',
      ]),
    );
    for (const key of ['_id', 'nextInvoiceNumber', 'aiEnabledByUserId', 'aiEnabledAt']) {
      expect(dto).not.toHaveProperty(key);
    }
    expect(dto).toMatchObject({ id: doc._id, myRole: 'MEMBER', rowVersion: 4 });
  });
});
