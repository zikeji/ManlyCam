import emojilib from 'emojilib';
import unicodeData from 'unicode-emoji-json';

// Enumerate SVG files present in the package at build time (keys only — no files are loaded).
// This filters out emojis the pack doesn't include rather than showing broken images.
const _emojiAssetGlob = import.meta.glob('/node_modules/@lobehub/fluent-emoji-modern/assets/*.svg');
const AVAILABLE_CODEPOINTS = new Set(
  Object.keys(_emojiAssetGlob).map((p) => p.replace(/^.*\/(.+)\.svg$/, '$1')),
);

// Cast emojilib to allow missing keys at runtime (not every emoji char is present)
const emojilibData = emojilib as Record<string, string[] | undefined>;

export interface Emoji {
  name: string;
  keywords: string[];
  category: string;
  codepoint: string;
}

export const EMOJI_CATEGORIES = [
  'smileys',
  'people',
  'animals',
  'food',
  'travel',
  'activities',
  'objects',
  'symbols',
  'flags',
] as const;

export type EmojiCategory = (typeof EMOJI_CATEGORIES)[number];

const CATEGORY_MAP: Record<string, EmojiCategory> = {
  'Smileys & Emotion': 'smileys',
  'People & Body': 'people',
  'Animals & Nature': 'animals',
  'Food & Drink': 'food',
  'Travel & Places': 'travel',
  Activities: 'activities',
  Objects: 'objects',
  Symbols: 'symbols',
  Flags: 'flags',
};

// Skin tone modifier codepoints (U+1F3FB–U+1F3FF); exclude emoji sequences containing them
const SKIN_TONE_CODEPOINTS = ['1f3fb', '1f3fc', '1f3fd', '1f3fe', '1f3ff'];

function emojiToCodepoint(emoji: string): string {
  return [...emoji].map((c) => c.codePointAt(0)!.toString(16).toLowerCase()).join('-');
}

function hasSkinTone(codepoint: string): boolean {
  return SKIN_TONE_CODEPOINTS.some((t) => codepoint.includes(t));
}

export const EMOJI_LIST: Emoji[] = Object.entries(unicodeData).reduce<Emoji[]>(
  (list, [emoji, data]) => {
    const category = CATEGORY_MAP[data.group];
    if (!category) return list; // skip Component group (skin tone swatches, ZWJ sequences, etc.)

    const codepoint = emojiToCodepoint(emoji);
    if (hasSkinTone(codepoint)) return list; // skip skin-tone-variant sequences
    if (!AVAILABLE_CODEPOINTS.has(codepoint)) return list; // skip emojis not in the pack

    const keywords = emojilibData[emoji] ?? [];
    list.push({ name: data.slug, keywords, category, codepoint });
    return list;
  },
  [],
);

export const EMOJI_MAP: Map<string, Emoji> = new Map(EMOJI_LIST.map((e) => [e.name, e]));

/**
 * Build a URL for a Fluent Emoji SVG asset.
 *
 * Returns the self-hosted path served by vite-plugin-static-copy
 * from @lobehub/fluent-emoji-modern (e.g. /emojis/1f600.svg).
 */
export function getEmojiUrl(codepoint: string): string {
  return `/emojis/${codepoint}.svg`;
}

export function searchEmojis(query: string, limit = 20): Emoji[] {
  if (!query) return EMOJI_LIST.slice(0, limit);
  const q = query.toLowerCase().trim();
  return EMOJI_LIST.filter(
    (e) => e.name.includes(q) || e.keywords.some((k) => k.includes(q)),
  ).slice(0, limit);
}
