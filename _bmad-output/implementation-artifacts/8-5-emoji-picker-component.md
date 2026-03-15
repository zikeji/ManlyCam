# Story 8-5: Emoji Picker Component

Status: ready-for-dev

## Story

As an **authorized viewer**,
I want to insert emojis into my chat messages using a visual picker or keyboard shortcuts,
So that I can express emotions and reactions quickly without memorizing emoji codes.

## Acceptance Criteria

1. **Given** a user clicks the emoji button in the chat input area, **When** the emoji picker opens, **Then** a searchable, categorized emoji picker displays using Fluent Emoji image assets (consistent cross-platform rendering).

2. **Given** the emoji picker is open, **When** a user types in the search field, **Then** the emoji list filters to show only matching emojis by name or keyword.

3. **Given** the emoji picker is open, **When** a user clicks an emoji, **Then** the `:shortcode:` (e.g., `:smile:`) is inserted at the cursor position in the chat input and the picker remains open.

4. **Given** a user types `:` followed by text (e.g., `:smile`), **When** an autocomplete popup appears, **Then** it shows Fluent Emoji images matching the typed shortcut with their names.

5. **Given** the emoji shortcut autocomplete is visible, **When** a user clicks/taps or uses arrow keys + Enter to select an emoji, **Then** the `:query` text is replaced with the full `:shortcode:` (e.g., `:smile:`) in the chat input.

6. **Given** a user presses Escape while the emoji picker or shortcut autocomplete is open, **When** the picker/popup closes, **Then** focus returns to the chat input.

7. **And** emojis are stored in messages as `:shortcode:` format (e.g., `"Hello :smile:"`) and converted to Fluent Emoji `<img>` tags at render time by the markdown renderer from Story 8-1.

8. **And** Fluent Emoji assets are loaded from CDN (`emoji.fluent-cdn.com`) or self-hosted via server configuration.

9. **And** the emoji picker component is reusable for both chat input and message reactions (Story 8-6).

10. **And** the architecture supports future custom emoji extensibility (not required for this story).

## Tasks / Subtasks

- [ ] Task 1: Research and document Fluent Emoji integration approach (AC: #1, #7)
  - [ ] Subtask 1.1: Document Fluent Emoji CDN URL pattern: `https://emoji.fluent-cdn.com/latest/svg/{emoji-code}.svg`
  - [ ] Subtask 1.2: Determine if we need a local emoji metadata file or can use unicode emoji data for search
  - [ ] Subtask 1.3: Document how to self-host Fluent Emoji assets (optional future enhancement)

- [ ] Task 2: Create emoji data and search utilities (AC: #2)
  - [ ] Subtask 2.1: Create `apps/web/src/lib/emoji-data.ts` with emoji metadata (name, keywords, unicode)
  - [ ] Subtask 2.2: Include common emoji set (~1000 emojis) with categories: smileys, people, animals, food, objects, symbols, etc.
  - [ ] Subtask 2.3: Export `searchEmojis(query: string): Emoji[]` function
  - [ ] Subtask 2.4: Implement fuzzy matching on name and keywords

- [ ] Task 3: Create EmojiPicker Vue component (AC: #1, #2, #3, #6)
  - [ ] Subtask 3.1: Create `apps/web/src/components/chat/EmojiPicker.vue`
  - [ ] Subtask 3.2: Implement search input with debounced filtering
  - [ ] Subtask 3.3: Implement category tabs (Smileys, People, Animals, Food, Objects, Symbols)
  - [ ] Subtask 3.4: Render emoji grid with virtualization for performance
  - [ ] Subtask 3.5: Style picker as floating popup (use Popover or custom positioning)
  - [ ] Subtask 3.6: Emit `select(emoji)` event when emoji is clicked

- [ ] Task 4: Create EmojiAutocomplete Vue component (AC: #4, #5, #6)
  - [ ] Subtask 4.1: Create `apps/web/src/components/chat/EmojiAutocomplete.vue`
  - [ ] Subtask 4.2: Trigger on `:` followed by alphanumeric characters
  - [ ] Subtask 4.3: Position popup near cursor in chat input
  - [ ] Subtask 4.4: Implement keyboard navigation (arrow keys, Enter, Escape)
  - [ ] Subtask 4.5: Render Fluent Emoji images from CDN
  - [ ] Subtask 4.6: Emit `select(emoji)` and `close()` events

- [ ] Task 5: Create emoji button in ChatInput (AC: #1)
  - [ ] Subtask 5.1: Add emoji button (Smile icon) to `ChatInput.vue`
  - [ ] Subtask 5.2: Position button to the left of the textarea
  - [ ] Subtask 5.3: On click, toggle EmojiPicker visibility
  - [ ] Subtask 5.4: Wire EmojiPicker `@select` to insert emoji at cursor position

- [ ] Task 6: Integrate emoji shortcut autocomplete into ChatInput (AC: #4, #5)
  - [ ] Subtask 6.1: In `ChatInput.vue`, detect `:` followed by text
  - [ ] Subtask 6.2: Show EmojiAutocomplete when pattern detected
  - [ ] Subtask 6.3: Extract query text after `:`
  - [ ] Subtask 6.4: On select, replace `:query` with full `:shortcode:` (e.g., `:smile:`)
  - [ ] Subtask 6.5: Close autocomplete on: select, Escape, space

- [ ] Task 7: Add emoji shortcode rendering to markdown renderer (AC: #7)
  - [ ] Subtask 7.1: In `apps/web/src/lib/markdown.ts`, add `renderEmojiShortcodes(text: string): string` preprocessor
  - [ ] Subtask 7.2: Match `:[a-z0-9_]+:` pattern in message content
  - [ ] Subtask 7.3: Look up shortcode in `emoji-data.ts` to get codepoint
  - [ ] Subtask 7.4: Replace `:shortcode:` with `<img src="https://emoji.fluent-cdn.com/latest/svg/{codepoint}.svg" alt="{shortcode}" class="emoji-inline" />`
  - [ ] Subtask 7.5: Run emoji rendering BEFORE markdown-it processing (so emojis work in any markdown context)
  - [ ] Subtask 7.6: Add CSS for `.emoji-inline` class: `display: inline-block; width: 1.2em; height: 1.2em; vertical-align: middle;`

- [ ] Task 8: Create useEmoji composable (optional, for reusability)
  - [ ] Subtask 7.1: Create `apps/web/src/composables/useEmoji.ts`
  - [ ] Subtask 7.2: Export `insertEmoji(text, emoji, cursorPos)` utility function
  - [ ] Subtask 7.3: Handle cursor position calculation for insertion

- [ ] Task 8: Style emoji picker and autocomplete (AC: All)
  - [ ] Subtask 8.1: Add CSS for emoji picker: max-height, shadow, border-radius, scrollable
  - [ ] Subtask 8.2: Add CSS for emoji grid: grid layout, hover states
  - [ ] Subtask 8.3: Add CSS for emoji autocomplete: max-height, shadow, list styling
  - [ ] Subtask 8.4: Ensure emoji images have consistent size (e.g., 20x20px)

- [ ] Task 9: Update tests (AC: All)
  - [ ] Subtask 9.1: Create `EmojiPicker.test.ts` — test search, category filtering, selection
  - [ ] Subtask 9.2: Create `EmojiAutocomplete.test.ts` — test trigger, filtering, keyboard navigation
  - [ ] Subtask 9.3: Update `ChatInput.test.ts` — test emoji button and shortcut trigger

- [ ] Task 10: Visual and accessibility verification (AC: All)
  - [ ] Subtask 10.1: Manual test: click emoji button, verify picker opens
  - [ ] Subtask 10.2: Manual test: search for "smile", verify filtering
  - [ ] Subtask 10.3: Manual test: click emoji, verify it appears in input
  - [ ] Subtask 10.4: Manual test: type `:smile`, verify autocomplete appears
  - [ ] Subtask 10.5: Manual test: arrow keys navigate, Enter selects
  - [ ] Subtask 10.6: Accessibility: verify picker has `role="dialog"` and emojis have `role="button"`

## Dev Notes

### Architecture and Patterns

- **Emoji Storage Strategy:** Emojis are stored in messages as `:shortcode:` format (e.g., `"Hello :smile:"`). This keeps messages as plain text in the database (searchable, compact, no HTML sanitization issues).
- **Emoji Rendering Strategy:** At render time, the markdown renderer (Story 8-1) converts `:shortcode:` patterns to Fluent Emoji `<img>` tags. This happens as a preprocessing step before markdown-it processes the text.
- **Why shortcode storage?**
  - Messages remain searchable ("smile" finds `:smile:`)
  - Smaller database storage vs HTML
  - No XSS risk from storing HTML
  - Easy to change emoji renderer in the future (just update the preprocessor)
- **Fluent Emoji CDN:** Emoji images are loaded from `https://emoji.fluent-cdn.com/latest/svg/{code}.svg` where `{code}` is the emoji unicode codepoint (e.g., `1f600` for 😀). No npm package needed.
- **Emoji metadata:** Store emoji data locally as a TypeScript file with name, keywords, category, and unicode codepoint. This enables fast search without API calls.
- **Reusable component:** The `EmojiPicker` component is used in two places:
  1. Chat input (click emoji button to open picker)
  2. Message reactions (Story 8-6, react to messages)
- **Future extensibility:** Architecture allows for custom emojis in the future by:
  - Adding a `custom` category to emoji data
  - Supporting custom image URLs in addition to Fluent Emoji CDN

### Emoji Rendering Pipeline

```
User selects emoji "😀"
     ↓
Input receives: ":smile:"
     ↓
Message stored: "Hello :smile:"
     ↓
Render time:
     ↓
Preprocessor: ":smile:" → "<img src='.../1f600.svg' class='emoji-inline' />"
     ↓
Markdown-it: processes rest of text
     ↓
Final HTML: "Hello <img src='.../1f600.svg' class='emoji-inline' />"
```

- Supporting custom image URLs in addition to Fluent Emoji CDN

### Fluent Emoji CDN URL Pattern

```
https://emoji.fluent-cdn.com/latest/svg/{unicode-codepoint}.svg

Examples:
- 😀 (U+1F600): https://emoji.fluent-cdn.com/latest/svg/1f600.svg
- 😂 (U+1F602): https://emoji.fluent-cdn.com/latest/svg/1f602.svg
- ❤️ (U+2764): https://emoji.fluent-cdn.com/latest/svg/2764.svg
```

### Emoji Data Structure

```typescript
// apps/web/src/lib/emoji-data.ts
export interface Emoji {
  name: string; // e.g., "smile"
  keywords: string[]; // e.g., ["happy", "grin", "joy"]
  category: string; // e.g., "smileys"
  codepoint: string; // e.g., "1f600" (unicode codepoint without U+ prefix)
}

export const EMOJI_CATEGORIES = [
  'smileys',
  'people',
  'animals',
  'food',
  'activities',
  'objects',
  'symbols',
  'flags',
] as const;
```

### EmojiPicker Component Structure

```vue
<!-- apps/web/src/components/chat/EmojiPicker.vue -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { EMOJI_DATA, searchEmojis, type Emoji } from '@/lib/emoji-data';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  select: [emoji: Emoji];
  close: [];
}>();

const searchQuery = ref('');
const selectedCategory = ref('smileys');
const highlightedIndex = ref(0);

const filteredEmojis = computed(() => {
  if (!searchQuery.value) {
    return EMOJI_DATA.filter((e) => e.category === selectedCategory.value);
  }
  return searchEmojis(searchQuery.value);
});

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  } else if (e.key === 'ArrowDown') {
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, filteredEmojis.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
  } else if (e.key === 'Enter' && filteredEmojis.value[highlightedIndex.value]) {
    emit('select', filteredEmojis.value[highlightedIndex.value]);
  }
}

function getEmojiUrl(codepoint: string): string {
  return `https://emoji.fluent-cdn.com/latest/svg/${codepoint}.svg`;
}
</script>

<template>
  <div v-if="visible" class="emoji-picker" @keydown="handleKeydown" tabindex="0">
    <div class="emoji-picker-search">
      <input v-model="searchQuery" placeholder="Search emojis..." />
    </div>

    <div v-if="!searchQuery" class="emoji-picker-categories">
      <button
        v-for="cat in EMOJI_CATEGORIES"
        :key="cat"
        :class="{ active: cat === selectedCategory }"
        @click="selectedCategory = cat"
      >
        {{ cat }}
      </button>
    </div>

    <div class="emoji-picker-grid">
      <button
        v-for="(emoji, index) in filteredEmojis"
        :key="emoji.codepoint"
        :class="{ highlighted: index === highlightedIndex }"
        @click="emit('select', emoji)"
      >
        <img :src="getEmojiUrl(emoji.codepoint)" :alt="emoji.name" class="emoji-img" />
      </button>
    </div>
  </div>
</template>
```

### EmojiAutocomplete Component Structure

```vue
<!-- apps/web/src/components/chat/EmojiAutocomplete.vue -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { searchEmojis, type Emoji } from '@/lib/emoji-data';

const props = defineProps<{
  visible: boolean;
  query: string;
  position: { top: number; left: number };
}>();

const emit = defineEmits<{
  select: [emoji: Emoji];
  close: [];
}>();

const highlightedIndex = ref(0);

const filteredEmojis = computed(() => {
  return searchEmojis(props.query);
});

watch(filteredEmojis, () => {
  highlightedIndex.value = 0;
});

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  } else if (e.key === 'ArrowDown') {
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, filteredEmojis.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
  } else if (e.key === 'Enter' && filteredEmojis.value[highlightedIndex.value]) {
    emit('select', filteredEmojis.value[highlightedIndex.value]);
  }
}

function getEmojiUrl(codepoint: string): string {
  return `https://emoji.fluent-cdn.com/latest/svg/${codepoint}.svg`;
}
</script>

<template>
  <div
    v-if="visible && filteredEmojis.length > 0"
    class="emoji-autocomplete"
    :style="{ top: position.top + 'px', left: position.left + 'px' }"
    @keydown="handleKeydown"
    tabindex="0"
  >
    <button
      v-for="(emoji, index) in filteredEmojis"
      :key="emoji.codepoint"
      :class="{ highlighted: index === highlightedIndex }"
      @click="emit('select', emoji)"
    >
      <img :src="getEmojiUrl(emoji.codepoint)" :alt="emoji.name" class="emoji-img" />
      <span>:{{ emoji.name }}:</span>
    </button>
  </div>
</template>
```

### Inserting Emoji into Chat Input

```typescript
// In ChatInput.vue
function insertEmoji(emoji: Emoji) {
  const textarea = textareaRef.value;
  if (!textarea) return;

  const cursorPos = textarea.selectionStart;
  const textBefore = content.value.substring(0, cursorPos);
  const textAfter = content.value.substring(cursorPos);

  // Insert as :shortcode: format - will be rendered to <img> at display time
  const shortcode = `:${emoji.name}:`;

  content.value = textBefore + shortcode + textAfter;

  // Move cursor after shortcode
  nextTick(() => {
    textarea.selectionStart = textarea.selectionEnd = cursorPos + shortcode.length;
    textarea.focus();
  });
}

// For autocomplete: replace the partial :query with full shortcode
function replaceWithEmoji(emoji: Emoji, queryStart: number) {
  const textarea = textareaRef.value;
  if (!textarea) return;

  const textBefore = content.value.substring(0, queryStart);
  const textAfter = content.value.substring(textarea.selectionStart);

  const shortcode = `:${emoji.name}:`;
  content.value = textBefore + shortcode + textAfter;

  nextTick(() => {
    textarea.selectionStart = textarea.selectionEnd = queryStart + shortcode.length;
    textarea.focus();
  });
}
```

### Emoji Rendering in Markdown (Task 7)

```typescript
// apps/web/src/lib/markdown.ts
import { EMOJI_MAP } from './emoji-data';

// Preprocessor to convert :shortcode: to <img> before markdown-it
export function renderEmojiShortcodes(text: string): string {
  // Match :word: patterns (alphanumeric and underscores)
  return text.replace(/:([a-z0-9_]+):/gi, (match, name) => {
    const emoji = EMOJI_MAP.get(name.toLowerCase());
    if (!emoji) return match; // Not a known emoji, leave as-is

    return `<img src="https://emoji.fluent-cdn.com/latest/svg/${emoji.codepoint}.svg" alt=":${emoji.name}:" class="emoji-inline" loading="lazy" />`;
  });
}

// Updated renderMarkdown function (integrates with Story 8-1)
export function renderMarkdown(text: string): string {
  // Step 1: Render emoji shortcodes to <img> tags
  const withEmojis = renderEmojiShortcodes(text);

  // Step 2: Normalize newlines (from Story 8-1)
  const normalized = normalizeNewlines(withEmojis);

  // Step 3: Parse with markdown-it
  return md.render(normalized);
}
```

### Emoji Data Map for Fast Lookup

```typescript
// apps/web/src/lib/emoji-data.ts
export interface Emoji {
  name: string; // e.g., "smile"
  keywords: string[]; // e.g., ["happy", "grin", "joy"]
  category: string; // e.g., "smileys"
  codepoint: string; // e.g., "1f600"
}

// Array for iteration (search, category filtering)
export const EMOJI_LIST: Emoji[] = [
  /* ... */
];

// Map for O(1) shortcode lookup (rendering)
export const EMOJI_MAP: Map<string, Emoji> = new Map(
  EMOJI_LIST.map((e) => [e.name.toLowerCase(), e]),
);

// Search function for autocomplete
export function searchEmojis(query: string): Emoji[] {
  const q = query.toLowerCase();
  return EMOJI_LIST.filter(
    (e) => e.name.includes(q) || e.keywords.some((k) => k.includes(q)),
  ).slice(0, 10); // Limit to 10 results
}
```

### Source Tree Components to Touch

**Files to create:**

- `apps/web/src/lib/emoji-data.ts` — Emoji metadata and search
- `apps/web/src/components/chat/EmojiPicker.vue` — Full emoji picker
- `apps/web/src/components/chat/EmojiAutocomplete.vue` — Shortcut autocomplete

**Files to modify:**

- `apps/web/src/components/chat/ChatInput.vue` — Add emoji button and integrate pickers
- `apps/web/src/lib/markdown.ts` — Add `renderEmojiShortcodes()` preprocessor (Story 8-1 integration)
- `apps/web/src/assets/main.css` — Add `.emoji-inline` CSS class
- `apps/web/src/components/chat/ChatInput.test.ts` — Add emoji tests

**Files NOT to touch:**

- `apps/server/**` — No server changes; emoji are rendered client-side only
- `packages/types/**` — No new types needed

### Emoji Data Source

Use the unicode emoji dataset. Options:

1. **emoji-data-ts** npm package — comprehensive but large
2. **Custom curated list** — ~1000 common emojis, smaller bundle

Recommend custom curated list for this story. Include:

- Smileys & Emotion (😀 😃 😄 😁 😆 😂 🤣 😇 😉 😊 😋 😎 🤩 🥳 😏 ☹ 😥 😢 😤 😠 😡 🤬 🤯 😱 🥵 🥶 😳 🤪 😵 🥴 😴 💤 😪 🤐 🤔 🤭 🤫 🤬 🤯 😱)
- People & Body (👋 🤚 🖐 ✋ 🖖 👌 👏 🙌 👐 🤝 👈 👎 🤛 👊 ✊ 👁 👀 👃 👅 👄 👅 🖕 👍 👎 👊 ✊ 👁 👀 👃 👄 🤞 🤟 🤘 🖖 👋)
- Animals & Nature (🐶 🐱 🐭 🐛 🐌 🐞 🐜 🦋 🐛 🐜 🐞 🐜 🦋 🐛 🐜 🐞 🐜 🦋 🐛 🐜)
- Food & Drink (🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍈 🍆 🥝 🥑 🥒 🥬 🌶 🌽 🌰 🍎 🥔 🥕 🥦 🧄 🧅 🧇)
- Objects (⌚ 🖲 🖱 📱 💻 ⌨️ 🖥 🖨 🖧 🖮 🖯 🖰 🖱 🖲 🖳 🖴 🖵 🖶 🖷 🖸 🖹 🖺)
- Symbols (❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💗 💖 💘 💝 🔯 🔰 🔱 🔗 🕳 🕴)

### CSS Styles

```css
/* Emoji picker */
.emoji-picker {
  position: absolute;
  z-index: 50;
  width: 320px;
  max-height: 300px;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.emoji-picker-search input {
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
}

.emoji-picker-categories {
  display: flex;
  padding: 4px;
  gap: 4px;
  border-bottom: 1px solid var(--border);
}

.emoji-picker-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  padding: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.emoji-img {
  width: 20px;
  height: 20px;
}

/* Emoji autocomplete */
.emoji-autocomplete {
  position: fixed;
  z-index: 50;
  max-height: 150px;
  overflow-y: auto;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Inline emoji in messages */
.emoji-inline {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: middle;
}
```

### Testing Standards

- **Emoji search:** Test that `searchEmojis("smile")` returns emojis with "smile" in name or keywords
- **Category filtering:** Test that clicking a category shows only that category's emojis
- **Keyboard navigation:** Test arrow keys move highlight, Enter selects, Escape closes
- **Emoji insertion:** Test that selecting an emoji inserts `:shortcode:` at cursor position
- **Autocomplete trigger:** Test that typing `:` followed by letters triggers autocomplete
- **Autocomplete replacement:** Test that selecting from autocomplete replaces `:query` with `:shortcode:`
- **Emoji rendering:** Test that `renderEmojiShortcodes("Hello :smile:")` outputs `<img>` tag with correct URL
- **Unknown shortcode:** Test that `:unknownemoji:` is left as-is (not converted to img)

### References

- [Source: epics.md#Story 8-5] — Original story requirements
- [Source: apps/web/src/components/chat/ChatInput.vue] — Integration point
- [Fluent Emoji CDN](https://emoji.fluent-cdn.com) — Emoji assets
- [Unicode Emoji List](https://unicode.org/emoji/charts/full-emoji-list.html) — Emoji reference

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
