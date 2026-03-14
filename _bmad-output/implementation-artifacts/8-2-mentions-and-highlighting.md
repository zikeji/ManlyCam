# Story 8-2: @Mentions & Highlighting

Status: ready-for-dev

## Story

As an **authorized viewer**,
I want to mention other users with `@Full Name` and be notified when someone mentions me,
So that I can get someone's attention in chat and know when I'm being spoken to.

## Acceptance Criteria

1. **Given** a user types `@` in the chat input, **When** the autocomplete popup appears, **Then** it shows all currently connected viewers sorted by most recently chatted (default list).

2. **Given** a user types `@` followed by characters (e.g., `@John`), **When** the autocomplete filters results, **Then** it filters the list by matching against full names with spaces removed (e.g., "John Smith" matches `@johns`, `@johnsmith`).

3. **Given** the autocomplete popup is visible, **When** a user clicks or taps on a name in the list, **Then** that name is inserted into the chat input at the cursor position with the `@Full Name` format.

4. **Given** the autocomplete popup is visible, **When** a user presses the up/down arrow keys, **Then** the selection highlight moves through the list items.

5. **Given** the autocomplete popup is visible and a name is highlighted via arrow keys, **When** the user presses Enter or Tab, **Then** the highlighted name is inserted into the chat input at the cursor position with the `@Full Name` format.

6. **Given** a user sends a message containing a valid `@Full Name`, **When** the message is stored, **Then** the mention is persisted with a reference to the mentioned user(s).

7. **Given** a message contains an `@mention` of the current user, **When** the message is rendered for that user, **Then** the mention is visually highlighted (e.g., different background color, pill styling).

8. **Given** a user is mentioned while the browser tab is in the background, **When** the message arrives, **Then** the `window.title` changes to draw attention (e.g., "mentioned you! • ManlyCam") and the tab title restores to its original value when the tab regains focus.

9. **And** mentioned users are stored server-side for future notification features (Story 8-3).

10. **Note:** Flash titlebar behavior defaults to enabled. A configurable preference toggle will be added in Story 8-3 (Browser Notifications & Preferences).

## Tasks / Subtasks

- [ ] Task 1: Add mentions field to Message model (AC: #6, #9)
  - [ ] Subtask 1.1: Add `mentionedUserIds String[]` field to `Message` model in `schema.prisma` (default `[]`)
  - [ ] Subtask 1.2: Run `pnpm prisma migrate dev --name add-message-mentions`
  - [ ] Subtask 1.3: Update `ChatMessage` type in `packages/types/src/ws.ts` to include `mentionedUserIds: string[]`

- [ ] Task 2: Create mention parsing utility on server (AC: #6)
  - [ ] Subtask 2.1: Create `apps/server/src/lib/mentions.ts` with `parseMentions(content: string, viewers: UserPresence[]): string[]` function
  - [ ] Subtask 2.2: Implement regex to find `@[words without spaces]` patterns (e.g., `@John`, `@JohnSmith`)
  - [ ] Subtask 2.3: Match found patterns against viewer display names with spaces removed (case-insensitive)
  - [ ] Subtask 2.4: Return array of matched user IDs

- [ ] Task 3: Update chatService to extract and store mentions (AC: #6, #9)
  - [ ] Subtask 3.1: Import `parseMentions` in `chatService.ts`
  - [ ] Subtask 3.2: In `createMessage`, call `parseMentions(content, wsHub.getPresenceList())` before DB write
  - [ ] Subtask 3.3: Store `mentionedUserIds` in the message record
  - [ ] Subtask 3.4: Include `mentionedUserIds` in the `toApiChatMessage` response

- [ ] Task 4: Create MentionAutocomplete Vue component (AC: #1, #2, #3, #4, #5)
  - [ ] Subtask 4.1: Create `apps/web/src/components/chat/MentionAutocomplete.vue`
  - [ ] Subtask 4.2: Accept props: `visible: boolean`, `query: string`, `viewers: UserPresence[]`, `position: { top: number; left: number }`
  - [ ] Subtask 4.3: Emit events: `select(user: UserPresence)`, `close()`
  - [ ] Subtask 4.4: Implement computed `filteredViewers` that filters by query with space-removed matching
  - [ ] Subtask 4.5: Implement keyboard navigation: up/down arrows move selection, Enter/Tab emits select, Escape emits close
  - [ ] Subtask 4.6: Style as floating popup with max-height scroll, z-index above chat input

- [ ] Task 5: Implement "most recently chatted" sorting (AC: #1)
  - [ ] Subtask 5.1: Create `useRecentlyChatted.ts` composable that tracks message authors
  - [ ] Subtask 5.2: Export `recentlyChattedUserIds: Ref<string[]>` updated on each new message
  - [ ] Subtask 5.3: Sort autocomplete list: users in `recentlyChattedUserIds` first (by recency), then alphabetically

- [ ] Task 6: Integrate autocomplete into ChatInput (AC: #1, #2, #3, #4, #5)
  - [ ] Subtask 6.1: Add ref for tracking `@` trigger position and query text
  - [ ] Subtask 6.2: On input, detect `@` character and show autocomplete popup
  - [ ] Subtask 6.3: Extract query text after `@` until space or end
  - [ ] Subtask 6.4: Position popup above or below cursor (based on available space)
  - [ ] Subtask 6.5: On select, replace `@query` with `@Selected Name ` (with trailing space)
  - [ ] Subtask 6.6: Close autocomplete on: select, Escape, click outside, space after `@`

- [ ] Task 7: Highlight mentions in ChatMessage rendering (AC: #7)
  - [ ] Subtask 7.1: Create `apps/web/src/lib/highlightMentions.ts` with `highlightMentions(content: string, mentionedUserIds: string[], currentUserId: string): string`
  - [ ] Subtask 7.2: If current user is in `mentionedUserIds`, wrap `@YourName` in `<span class="mention-highlight">` with pill styling
  - [ ] Subtask 7.3: For all other mentions, wrap in `<span class="mention">` with subtle styling
  - [ ] Subtask 7.4: Update `ChatMessage.vue` to apply `highlightMentions` before markdown rendering
  - [ ] Subtask 7.5: Add CSS for `.mention-highlight` (bright background, pill, bold) and `.mention` (subtle background)

- [ ] Task 8: Implement titlebar flash on mention (AC: #8)
  - [ ] Subtask 8.1: Create `apps/web/src/composables/useTitlebarFlash.ts`
  - [ ] Subtask 8.2: Store original document.title on mount
  - [ ] Subtask 8.3: Export `flashTitlebar(message: string)` function
  - [ ] Subtask 8.4: On flash, set `document.title = message` only if `document.hidden` is true
  - [ ] Subtask 8.5: Listen to `visibilitychange` event to restore original title when tab becomes visible
  - [ ] Subtask 8.6: Clear flash state on restore

- [ ] Task 9: Wire titlebar flash to incoming mentions (AC: #8)
  - [ ] Subtask 9.1: In `useWebSocket.ts` or `ChatPanel.vue`, check incoming `chat:message` for current user in `mentionedUserIds`
  - [ ] Subtask 9.2: If mentioned and `document.hidden`, call `flashTitlebar('mentioned you! • ManlyCam')`
  - [ ] Subtask 9.3: Ensure original title is stored before first flash (handle initial page state)

- [ ] Task 10: Update tests for mentions (AC: All)
  - [ ] Subtask 10.1: Create `apps/server/src/lib/mentions.test.ts` — test `parseMentions` with various patterns
  - [ ] Subtask 10.2: Update `chatService.test.ts` — verify `mentionedUserIds` is populated on message create
  - [ ] Subtask 10.3: Create `MentionAutocomplete.test.ts` — test filtering, keyboard nav, selection
  - [ ] Subtask 10.4: Update `ChatInput.test.ts` — test @ trigger detection, popup show/hide
  - [ ] Subtask 10.5: Create `highlightMentions.test.ts` — test current user highlighting vs others
  - [ ] Subtask 10.6: Create `useTitlebarFlash.test.ts` — test flash on hidden, restore on visible

- [ ] Task 11: Visual and accessibility verification (AC: All)
  - [ ] Subtask 11.1: Manual test: type @, verify all viewers appear sorted by recent chat
  - [ ] Subtask 11.2: Manual test: type @John, verify filtering works with space-removed matching
  - [ ] Subtask 11.3: Manual test: arrow keys navigate, Enter/Tab select, Escape closes
  - [ ] Subtask 11.4: Manual test: send message with @mention, verify highlighting for mentioned user
  - [ ] Subtask 11.5: Manual test: switch to another tab, get mentioned, verify titlebar flash
  - [ ] Subtask 11.6: Accessibility: verify autocomplete has `role="listbox"` and options have `role="option"`

## Dev Notes

### Architecture and Patterns

- **Mention format:** Mentions are stored in plain text as `@Full Name` (e.g., `@John Smith`). No special syntax or IDs in the message content — parsing happens server-side by matching against known user names.
- **Space-removed matching:** "John Smith" matches `@johnsmith`, `@JohnSmith`, `@johns`, etc. The match is case-insensitive and ignores spaces in the display name.
- **Autocomplete position:** The popup should appear near the cursor position. Use `selectionStart` on the textarea to determine cursor position, then calculate pixel offset.
- **Most recently chatted:** Track the order of users who sent messages (from `useChat.messages`). When a user sends a message, add their ID to the front of a "recent chatters" list (deduplicated, max ~20 entries).

### Mention Parsing Strategy (Server-side)

```typescript
// apps/server/src/lib/mentions.ts
import type { UserPresence } from '@manlycam/types';

export function parseMentions(content: string, viewers: UserPresence[]): string[] {
  // Match @word or @WordWord (no spaces in the @mention itself)
  const mentionPattern = /@(\w+)/gi;
  const matches = content.matchAll(mentionPattern);

  const mentionedIds = new Set<string>();

  for (const match of matches) {
    const query = match[1].toLowerCase();

    for (const viewer of viewers) {
      // Remove spaces from display name for matching
      const normalizedName = viewer.displayName.replace(/\s+/g, '').toLowerCase();

      if (normalizedName.startsWith(query)) {
        mentionedIds.add(viewer.id);
        break; // Only match the first user for this query
      }
    }
  }

  return Array.from(mentionedIds);
}
```

### Mention Highlighting (Client-side)

```typescript
// apps/web/src/lib/highlightMentions.ts
export function highlightMentions(
  content: string,
  mentionedUserIds: string[],
  currentUserId: string,
  viewers: UserPresence[],
): string {
  let result = content;

  // Sort viewers by name length (longest first) to avoid partial replacements
  const sorted = [...viewers].sort((a, b) => b.displayName.length - a.displayName.length);

  for (const viewer of sorted) {
    if (!mentionedUserIds.includes(viewer.id)) continue;

    const normalizedName = viewer.displayName.replace(/\s+/g, '');
    const pattern = new RegExp(`@${normalizedName}`, 'gi');

    if (viewer.id === currentUserId) {
      // Highlight for current user
      result = result.replace(
        pattern,
        `<span class="mention-highlight">@${viewer.displayName}</span>`,
      );
    } else {
      // Subtle styling for other mentions
      result = result.replace(pattern, `<span class="mention">@${viewer.displayName}</span>`);
    }
  }

  return result;
}
```

### Titlebar Flash Implementation

```typescript
// apps/web/src/composables/useTitlebarFlash.ts
import { ref, onMounted, onUnmounted } from 'vue';

const originalTitle = ref(document.title);
let isFlashing = false;

export function useTitlebarFlash() {
  function flashTitlebar(message: string): void {
    if (!document.hidden || isFlashing) return;
    isFlashing = true;
    document.title = message;
  }

  function restoreTitle(): void {
    if (isFlashing) {
      document.title = originalTitle.value;
      isFlashing = false;
    }
  }

  function handleVisibilityChange(): void {
    if (!document.hidden) {
      restoreTitle();
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  return { flashTitlebar, restoreTitle };
}
```

### CSS Styles for Mentions

```css
/* Add to ChatMessage.vue <p> element or main.css */
.mention {
  background-color: hsl(var(--muted));
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-weight: 500;
}

.mention-highlight {
  background-color: hsl(var(--primary) / 0.2);
  color: hsl(var(--primary));
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-weight: 600;
}
```

### Autocomplete Positioning

```typescript
// In ChatInput.vue, calculate popup position
function getCursorPosition(): { top: number; left: number } {
  const textarea = textareaRef.value;
  if (!textarea) return { top: 0, left: 0 };

  // Create a hidden div to measure text position
  const div = document.createElement('div');
  const style = window.getComputedStyle(textarea);

  // Copy textarea styles to div
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.width = style.width;
  div.style.font = style.font;
  div.style.padding = style.padding;
  div.style.border = style.border;

  div.textContent = textarea.value.substring(0, textarea.selectionStart);
  document.body.appendChild(div);

  const span = document.createElement('span');
  span.textContent = '|';
  div.appendChild(span);

  const rect = textarea.getBoundingClientRect();
  const position = {
    top: rect.top + span.offsetTop + parseInt(style.lineHeight) - textarea.scrollTop,
    left: rect.left + span.offsetLeft,
  };

  document.body.removeChild(div);
  return position;
}
```

### Source Tree Components to Touch

**Files to create:**

- `apps/server/src/lib/mentions.ts` — Server-side mention parsing
- `apps/server/src/lib/mentions.test.ts` — Tests for mention parsing
- `apps/web/src/components/chat/MentionAutocomplete.vue` — Autocomplete popup component
- `apps/web/src/components/chat/MentionAutocomplete.test.ts` — Autocomplete tests
- `apps/web/src/composables/useRecentlyChatted.ts` — Track recently chatted users
- `apps/web/src/composables/useTitlebarFlash.ts` — Titlebar flash behavior
- `apps/web/src/lib/highlightMentions.ts` — Client-side mention highlighting
- `apps/web/src/lib/highlightMentions.test.ts` — Highlighting tests

**Files to modify:**

- `apps/server/prisma/schema.prisma` — Add `mentionedUserIds` to Message model
- `packages/types/src/ws.ts` — Add `mentionedUserIds: string[]` to ChatMessage
- `apps/server/src/services/chatService.ts` — Parse and store mentions
- `apps/server/src/services/chatService.test.ts` — Test mention storage
- `apps/web/src/components/chat/ChatInput.vue` — Integrate autocomplete
- `apps/web/src/components/chat/ChatInput.test.ts` — Test @ trigger
- `apps/web/src/components/chat/ChatMessage.vue` — Highlight mentions
- `apps/web/src/composables/useChat.ts` — Expose messages for recent chat tracking
- `apps/web/src/composables/usePresence.ts` — Ensure viewers accessible

**Files NOT to touch:**

- `apps/web/src/composables/useWebSocket.ts` — No changes needed (message handling stays in ChatPanel)
- Server routes — No new endpoints needed

### Database Migration

```sql
-- Add mentionedUserIds to messages table
ALTER TABLE messages ADD COLUMN mentioned_user_ids TEXT[] DEFAULT '{}';

-- Create index for faster lookups (optional, for Story 8-3)
-- CREATE INDEX idx_messages_mentioned_user_ids ON messages USING GIN(mentioned_user_ids);
```

### Testing Standards

- **Coverage threshold:** Maintain existing threshold
- **Test patterns:**
  - Server: Test `parseMentions` with various @mention patterns
  - Client: Test autocomplete filtering, keyboard navigation, selection
  - Client: Test highlighting for current user vs other users
  - Client: Test titlebar flash only triggers when `document.hidden`

### Edge Cases to Handle

1. **Multiple mentions:** A message can mention multiple users (`@John @Jane`)
2. **Self-mention:** User can mention themselves (highlighted for them)
3. **Partial name match:** `@John` matches "John Smith" but not "Johnny"
4. **No matching user:** `@UnknownUser` is ignored (not highlighted, not stored)
5. **Mention at end of message:** Autocomplete should still work
6. **Mention in edit:** Edited messages should re-parse mentions (future consideration)
7. **Tab focus/blur race:** Titlebar flash should only happen if tab is hidden at message arrival

### References

- [Source: epics.md#Story 8-2] — Original story requirements
- [Source: apps/web/src/composables/usePresence.ts] — Viewers list source
- [Source: apps/web/src/composables/useChat.ts] — Messages for recent chat tracking
- [Source: apps/server/src/services/wsHub.ts:82-99] — `getPresenceList()` method
- [Source: apps/web/src/components/chat/ChatInput.vue] — Autocomplete integration point
- [Source: apps/web/src/components/chat/ChatMessage.vue] — Mention highlighting point

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
