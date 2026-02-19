import { describe, it, expect } from 'vitest';
import { formatDate, formatTime, formatDateTime } from './formatting';

const iso = '2026-02-19T14:30:00.000Z';

describe('formatDate', () => {
  it('should format MM/DD/YYYY by default', () => {
    expect(formatDate(iso, 'MM/DD/YYYY')).toBe('02/19/2026');
  });

  it('should format DD/MM/YYYY', () => {
    expect(formatDate(iso, 'DD/MM/YYYY')).toBe('19/02/2026');
  });

  it('should format YYYY-MM-DD', () => {
    expect(formatDate(iso, 'YYYY-MM-DD')).toBe('2026-02-19');
  });
});

describe('formatTime', () => {
  it('should format 12h', () => {
    const t = formatTime(iso, '12h');
    expect(t).toMatch(/\d{1,2}:\d{2}:\d{2}\s*(AM|PM)/);
  });

  it('should format 24h', () => {
    const t = formatTime(iso, '24h');
    expect(t).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

describe('formatDateTime', () => {
  it('should combine date and time', () => {
    const result = formatDateTime(iso, 'YYYY-MM-DD', '24h');
    expect(result).toContain('2026-02-19');
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
