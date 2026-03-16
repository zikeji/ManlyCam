import { describe, it, expect } from 'vitest';
import { insertEmoji, replaceEmojiQuery } from './useEmoji';
import type { Emoji } from '@/lib/emoji-data';

const smile: Emoji = {
  name: 'smile',
  keywords: ['happy', 'joy'],
  category: 'smileys',
  codepoint: '1f604',
};

const heart: Emoji = {
  name: 'heart',
  keywords: ['love'],
  category: 'symbols',
  codepoint: '2764',
};

describe('insertEmoji', () => {
  it('inserts shortcode at cursor position (end of text)', () => {
    const result = insertEmoji('Hello ', smile, 6);
    expect(result.text).toBe('Hello :smile:');
    expect(result.newCursorPos).toBe(13);
  });

  it('inserts shortcode at cursor position (start of text)', () => {
    const result = insertEmoji('world', smile, 0);
    expect(result.text).toBe(':smile:world');
    expect(result.newCursorPos).toBe(7);
  });

  it('inserts shortcode in the middle of text', () => {
    const result = insertEmoji('Hello world', smile, 5);
    expect(result.text).toBe('Hello:smile: world');
    expect(result.newCursorPos).toBe(12);
  });

  it('inserts shortcode into empty string', () => {
    const result = insertEmoji('', smile, 0);
    expect(result.text).toBe(':smile:');
    expect(result.newCursorPos).toBe(7);
  });

  it('newCursorPos is at end of shortcode', () => {
    const result = insertEmoji('abc', heart, 3);
    expect(result.text).toBe('abc:heart:');
    expect(result.newCursorPos).toBe(result.text.length);
  });

  it('works with multi-character emoji name', () => {
    const tada: Emoji = { name: 'tada', keywords: [], category: 'activities', codepoint: '1f389' };
    const result = insertEmoji('Hello', tada, 5);
    expect(result.text).toBe('Hello:tada:');
    expect(result.newCursorPos).toBe(11);
  });
});

describe('replaceEmojiQuery', () => {
  it('replaces :query with :shortcode:', () => {
    // User typed ":smi" — colonIndex=0, cursorPos=4
    const result = replaceEmojiQuery(':smi', smile, 0, 4);
    expect(result.text).toBe(':smile:');
    expect(result.newCursorPos).toBe(7);
  });

  it('replaces partial query within larger text', () => {
    // "Hello :smi" — colonIndex=6, cursorPos=10
    const result = replaceEmojiQuery('Hello :smi', smile, 6, 10);
    expect(result.text).toBe('Hello :smile:');
    expect(result.newCursorPos).toBe(13);
  });

  it('replaces query and preserves text after cursor', () => {
    // "Hello :smi world" — colonIndex=6, cursorPos=10 (cursor after "smi")
    const result = replaceEmojiQuery('Hello :smi world', smile, 6, 10);
    expect(result.text).toBe('Hello :smile: world');
    expect(result.newCursorPos).toBe(13);
  });

  it('handles empty query (just colon)', () => {
    // "Hello :" — colonIndex=6, cursorPos=7
    const result = replaceEmojiQuery('Hello :', heart, 6, 7);
    expect(result.text).toBe('Hello :heart:');
    expect(result.newCursorPos).toBe(13);
  });

  it('newCursorPos is after inserted shortcode', () => {
    const result = replaceEmojiQuery(':smile_test', smile, 0, 11);
    expect(result.newCursorPos).toBe(':smile:'.length);
  });
});
