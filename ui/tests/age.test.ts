import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatAge } from '../src/lib/age';

describe('formatAge', () => {
  afterEach(() => vi.useRealTimers());

  function fromNow(ms: number): string {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    return formatAge(new Date(now - ms).toISOString());
  }

  it('returns "just now" for < 60s', () => {
    expect(fromNow(30_000)).toBe('just now');
  });

  it('returns minutes for 1–59m', () => {
    expect(fromNow(2 * 60_000)).toBe('2m');
    expect(fromNow(59 * 60_000 - 1)).toBe('58m');
  });

  it('returns hours for 1–23h', () => {
    expect(fromNow(60 * 60_000)).toBe('1h');
    expect(fromNow(4 * 60 * 60_000)).toBe('4h');
  });

  it('returns days for 1–13d', () => {
    expect(fromNow(24 * 60 * 60_000)).toBe('1d');
    expect(fromNow(13 * 24 * 60 * 60_000)).toBe('13d');
  });

  it('returns weeks for >= 14d', () => {
    expect(fromNow(14 * 24 * 60 * 60_000)).toBe('2w');
    expect(fromNow(21 * 24 * 60 * 60_000)).toBe('3w');
  });
});
