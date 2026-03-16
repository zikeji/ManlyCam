import type { Emoji } from '@/lib/emoji-data';

export interface InsertEmojiResult {
  text: string;
  newCursorPos: number;
}

/**
 * Insert an emoji shortcode at the given cursor position in text.
 * Returns the updated text and new cursor position after the inserted shortcode.
 */
export function insertEmoji(text: string, emoji: Emoji, cursorPos: number): InsertEmojiResult {
  const shortcode = `:${emoji.name}:`;
  const textBefore = text.substring(0, cursorPos);
  const textAfter = text.substring(cursorPos);
  return {
    text: textBefore + shortcode + textAfter,
    newCursorPos: cursorPos + shortcode.length,
  };
}

/**
 * Replace a partial emoji shortcode (`:query`) starting at queryStart
 * with the full `:shortcode:` format.
 * queryEnd is the current cursor position (where the user stopped typing).
 */
export function replaceEmojiQuery(
  text: string,
  emoji: Emoji,
  queryStart: number,
  queryEnd: number,
): InsertEmojiResult {
  const shortcode = `:${emoji.name}:`;
  const textBefore = text.substring(0, queryStart);
  const textAfter = text.substring(queryEnd);
  return {
    text: textBefore + shortcode + textAfter,
    newCursorPos: queryStart + shortcode.length,
  };
}
