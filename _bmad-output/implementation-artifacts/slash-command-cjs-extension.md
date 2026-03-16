# Story: Slash Command .cjs Extension Fix

Status: done

## Story

As **a developer**,
when I create custom slash commands,
I want them loaded from `.cjs` files (CommonJS),
so that they work correctly with Node.js `require()` in the server environment.

## Acceptance Criteria

1. **Slash commands load from `.cjs` files**
   - `slashCommands.ts` filters for files ending with `.cjs` (not `.js`)
   - Existing example commands (`shrug.cjs`, `tableflip.cjs`, `pet.cjs`, `treat.cjs`) are renamed

2. **Documentation updated**
   - `README.md` in `apps/server/custom/` references `.cjs` extension
   - `.gitignore` allows `.cjs` files

3. **All tests pass**
   - `slashCommands.test.ts` updated to test `.cjs` extension

---

## Tasks / Subtasks

- [x] **Task 1: Update file extension filter**
  - [x] 1.1 Change `endsWith('.js')` to `endsWith('.cjs')` in `slashCommands.ts`
  - [x] 1.2 Rename example files: `.js` → `.cjs`
  - [x] 1.3 Update `.gitignore` to allow `.cjs` files

- [x] **Task 2: Update documentation**
  - [x] 2.1 Update `README.md` to reference `.cjs` extension

- [x] **Task 3: Update tests**
  - [x] 3.1 Update `slashCommands.test.ts` to use `.cjs` in mock filenames

- [x] **Task 4: Full regression — all tests pass**

---

## File List

- `apps/server/src/services/slashCommands.ts`
- `apps/server/src/services/slashCommands.test.ts`
- `apps/server/custom/.gitignore`
- `apps/server/custom/README.md`
- `apps/server/custom/shrug.cjs` (renamed from .js)
- `apps/server/custom/tableflip.cjs` (renamed from .js)
- `apps/server/custom/pet.cjs` (renamed from .js)
- `apps/server/custom/treat.cjs` (renamed from .js)

---

## Dev Agent Record

### Implementation Plan

Changed slash command loader to use `.cjs` extension for CommonJS compatibility with Node.js `require()`.

### Completion Notes

- Changed file extension filter from `.js` to `.cjs`
- Renamed all 4 example custom commands
- Updated README and .gitignore
- All 390 server tests passing

---

## Change Log

| Date       | Change                                                    |
| ---------- | --------------------------------------------------------- |
| 2026-03-16 | Bugfix — changed slash command extension from .js to .cjs |
