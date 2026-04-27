import { describe, it, expect } from 'vitest';
import { formatDateForDisplay, formatDateForPdf } from '../dateDisplayFormatter';

describe('dateDisplayFormatter', () => {
  it('returns empty fallback for invalid date', () => {
    expect(formatDateForDisplay('not-a-date')).toBe('');
    expect(formatDateForDisplay(undefined, { fallback: '-' })).toBe('-');
  });

  it('uses same output contract for display and pdf helpers', () => {
    const d = new Date('2024-06-01T10:30:00');
    expect(formatDateForPdf(d)).toBe(formatDateForDisplay(d));
  });

  it('avoids ISO yyyy-mm-dd default output by contract', () => {
    const d = new Date('2024-12-31T23:00:00');
    const out = formatDateForDisplay(d);
    expect(out).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('timezone-sensitive input stays aligned between helpers', () => {
    const input = '2024-01-01T00:30:00+07:00';
    expect(formatDateForPdf(input)).toBe(formatDateForDisplay(input));
  });
});

