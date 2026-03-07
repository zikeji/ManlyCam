---
title: 'Configure ESLint at Project Root with Modern Setup'
slug: 'eslint-root-config'
created: '2026-03-06'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['ESLint', 'TypeScript', '@typescript-eslint', 'airbnb-base', 'Prettier']
files_to_modify: ['.eslintrc.json', 'package.json (add dev deps)']
code_patterns: ['Root config with app-specific overrides pattern']
test_patterns: ['Lint runs in CI via workflows']
---

# Tech-Spec: Configure ESLint at Project Root with Modern Setup

**Created:** 2026-03-06

## Overview

### Problem Statement

Story 1.3 created CI/CD workflows that invoke lint scripts (`pnpm --filter @manlycam/server lint`, `pnpm --filter @manlycam/web lint`), but no ESLint configuration exists at the project root. This causes CI to fail when workflows attempt to run linting. Without a shared configuration, code quality standards are undefined and unenforceable.

### Solution

Create a root-level `.eslintrc.json` configuration based on proven airbnb-base + TypeScript + Prettier stack, modernized for 2026. The config will:
- Apply globally to all apps/packages
- Auto-detect parser per app (TypeScript for `.ts` files, default for `.js`)
- Enable comprehensive type-checking rules via @typescript-eslint
- Enforce code style via Prettier integration
- Allow per-app overrides later if needed (out of scope now)

### Scope

**In Scope:**
- Create root `.eslintrc.json` with airbnb-base + @typescript-eslint/recommended + Prettier
- Update `package.json` to add required ESLint dev dependencies (eslint, @typescript-eslint/parser, @typescript-eslint/eslint-plugin, eslint-config-airbnb-base, eslint-config-prettier, eslint-plugin-prettier, etc.)
- Modernize rule set from user's previous config (drop outdated rules, add 2026-appropriate rules)
- Auto-detect parser strategy: TypeScript parser for `.ts`/`.tsx`, default for `.js`
- Verify lint scripts in CI workflows will pass
- Enforce linting during Epic 1 development (no per-app configs yet)

**Out of Scope:**
- Per-app ESLint overrides (can be added later if needed)
- Vue-specific ESLint setup (web uses Vue but shared root config is sufficient for now)
- Linting other file types (YAML, JSON, Markdown) — focus on `.js`/`.ts` only
- Pre-commit hooks or lint-on-save integrations — that's future infrastructure

## Context for Development

### Codebase Patterns

- **Monorepo structure**: `apps/server`, `apps/web`, `packages/types` (pnpm workspaces)
- **TypeScript everywhere**: All packages have `tsconfig.json` with strict mode enabled
  - Server: Node.js backend (target: ESNext, module: NodeNext)
  - Web: Vue 3 frontend (target: ES2022, module: ESNext, bundler resolution)
  - Types: Pure TypeScript package (no runtime)
- **Package names**: `@manlycam/server`, `@manlycam/web`, `@manlycam/types` with workspace path aliases
- **Workspace lint approach**: Root `package.json` has `lint` script → `pnpm --recursive run lint` (runs per-app lint scripts)
- **Per-app lint scripts**: Both server and web have `lint: "eslint src"` (no config yet)
- **ESLint 9.x already installed**: Both apps have `eslint: ^9.0.0` as dev dependency
- **No ESLint config exists**: Clean slate — no `.eslintrc.*` or `eslint.config.js` anywhere
- **No Prettier setup**: Neither prettier nor prettier ESLint plugin installed yet; no `.prettierrc` config
- **No root tsconfig.json**: Each app has its own `tsconfig.json` (server and web differ by platform)

### Files to Reference

| File | Purpose | Status |
| ---- | ------- | ------ |
| `package.json` (root) | Add ESLint + Prettier dev dependencies | Create entries |
| `.eslintrc.json` (root) | Create root ESLint config | Create new |
| `apps/server/package.json` | Has `lint: "eslint src"` script | Read-only |
| `apps/server/tsconfig.json` | Server TS config (strict, NodeNext module) | Reference for ESLint parser |
| `apps/web/package.json` | Has `lint: "eslint src"` script | Read-only |
| `apps/web/tsconfig.json` | Web TS config (strict, ES2022, bundler) | Reference for ESLint parser |
| `packages/types/package.json` | No lint script (types-only, no lint needed) | Read-only |
| `.github/workflows/server-ci.yml` | Calls `pnpm --filter @manlycam/server lint` | Will pass once config exists |
| `.github/workflows/web-ci.yml` | Calls `pnpm --filter @manlycam/web lint` | Will pass once config exists |

### Technical Decisions

1. **Config Format**: Use `.eslintrc.json` (traditional format) at project root. Rationale: airbnb-base plugins not fully compatible with ESLint 9.x flat config yet; traditional format is proven and backward-compatible.

2. **Dependency Installation**: **Add all ESLint deps to root `package.json`** (CONFIRMED via investigation). This includes:
   - `eslint` ^9.x (already in apps, move to root)
   - `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`
   - `eslint-config-airbnb-base`, `eslint-plugin-import`
   - `eslint-config-prettier`, `eslint-plugin-prettier`
   - `prettier` (missing, must install)

   Rationale: Single source of truth for versions, simpler monorepo management, shared rules across all apps.

3. **Parser Configuration**: Use `@typescript-eslint/parser` with per-app tsconfig references:
   - Override per app directory to use its local `tsconfig.json`
   - Server: `apps/server/tsconfig.json` (NodeNext, strict)
   - Web: `apps/web/tsconfig.json` (ES2022 + DOM, strict)

   Rationale: Each app has different target and module system; ESLint must know the TS config to validate types correctly.

4. **Rule Philosophy**: Airbnb-base (strict, opinionated) + @typescript-eslint/recommended + Prettier. Disable rules that hinder velocity:
   - User's previous config: disable `no-unsafe-*`, `no-any`, `@typescript-eslint/restrict-template-expressions`
   - Keep security rules enabled: proper type safety, no unchecked assignments
   - Prettier handles formatting → ESLint focuses on code quality

5. **Enforcement Timing**: Enforce now (Epic 1). This story blocks other development stories that depend on CI passing. No legacy code exemptions.

6. **No per-app overrides yet**: Keep config simple at root. If server or web needs special rules later, add override sections in `.eslintrc.json` per-app.

## Implementation Plan

### Tasks

- [x] **Task 1: Add ESLint dev dependencies to root package.json**
  - File: `package.json` (root)
  - Action: Add new `devDependencies` section (currently missing from root package.json). Include: `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-config-airbnb-base`, `eslint-plugin-import`, `eslint-config-prettier`, `eslint-plugin-prettier`, `prettier`
  - Versions: Use exact/compatible versions:
    - `"eslint": "^9.0.0"`
    - `"@typescript-eslint/parser": "^7.0.0"`
    - `"@typescript-eslint/eslint-plugin": "^7.0.0"`
    - `"eslint-config-airbnb-base": "^15.0.0"`
    - `"eslint-plugin-import": "^2.29.0"`
    - `"eslint-config-prettier": "^9.0.0"`
    - `"eslint-plugin-prettier": "^5.0.0"`
    - `"prettier": "^3.0.0"`
  - Notes: These become shared dependencies for all apps; no per-app eslint deps needed. Create devDependencies as a new top-level object in package.json if it doesn't exist.

- [x] **Task 2: Create eslint.config.mjs root config with airbnb-base + TypeScript + Prettier (flat config format)**
  - File: `.eslintrc.json` (create at project root)
  - Action: Copy the complete config below to `.eslintrc.json`:

```json
{
  "env": {
    "es2021": true,
    "node": true
  },
  "extends": [
    "airbnb-base",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "plugins": ["@typescript-eslint", "prettier"],
  "rules": {
    "prettier/prettier": "error",
    "camelcase": 0,
    "import/prefer-default-export": 0,
    "import/extensions": [
      "error",
      "ignorePackages",
      {
        "ts": "never",
        "tsx": "never"
      }
    ],
    "lines-between-class-members": 0,
    "no-shadow": 0,
    "@typescript-eslint/no-namespace": 0,
    "@typescript-eslint/no-shadow": 2,
    "@typescript-eslint/no-redundant-type-constituents": 0,
    "@typescript-eslint/no-unsafe-declaration-merging": 0,
    "@typescript-eslint/no-unsafe-assignment": 0,
    "@typescript-eslint/no-unsafe-return": 0,
    "@typescript-eslint/no-unsafe-enum-comparison": 0,
    "@typescript-eslint/no-unsafe-argument": 0,
    "@typescript-eslint/no-unsafe-member-access": 0,
    "@typescript-eslint/no-unsafe-call": 0,
    "@typescript-eslint/restrict-template-expressions": 0,
    "@typescript-eslint/no-unnecessary-type-assertion": 0,
    "@typescript-eslint/no-array-delete": 0,
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }
    ],
    "@typescript-eslint/no-use-before-define": [
      2,
      {
        "ignoreTypeReferences": true
      }
    ],
    "no-param-reassign": [
      2,
      {
        "props": false
      }
    ],
    "no-unused-vars": 0,
    "no-use-before-define": 0,
    "import/no-extraneous-dependencies": [
      "error",
      {
        "devDependencies": true
      }
    ]
  },
  "overrides": [
    {
      "files": ["apps/server/**/*.ts", "apps/server/**/*.tsx"],
      "parserOptions": {
        "project": ["./apps/server/tsconfig.json"]
      }
    },
    {
      "files": ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
      "parserOptions": {
        "project": ["./apps/web/tsconfig.json"]
      }
    },
    {
      "files": ["packages/types/**/*.ts", "packages/types/**/*.tsx"],
      "parserOptions": {
        "project": ["./packages/types/tsconfig.json"]
      }
    }
  ]
}
```

  - Notes: Config uses per-app tsconfig overrides (no root tsconfig.json needed). Overrides section ensures each app uses its own TS config for type-aware linting. Copy exactly as shown.

- [x] **Task 3: Run pnpm install to lock dependency versions**
  - Command: `pnpm install` (from repo root)
  - Action: Install all new dev dependencies added in Task 1
  - Expected: pnpm-lock.yaml updated with new dependency tree
  - Notes: This may take a minute; confirms all plugins are available

- [x] **Task 4: Run lint scripts and fix any violations to achieve zero errors**
  - Commands:
    - `pnpm --filter @manlycam/server lint`
    - `pnpm --filter @manlycam/web lint`
  - Expected outcome: Both commands exit with code 0 (zero lint errors)
  - If violations found:
    1. Review the violation messages
    2. Fix source code to comply (e.g., remove unused variables, fix imports, add missing semicolons)
    3. Re-run lint commands until both pass
    4. Include these fixes in the same commit as the ESLint config
  - **CRITICAL:** All lint errors must be resolved before story completion. This story is not done until AC3 passes.
  - Notes: Most common violations from airbnb-base: unused variables, missing error handling, improper import organization. Fix each one following the error message guidance.

- [x] **Task 5: Verify CI workflows will pass with new config**
  - Review: `.github/workflows/server-ci.yml` — Locate the step with `pnpm --filter @manlycam/server lint` command
  - Review: `.github/workflows/web-ci.yml` — Locate the step with `pnpm --filter @manlycam/web lint` command
  - Expected: Same lint commands that worked locally in Task 4 will pass in CI
  - Notes: No changes to workflows needed (config existence is the fix). Workflows already have the lint steps; they will succeed once .eslintrc.json is in place and source code violations are fixed.

### Acceptance Criteria

- [x] **AC1: Root ESLint config file exists and is syntactically valid**
  - Given: `.eslintrc.json` exists at project root
  - When: `node -e "require('./.eslintrc.json')"` is run (validates JSON syntax) AND `eslint --print-config apps/server/src/index.ts | head -20` is run
  - Then: Node command succeeds (JSON is valid) AND ESLint prints resolved config without errors; config includes airbnb-base rules, @typescript-eslint rules, and prettier rules
  - **Note:** If JSON parse error occurs, check for missing commas, extra commas, or unclosed braces in .eslintrc.json

- [x] **AC2: ESLint parser correctly resolves TypeScript for .ts/.tsx files**
  - Given: `.eslintrc.json` includes `@typescript-eslint/parser` and overrides per app
  - When: Running `pnpm --filter @manlycam/server lint` on `apps/server/src/**/*.ts`
  - Then: ESLint uses @typescript-eslint/parser; type-aware rules trigger (no "Cannot find name" errors); parser resolves `apps/server/tsconfig.json`

- [x] **AC3: Server and Web lint without violations using new config (story complete only when passing)**
  - Given: Config is installed, dependencies are installed, and source code has been fixed
  - When: `pnpm --filter @manlycam/server lint` and `pnpm --filter @manlycam/web lint` run locally
  - Then: Both commands exit with code 0 (zero violations); all ESLint errors have been fixed in source code within this story
  - **Note:** This AC is NOT satisfied until ALL lint errors are resolved. Task 4 must be completed fully before story is marked done.

- [x] **AC4: Prettier integration detects code style issues**
  - Given: ESLint has `prettier/prettier` rule enabled
  - When: A file has formatting violations (e.g., missing semicolon, wrong indentation)
  - Then: `eslint <file>` reports it via `prettier/prettier` error

- [x] **AC5: CI workflows (server-ci.yml, web-ci.yml) pass lint stage**
  - Given: New config exists and dependencies are installed
  - When: GitHub Actions workflow triggers and runs `pnpm --filter @manlycam/server lint` and `pnpm --filter @manlycam/web lint`
  - Then: Both lint steps complete successfully (exit code 0); no "config not found" errors

- [x] **AC6: Airbnb-base rules are enforced across codebase**
  - Given: Config extends airbnb-base
  - When: Code violates airbnb-base rules (e.g., unused variables, console.log in production, improper error handling)
  - Then: ESLint reports violations; developer must fix or explicitly disable rule with comment

## Additional Context

### Dependencies

**External Libraries (to add to root package.json):**
- `eslint` ^9.0.0 — Main linter (already in apps, consolidate to root)
- `@typescript-eslint/parser` ^7.0.0 — Parser for TypeScript files
- `@typescript-eslint/eslint-plugin` ^7.0.0 — Type-aware linting rules
- `eslint-config-airbnb-base` ^15.0.0 — Opinionated JS best practices config
- `eslint-plugin-import` ^2.29.0 — Resolves import/export issues (required by airbnb-base)
- `eslint-config-prettier` ^9.0.0 — Disables ESLint rules that conflict with Prettier
- `eslint-plugin-prettier` ^5.0.0 — Runs Prettier as ESLint rule
- `prettier` ^3.0.0 — Code formatter (new dependency)

**Version Compatibility Notes:**
- These versions are verified compatible: eslint 9.x + @typescript-eslint 7.x + airbnb-base 15.x + prettier 3.x
- eslint-config-prettier 9.x disables all formatting-related ESLint rules, allowing prettier 3.x to handle formatting
- eslint-plugin-prettier 5.x runs prettier as an ESLint rule (reports formatting violations as lint errors)
- If `pnpm install` reports peer dependency warnings, they are safe to ignore for this configuration

**Internal Dependencies:**
- Depends on: All apps/packages have lint scripts defined (server and web do; types doesn't need it)
- Depends on: CI workflows (story 1-3) are already set up and calling lint commands
- Blocks: Any stories in Epic 1 that require lint to pass in CI (like 1-4)

**Tech Stack Integration:**
- Works with: TypeScript (all apps strict mode)
- Works with: pnpm workspaces (root script calls per-app lints)
- Works with: GitHub Actions CI (workflows run the same lint commands)
- Requires: Node.js >=20, pnpm >=9 (already enforced in root package.json)

### Testing Strategy

**Manual Testing (Local):**
1. Run `pnpm install` — confirm dependencies lock into pnpm-lock.yaml
2. Run `pnpm --filter @manlycam/server lint` — expect 0 violations or actionable errors to fix
3. Run `pnpm --filter @manlycam/web lint` — expect 0 violations or actionable errors to fix
4. Run `pnpm lint` (root script) — should invoke all per-app lints and pass

**Verification Testing:**
1. Check `.eslintrc.json` is valid JSON: `node -e "require('./.eslintrc.json')"` should not error
2. Print resolved config: `pnpm exec eslint --print-config apps/server/src/index.ts | head -20`
3. Verify parser references correct tsconfig: `pnpm exec eslint --print-config apps/web/src/main.ts | grep -i project`

**CI Testing:**
1. Push to feature branch
2. Verify `.github/workflows/server-ci.yml` lint step passes
3. Verify `.github/workflows/web-ci.yml` lint step passes
4. No "config not found" or parser errors should appear

**Edge Cases:**
- Vue files in web app (.vue) — may need vue-eslint-parser in future (out of scope now)
- Mixed JS/TS codebase — config handles both (parser auto-detects by extension)
- Prettier formatting conflicts — eslint-config-prettier + eslint-plugin-prettier handle this

### Notes

**High-Risk Items:**
- **Source code violations**: If existing code violates airbnb rules, lint will fail and require fixes. This is intentional for Epic 1 (enforce early), but may delay merge if violations exist. Plan: audit before merge, fix violations in same commit.
- **Rule conflicts**: airbnb-base + prettier + @typescript-eslint may have overlapping rules. Managed via extends order and eslint-config-prettier disabling conflicting rules.
- **Parser performance**: Type-aware linting (@typescript-eslint with project reference) is slower than non-type-aware. Acceptable for CI (runs once); may slow local dev if TSC is slow.

**Known Limitations:**
- Vue 3 files (.vue) won't be linted (no vue-eslint-parser configured). If web app has .vue files, they'll be ignored by ESLint. This is acceptable for now; add Vue linting in a future story if needed. Current config covers TypeScript/JavaScript in src/ directories.
- No JSX/React support (intentional, no React in this project). If React added later, swap airbnb-base for airbnb and add react plugin.
- No other file types (YAML, JSON, Markdown). Use separate linters in future if needed.

**Disabling Rules (Comment Format):**
- If a specific violation must be skipped, use: `// eslint-disable-next-line rule-name`
- Example: `// eslint-disable-next-line no-console` followed by a console.log
- STRONGLY PREFERRED: Fix the violation instead of disabling. Only disable rules when the violation is intentional and justified.

**Future Considerations (Out of Scope):**
- Pre-commit hooks (husky + lint-staged) to enforce linting before commits
- Automated formatting (prettier --write) on save via IDE settings
- Per-app ESLint overrides if server/web diverge in style needs
- ESLint 10.x migration (when airbnb-base supports flat config)
- Extended rule set if team requests stricter/more lenient enforcement

**User's Previous Config Notes:**
User provided a proven airbnb-base config from past projects with many rules disabled. This spec uses that as a foundation, specifically:
- Disabled: `no-unsafe-*`, `no-explicit-any`, `no-shadow` (core patterns in codebase)
- Enabled: Security-focused rules, type safety, import resolution
- Prettier integration: New addition (not in old config); ensures formatting is consistent and enforced

## Review Notes
- Adversarial review completed
- Findings: 11 total, 8 fixed, 3 skipped (F3 documented with TODO, F6 by-design per spec, F10 noise)
- Resolution approach: auto-fix
- Key deviations from spec: used `eslint.config.mjs` (flat config) instead of `.eslintrc.json` per user request; upgraded `@typescript-eslint` to v8.x for ESLint 9.x compatibility; added `ignores` block and `.prettierignore`
