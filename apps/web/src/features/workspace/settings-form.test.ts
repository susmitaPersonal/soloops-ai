import type { WorkspaceSettingsDto } from '@soloops/contracts';
import {
  updateWorkspaceSettingsRequestSchema,
  workspaceSettingsFieldsSchema,
} from '@soloops/contracts';
import { describe, expect, it } from 'vitest';
import {
  API_PATH_TO_FIELD,
  settingsFormSchema,
  toFormValues,
  toUpdateRequest,
} from './settings-form';

const dto: WorkspaceSettingsDto = {
  id: '0192a000-0000-7000-8000-000000000001',
  name: 'Studio',
  defaultCurrency: 'INR',
  defaultHourlyRateMinor: '150050',
  taxLabel: 'GST',
  taxRateBps: 1250,
  invoicePrefix: 'RS',
  timeZone: 'Asia/Kolkata',
  billingDetails: { legalName: 'Riya', address: null, taxId: null },
  aiEnabled: false,
  rowVersion: 1,
  myRole: 'OWNER',
};

const parse = (overrides: Record<string, string>) =>
  settingsFormSchema.safeParse({ ...toFormValues(dto), ...overrides });

describe('BR-019 settings form ↔ contract conversion (no floating point)', () => {
  it('UT-SET-01 DTO → form shows decimal rate and percentage', () => {
    expect(toFormValues(dto)).toMatchObject({
      defaultHourlyRate: '1500.50',
      taxRatePercent: '12.50',
      address: '',
      taxId: '',
    });
  });

  it('UT-SET-02 round trip DTO → form → request preserves exact integer units', () => {
    const parsed = parse({});
    expect(parsed.success).toBe(true);
    const req = toUpdateRequest(parsed.data!);
    expect(req).toMatchObject({ defaultHourlyRateMinor: '150050', taxRateBps: 1250 });
    expect(req.billingDetails).toEqual({ legalName: 'Riya', address: null, taxId: null });
    // The produced request is accepted by the API contract.
    expect(updateWorkspaceSettingsRequestSchema.safeParse(req).success).toBe(true);
  });

  it.each([
    ['0', 0],
    ['18', 1800],
    ['0.01', 1],
    ['100', 10000],
    ['100.00', 10000],
  ])('UT-SET-03 AC-002.3 tax %s%% → %i bps', (percent, bps) => {
    const parsed = parse({ taxRatePercent: percent });
    expect(parsed.success).toBe(true);
    expect(toUpdateRequest(parsed.data!).taxRateBps).toBe(bps);
  });

  it.each(['100.01', '-1', '12.345', 'abc', ''])('UT-SET-04 AC-002.3 rejects tax %s', (percent) => {
    const parsed = parse({ taxRatePercent: percent });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path.join('.'))).toContain('taxRatePercent');
  });

  it('UT-SET-05 currency precision drives the rate field: JPY has no decimals', () => {
    expect(parse({ defaultCurrency: 'JPY', defaultHourlyRate: '1500' }).success).toBe(true);
    expect(parse({ defaultCurrency: 'JPY', defaultHourlyRate: '1500.5' }).success).toBe(false);
    expect(parse({ defaultCurrency: 'INR', defaultHourlyRate: '1500.505' }).success).toBe(false);
    const jpy = parse({ defaultCurrency: 'jpy', defaultHourlyRate: '1500' });
    expect(toUpdateRequest(jpy.data!)).toMatchObject({
      defaultCurrency: 'JPY',
      defaultHourlyRateMinor: '1500',
    });
  });

  it('UT-SET-06 invoice prefix and currency are upper-cased before validation', () => {
    const parsed = parse({ invoicePrefix: 'rs-26', defaultCurrency: 'inr' });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ invoicePrefix: 'RS-26', defaultCurrency: 'INR' });
  });

  it('UT-SET-07 every editable contract field has a mapping for server 422 errors', () => {
    const contractPaths = Object.keys(workspaceSettingsFieldsSchema.shape)
      .filter((k) => k !== 'billingDetails')
      .concat(['billingDetails.legalName', 'billingDetails.address', 'billingDetails.taxId']);
    for (const p of contractPaths) expect(API_PATH_TO_FIELD, p).toHaveProperty([p]);
  });
});
