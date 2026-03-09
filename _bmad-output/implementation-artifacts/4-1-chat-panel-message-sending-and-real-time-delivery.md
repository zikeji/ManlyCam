# Story 4.1: Chat Panel, Message Sending, and Real-Time Delivery

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **authorized viewer**,
I want to send messages in the chat sidebar and see everyone else's messages appear instantly,
so that watching Manly becomes a shared social moment with coworkers.

## Acceptance Criteria

1. **Message sending — composable abstraction**
   - A `<ChatInput>` textarea sends messages via `sendChatMessage(content)` from `useChat.ts` — the component never calls `ws.send()` directly
   - `Enter` key sends; `Shift+Enter` inserts a newline
   - The send button is disabled and no message is sent when the textarea is empty
   - Message content is capped at 1000 characters; a character counter appears once 800+ characters are typed

2. **Server persists and broadcasts**
   - `POST /api/chat/messages` authenticates the sender, inserts a `messages` row with a server-generated ULID, `user_id`, `content`, and `created_at`, then broadcasts `{ type: 'chat:message', payload: ChatMessage }` to **all** connected WS clients including the sender

3. **Real-time display**
   - When a `chat:message` WS event arrives at the client, `useChat.ts` handles it (not the component directly)
   - The message appears at the bottom of `<ChatPanel>`'s scroll area without a page refresh
   - The scroll area auto-scrolls to the bottom when a new message is appended

4. **Markdown-lite rendering**
   - Bold (`**text**`), inline code (`` `text` ``), and links (`[label](url)`) are rendered as HTML inside `<ChatMessage>`
   - No other markdown elements are required at MVP
   - Links must open in a new tab (`target="_blank" rel="noopener noreferrer"`) and `javascript:` URLs must be rejected silently

5. **Empty chat state**
   - When no messages exist, the scroll area shows the centred text: `"Be the first to say something 👋"`

6. **Layout — desktop (≥ lg, 1024px)**
   - `WatchView.vue` replaces the `<!-- Story 4.x: ChatPanel here -->` placeholder with `<ChatPanel />`
   - The right sidebar (`w-[320px]`, fixed-width) renders beside the stream in the existing three-column layout
   - No collapse toggle in this story — Story 4-4 adds `|→` / `←|` and the unread badge

7. **Layout — mobile portrait (< lg)**
   - `WatchView.vue` outer container changes to `flex-col` on mobile, `flex-row` on `lg+`
   - Stream (`<StreamPlayer>`) uses `aspect-video w-full` on mobile (16:9, full-width, anchored top), `flex-1` on desktop
   - Chat fills the remaining vertical space below the stream on mobile (no right-column sidebar)
   - `ProfileAnchor` is hidden from the stream overlay on mobile (moved to the chat input bar — see below)
   - Mobile input bar layout: `[ProfileAnchor] [ChatInput textarea] [Send button]` — the avatar opens the full existing profile popover (including Camera Controls for admin users)
   - `ChatPanel` emits `openCameraControls` so `WatchView` can forward it to the Sheet drawer
   - Mobile landscape orientation is deferred to Story 4-4 (involves the collapsible right-panel pattern)

8. **Tab strip shell (Chat + Viewers placeholder)**
   - `<ChatPanel>` renders a tab strip with a "Chat" tab and a "Viewers" tab
   - "Viewers" tab is visible but its content is a stub/placeholder (`<!-- Story 4.6: presence list -->`)
   - "Chat" tab is active by default and shows the message list + input

9. **Tests**
   - `chatService.ts` — unit tests: createMessage persists to DB, returns ChatMessage shape, broadcasts via wsHub
   - `chat.ts` route — integration tests: POST 201 with valid body; POST 401 unauthenticated; POST 422 on empty/too-long content
   - `useChat.ts` — unit tests: sendChatMessage calls apiFetch; incoming `chat:message` WS events append to messages
   - `ChatInput.vue` — unit tests: Enter sends; Shift+Enter inserts newline; empty disables button; counter at 800+
   - `ChatMessage.vue` — unit tests: bold/code/links render correctly; `javascript:` URL is suppressed
   - `ChatPanel.vue` — unit tests: renders message list; shows empty state; tab strip present; mobile avatar slot renders

---

## Tasks / Subtasks

### Server

- [x] Task 1 — Create `apps/server/src/routes/chat.ts` with `POST /api/chat/messages` (AC: #2)
  - [x] Apply `requireAuth` middleware
  - [x] Validate `content`: non-empty string, max 1000 chars — return 422 on failure
  - [x] Call `chatService.createMessage({ userId, content })`
  - [x] Return 201 `{ message: ChatMessage }` on success
  - [x] Register route in `apps/server/src/app.ts` as `app.route('/', chatRouter)`

- [x] Task 2 — Create `apps/server/src/services/chatService.ts` (AC: #2)
  - [x] `createMessage(params: { userId: string; content: string }): Promise<ChatMessage>`
  - [x] Insert `messages` row using ULID from `apps/server/src/lib/ulid.ts`
  - [x] Join user row to get `displayName`, `avatarUrl`, `userTagText`, `userTagColor`, `role`
  - [x] Compute `userTag: UserTag | null` server-side (see userTag logic below)
  - [x] Broadcast `{ type: 'chat:message', payload: chatMessage }` via `wsHub.broadcast()`
  - [x] Return the full `ChatMessage` shape (matching `packages/types/src/ws.ts`)

### Client

- [x] Task 3 — Install ShadCN-Vue components needed for this story (AC: #7)
  - [x] `pnpm dlx shadcn-vue@latest add scroll-area` — for `<ScrollArea>` in chat panel
  - [x] `pnpm dlx shadcn-vue@latest add tabs` — for Chat / Viewers tab strip
  - [x] `pnpm dlx shadcn-vue@latest add textarea` — for chat input (if not already a raw HTML textarea per UX spec)

- [x] Task 4 — Create `apps/web/src/composables/useChat.ts` (AC: #1, #3)
  - [x] `messages: Ref<ChatMessage[]>` — module-level singleton (same pattern as `useStream`)
  - [x] `sendChatMessage(content: string): Promise<void>` — calls `POST /api/chat/messages` via `apiFetch`
  - [x] `handleChatMessage(msg: ChatMessage): void` — appends to `messages` (called by `useWebSocket`)
  - [x] Export: `{ messages, sendChatMessage, handleChatMessage }`

- [x] Task 5 — Update `apps/web/src/composables/useWebSocket.ts` to dispatch `chat:message` (AC: #3)
  - [x] In `handleMessage()`, add case: `if (msg.type === 'chat:message') useChat().handleChatMessage(msg.payload)`
  - [x] Import `useChat` — be careful of circular dependency; `useChat` must NOT import `useWebSocket`

- [x] Task 6 — Create `apps/web/src/components/chat/ChatMessage.vue` (AC: #4)
  - [x] Props: `message: ChatMessage`
  - [x] Renders: avatar (initials fallback), display name, timestamp (`2:14 PM` format, user's local timezone), content with markdown-lite
  - [x] Markdown-lite: implement as a regex-based pure function `renderMarkdownLite(text: string): string` — colocate in `apps/web/src/lib/markdown.ts`
  - [x] `javascript:` URL suppression in link rendering
  - [x] Each message group: `role="listitem"`
  - [x] Note: message grouping (continuation messages, same-sender) is **Story 4-3** — every message in this story shows full avatar + name

- [x] Task 7 — Create `apps/web/src/components/chat/ChatInput.vue` (AC: #1)
  - [x] `<textarea>` with placeholder `"Message ManlyCam…"`
  - [x] `Enter` → calls `emit('send', content)` and clears input; `Shift+Enter` → inserts newline
  - [x] Char counter: hidden until content length ≥ 800; shows `{n}/1000`
  - [x] Send button: `Button` variant `ghost` or `primary`; disabled when empty or content === ''
  - [x] Emits: `send(content: string)`
  - [x] `aria-label="Message ManlyCam"` on textarea

- [x] Task 8 — Create `apps/web/src/components/chat/ChatPanel.vue` (AC: #3, #5, #6, #7)
  - [x] Tab strip: `<Tabs default-value="chat">` with "Chat" and "Viewers" tabs
  - [x] Chat tab content: `<ScrollArea>` containing `role="log" aria-live="polite" aria-label="Chat messages"` message list
  - [x] Renders `<ChatMessage>` for each message in `useChat().messages`
  - [x] Empty state: `"Be the first to say something 👋"` when `messages.length === 0`
  - [x] Auto-scroll to bottom on new message (use `nextTick` + element ref `scrollTop = scrollHeight`)
  - [x] `<ChatInput>` at bottom; on `send` event calls `useChat().sendChatMessage(content)`
  - [x] Viewers tab content: `<!-- Story 4.6: presence list -->`

- [x] Task 9 — Update `apps/web/src/views/WatchView.vue` for responsive layout (AC: #6, #7)
  - [x] Change outer `div` from `flex` to `flex flex-col lg:flex-row`
  - [x] Stream `<main>`: add `lg:flex-1` and remove `flex-1`; on mobile it uses natural height from `StreamPlayer`'s `aspect-video`
  - [x] Replace `<aside data-sidebar-right>` with `<ChatPanel />` directly (no wrapping aside needed — ChatPanel owns its own layout)
  - [x] Import `<ChatPanel />` and add `@open-camera-controls="handleOpenCameraControls"` so mobile avatar popover can trigger the Sheet drawer
  - [x] Remove `<!-- Story 4.x: ChatPanel here -->` comment

- [x] Task 10 — Update `StreamPlayer.vue` to hide `ProfileAnchor` on mobile (AC: #7)
  - [x] The ProfileAnchor `div` at bottom-left changes from `v-if="user"` to `v-if="user && isDesktop"`
  - [x] This removes the hover-overlay avatar from mobile (it moves to `ChatPanel`'s input bar instead)
  - [x] No other changes to `StreamPlayer.vue`

- [x] Task 11 — Update `ChatPanel.vue` for mobile input bar with avatar (AC: #7)
  - [x] Add `emit('openCameraControls')` and forward from the `<ProfileAnchor>` inside the panel
  - [x] On mobile (`< lg`): render `<div class="flex items-center gap-2 p-2 border-t lg:hidden">` containing `<ProfileAnchor :isDesktop="false" @open-camera-controls="emit('openCameraControls')" />` + `<ChatInput class="flex-1" />`
  - [x] On desktop (`lg+`): render `<ChatInput />` standalone (no avatar prefix — it lives in the stream overlay)
  - [x] `ChatPanel` accepts no new props; reads user from `useAuth()` internally (same as `ProfileAnchor`)

- [x] Task 12 — Tests (AC: #9)
  - [x] `apps/server/src/services/chatService.test.ts`
  - [x] `apps/server/src/routes/chat.test.ts`
  - [x] `apps/web/src/composables/useChat.test.ts`
  - [x] `apps/web/src/lib/markdown.test.ts`
  - [x] `apps/web/src/components/chat/ChatInput.test.ts`
  - [x] `apps/web/src/components/chat/ChatMessage.test.ts`
  - [x] `apps/web/src/components/chat/ChatPanel.test.ts`
  - [x] `apps/web/src/views/WatchView.test.ts` — update for new layout structure (StreamPlayer `aspect-video` on mobile, ChatPanel present)

---

## Dev Notes

### UX Issues / Spec Improvements (User-Directed: Flag Anything That Could Improve)

> **⚠️ IMPORTANT:** The user has requested explicit flagging of UX spec gaps and improvement opportunities. Review these before implementing.

**Issue 1 — Mobile chat layout ✅ RESOLVED**
The UX spec describes mobile portrait as "persistent bottom chat bar below the stream." This is now scoped to Story 4-1:
- `WatchView.vue` layout changes to `flex-col` on mobile / `flex-row` on `lg+`
- Stream is `aspect-video w-full` (full-width, 16:9) anchored at top on mobile
- Chat fills remaining vertical space below stream
- `ProfileAnchor` moves from stream overlay to the chat input bar on mobile (sole access point for profile menu + Camera Controls for admin)
- Mobile landscape orientation deferred to Story 4-4 (involves collapsible right-panel)

**Issue 2 — UX spec "Optimistic UI" conflicts with Epic AC**
The UX spec (`ux-design-specification.md` §Feedback Patterns) says:
> "Message sent — Optimistic UI — message appears immediately; no toast"

But the Epic 4-1 AC says:
> "Given a `chat:message` WS message arrives at the client, When `useChat.ts` dispatches it, Then the message appears..."

This is a contradiction. True optimistic UI (append locally before server confirms) requires deduplication when the server echo arrives — otherwise the message appears twice.

**Recommendation:** Follow Epic AC for this story (WS-driven display). The WS round-trip on LAN is < 50ms and feels instant. True optimistic UI can be added as an enhancement if internet latency becomes a problem in practice. No toast on send is still correct — implemented by simply not showing one.

**Issue 3 — Tab strip (Chat/Viewers) not explicitly scoped to a story**
The UX HTML mockup shows the Chat/Viewers tab strip from the first render. Story 4-6 adds Viewers content. If Story 4-1 omits the tab strip shell, Story 4-6 will require a more invasive refactor of `ChatPanel.vue`.

**Recommendation (implemented in this story's Tasks):** Add the `<Tabs>` shell with both "Chat" and "Viewers" tabs now. The Viewers tab renders a `<!-- Story 4.6: presence list -->` stub. This avoids structural refactor in Story 4-6.

**Issue 4 — `|→` collapse button for right sidebar**
Story 3-6 placed a `|→` toggle in the `StreamPlayer`'s `HoverOverlay` for the LEFT sidebar. The UX spec shows `|→` in the `HoverOverlay` top-right corner for the RIGHT sidebar too. Story 4-4 adds this.

**Do NOT add a right-sidebar collapse toggle in this story.** The sidebar renders open and fixed-width for now. Story 4-4 wires up collapse + unread badge + state persistence.

**Issue 5 — Markdown library choice not specified**
The UX spec and Epic AC require only: bold (`**text**`), inline code (`` `text` ``), and links. This is three regex patterns — a full markdown library (marked, unified, etc.) adds unnecessary bundle weight for MVP.

**Recommendation:** Implement a pure function `renderMarkdownLite(text: string): string` in `apps/web/src/lib/markdown.ts` using three regex replacements. Sanitise links (reject `javascript:`, `data:`) before inserting as HTML. Use `v-html` in `<ChatMessage>` (acceptable here since the input comes from authenticated users and goes through server-side content trimming).

---

### Architecture Constraints

**Server — ULID for message IDs**
Use `ulid()` from `apps/server/src/lib/ulid.ts` (monotonicFactory singleton). Never `import { ulid } from 'ulidx'` directly.

**Server — Prisma client**
Use the singleton from `apps/server/src/db/client.ts`. Never `new PrismaClient()`.

**Server — Error pattern**
Use `new AppError(message, code, statusCode)` from `apps/server/src/lib/errors.ts`. For validation failures return 422; for unauthenticated return 401 (already handled by `requireAuth`).

**Server — WS hub**
`wsHub.broadcast(msg)` sends to all connected clients. For Story 4-1 this is correct — all viewers see each message. The hub is at `apps/server/src/services/wsHub.ts`.

**Server — userTag computation (server-side, never client-side)**
```typescript
function computeUserTag(user: User): UserTag | null {
  if (user.userTagText) {
    return { text: user.userTagText, color: user.userTagColor ?? '#6B7280' }
  }
  if (user.role === 'ViewerGuest') {
    return { text: 'Guest', color: '#9CA3AF' }
  }
  return null
}
```
This logic lives in `chatService.ts` (and will be needed in `userService.ts` for presence in Story 4-6 — extract to a shared helper if desired, but don't over-engineer for one story).

**Server — ChatMessage shape (must match `packages/types/src/ws.ts` exactly)**
```typescript
// packages/types/src/ws.ts — already defined:
export interface ChatMessage {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  content: string
  editHistory: { content: string; editedAt: string }[] | null
  updatedAt: string | null
  deletedAt: string | null
  deletedBy: string | null
  createdAt: string
  userTag: UserTag | null
}
```
For a new message, `editHistory = null`, `updatedAt = null`, `deletedAt = null`, `deletedBy = null`.

**Server — Named exports only**
Route functions: `export function createChatRouter()` (matching pattern from `createWsRouter`). Service: `export const chatService = new ChatService()` or `export function createMessage(...)`.

**Client — composable singleton pattern**
`useChat.ts` must use module-level refs (same as `useStream.ts`):
```typescript
// Module-level singleton
const messages = ref<ChatMessage[]>([])

export const useChat = () => {
  const sendChatMessage = async (content: string): Promise<void> => { ... }
  const handleChatMessage = (msg: ChatMessage): void => { messages.value.push(msg) }
  return { messages, sendChatMessage, handleChatMessage }
}
```

**Client — no component calls `ws.send()` directly**
Components emit events → parent calls composable action → composable calls `apiFetch`. For chat, there's no WS send needed on the client (message send is via REST POST).

**Client — `apiFetch` for REST calls**
Use `apiFetch<T>(path, options?)` from `apps/web/src/lib/api.ts`. For POST:
```typescript
await apiFetch<{ message: ChatMessage }>('/api/chat/messages', {
  method: 'POST',
  body: JSON.stringify({ content }),
})
```

**Client — WS dispatch in `useWebSocket.ts`**
Add to the `handleMessage` switch/if block (currently only handles `stream:state`):
```typescript
if (msg.type === 'chat:message') {
  useChat().handleChatMessage(msg.payload)
}
```
Import `useChat` at the top of the file. Confirm no circular dependency: `useChat` → `apiFetch` only; `useWebSocket` → `useChat` is fine (one direction).

**Client — `ScrollArea` and auto-scroll**
Use ShadCN-Vue `<ScrollArea>` from `@/components/ui/scroll-area`. Auto-scroll pattern:
```typescript
const scrollRef = ref<HTMLElement | null>(null)
watch(messages, async () => {
  await nextTick()
  if (scrollRef.value) {
    scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  }
}, { deep: true })
```
Target the `scrollRef` at the viewport div inside `<ScrollArea>` (use a template ref on the `ScrollArea` component's inner element).

**Client — route registration in `app.ts`**
Add alongside existing routes:
```typescript
import { createChatRouter } from './routes/chat.js'
// ...
app.route('/', createChatRouter())
```

---

### Mobile Layout — WatchView Restructure

**Before (current):**
```html
<div class="flex h-screen w-full overflow-hidden">         <!-- flex-row always -->
  <aside data-sidebar-left ...>...</aside>                 <!-- lg+ only, conditional -->
  <main class="flex-1 ..."><StreamPlayer /></main>         <!-- fills remaining width -->
  <aside data-sidebar-right class="hidden lg:flex ...">   <!-- desktop only, empty -->
    <!-- Story 4.x placeholder -->
  </aside>
  <Sheet>...</Sheet>                                       <!-- mobile admin drawer -->
</div>
```

**After (this story):**
```html
<div class="flex flex-col lg:flex-row h-screen w-full overflow-hidden">
  <!-- Left sidebar: unchanged, lg+ desktop only -->
  <aside v-if="isAdmin && adminPanelOpen && isDesktop" data-sidebar-left ...>
    <AdminPanel />
  </aside>

  <!-- Stream: aspect-video on mobile (natural height), flex-1 on desktop -->
  <main class="lg:flex-1 min-w-0 flex items-center justify-center bg-black">
    <StreamPlayer ... />    <!-- StreamPlayer hides ProfileAnchor when !isDesktop -->
  </main>

  <!-- Chat: full-width column below stream on mobile, right sidebar on desktop -->
  <ChatPanel
    class="flex-1 lg:flex-none lg:w-[320px] flex flex-col bg-[hsl(var(--sidebar))] lg:border-l border-[hsl(var(--border))]"
    @open-camera-controls="handleOpenCameraControls"
  />

  <!-- Mobile Sheet for admin controls: unchanged -->
  <Sheet v-if="isAdmin" v-model:open="mobileSheetOpen">...</Sheet>
</div>
```

**ChatPanel mobile input bar (inside ChatPanel.vue):**
```html
<!-- Mobile only: avatar + input row -->
<div class="flex items-center gap-2 p-2 border-t border-[hsl(var(--border))] lg:hidden">
  <ProfileAnchor
    :isDesktop="false"
    v-model:popover-open="profilePopoverOpen"
    @open-camera-controls="emit('openCameraControls')"
  />
  <ChatInput class="flex-1" @send="handleSend" />
</div>

<!-- Desktop only: standalone input -->
<div class="p-2 border-t border-[hsl(var(--border))] hidden lg:block">
  <ChatInput @send="handleSend" />
</div>
```

**Key behaviour notes:**
- `ProfileAnchor` in the chat bar is the **only** mobile access point for the profile menu (Sign out, Camera Controls for admin). The stream overlay avatar is hidden on mobile (`v-if="user && isDesktop"` in `StreamPlayer.vue`).
- The `isDesktop` prop passed to `ProfileAnchor` must be `false` so it shows the "Camera Controls" menu item (that button is already `v-if="!isDesktop"` in `ProfileAnchor.vue`).
- `profilePopoverOpen` is a local `ref<boolean>` in `ChatPanel.vue` (same pattern as `StreamPlayer.vue`).
- `ChatPanel` does NOT need a `user` prop — it reads from `useAuth()` internally, just like `ProfileAnchor` does.

### Project Structure — New Files

```
apps/server/src/
  routes/
    chat.ts          ← NEW: POST /api/chat/messages
  services/
    chatService.ts   ← NEW: createMessage()
    chatService.test.ts ← NEW

apps/web/src/
  components/
    chat/            ← NEW directory
      ChatPanel.vue
      ChatPanel.test.ts
      ChatInput.vue
      ChatInput.test.ts
      ChatMessage.vue
      ChatMessage.test.ts
  composables/
    useChat.ts       ← NEW
    useChat.test.ts  ← NEW
  lib/
    markdown.ts      ← NEW: renderMarkdownLite()
    markdown.test.ts ← NEW
```

**Files to modify:**
- `apps/server/src/app.ts` — register `chatRouter`
- `apps/web/src/composables/useWebSocket.ts` — add `chat:message` dispatch
- `apps/web/src/views/WatchView.vue` — responsive layout (`flex-col lg:flex-row`), add `<ChatPanel>`, forward `openCameraControls`
- `apps/web/src/components/stream/StreamPlayer.vue` — hide ProfileAnchor on mobile (`v-if="user && isDesktop"`)
- `apps/web/src/views/WatchView.test.ts` — update for new layout
- `apps/web/src/components/ui/` — add `scroll-area/`, `tabs/`, `textarea/` (via shadcn-vue CLI)

---

### ShadCN-Vue Components to Install

These are listed in the UX spec Component Strategy table but not yet installed:

```bash
cd apps/web
pnpm dlx shadcn-vue@latest add scroll-area
pnpm dlx shadcn-vue@latest add tabs
pnpm dlx shadcn-vue@latest add textarea
```

Verify each adds files under `apps/web/src/components/ui/`. If Textarea is just a styled HTML element, a raw `<textarea>` with Tailwind classes is acceptable given the UX spec's simple requirements.

---

### Markdown-Lite Implementation Reference

```typescript
// apps/web/src/lib/markdown.ts

const SAFE_URL = /^https?:\/\//i

function sanitizeHref(url: string): string {
  return SAFE_URL.test(url) ? url : '#'
}

export function renderMarkdownLite(text: string): string {
  // Escape HTML first to prevent XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  return escaped
    // Bold: **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Inline code: `text`
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links: [label](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const href = sanitizeHref(url)
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
    })
}
```

Use `v-html="renderMarkdownLite(message.content)"` in `<ChatMessage>`. This is safe because:
1. Content is HTML-escaped before regex substitution
2. Only specific patterns are unescaped into known-safe HTML elements
3. All user-supplied URLs are sanitised through `sanitizeHref`

---

### Timestamp Formatting

Use `Intl.DateTimeFormat` for user's local timezone. Short time format (`2:14 PM`):
```typescript
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}
```
This belongs in `apps/web/src/lib/` as a shared utility (e.g., `dateFormat.ts`) since Story 4-2 also needs `Intl.DateTimeFormat` for day-boundary delineators.

---

### Avatar Component Usage

The existing `<Avatar>`, `<AvatarImage>`, `<AvatarFallback>` ShadCN components are already installed at `apps/web/src/components/ui/avatar/`. Use them for message sender avatars:
```vue
<Avatar class="h-8 w-8">
  <AvatarImage :src="message.avatarUrl ?? ''" :alt="message.displayName" />
  <AvatarFallback>{{ initials(message.displayName) }}</AvatarFallback>
</Avatar>
```
Initials helper: take first letter of each word, max 2 chars.

---

### Testing Approach

**Server tests** (`chatService.test.ts`, `chat.test.ts`):
- Mock `prisma` (from `apps/server/src/db/client.ts`) — use `vi.mock('../db/client.js')`
- Mock `wsHub.broadcast` — verify it's called with correct `WsMessage` shape
- Test validation: empty content, content > 1000 chars → 422; unauthenticated → 401

**Client tests** (Vue Test Utils + Vitest):
- Follow existing patterns from `AdminPanel.test.ts`, `CameraControls.test.ts`, `WatchView.test.ts`
- Mock `useChat` when testing `ChatPanel` and `ChatInput` (avoids real HTTP)
- Mock `apiFetch` in `useChat.test.ts`
- `markdown.test.ts` — pure unit tests on `renderMarkdownLite()` with no Vue setup needed

**Coverage thresholds** (from Story 3-4 baseline):
- Server: lines ≥ 84%, functions ≥ 90%, branches ≥ 87%, statements ≥ 84%
- Web: lines ≥ 93%, functions ≥ 66%, branches ≥ 92%, statements ≥ 93% (Story 3-6 actuals)

---

### Story Boundary — What Is NOT in Scope

| Feature | Story |
|---|---|
| Chat history on page load (`GET /api/chat/history`) | 4-2 |
| Infinite scroll / older message pagination | 4-2 |
| Message grouping (continuation messages, same-sender) | 4-3 |
| Viewer presence list in Viewers tab | 4-6 |
| Unread badge on `|→` collapse button | 4-4 |
| Right sidebar collapse/expand (`|→` / `←|` toggle) | 4-4 |
| Mobile landscape chat panel / collapsible | 4-4 |
| Message edit / delete | 4-5 |
| Typing indicator | 4-6 |
| Moderator delete | 5-1 |

---

### References

- Epic 4 story foundation: [Source: `_bmad-output/planning-artifacts/epics.md` §Story 4.1]
- Right sidebar structure: [Source: `apps/web/src/views/WatchView.vue` lines 80–86]
- WS message union: [Source: `packages/types/src/ws.ts`]
- WS hub: [Source: `apps/server/src/services/wsHub.ts`]
- WS route: [Source: `apps/server/src/routes/ws.ts`]
- Prisma schema (messages model): [Source: `apps/server/prisma/schema.prisma` lines 54–70]
- Architecture — chat API: [Source: `_bmad-output/planning-artifacts/architecture.md` §Chat Message Schema, §Chat History Pagination, §REST Surface, §WebSocket Message Envelope]
- Architecture — composable pattern: [Source: `_bmad-output/planning-artifacts/architecture.md` §WebSocket client — singleton composable]
- Architecture — file structure: [Source: `_bmad-output/planning-artifacts/architecture.md` §Directory structure, `chat/` component dir]
- UX component specs: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` §Custom Components, §`<ChatMessage />`, §`<TypingIndicator />`, §Form Patterns, §Empty States]
- UX layout + spacing: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` §Spacing & Layout Foundation]
- UX HTML mockup — right sidebar with tab strip and chat messages: [Source: `_bmad-output/planning-artifacts/ux-design-directions.html` lines 723–767]
- UX accessibility requirements: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` §Custom Accessibility Requirements]
- Previous story patterns: [Source: `_bmad-output/implementation-artifacts/3-6-admin-camera-controls-sidebar.md`]
- ULID singleton: [Source: `apps/server/src/lib/ulid.ts`]
- Prisma singleton: [Source: `apps/server/src/db/client.ts`]
- Error pattern: [Source: `apps/server/src/lib/errors.ts`]
- Named exports rule: [Source: `_bmad-output/planning-artifacts/architecture.md` §Conventions]
- `apiFetch` helper: [Source: `apps/web/src/lib/api.ts`]
- Test patterns: [Source: `apps/web/src/views/WatchView.test.ts`, `apps/web/src/components/admin/AdminPanel.test.ts`]
- Coverage baselines: [Source: `apps/server/vitest.config.ts`, Story 3.4 notes]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation completed without blockers.

### Completion Notes List

- Implemented `POST /api/chat/messages` with `requireAuth`, 422 validation (empty/whitespace/too-long), and 201 success response
- `chatService.createMessage()` uses ULID singleton, Prisma `include: { user: true }`, computes `userTag` server-side (custom tag > Guest fallback for ViewerGuest > null), broadcasts `chat:message` WS event, returns full `ChatMessage` shape
- `useChat.ts` module-level singleton — WS-driven display (no optimistic UI), consistent with Epic AC (Issue 2 in Dev Notes)
- `useWebSocket.ts` now dispatches `chat:message` to `useChat().handleChatMessage()` — no circular dependency (useChat → apiFetch only)
- `renderMarkdownLite()` pure function: HTML-escapes first, then applies bold/code/link patterns; `javascript:` and `data:` URLs replaced with `#`
- `ChatInput.vue` uses raw textarea (not shadcn Textarea component) — simpler and sufficient for the UX requirements
- ShadCN-Vue components installed: `scroll-area`, `tabs`, `textarea` (textarea installed but ChatInput uses raw textarea for full control)
- `ChatPanel.vue` includes tab strip shell with Viewers stub (`<!-- Story 4.6: presence list -->`) to avoid structural refactor in Story 4-6
- `WatchView.vue` outer container changed to `flex flex-col lg:flex-row`; right sidebar placeholder replaced with `<ChatPanel />`
- `StreamPlayer.vue` ProfileAnchor changed from `v-if="user"` to `v-if="user && isDesktop"` — moved to ChatPanel mobile input bar
- `ChatPanel.vue` mobile input bar: `lg:hidden` div with `ProfileAnchor` (`:isDesktop="false"`) + `ChatInput`; desktop: standalone `ChatInput` in `hidden lg:block` div
- `apps/web/src/lib/dateFormat.ts` created with `formatTime()` (Intl.DateTimeFormat) and `initials()` — shared utility for Story 4-2
- All tests pass: server 125 tests, web 163 tests; coverage above all thresholds; TypeScript clean; linting clean

### File List

**New files:**
- `apps/server/src/services/chatService.ts`
- `apps/server/src/services/chatService.test.ts`
- `apps/server/src/routes/chat.ts`
- `apps/server/src/routes/chat.test.ts`
- `apps/web/src/composables/useChat.ts`
- `apps/web/src/composables/useChat.test.ts`
- `apps/web/src/lib/markdown.ts`
- `apps/web/src/lib/markdown.test.ts`
- `apps/web/src/lib/dateFormat.ts`
- `apps/web/src/components/chat/ChatMessage.vue`
- `apps/web/src/components/chat/ChatMessage.test.ts`
- `apps/web/src/components/chat/ChatInput.vue`
- `apps/web/src/components/chat/ChatInput.test.ts`
- `apps/web/src/components/chat/ChatPanel.vue`
- `apps/web/src/components/chat/ChatPanel.test.ts`
- `apps/web/src/components/ui/scroll-area/ScrollArea.vue`
- `apps/web/src/components/ui/scroll-area/ScrollBar.vue`
- `apps/web/src/components/ui/scroll-area/index.ts`
- `apps/web/src/components/ui/tabs/Tabs.vue`
- `apps/web/src/components/ui/tabs/TabsContent.vue`
- `apps/web/src/components/ui/tabs/TabsList.vue`
- `apps/web/src/components/ui/tabs/TabsTrigger.vue`
- `apps/web/src/components/ui/tabs/index.ts`
- `apps/web/src/components/ui/textarea/Textarea.vue`
- `apps/web/src/components/ui/textarea/index.ts`

**Modified files:**
- `apps/server/src/app.ts` — register `createChatRouter()`
- `apps/web/src/composables/useWebSocket.ts` — dispatch `chat:message` to `useChat`
- `apps/web/src/views/WatchView.vue` — responsive layout, add `<ChatPanel />`
- `apps/web/src/views/WatchView.test.ts` — update for new layout (ChatPanel replaces sidebar)
- `apps/web/src/components/stream/StreamPlayer.vue` — hide ProfileAnchor on mobile

## Change Log

- 2026-03-08: Story 4-1 implemented — chat panel, message sending, real-time delivery (claude-sonnet-4-6)
