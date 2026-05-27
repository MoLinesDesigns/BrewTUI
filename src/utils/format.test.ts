import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n/index.js', () => ({
  getLocale: () => 'en',
  t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${values.n}` : key,
}));

import { formatBytes, formatDate, formatRelativeTime, truncate } from './format.js';

describe('format utilities', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-05-27T10:00:00.000Z'));
  });

  it('formats byte sizes across boundaries', () => {
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(512)).toBe('512.0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 ** 2)).toBe('1.0 MB');
    expect(formatBytes(1024 ** 5)).toBe('1024.0 TB');
  });

  it('formats relative time buckets', () => {
    const now = Date.now() / 1000;
    expect(formatRelativeTime(0)).toBe('time_justNow');
    expect(formatRelativeTime(now + 60)).toBe('time_justNow');
    expect(formatRelativeTime(now - 30)).toBe('time_justNow');
    expect(formatRelativeTime(now - 120)).toBe('time_minutesAgo:2');
    expect(formatRelativeTime(now - 7_200)).toBe('time_hoursAgo:2');
    expect(formatRelativeTime(now - 172_800)).toBe('time_daysAgo:2');
    expect(formatRelativeTime(now - 5_184_000)).toBe('time_monthsAgo:2');
  });

  it('formats dates and truncates long strings', () => {
    expect(formatDate('2026-05-27T00:00:00.000Z')).toContain('2026');
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('abcdef', 4)).toBe('abc\u2026');
  });
});
