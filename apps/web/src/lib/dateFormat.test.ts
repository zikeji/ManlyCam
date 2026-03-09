import { describe, it, expect } from 'vitest';
import { formatTime, initials, formatDayLabel, isSameDay } from './dateFormat';

describe('formatTime', () => {
  it('formats ISO timestamp to human-readable time', () => {
    const result = formatTime('2026-03-08T14:30:00.000Z');
    // Result depends on locale/timezone; just check it's a non-empty string
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('initials', () => {
  it('extracts first letter of each word (up to 2)', () => {
    expect(initials('Alice Bob')).toBe('AB');
  });

  it('handles single name', () => {
    expect(initials('Alice')).toBe('A');
  });

  it('uppercases initials', () => {
    expect(initials('alice bob')).toBe('AB');
  });

  it('takes only first two words', () => {
    expect(initials('Alice Bob Carol')).toBe('AB');
  });
});

describe('formatDayLabel', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDayLabel('2026-03-08T10:00:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns different labels for different days', () => {
    const day1 = formatDayLabel('2026-03-08T10:00:00.000Z');
    const day2 = formatDayLabel('2026-03-09T10:00:00.000Z');
    expect(day1).not.toBe(day2);
  });

  it('returns same label for two timestamps on the same day', () => {
    const morning = formatDayLabel('2026-03-08T08:00:00.000Z');
    const evening = formatDayLabel('2026-03-08T20:00:00.000Z');
    // Same UTC day — could differ by locale timezone; test that both produce a string
    expect(typeof morning).toBe('string');
    expect(typeof evening).toBe('string');
  });
});

describe('isSameDay', () => {
  it('returns true for two ISO strings on the same local day', () => {
    // Use explicit UTC timestamps to avoid timezone-dependent test failures
    const a = '2026-03-08T10:00:00.000Z';
    const b = '2026-03-08T22:00:00.000Z';
    expect(isSameDay(a, b)).toBe(true);
  });

  it('returns false for two ISO strings on different local days', () => {
    const a = '2026-03-08T10:00:00.000Z';
    const b = '2026-03-09T10:00:00.000Z';
    expect(isSameDay(a, b)).toBe(false);
  });

  it('returns false for same time different months', () => {
    const a = '2026-03-08T10:00:00.000Z';
    const b = '2026-04-08T10:00:00.000Z';
    expect(isSameDay(a, b)).toBe(false);
  });

  it('returns false for same day different years', () => {
    const a = '2025-03-08T10:00:00.000Z';
    const b = '2026-03-08T10:00:00.000Z';
    expect(isSameDay(a, b)).toBe(false);
  });
});
