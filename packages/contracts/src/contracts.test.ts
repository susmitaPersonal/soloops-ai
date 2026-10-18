import { describe, expect, it } from 'vitest';
import {
  currencyFractionDigits,
  decimalToMinorUnits,
  minorUnitsSchema,
  minorUnitsToDecimal,
  registerRequestSchema,
  updateWorkspaceSettingsRequestSchema,
  auditActionSchema,
  currencyCodeSchema,
  emailSchema,
  idSchema,
  loginRequestSchema,
  problemCodes,
  timeZoneSchema,
  apiPaths,
} from './index';

describe('BR-019 minor-unit strings', () => {
  it.each([
    ['0', true],
    ['150000', true],
    ['9223372036854775807', true], // Int64 max
    ['9223372036854775808', false],
    ['-1', false],
    ['1500.50', false],
    ['01', false],
    ['', false],
    ['1e5', false],
  ])('minorUnitsSchema(%s) valid=%s', (value, valid) => {
    expect(minorUnitsSchema.safeParse(value).success).toBe(valid);
  });

  it.each([
    ['1500', 2, '150000'],
    ['1,500.5', 2, '150050'],
    ['0.01', 2, '1'],
    ['0', 2, '0'],
    ['1500', 0, '1500'],
    ['  42.10 ', 2, '4210'],
  ])('decimalToMinorUnits(%s, %i) = %s', (input, digits, expected) => {
    expect(decimalToMinorUnits(input, digits)).toBe(expected);
  });

  it.each([['1.234'], ['-5'], ['abc'], ['1.2.3'], ['']])(
    'decimalToMinorUnits rejects %s',
    (input) => {
      expect(decimalToMinorUnits(input, 2)).toBeNull();
    },
  );

  it('never uses floating point: 0.1 + 0.2 style inputs stay exact', () => {
    expect(decimalToMinorUnits('0.30', 2)).toBe('30');
    expect(decimalToMinorUnits('90071992547409.93', 2)).toBe('9007199254740993');
  });

  it('minorUnitsToDecimal formats without arithmetic', () => {
    expect(minorUnitsToDecimal('150050', 2)).toBe('1500.50');
    expect(minorUnitsToDecimal('5', 2)).toBe('0.05');
    expect(minorUnitsToDecimal('1500', 0)).toBe('1500');
  });

  it('currency precision comes from Intl', () => {
    expect(currencyFractionDigits('INR')).toBe(2);
    expect(currencyFractionDigits('JPY')).toBe(0);
  });
});

describe('identity contracts', () => {
  it('normalises email to lowercase and strips unknown keys', () => {
    const parsed = registerRequestSchema.parse({
      name: ' Riya ',
      email: ' Riya@Example.COM ',
      password: 'a'.repeat(12),
      role: 'OWNER',
    });
    expect(parsed).toEqual({ name: 'Riya', email: 'riya@example.com', password: 'a'.repeat(12) });
  });
});

describe('workspace settings contract', () => {
  it('AC-002.3 tax rate bounds are 0–10000 bps', () => {
    expect(updateWorkspaceSettingsRequestSchema.safeParse({ taxRateBps: 0 }).success).toBe(true);
    expect(updateWorkspaceSettingsRequestSchema.safeParse({ taxRateBps: 10000 }).success).toBe(
      true,
    );
    expect(updateWorkspaceSettingsRequestSchema.safeParse({ taxRateBps: -1 }).success).toBe(false);
    expect(updateWorkspaceSettingsRequestSchema.safeParse({ taxRateBps: 10001 }).success).toBe(
      false,
    );
  });

  it('empty optional billing text becomes null', () => {
    const parsed = updateWorkspaceSettingsRequestSchema.parse({
      billingDetails: { legalName: 'Riya', address: '', taxId: '  ' },
    });
    expect(parsed.billingDetails).toEqual({ legalName: 'Riya', address: null, taxId: null });
  });

  it('requires at least one field', () => {
    expect(updateWorkspaceSettingsRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('shared validation schemas (SEC-005)', () => {
  it.each([
    ['Asia/Kolkata', true],
    ['UTC', true],
    ['America/New_York', true],
    ['Mars/Olympus', false],
    ['', false],
    ['x'.repeat(65), false],
  ])('UT-CON-01 timeZoneSchema(%s) valid=%s', (tz, valid) => {
    expect(timeZoneSchema.safeParse(tz).success).toBe(valid);
  });

  it.each([
    ['INR', true],
    ['USD', true],
    ['inr', false],
    ['RUPEE', false],
    ['IN', false],
  ])('UT-CON-02 currencyCodeSchema(%s) valid=%s', (code, valid) => {
    expect(currencyCodeSchema.safeParse(code).success).toBe(valid);
  });

  it.each([
    ['0192a000-0000-7000-8000-000000000001', true],
    ['not-a-uuid', false],
    ['0192a000000070008000000000000001', false],
    ['{"$ne":null}', false],
  ])('UT-CON-03 idSchema(%s) valid=%s', (id, valid) => {
    expect(idSchema.safeParse(id).success).toBe(valid);
  });

  it('UT-CON-04 emails are trimmed, lower-cased and length-limited', () => {
    expect(emailSchema.parse('  A@Example.COM ')).toBe('a@example.com');
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@example.com`).success).toBe(false);
    expect(emailSchema.safeParse({ $ne: null }).success).toBe(false);
  });

  it('UT-CON-05 login keeps errors generic: any non-empty password up to 256 chars is accepted', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@example.com', password: 'x' }).success).toBe(
      true,
    );
    expect(loginRequestSchema.safeParse({ email: 'a@example.com', password: '' }).success).toBe(
      false,
    );
    expect(
      loginRequestSchema.safeParse({ email: 'a@example.com', password: 'x'.repeat(257) }).success,
    ).toBe(false);
  });

  it('UT-CON-06 every problem code is a stable SCREAMING_SNAKE identifier', () => {
    for (const code of problemCodes) expect(code).toMatch(/^[A-Z][A-Z_]+$/);
    expect(new Set(problemCodes).size).toBe(problemCodes.length);
  });

  it('UT-CON-07 audit actions are a closed set (data-model §4.15)', () => {
    expect(auditActionSchema.safeParse('workspace.settings_changed').success).toBe(true);
    expect(auditActionSchema.safeParse('ai.approved_change').success).toBe(false);
  });

  it('UT-CON-08 unknown currencies fall back to the Intl default precision without throwing', () => {
    expect(currencyFractionDigits('XXX')).toBeTypeOf('number');
  });
});

describe('route paths (ADR-0013)', () => {
  it('UT-CON-09 all paths are same-origin /api/v1 paths', () => {
    expect(apiPaths.register()).toBe('/api/v1/auth/register');
    expect(apiPaths.login()).toBe('/api/v1/auth/login');
    expect(apiPaths.logout()).toBe('/api/v1/auth/logout');
    expect(apiPaths.me()).toBe('/api/v1/auth/me');
  });

  it('UT-CON-10 IDs are URL-encoded, so a crafted ID cannot change the path', () => {
    expect(apiPaths.workspace('../auth/logout')).toBe('/api/v1/workspaces/..%2Fauth%2Flogout');
    expect(apiPaths.workspace('a?b#c')).toBe('/api/v1/workspaces/a%3Fb%23c');
  });
});
