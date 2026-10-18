import { describe, expect, it } from 'vitest';
import { todayIn } from './today';

describe('todayIn (date-input defaults only; the server enforces dates)', () => {
  it('UT-TODAY-01 uses the workspace time zone, not the machine one', () => {
    const at = new Date('2026-10-16T20:00:00Z'); // 01:30 next day in Kolkata
    expect(todayIn('Asia/Kolkata', at)).toBe('2026-10-17');
    expect(todayIn('UTC', at)).toBe('2026-10-16');
    expect(todayIn('America/Los_Angeles', at)).toBe('2026-10-16');
  });

  it('UT-TODAY-02 an invalid zone falls back to the UTC date instead of throwing', () => {
    expect(todayIn('Not/AZone', new Date('2026-10-16T20:00:00Z'))).toBe('2026-10-16');
  });
});
