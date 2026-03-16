import { describe, it, expect } from 'vitest';
import { EMOJI_LIST, EMOJI_MAP, EMOJI_CATEGORIES, searchEmojis, getEmojiUrl } from './emoji-data';

describe('emoji-data', () => {
  describe('EMOJI_LIST', () => {
    it('contains emojis', () => {
      expect(EMOJI_LIST.length).toBeGreaterThan(100);
    });

    it('each emoji has required fields', () => {
      for (const emoji of EMOJI_LIST) {
        expect(emoji.name).toBeTruthy();
        expect(typeof emoji.name).toBe('string');
        expect(Array.isArray(emoji.keywords)).toBe(true);
        expect(emoji.category).toBeTruthy();
        expect(emoji.codepoint).toBeTruthy();
        expect(/^[0-9a-f-]+$/i.test(emoji.codepoint)).toBe(true);
      }
    });

    it('all emoji names are unique', () => {
      const names = EMOJI_LIST.map((e) => e.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });

    it('all emoji categories are valid', () => {
      const validCats = new Set(EMOJI_CATEGORIES);
      for (const emoji of EMOJI_LIST) {
        expect(validCats.has(emoji.category as never)).toBe(true);
      }
    });

    it('contains grinning_face emoji with correct codepoint', () => {
      const grinning = EMOJI_LIST.find((e) => e.name === 'grinning_face');
      expect(grinning).toBeDefined();
      expect(grinning!.codepoint).toBe('1f600');
      expect(grinning!.category).toBe('smileys');
    });

    it('contains red_heart emoji in smileys category (Unicode: Smileys & Emotion)', () => {
      const heart = EMOJI_LIST.find((e) => e.name === 'red_heart');
      expect(heart).toBeDefined();
      expect(heart!.category).toBe('smileys');
      // Codepoint includes fe0f variation selector (❤️ = U+2764 U+FE0F)
      expect(heart!.codepoint).toContain('2764');
    });

    it('covers all defined categories', () => {
      const presentCats = new Set(EMOJI_LIST.map((e) => e.category));
      for (const cat of EMOJI_CATEGORIES) {
        expect(presentCats.has(cat)).toBe(true);
      }
    });
  });

  describe('EMOJI_MAP', () => {
    it('has same size as EMOJI_LIST', () => {
      expect(EMOJI_MAP.size).toBe(EMOJI_LIST.length);
    });

    it('keys are lowercase emoji names', () => {
      for (const [key, emoji] of EMOJI_MAP) {
        expect(key).toBe(emoji.name.toLowerCase());
      }
    });

    it('can look up grinning_face by name', () => {
      const result = EMOJI_MAP.get('grinning_face');
      expect(result).toBeDefined();
      expect(result!.codepoint).toBe('1f600');
    });

    it('returns undefined for unknown shortcode', () => {
      expect(EMOJI_MAP.get('thisdoesnotexist')).toBeUndefined();
    });

    it('can look up face_with_tears_of_joy emoji', () => {
      const result = EMOJI_MAP.get('face_with_tears_of_joy');
      expect(result).toBeDefined();
      expect(result!.codepoint).toBe('1f602');
    });
  });

  describe('searchEmojis', () => {
    it('returns emojis matching name substring', () => {
      const results = searchEmojis('grinning');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((e) => e.name.includes('grinning'))).toBe(true);
    });

    it('returns emojis with query in name or keywords', () => {
      const results = searchEmojis('grinning');
      for (const emoji of results) {
        const matches =
          emoji.name.includes('grinning') || emoji.keywords.some((k) => k.includes('grinning'));
        expect(matches).toBe(true);
      }
    });

    it('is case-insensitive', () => {
      const lower = searchEmojis('grinning');
      const upper = searchEmojis('GRINNING');
      expect(lower.length).toBe(upper.length);
      expect(lower.map((e) => e.name)).toEqual(upper.map((e) => e.name));
    });

    it('limits results to 20 by default', () => {
      // 'a' matches many emojis
      const results = searchEmojis('a');
      expect(results.length).toBeLessThanOrEqual(20);
    });

    it('respects custom limit', () => {
      const results = searchEmojis('a', 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('returns empty array for no match', () => {
      const results = searchEmojis('xyznotanemoji123');
      expect(results).toHaveLength(0);
    });

    it('returns emojis matching keywords', () => {
      // "laugh" is a keyword on multiple emojis
      const results = searchEmojis('laugh');
      expect(results.length).toBeGreaterThan(0);
      for (const emoji of results) {
        const matches =
          emoji.name.includes('laugh') || emoji.keywords.some((k) => k.includes('laugh'));
        expect(matches).toBe(true);
      }
    });

    it('returns results for category-level keyword searches', () => {
      const results = searchEmojis('love');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns emojis for "happy" query', () => {
      const results = searchEmojis('happy');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns all emojis up to limit when query is empty', () => {
      const results = searchEmojis('', 10);
      expect(results).toHaveLength(10);
    });
  });

  describe('getEmojiUrl', () => {
    it('returns self-hosted local path', () => {
      const url = getEmojiUrl('1f600');
      expect(url).toBe('/emojis/1f600.svg');
    });

    it('handles compound codepoints (e.g. heart with variation selector)', () => {
      const url = getEmojiUrl('2764-fe0f');
      expect(url).toBe('/emojis/2764-fe0f.svg');
    });
  });
});
