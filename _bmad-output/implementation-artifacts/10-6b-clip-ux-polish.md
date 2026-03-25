# Story 10-6b: Clip UX Polish

Status: ready-for-dev

## Story

As a **viewer using the clips feature**,
I want clearer ownership attribution in My Clips, sensible visibility handling when an admin has set my clip to public, and spacebar play/pause in the clip editor,
So that the clips UI feels complete and polished.

## Acceptance Criteria

1. **My Clips — clipper attribution row in mixed-ownership views**
   Given the MyClipsDialog clip list,
   when **either** `includeShared` or `showAll` is active (the list may contain clips from multiple owners),
   then every clip card shows a clipper row below the clip name/date line:
   - For clips owned by the current user: the user's own avatar (`user.avatarUrl`, `h-6 w-6 rounded-full`, omitted if null) + label **"You"**
   - For clips owned by others: `clipperAvatarUrlOwner` (omitted if null) + `clipperDisplayName`
   - Row style: `flex items-center gap-2 text-xs text-muted-foreground`

   And when **neither** toggle is active (own-clips-only view), the clipper row is hidden entirely.

2. **ClipEditForm — disabled Public option for locked-out users**
   Given a clip with `visibility === 'public'` being edited by a user with `ROLE_RANK < Moderator` (`canSetPublic === false`),
   when the visibility section renders,
   then a "Public" button is shown alongside Private and Shared, but is `disabled` with `opacity-50 cursor-not-allowed` and no hover effect,
   and it appears in the active/selected state (`border-ring bg-accent`) reflecting the current clip state,
   and the attribution block (show clipper / avatar toggles) remains hidden (still gated on `canSetPublic`).

3. **ClipEditForm — confirmation when moving away from admin-set public**
   Given a clip with `visibility === 'public'` being edited by a user with `canSetPublic === false`,
   when the user selects Private or Shared and then clicks Save,
   then a confirmation `AlertDialog` appears with the message:
   *"This clip is currently public. Changing visibility will make it less visible and only an Admin or Moderator can make it public again."*
   with a **Cancel** button (reverts selection to `public`) and a **Continue** button (proceeds with the save).

4. **ClipEditForm — no confirmation for Moderator/Admin**
   Given a Moderator or Admin editing any clip,
   when they change visibility and click Save,
   then no confirmation dialog appears (they can always restore public themselves).

5. **Spacebar play/pause in clip editor**
   Given the clip editor is open (`props.open === true`),
   when the user presses `Space` and the active element is **not** an `<input>` or `<textarea>`,
   then `togglePlayback()` is called and the default scroll behaviour is suppressed (`e.preventDefault()`).
   And when the editor is closed (`props.open === false`), the `keydown` listener is removed.
   And pressing Space while focused inside the name or description fields does **not** trigger playback.

## Tasks / Subtasks

- [ ] **Task 1: MyClipsDialog — clipper attribution row** (AC: #1)
  - [ ] 1.1 Add a computed `isMixedView = computed(() => includeShared.value || showAll.value)` in `MyClipsDialog.vue`
  - [ ] 1.2 In the card body, below the name/date block, conditionally render the clipper row:
    ```html
    <div v-if="isMixedView" class="flex items-center gap-2 text-xs text-muted-foreground" data-testid="clip-owner-row">
      <img v-if="isOwnClip ? user.avatarUrl : clip.clipperAvatarUrlOwner"
           :src="isOwnClip ? user.avatarUrl : clip.clipperAvatarUrlOwner"
           class="h-6 w-6 rounded-full object-cover" />
      <span>{{ isOwnClip ? 'You' : clip.clipperDisplayName }}</span>
    </div>
    ```
    where `isOwnClip = clip.userId === user.value?.id`
  - [ ] 1.3 Add `data-testid="clip-owner-name"` on the name span for test targeting

- [ ] **Task 2: ClipEditForm — locked-out Public button** (AC: #2, #3, #4)
  - [ ] 2.1 Add computed `lockedPublic = computed(() => props.clip.visibility === 'public' && !canSetPublic.value)` in `ClipEditForm.vue`
  - [ ] 2.2 Add `confirmDialogOpen = ref(false)` and `pendingData = ref<UpdateClipData | null>(null)` for deferred save
  - [ ] 2.3 In the `visibilityOptions` template block:
    - For the Public option: always render it (remove the `v-if="opt.value !== 'public' || canSetPublic"` guard)
    - Apply `disabled` + `opacity-50 cursor-not-allowed pointer-events-none` classes when `!canSetPublic`
    - Keep the active styling when `visibility === 'public'`
  - [ ] 2.4 Update `submit()`: if `lockedPublic.value` is true **and** `data.visibility` is set (changing away from public), do not emit `save` directly — instead store `data` in `pendingData` and set `confirmDialogOpen = true`
  - [ ] 2.5 Add `AlertDialog` at bottom of form template with the message from AC #3; Cancel handler reverts `visibility.value = 'public'` and clears `pendingData`; Continue handler emits `save(pendingData)` and clears state
  - [ ] 2.6 Import `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogCancel`, `AlertDialogAction` from `@/components/ui/alert-dialog`

- [ ] **Task 3: ClipEditor — spacebar play/pause** (AC: #5)
  - [ ] 3.1 In `ClipEditor.vue`, define a named handler function (not inline arrow):
    ```ts
    /* c8 ignore next -- JSDOM does not support requestAnimationFrame; togglePlayback is already c8-ignored */
    function onSpaceKey(e: KeyboardEvent): void {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      togglePlayback();
    }
    ```
  - [ ] 3.2 Add a `watch` on `props.open`:
    ```ts
    watch(() => props.open, (isOpen) => {
      if (isOpen) {
        document.addEventListener('keydown', onSpaceKey);
      } else {
        document.removeEventListener('keydown', onSpaceKey);
      }
    });
    ```
  - [ ] 3.3 Ensure the listener is removed in `onUnmounted` as a safety net (component may unmount while open):
    ```ts
    onUnmounted(() => {
      document.removeEventListener('keydown', onSpaceKey);
    });
    ```

- [ ] **Task 4: Tests** (All ACs)
  - [ ] 4.1 `MyClipsDialog.test.ts`:
    - Clipper row hidden when neither toggle active (own-clips view)
    - Clipper row shows "You" + own avatar on own clip when `includeShared = true`
    - Clipper row shows others' `clipperDisplayName` on non-owned clip when `includeShared = true`
    - Clipper row shows correctly when `showAll = true` (admin mode)
    - Avatar `img` omitted when `clipperAvatarUrlOwner` is null (others' clip)
    - Avatar `img` omitted when `user.avatarUrl` is null (own clip in mixed view)
  - [ ] 4.2 `ClipEditForm.test.ts`:
    - Locked-out user sees disabled Public button when `clip.visibility === 'public'`
    - Public button has active styling (border-ring bg-accent) when selected but locked
    - Locked-out user does NOT see disabled Public button when `clip.visibility !== 'public'`
    - Moderator/Admin sees interactive Public button (no disabled state)
    - Clicking Save with visibility changed away from public triggers confirmation dialog (lockedPublic user)
    - Clicking Cancel in confirmation dialog reverts visibility to 'public', no save emitted
    - Clicking Continue in confirmation dialog emits save with the new visibility
    - No confirmation dialog when Moderator saves (canSetPublic = true)
  - [ ] 4.3 `ClipEditor.test.ts`:
    - Space key calls togglePlayback when editor is open and target is not input/textarea
    - Space key does NOT call togglePlayback when target is INPUT
    - Space key does NOT call togglePlayback when target is TEXTAREA
    - Space key does NOT call togglePlayback when editor is closed
    - Listener removed when editor closes (watch fires with `false`)
    - Listener removed on unmount

## Dev Notes

### Task 1 — MyClipsDialog clipper row

The `ClipListItem` type already returns `clipperDisplayName`, `clipperAvatarUrlOwner`, and `userId` from the API — no server changes needed.

The `user` value from `useAuth()` is already imported in `MyClipsDialog.vue`. Access `user.value?.id` to compare with `clip.userId`.

For the "You" label case: use `user.value?.avatarUrl` for the avatar src. If null, omit the img element entirely. The `clipperAvatarUrlOwner` field is the clip owner's profile avatar (distinct from the `clipperAvatarUrl` attribution field used on public pages).

Pattern for the row — follow the existing chat avatar pattern (ChatMessage.vue) for sizing reference, but scale down to `h-6 w-6` to fit the compact card layout.

### Task 2 — ClipEditForm locked-out Public

The current visibility template uses:
```html
<button v-if="opt.value !== 'public' || canSetPublic" ...>
```
Change this so the Public button always renders but is conditionally disabled:
- When `canSetPublic`: renders normally (clickable)
- When `!canSetPublic && opt.value === 'public'`: renders disabled with `pointer-events-none opacity-50 cursor-not-allowed`

The `lockedPublic` guard only applies when `props.clip.visibility === 'public'` AND `!canSetPublic`. When a non-privileged user's clip is `private` or `shared`, the Public button remains hidden (via `v-if="opt.value !== 'public' || canSetPublic || clip.visibility === 'public'"` or equivalent).

Deferred save flow:
1. `submit()` builds `data` as normal
2. If `lockedPublic.value && data.visibility !== undefined` → store in `pendingData.value`, open confirm dialog, return early
3. Otherwise emit `save(data)` as before

The AlertDialog needs to be rendered outside the `<form>` to avoid nested form issues. Place it as a sibling after `</form>` in the template.

`AlertDialogAction` (from shadcn) emits the close event automatically — the Continue handler can just be:
```ts
function onConfirmVisibilityChange() {
  if (pendingData.value) emit('save', pendingData.value);
  pendingData.value = null;
}
```

### Task 3 — ClipEditor spacebar

`togglePlayback()` is wrapped in `/* c8 ignore start/stop */` blocks (requestAnimationFrame). The `onSpaceKey` handler that calls it should carry a `/* c8 ignore next */` annotation on the `togglePlayback()` call line — the handler itself (guards, early-returns) can be covered.

Do NOT use `watch` with `{ immediate: true }` — the component may mount with `open: false`. Start listener only on `true` transition.

The handler must be a **named function reference** (not an inline arrow) so the same reference is passed to both `addEventListener` and `removeEventListener`.

### Existing Patterns

- `AlertDialog` is already imported in `MyClipsDialog.vue` — confirm it's scaffolded in `components/ui/alert-dialog/` before importing in `ClipEditForm.vue`
- `canSetPublic` computed in `ClipEditForm.vue` (line 27): `ROLE_RANK[props.userRole] >= ROLE_RANK[Role.Moderator]`
- `watch` + `onUnmounted` pattern for document listeners: see `ClipEditor.vue` existing drag handlers for style reference

### Files to Modify

- `apps/web/src/components/clips/MyClipsDialog.vue`
- `apps/web/src/components/clips/MyClipsDialog.test.ts`
- `apps/web/src/components/clips/ClipEditForm.vue`
- `apps/web/src/components/clips/ClipEditForm.test.ts`
- `apps/web/src/components/stream/ClipEditor.vue`
- `apps/web/src/components/stream/ClipEditor.test.ts`

### References

- `apps/web/src/components/clips/MyClipsDialog.vue` — current card template, `includeShared`/`showAll` refs
- `apps/web/src/composables/useClips.ts` — `ClipListItem` type (has `clipperDisplayName`, `clipperAvatarUrlOwner`, `userId`)
- `apps/web/src/components/clips/ClipEditForm.vue` — `canSetPublic`, `visibilityOptions`, `submit()`
- `apps/web/src/components/stream/ClipEditor.vue` — `togglePlayback()`, `props.open`, existing `onUnmounted`
- `apps/web/src/components/ui/alert-dialog/` — AlertDialog component (already in project)

## Change Log

- 2026-03-24: Story created via sprint-change-proposal-2026-03-24.md (correct-course on 10-6 review)
