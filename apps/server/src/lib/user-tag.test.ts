import { describe, it, expect } from 'vitest';
import { computeUserTag, DEFAULT_TAG_COLOR, DEFAULT_GUEST_TAG_COLOR } from './user-tag.js';

describe('computeUserTag', () => {
  it('returns custom tag when userTagText is set', () => {
    const result = computeUserTag({
      role: 'ViewerCompany',
      userTagText: 'VIP',
      userTagColor: '#ef4444',
    });
    expect(result).toEqual({ text: 'VIP', color: '#ef4444' });
  });

  it('falls back to DEFAULT_TAG_COLOR when userTagText set but userTagColor is null', () => {
    const result = computeUserTag({
      role: 'ViewerCompany',
      userTagText: 'VIP',
      userTagColor: null,
    });
    expect(result).toEqual({ text: 'VIP', color: DEFAULT_TAG_COLOR });
  });

  it('returns Guest default for ViewerGuest with no custom tag', () => {
    const result = computeUserTag({
      role: 'ViewerGuest',
      userTagText: null,
      userTagColor: null,
    });
    expect(result).toEqual({ text: 'Guest', color: DEFAULT_GUEST_TAG_COLOR });
  });

  it('returns null for non-guest user with no custom tag', () => {
    const result = computeUserTag({
      role: 'ViewerCompany',
      userTagText: null,
      userTagColor: null,
    });
    expect(result).toBeNull();
  });

  it('returns null for Admin with no custom tag', () => {
    const result = computeUserTag({
      role: 'Admin',
      userTagText: null,
      userTagColor: null,
    });
    expect(result).toBeNull();
  });

  it('returns null for Moderator with no custom tag', () => {
    const result = computeUserTag({
      role: 'Moderator',
      userTagText: null,
      userTagColor: null,
    });
    expect(result).toBeNull();
  });

  it('returns custom tag for ViewerGuest when userTagText is set (custom overrides Guest default)', () => {
    const result = computeUserTag({
      role: 'ViewerGuest',
      userTagText: 'Special',
      userTagColor: '#22c55e',
    });
    expect(result).toEqual({ text: 'Special', color: '#22c55e' });
  });

  it('returns Guest default for ViewerGuest when userTagText is null but userTagColor is set', () => {
    // color alone does not activate custom tag — text is required
    const result = computeUserTag({
      role: 'ViewerGuest',
      userTagText: null,
      userTagColor: '#ef4444',
    });
    expect(result).toEqual({ text: 'Guest', color: DEFAULT_GUEST_TAG_COLOR });
  });

  it('exports DEFAULT_TAG_COLOR as zinc-500 hex', () => {
    expect(DEFAULT_TAG_COLOR).toBe('#6b7280');
  });

  it('exports DEFAULT_GUEST_TAG_COLOR as yellow-700 hex', () => {
    expect(DEFAULT_GUEST_TAG_COLOR).toBe('#a16207');
  });
});
