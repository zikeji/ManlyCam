# Story 8-6: Message Reactions

Status: ready-for-dev

## Story

As an **authorized viewer**,
I want to react to chat messages with emojis and see others' reactions,
So that I can express my feelings about a message without typing a response.

## Acceptance Criteria

1. **Given** a user hovers over or long-presses a chat message, **When** the reaction UI appears, **Then** a quick reaction bar displays with commonly used emojis and an option to open the full emoji picker.

2. **Given** a user clicks a quick reaction emoji or selects one from the full picker, **When** the reaction is added, **Then** the emoji appears below the message with a count (or the count increments if already present).

3. **Given** a message has existing reactions, **When** rendered, **Then** each unique emoji displays with its count, sorted oldest reaction first (to prevent UI jumping during interaction).

4. **Given** a user clicks on an existing reaction emoji they previously added, **When** the click is processed, **Then** their reaction is removed and the count decrements (or emoji removed if count reaches 0).

5. **Given** a user clicks on an existing reaction emoji they did NOT add, **When** the click is processed, **Then** their reaction is added (toggles on) and the count increments.

6. **Given** a moderator or admin hovers over a reaction, **When** the reaction detail tooltip appears, **Then** it includes an option to remove the reaction (moderation capability).

7. **Given** a muted user views a message with reactions, **When** the message renders, **Then** existing reaction buttons appear disabled (visible but non-interactive) and the add reaction UI is disabled.

8. **Given** a user adds or removes a reaction, **When** the action completes, **Then** the change is broadcast to all connected clients via WebSocket in real-time.

9. **And** the emoji picker component from Story 8-5 is reused for the full picker option.

10. **And** quick reaction bar includes 6 common emojis: 👍 👎 😂 ❤️ 😮 😢.

## Tasks / Subtasks

- [ ] Task 1: Add Reaction model to Prisma schema (AC: #2, #3)
  - [ ] Subtask 1.1: Add `Reaction` model with `id`, `messageId`, `userId`, `emoji`, `createdAt`
  - [ ] Subtask 1.2: Add relation from `Message` to `Reaction[]`
  - [ ] Subtask 1.3: Add unique constraint on `[messageId, userId, emoji]` to prevent duplicate reactions
  - [ ] Subtask 1.4: Run `pnpm prisma migrate dev --name add-message-reactions`

- [ ] Task 2: Add Reaction types to packages/types (AC: #2, #8)
  - [ ] Subtask 2.1: Add `MessageReaction` interface to `packages/types/src/ws.ts`
  - [ ] Subtask 2.2: Add `Reaction` type with `emoji: string`, `count: number`, `userReacted: boolean`, `userIds: string[]`
  - [ ] Subtask 2.3: Add `ChatMessage.reactions: Reaction[]` field (optional, may be computed)
  - [ ] Subtask 2.4: Add `reaction:add` and `reaction:remove` WebSocket message types

- [ ] Task 3: Create reactions service (AC: #2, #4, #5)
  - [ ] Subtask 3.1: Create `apps/server/src/services/reactionsService.ts`
  - [ ] Subtask 3.2: Implement `addReaction(messageId, userId, emoji)` — creates reaction or returns existing
  - [ ] Subtask 3.3: Implement `removeReaction(messageId, userId, emoji)` — deletes reaction
  - [ ] Subtask 3.4: Implement `removeReactionByMod(messageId, userId, emoji, modId)` — mod removal with audit log
  - [ ] Subtask 3.5: Implement `getReactionsForMessage(messageId)` — returns grouped reactions with counts

- [ ] Task 4: Add reactions API routes (AC: #2, #4, #5, #6)
  - [ ] Subtask 4.1: Create `apps/server/src/routes/reactions.ts`
  - [ ] Subtask 4.2: `POST /api/messages/:messageId/reactions` — add reaction
  - [ ] Subtask 4.3: `DELETE /api/messages/:messageId/reactions/:emoji` — remove own reaction
  - [ ] Subtask 4.4: `DELETE /api/messages/:messageId/reactions/:emoji/users/:userId` — mod remove reaction
  - [ ] Subtask 4.5: Mount routes in `apps/server/src/index.ts`

- [ ] Task 5: Wire reaction WebSocket broadcasts (AC: #8)
  - [ ] Subtask 5.1: On `addReaction`, broadcast `reaction:add` with messageId, userId, emoji, displayName
  - [ ] Subtask 5.2: On `removeReaction`, broadcast `reaction:remove` with messageId, userId, emoji
  - [ ] Subtask 5.3: Include reaction data in `chat:message` WebSocket payload (initial reactions array)

- [ ] Task 6: Create ReactionBar Vue component (AC: #1, #10)
  - [ ] Subtask 6.1: Create `apps/web/src/components/chat/ReactionBar.vue`
  - [ ] Subtask 6.2: Display 6 quick reaction emojis: 👍 👎 😂 ❤️ 😮 😢
  - [ ] Subtask 6.3: Add "More" button that opens EmojiPicker
  - [ ] Subtask 6.4: Style as horizontal bar with emoji buttons
  - [ ] Subtask 6.5: Show on message hover (desktop) or long-press (mobile)

- [ ] Task 7: Create ReactionDisplay Vue component (AC: #2, #3, #4, #5)
  - [ ] Subtask 7.1: Create `apps/web/src/components/chat/ReactionDisplay.vue`
  - [ ] Subtask 7.2: Accept `reactions: Reaction[]`, `currentUserId`, `canModerate`, `isMuted` props
  - [ ] Subtask 7.3: Render reactions as emoji + count badges, sorted by first reaction time
  - [ ] Subtask 7.4: Highlight reactions user has added (different background)
  - [ ] Subtask 7.5: On click: toggle reaction (add if not present, remove if present)
  - [ ] Subtask 7.6: For muted users: disable clicks (no pointer events)
  - [ ] Subtask 7.7: For mods: show remove option in tooltip on hover

- [ ] Task 8: Integrate reactions into ChatMessage (AC: #1, #7)
  - [ ] Subtask 8.1: Add `ReactionBar` component to `ChatMessage.vue` (appears on hover)
  - [ ] Subtask 8.2: Add `ReactionDisplay` component below message content
  - [ ] Subtask 8.3: Pass `isMuted` prop to disable reaction UI
  - [ ] Subtask 8.4: Handle `reaction:add` and `reaction:remove` WebSocket messages
  - [ ] Subtask 8.5: Update local message state with reaction changes

- [ ] Task 9: Create useReactions composable (AC: #4, #5, #8)
  - [ ] Subtask 9.1: Create `apps/web/src/composables/useReactions.ts`
  - [ ] Subtask 9.2: Export `addReaction(messageId, emoji)`, `removeReaction(messageId, emoji)`
  - [ ] Subtask 9.3: Export `handleReactionAdd(payload)`, `handleReactionRemove(payload)` for WS
  - [ ] Subtask 9.4: Update message reactions array in local state

- [ ] Task 10: Update tests (AC: All)
  - [ ] Subtask 10.1: Create `reactionsService.test.ts` — test add, remove, duplicate prevention
  - [ ] Subtask 10.2: Create `reactions.test.ts` (route) — test API endpoints
  - [ ] Subtask 10.3: Create `ReactionBar.test.ts` — test quick reactions and picker trigger
  - [ ] Subtask 10.4: Create `ReactionDisplay.test.ts` — test toggle, mod remove, muted user
  - [ ] Subtask 10.5: Update `ChatMessage.test.ts` — test reaction UI presence

- [ ] Task 11: Visual and accessibility verification (AC: All)
  - [ ] Subtask 11.1: Manual test: hover message, verify reaction bar appears
  - [ ] Subtask 11.2: Manual test: click quick reaction, verify it appears below message
  - [ ] Subtask 11.3: Manual test: click existing reaction, verify it toggles off
  - [ ] Subtask 11.4: Manual test: as muted user, verify reactions are disabled
  - [ ] Subtask 11.5: Manual test: as mod, hover reaction, verify remove option
  - [ ] Subtask 11.6: Accessibility: verify reaction buttons have `aria-label` with count

## Dev Notes

### Architecture and Patterns

- **Emoji storage:** Reactions store the emoji shortcode (e.g., `:+1:`, `:heart:`) to match the emoji system from Story 8-5.
- **Reaction uniqueness:** A user can only have one reaction per emoji per message. Unique constraint on `[messageId, userId, emoji]` enforces this.
- **Oldest-first sorting:** Reactions are sorted by the earliest `createdAt` for that emoji on that message. This prevents UI jumping when new reactions are added.
- **Moderation:** Mods/admins can remove any user's reaction. This is logged in the audit log.
- **Muted users:** Cannot add reactions. Existing reaction buttons are visible but disabled (grayed out, no pointer events).

### Database Schema

```prisma
model Reaction {
  id        String   @id @db.Char(26)
  messageId String   @map("message_id") @db.Char(26)
  userId    String   @map("user_id") @db.Char(26)
  emoji     String   // Stored as shortcode, e.g., "+1", "heart"
  createdAt DateTime @default(now()) @db.Timestamptz @map("created_at")

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([messageId, userId, emoji])
  @@index([messageId])
  @@map("reactions")
}

// Add to Message model
model Message {
  // ... existing fields
  reactions Reaction[]
}

// Add to User model
model User {
  // ... existing fields
  reactions Reaction[]
}
```

### Types

```typescript
// packages/types/src/ws.ts

export interface Reaction {
  emoji: string; // Shortcode, e.g., "+1", "heart"
  count: number;
  userReacted: boolean; // Whether current user has this reaction
  firstReactedAt: string; // ISO timestamp of first reaction (for sorting)
}

export interface ReactionPayload {
  messageId: string;
  userId: string;
  displayName: string;
  emoji: string;
  createdAt: string;
}

// Add to WsMessage union
export type WsMessage =
  | { type: 'reaction:add'; payload: ReactionPayload }
  | { type: 'reaction:remove'; payload: { messageId: string; userId: string; emoji: string } };
// ... existing types
```

### Reactions Service

```typescript
// apps/server/src/services/reactionsService.ts
import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';
import { wsHub } from './wsHub.js';
import { AppError } from '../lib/errors.js';
import type { Reaction, ReactionPayload } from '@manlycam/types';

export async function addReaction(params: {
  messageId: string;
  userId: string;
  emoji: string; // shortcode without colons, e.g., "+1"
}): Promise<ReactionPayload> {
  const { messageId, userId, emoji } = params;

  // Check message exists
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { user: true },
  });
  if (!message || message.deletedAt) {
    throw new AppError('Message not found', 'NOT_FOUND', 404);
  }

  // Check if user is muted
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.mutedAt) {
    throw new AppError('Cannot react while muted', 'FORBIDDEN', 403);
  }

  // Upsert reaction (unique constraint handles duplicates)
  const reaction = await prisma.reaction.upsert({
    where: {
      messageId_userId_emoji: { messageId, userId, emoji },
    },
    update: {}, // No-op if exists
    create: {
      id: ulid(),
      messageId,
      userId,
      emoji,
    },
    include: { user: true },
  });

  const payload: ReactionPayload = {
    messageId,
    userId,
    displayName: reaction.user.displayName,
    emoji,
    createdAt: reaction.createdAt.toISOString(),
  };

  wsHub.broadcast({ type: 'reaction:add', payload });

  return payload;
}

export async function removeReaction(params: {
  messageId: string;
  userId: string;
  emoji: string;
}): Promise<void> {
  const { messageId, userId, emoji } = params;

  await prisma.reaction.deleteMany({
    where: { messageId, userId, emoji },
  });

  wsHub.broadcast({
    type: 'reaction:remove',
    payload: { messageId, userId, emoji },
  });
}

export async function removeReactionByMod(params: {
  messageId: string;
  targetUserId: string;
  emoji: string;
  modId: string;
}): Promise<void> {
  const { messageId, targetUserId, emoji, modId } = params;

  await prisma.reaction.deleteMany({
    where: { messageId, userId: targetUserId, emoji },
  });

  await prisma.auditLog.create({
    data: {
      id: ulid(),
      action: 'reaction_remove',
      actorId: modId,
      targetId: `${messageId}:${targetUserId}:${emoji}`,
    },
  });

  wsHub.broadcast({
    type: 'reaction:remove',
    payload: { messageId, userId: targetUserId, emoji },
  });
}

export async function getReactionsForMessage(messageId: string): Promise<Reaction[]> {
  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    orderBy: { createdAt: 'asc' },
  });

  // Group by emoji
  const grouped = new Map<string, { count: number; firstAt: Date; userIds: string[] }>();

  for (const r of reactions) {
    const existing = grouped.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.userIds.push(r.userId);
    } else {
      grouped.set(r.emoji, {
        count: 1,
        firstAt: r.createdAt,
        userIds: [r.userId],
      });
    }
  }

  // Convert to Reaction[] sorted by first reaction time
  return Array.from(grouped.entries())
    .map(([emoji, data]) => ({
      emoji,
      count: data.count,
      firstReactedAt: data.firstAt.toISOString(),
    }))
    .sort((a, b) => new Date(a.firstReactedAt).getTime() - new Date(b.firstReactedAt).getTime());
}
```

### ReactionBar Component

```vue
<!-- apps/web/src/components/chat/ReactionBar.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { EMOJI_MAP } from '@/lib/emoji-data';
import EmojiPicker from './EmojiPicker.vue';
import type { Emoji } from '@/lib/emoji-data';

const QUICK_REACTIONS = ['thumbs_up', 'thumbs_down', 'joy', 'heart', 'open_mouth', 'cry'];

const props = defineProps<{
  visible: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  select: [emoji: string]; // shortcode without colons
}>();

const showPicker = ref(false);

function getEmojiUrl(shortcode: string): string {
  const emoji = EMOJI_MAP.get(shortcode);
  if (!emoji) return '';
  return `https://emoji.fluent-cdn.com/latest/svg/${emoji.codepoint}.svg`;
}

function handleQuickReaction(shortcode: string) {
  emit('select', shortcode);
}

function handlePickerSelect(emoji: Emoji) {
  emit('select', emoji.name);
  showPicker.value = false;
}
</script>

<template>
  <div v-if="visible" class="reaction-bar">
    <button
      v-for="shortcode in QUICK_REACTIONS"
      :key="shortcode"
      :disabled="disabled"
      class="reaction-quick-btn"
      @click="handleQuickReaction(shortcode)"
    >
      <img :src="getEmojiUrl(shortcode)" :alt="shortcode" class="emoji-img" />
    </button>
    <button :disabled="disabled" class="reaction-more-btn" @click="showPicker = !showPicker">
      <EmojiPicker :visible="showPicker" @select="handlePickerSelect" @close="showPicker = false" />
      <span>+</span>
    </button>
  </div>
</template>

<style scoped>
.reaction-bar {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--background);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.reaction-quick-btn,
.reaction-more-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
}

.reaction-quick-btn:hover,
.reaction-more-btn:hover {
  background: var(--accent);
}

.reaction-quick-btn:disabled,
.reaction-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
```

### ReactionDisplay Component

```vue
<!-- apps/web/src/components/chat/ReactionDisplay.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import type { Reaction } from '@manlycam/types';
import { EMOJI_MAP } from '@/lib/emoji-data';

const props = defineProps<{
  reactions: Reaction[];
  currentUserId: string;
  canModerate?: boolean;
  isMuted?: boolean;
}>();

const emit = defineEmits<{
  toggle: [emoji: string];
  remove: [emoji: string, userId: string]; // mod removal
}>();

function getEmojiUrl(shortcode: string): string {
  const emoji = EMOJI_MAP.get(shortcode);
  if (!emoji) return '';
  return `https://emoji.fluent-cdn.com/latest/svg/${emoji.codepoint}.svg`;
}

function handleClick(reaction: Reaction) {
  if (props.isMuted) return;
  emit('toggle', reaction.emoji);
}

function getUserReacted(emoji: string): boolean {
  return props.reactions.find((r) => r.emoji === emoji)?.userReacted ?? false;
}
</script>

<template>
  <div v-if="reactions.length > 0" class="reaction-display">
    <button
      v-for="reaction in reactions"
      :key="reaction.emoji"
      :class="['reaction-badge', { 'user-reacted': reaction.userReacted, disabled: isMuted }]"
      :disabled="isMuted"
      @click="handleClick(reaction)"
    >
      <img :src="getEmojiUrl(reaction.emoji)" :alt="reaction.emoji" class="emoji-img" />
      <span class="reaction-count">{{ reaction.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.reaction-display {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.reaction-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--background);
  cursor: pointer;
  font-size: 12px;
}

.reaction-badge:hover {
  background: var(--accent);
}

.reaction-badge.user-reacted {
  background: var(--primary);
  border-color: var(--primary);
}

.reaction-badge.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.reaction-count {
  font-weight: 500;
}
</style>
```

### Integrating into ChatMessage

```vue
<!-- In ChatMessage.vue, add below the message content -->
<script setup lang="ts">
// ... existing imports
import ReactionBar from './ReactionBar.vue';
import ReactionDisplay from './ReactionDisplay.vue';
import { useReactions } from '@/composables/useReactions';

const { addReaction, removeReaction } = useReactions();

const showReactionBar = ref(false);
let longPressTimer: ReturnType<typeof setTimeout> | null = null;

function handleReactionStart() {
  if (props.isAuthorMuted) return;
  longPressTimer = setTimeout(() => {
    showReactionBar.value = true;
  }, 500); // 500ms long-press
}

function handleReactionEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

async function handleReactionToggle(emoji: string) {
  showReactionBar.value = false;
  const reaction = props.message.reactions?.find((r) => r.emoji === emoji);
  if (reaction?.userReacted) {
    await removeReaction(props.message.id, emoji);
  } else {
    await addReaction(props.message.id, emoji);
  }
}
</script>

<template>
  <!-- ... existing message content ... -->

  <!-- Reaction bar (hover/long-press) -->
  <ReactionBar
    v-if="showReactionBar"
    :visible="showReactionBar"
    :disabled="isAuthorMuted"
    @select="handleReactionToggle"
    @mouseleave="showReactionBar = false"
  />

  <!-- Existing reactions -->
  <ReactionDisplay
    v-if="message.reactions && message.reactions.length > 0"
    :reactions="message.reactions"
    :current-user-id="currentUserId"
    :can-moderate="canModerate"
    :is-muted="isAuthorMuted"
    @toggle="handleReactionToggle"
  />
</template>
```

### useReactions Composable

```typescript
// apps/web/src/composables/useReactions.ts
import { apiFetch } from '@/lib/api';
import { messages } from './useChat';
import type { Reaction, ReactionPayload } from '@manlycam/types';

export function useReactions() {
  async function addReaction(messageId: string, emoji: string): Promise<void> {
    await apiFetch(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
  }

  async function removeReaction(messageId: string, emoji: string): Promise<void> {
    await apiFetch(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
    });
  }

  function handleReactionAdd(payload: ReactionPayload): void {
    const messageIndex = messages.value.findIndex((m) => m.id === payload.messageId);
    if (messageIndex === -1) return;

    const message = messages.value[messageIndex];
    const reactions = message.reactions || [];

    const existingReaction = reactions.find((r) => r.emoji === payload.emoji);
    if (existingReaction) {
      existingReaction.count++;
    } else {
      reactions.push({
        emoji: payload.emoji,
        count: 1,
        firstReactedAt: payload.createdAt,
      });
    }

    messages.value[messageIndex] = { ...message, reactions };
  }

  function handleReactionRemove(payload: {
    messageId: string;
    userId: string;
    emoji: string;
  }): void {
    const messageIndex = messages.value.findIndex((m) => m.id === payload.messageId);
    if (messageIndex === -1) return;

    const message = messages.value[messageIndex];
    let reactions = message.reactions || [];

    const existingReaction = reactions.find((r) => r.emoji === payload.emoji);
    if (existingReaction) {
      existingReaction.count--;
      if (existingReaction.count <= 0) {
        reactions = reactions.filter((r) => r.emoji !== payload.emoji);
      }
    }

    messages.value[messageIndex] = { ...message, reactions };
  }

  return {
    addReaction,
    removeReaction,
    handleReactionAdd,
    handleReactionRemove,
  };
}
```

### Source Tree Components to Touch

**Files to create:**

- `apps/server/src/services/reactionsService.ts` — Reactions business logic
- `apps/server/src/routes/reactions.ts` — Reactions API routes
- `apps/web/src/components/chat/ReactionBar.vue` — Quick reaction bar
- `apps/web/src/components/chat/ReactionDisplay.vue` — Reaction badges display
- `apps/web/src/composables/useReactions.ts` — Reactions state management

**Files to modify:**

- `apps/server/prisma/schema.prisma` — Add Reaction model
- `packages/types/src/ws.ts` — Add Reaction types and WS messages
- `apps/server/src/index.ts` — Mount reactions routes
- `apps/server/src/services/chatService.ts` — Include reactions in message payload
- `apps/web/src/components/chat/ChatMessage.vue` — Integrate reaction UI
- `apps/web/src/composables/useWebSocket.ts` or `WatchView.vue` — Handle reaction WS messages

### Quick Reaction Emojis

| Emoji | Shortcode   | Unicode | Fluent URL |
| ----- | ----------- | ------- | ---------- |
| 👍    | thumbs_up   | 1f44d   | 1f44d.svg  |
| 👎    | thumbs_down | 1f44e   | 1f44e.svg  |
| 😂    | joy         | 1f602   | 1f602.svg  |
| ❤️    | heart       | 2764    | 2764.svg   |
| 😮    | open_mouth  | 1f62e   | 1f62e.svg  |
| 😢    | cry         | 1f622   | 1f622.svg  |

### Testing Standards

- **Add reaction:** Test that clicking an emoji adds it to the message
- **Remove reaction:** Test that clicking own reaction removes it
- **Duplicate prevention:** Test that adding same emoji twice doesn't create duplicate
- **Sort order:** Test that reactions are sorted by first reaction time
- **Muted user:** Test that muted users cannot add reactions and see disabled UI
- **Mod removal:** Test that mods can remove others' reactions
- **WebSocket sync:** Test that reaction changes are broadcast to all clients

### References

- [Source: epics.md#Story 8-6] — Original story requirements
- [Source: apps/web/src/components/chat/ChatMessage.vue] — Integration point
- [Source: apps/web/src/lib/emoji-data.ts] — Emoji data from Story 8-5
- [Source: Story 8-5] — EmojiPicker component reuse

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
