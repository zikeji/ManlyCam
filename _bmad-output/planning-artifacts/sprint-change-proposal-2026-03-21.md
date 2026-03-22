# Sprint Change Proposal

**Date:** 2026-03-21
**Project:** ManlyCam
**Requested By:** Zikeji

---

## 1. Issue Summary

**Triggering Story:** 9-2 (Allowlist Management Web UI)

**Problem Statement:**
Story 9-2 Task 5 instructs integrating `AllowlistPanel` into `AdminPanel.vue` with tabs for Camera and Allowlist. However:

- `AdminPanel.vue` does not exist in the codebase
- Camera controls are in `CameraControlsPanel.vue` (left sidebar)
- `AdminDialog.vue` exists and contains only `UserList` (User Management)
- Placing allowlist in the camera controls sidebar is architecturally incorrect — admin functions (users, allowlist, audit log) belong in a consolidated admin dialog, not scattered across the camera panel

**Issue Type:** Misunderstanding of component structure / incorrect architectural placement

**Discovery Context:** Identified during sprint review before 9-2 implementation proceeded

**Evidence:**

```
$ ls apps/web/src/components/admin/
AdminDialog.vue         ← exists, has UserList only
CameraControlsPanel.vue ← exists, camera controls sidebar
CameraControls.vue
UserList.vue

AdminPanel.vue          ← DOES NOT EXIST
```

---

## 2. Impact Analysis

### Epic Impact

| Epic     | Impact | Details                                                     |
| -------- | ------ | ----------------------------------------------------------- |
| Epic 9   | Minor  | Stories 9-2 and 9-3 need task/dev notes scoping corrections |
| Epic 1-8 | None   | No changes to completed or in-progress epics                |

### Story Impact

| Story         | Impact   | Changes Required                                                           |
| ------------- | -------- | -------------------------------------------------------------------------- |
| 9-2           | Moderate | Task 5 rewrite, Dev Notes update, File List update                         |
| 9-3           | Moderate | Task 6 rewrite, Dev Notes update, File List update (remove AuditLogDialog) |
| 9-1, 9-4, 9-5 | None     | Unaffected                                                                 |

### Artifact Conflicts

| Artifact     | Conflict | Resolution                                                |
| ------------ | -------- | --------------------------------------------------------- |
| PRD          | None     | FR41-FR44 (allowlist management) unchanged                |
| Architecture | None     | AdminDialog pattern aligns with existing patterns         |
| UX           | Minor    | Button label change "Users" → "Admin" in BroadcastConsole |
| Epics        | Minor    | Story task details updated, epic scope unchanged          |

### Technical Impact

- No code was incorrectly implemented — `AdminPanel.vue` doesn't exist, so no rollback needed
- No database changes required
- No API changes required

---

## 3. Recommended Approach

**Selected Path:** Direct Adjustment (Option 1)

**Rationale:**

- No code was implemented incorrectly — `AdminPanel.vue` doesn't exist, so no rollback needed
- Simple story scope corrections before implementation proceeds
- Low effort, low risk
- Maintains project timeline
- Consolidates admin functions into single AdminDialog (cleaner UX)

**Effort Estimate:** Low
**Risk Level:** Low
**Timeline Impact:** None

---

## 4. Detailed Change Proposals

### Proposal A: Story 9-2 Task 5 Replacement

**Story:** 9-2 (Allowlist Management Web UI)
**Section:** Tasks / Task 5

**OLD:**

```markdown
- [x] Task 5: Integrate `AllowlistPanel` into `AdminPanel.vue` (AC: #1)
  - [x] Add a tab/section for "Allowlist" in the admin panel using existing shadcn-vue `Tabs` components
  - [x] `AdminPanel.vue` currently only shows `CameraControls` — restructure to show tabs: "Camera" (existing controls) and "Allowlist" (new panel)
  - [x] Preserve the existing `CameraControls` + `ScrollArea` structure inside the Camera tab
  - [x] The Allowlist tab renders `AllowlistPanel`
  - [x] Update `AdminPanel.test.ts` — the existing tests check for `"Camera Controls"` header text...
```

**NEW:**

```markdown
- [ ] Task 5: Integrate `AllowlistPanel` into `AdminDialog.vue` (AC: #1)
  - [ ] Convert `AdminDialog.vue` to a tabbed dialog using shadcn-vue `Tabs` components
  - [ ] Tab 1: "Users" — contains existing `UserList` component
  - [ ] Tab 2: "Allowlist" — contains `AllowlistPanel` component
  - [ ] Preserve existing `AlertDialog` structure; add `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` inside `AlertDialogContent`
  - [ ] Update dialog title from "User Management" to "Admin"
  - [ ] In `BroadcastConsole.vue`, rename the admin button from "Users" to "Admin" (reflects broader scope)
  - [ ] Update `AdminDialog.test.ts` to cover: tab structure renders; Users tab contains UserList; Allowlist tab contains AllowlistPanel; dialog open/close still works
```

---

### Proposal B: Story 9-2 Dev Notes Update

**Story:** 9-2
**Section:** Dev Notes

**Remove Section:** "Web: AdminPanel.vue refactor to tabs"

**Add Section:**

````markdown
### Web: AdminDialog.vue refactor to tabs

`apps/web/src/components/admin/AdminDialog.vue` currently renders only `UserList`:

```html
<AlertDialogContent>
  <AlertDialogHeader>
    <AlertDialogTitle>User Management</AlertDialogTitle>
  </AlertDialogHeader>
  <div class="flex-1 min-h-0">
    <UserList />
  </div>
</AlertDialogContent>
```
````

Refactor to a tabbed structure using shadcn-vue `Tabs` components:

```html
<AlertDialogContent class="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
  <AlertDialogHeader
    class="px-6 py-4 border-b border-border flex flex-row items-center justify-between space-y-0"
  >
    <AlertDialogTitle>Admin</AlertDialogTitle>
    <AlertDialogCancel class="mt-0 p-1 h-auto bg-transparent border-none hover:bg-accent">
      <X class="w-4 h-4" />
    </AlertDialogCancel>
  </AlertDialogHeader>
  <Tabs default-value="users" class="flex-1 flex flex-col overflow-hidden">
    <TabsList class="px-6 pt-2 shrink-0">
      <TabsTrigger value="users">Users</TabsTrigger>
      <TabsTrigger value="allowlist">Allowlist</TabsTrigger>
    </TabsList>
    <TabsContent value="users" class="flex-1 overflow-hidden m-0">
      <UserList />
    </TabsContent>
    <TabsContent value="allowlist" class="flex-1 overflow-hidden m-0">
      <AllowlistPanel />
    </TabsContent>
  </Tabs>
</AlertDialogContent>
```

**Important:**

- Camera controls remain in `CameraControlsPanel.vue` (left sidebar). Do NOT add camera controls to AdminDialog.
- Import `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs`
- The `TabsContent` needs `class="m-0"` to remove default margin that causes layout issues

````

---

### Proposal C: Story 9-3 Task 6 Replacement

**Story:** 9-3 (Audit Log Viewer)
**Section:** Tasks / Task 6

**OLD:**
```markdown
- [ ] Task 6: Wire AuditLogTable into admin UI (AC: #10)
  - [ ] Subtask 6.1: Identify where to surface the audit log — see Dev Notes (dialog or new tab in existing admin section)
  - [ ] Subtask 6.2: Gate the audit log trigger/tab on `user.value?.role === Role.Admin`
  - [ ] Subtask 6.3: Add a trigger in `BroadcastConsole.vue` profile popover (admin-only) OR add a tab to `UserManagerDialog.vue` (see Dev Notes)
````

**NEW:**

```markdown
- [ ] Task 6: Add Audit Log tab to AdminDialog (AC: #10)
  - [ ] Subtask 6.1: Add "Audit Log" as third tab in `AdminDialog.vue` (after Users, Allowlist)
  - [ ] Subtask 6.2: The Audit Log tab renders `AuditLogTable` component
  - [ ] Subtask 6.3: No additional trigger needed in BroadcastConsole — the existing "Admin" button (renamed from "Users" in Story 9-2) opens AdminDialog with all three tabs accessible
  - [ ] Subtask 6.4: Update `AdminDialog.test.ts` to verify Audit Log tab renders `AuditLogTable`
```

---

### Proposal D: Story 9-3 Dev Notes Update

**Story:** 9-3
**Section:** Dev Notes

**Replace Section:** "Where to Surface the Audit Log in the UI"

**NEW:**

```markdown
### Where to Surface the Audit Log in the UI

The admin UI structure (after Story 9-2):

- `CameraControlsPanel.vue` — left-side camera controls sidebar (desktop only)
- `AdminDialog.vue` — tabbed modal dialog with: Users, Allowlist, Audit Log tabs

**Approach:** Add "Audit Log" as the third tab in `AdminDialog.vue`. The existing "Admin" button in `BroadcastConsole.vue` profile popover (renamed from "Users" in Story 9-2) opens this dialog. No separate `AuditLogDialog.vue` needed — all admin functions consolidated into one dialog.
```

---

### Proposal E: Story 9-3 File List Update

**Story:** 9-3
**Section:** File List

**REMOVE:**

```markdown
- `apps/web/src/components/admin/AuditLogDialog.vue` — new
- `apps/web/src/components/admin/AuditLogDialog.test.ts` — new
```

**ADD:**

```markdown
- `apps/web/src/components/admin/AdminDialog.vue` — modified (add Audit Log tab)
- `apps/web/src/components/admin/AdminDialog.test.ts` — modified (add Audit Log tab tests)
```

---

## 5. Implementation Handoff

**Change Scope:** Minor

**Handoff Recipients:** Development team

**Responsibilities:**

1. Update Story 9-2 markdown file with Proposals A, B
2. Update Story 9-3 markdown file with Proposals C, D, E
3. Implement Story 9-2 with corrected scope (AdminDialog tabs)
4. Implement Story 9-3 with corrected scope (Audit Log as third tab)

**Execution Order:**

1. Update story markdown files (immediate)
2. Story 9-2 implementation: Modify AdminDialog.vue with tabs, rename BroadcastConsole button
3. Story 9-3 implementation: Add Audit Log tab to AdminDialog

**Success Criteria:**

- AdminDialog contains tabs: Users, Allowlist, Audit Log
- BroadcastConsole "Admin" button opens the dialog
- CameraControlsPanel remains unchanged (camera controls only)
- All existing tests pass
- Quality gates (typecheck, lint, test) pass

---

## 6. Approval

**Status:** Approved

**Approved By:** Zikeji

**Approval Date:** 2026-03-21

**Conditions:** None

---

## Appendix: Checklist Status

| Section                                  | Status   |
| ---------------------------------------- | -------- |
| 1. Understand the Trigger and Context    | [x] Done |
| 2. Epic Impact Assessment                | [x] Done |
| 3. Artifact Conflict and Impact Analysis | [x] Done |
| 4. Path Forward Evaluation               | [x] Done |
| 5. Sprint Change Proposal Components     | [x] Done |
| 6. Final Review and Handoff              | [x] Done |
