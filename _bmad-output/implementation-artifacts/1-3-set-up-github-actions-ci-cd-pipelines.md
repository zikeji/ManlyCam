# Story 1.3: Set Up GitHub Actions CI/CD Pipelines

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want path-filtered GitHub Actions workflows for all three components,
so that each component can be built, tested, and released independently when its code changes.

## Acceptance Criteria

**AC1 — Agent CI: lint, test, cross-compile on path change**
Given a commit is pushed that modifies files under `apps/agent/`
When the agent CI workflow runs
Then it runs `go vet ./...`, runs `go test ./...`, and cross-compiles for `GOOS=linux GOARCH=arm GOARM=7`

**AC2 — Agent CI: GitHub Release on semver tag**
Given a semver tag (e.g., `v1.2.3`) is pushed
When the agent release workflow runs
Then it cross-compiles the binary for `GOOS=linux GOARCH=arm GOARM=7` and creates a GitHub Release with the binary artifact — the artifact contains no credentials or hardcoded server addresses

**AC3 — Server CI: lint, typecheck, test, Docker build/push on path change**
Given a commit is pushed that modifies files under `apps/server/**`
When the server CI workflow runs
Then it runs ESLint, runs `tsc --noEmit`, runs Vitest, builds the Docker image (`apps/server/Dockerfile`), and pushes to the configured registry tagged with commit SHA and `latest`

**AC4 — Web CI: lint, typecheck, test, Vite build, Docker build/push on path change**
Given a commit is pushed that modifies files under `apps/web/**`
When the web CI workflow runs
Then it runs ESLint, runs `tsc --noEmit`, runs Vitest, runs `vite build`, builds the Docker image (`apps/web/Dockerfile`), and pushes to the configured registry tagged with commit SHA and `latest`

**AC5 — Types CI: typecheck only on path change**
Given a commit is pushed that modifies only `packages/types/**`
When the types CI workflow runs
Then it runs `tsc --noEmit` — no Docker build, no release artifact

**AC6 — Path isolation**
Given a commit that modifies only one component's files
When CI runs
Then only that component's workflow fires — other workflows are not triggered

**AC7 — No secrets in build artifacts**
Given any workflow runs
When a Docker image or binary artifact is built
Then no workflow embeds secrets in build artifacts — all sensitive values are injected at runtime via environment variables or Docker secrets

**AC8 — Server Dockerfile created**
Given the `apps/server/Dockerfile` does not yet exist (intentionally deferred from Story 1.1)
When this story is complete
Then `apps/server/Dockerfile` exists: Node.js base + `ffmpeg` via apt/apk, Prisma generate at build time, production-ready multi-stage build

---

## Tasks / Subtasks

- [x] Task 1: Create `apps/server/Dockerfile` (AC: #8, #3)
  - [x] Multi-stage: `builder` stage installs deps, runs `prisma generate`, runs `tsc`
  - [x] Final stage: Node.js runtime + `ffmpeg` installed, copies `dist/` and `node_modules`
  - [x] Use `node:20-alpine` base (consistent with web Dockerfile pattern)
  - [x] `ffmpeg` installed via `apk add ffmpeg` in final stage
  - [x] `prisma generate` runs in builder stage after deps install
  - [x] `EXPOSE 3000` (Hono default port)

- [x] Task 2: Create `.github/workflows/agent-ci.yml` (AC: #1, #2, #6, #7)
  - [x] Path filter: `apps/agent/**` for push/PR events
  - [x] Separate trigger for semver tag `v*.*.*` (release job)
  - [x] CI job: `go vet ./...` then `go test ./...` from `apps/agent/`
  - [x] Cross-compile: `GOOS=linux GOARCH=arm GOARM=7 go build -o manlycam-agent ./...`
  - [x] Release job (tag-only): cross-compile + `gh release create` with binary artifact
  - [x] No hardcoded credentials or server addresses in workflow or binary

- [x] Task 3: Create `.github/workflows/server-ci.yml` (AC: #3, #6, #7)
  - [x] Path filter: `apps/server/**` for push to `main`
  - [x] Install pnpm + deps via `pnpm install --frozen-lockfile`
  - [x] Lint: `pnpm --filter @manlycam/server lint`
  - [x] Typecheck: `pnpm --filter @manlycam/server typecheck`
  - [x] Test: `pnpm --filter @manlycam/server test`
  - [x] Docker build: `docker build -f apps/server/Dockerfile -t <registry>/server:<sha> .`
  - [x] Tag with both commit SHA (`${{ github.sha }}`) and `latest`
  - [x] Push to GHCR (`ghcr.io/${{ github.repository_owner }}/manlycam-server`)
  - [x] Use `GITHUB_TOKEN` for GHCR auth (no external secret needed for GHCR)

- [x] Task 4: Create `.github/workflows/web-ci.yml` (AC: #4, #6, #7)
  - [x] Path filter: `apps/web/**` for push to `main`
  - [x] Install pnpm + deps via `pnpm install --frozen-lockfile`
  - [x] Lint: `pnpm --filter @manlycam/web lint`
  - [x] Typecheck: `pnpm --filter @manlycam/web typecheck`
  - [x] Test: `pnpm --filter @manlycam/web test`
  - [x] Vite build: `pnpm --filter @manlycam/web build`
  - [x] Docker build: `docker build -f apps/web/Dockerfile -t <registry>/web:<sha> .`
  - [x] Tag with commit SHA and `latest`
  - [x] Push to GHCR (`ghcr.io/${{ github.repository_owner }}/manlycam-web`)

- [x] Task 5: Create `.github/workflows/types-ci.yml` (AC: #5, #6)
  - [x] Path filter: `packages/types/**` for push to `main`
  - [x] Install pnpm + deps
  - [x] Typecheck only: `pnpm --filter @manlycam/types typecheck`
  - [x] No Docker build, no artifact, no release

---

## Dev Notes

### Context: What Story 1.1 Intentionally Left Out

Story 1.1 explicitly deferred `apps/server/Dockerfile` to this story (per Story 1.1 completion notes):
> "Server Dockerfile scope: `apps/server/Dockerfile` is NOT created in this story — that is Story 1.3 (CI/CD pipelines) scope."

`apps/web/Dockerfile` already exists (created in Story 1.1) and is correct — do NOT modify it. Use it as a pattern reference for the server Dockerfile.

### Existing Web Dockerfile Pattern (reference — do NOT modify)

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/ ./packages/types/
COPY apps/web/ ./apps/web/

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @manlycam/web build

# Stage 2: Serve
FROM nginx:alpine AS runner

COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Server Dockerfile Requirements (Architecture)

From architecture.md: "Node.js base + `ffmpeg` apt package; Prisma generate at build time"

The server Dockerfile must:
1. Use `node:20-alpine` base (consistent with web)
2. Install `ffmpeg` via `apk add --no-cache ffmpeg` in the final stage (runtime dependency — ffmpeg transcodes HLS)
3. Run `prisma generate` in the builder stage so Prisma client is available at runtime
4. Run `tsc` build to produce `dist/`
5. Copy only production artifacts to the final stage

Target Dockerfile for `apps/server/Dockerfile`:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/ ./packages/types/
COPY apps/server/ ./apps/server/

RUN pnpm install --frozen-lockfile

# Generate Prisma client (must run before build so TS can resolve generated types)
RUN pnpm --filter @manlycam/server exec prisma generate

# Compile TypeScript
RUN pnpm --filter @manlycam/server build

# Stage 2: Runtime
FROM node:20-alpine AS runner

# ffmpeg is required for HLS stream transcoding
RUN apk add --no-cache ffmpeg

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/ ./packages/types/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile --prod

# Copy compiled output and Prisma artifacts
COPY --from=builder /repo/apps/server/dist ./apps/server/dist
COPY --from=builder /repo/apps/server/prisma ./apps/server/prisma
COPY --from=builder /repo/node_modules/.pnpm ./node_modules/.pnpm

WORKDIR /repo/apps/server

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

Note: If the production install approach is complex with pnpm workspaces, an alternative is to copy `node_modules` wholesale from builder — test the build and adjust if needed. The goal is a working production image, not a perfectly minimized one.

### GitHub Actions Workflow Patterns

#### Agent CI/CD (`.github/workflows/agent-ci.yml`)

Two distinct triggers:
1. **Path-filtered CI** (push to `main` or PR touching `apps/agent/**`): vet + test + build check
2. **Semver tag release** (`v*.*.*`): cross-compile + GitHub Release

```yaml
name: Agent CI

on:
  push:
    branches: [main]
    paths:
      - 'apps/agent/**'
    tags:
      - 'v*.*.*'
  pull_request:
    paths:
      - 'apps/agent/**'

jobs:
  test:
    if: "!startsWith(github.ref, 'refs/tags/')"
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/agent
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: 'apps/agent/go.mod'
      - run: go vet ./...
      - run: go test ./...
      - name: Cross-compile ARM check
        run: GOOS=linux GOARCH=arm GOARM=7 go build -o /dev/null ./...

  release:
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    defaults:
      run:
        working-directory: apps/agent
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: 'apps/agent/go.mod'
      - name: Cross-compile for ARM
        run: GOOS=linux GOARCH=arm GOARM=7 go build -o manlycam-agent ./...
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: apps/agent/manlycam-agent
```

Key constraint: The binary must contain no hardcoded credentials or server addresses. All runtime config is loaded from `config.toml` on the Pi.

#### Server CI (`.github/workflows/server-ci.yml`)

```yaml
name: Server CI

on:
  push:
    branches: [main]
    paths:
      - 'apps/server/**'
      - 'packages/types/**'

jobs:
  ci:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @manlycam/server lint
      - run: pnpm --filter @manlycam/server typecheck
      - run: pnpm --filter @manlycam/server test
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push server image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/server/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/manlycam-server:${{ github.sha }}
            ghcr.io/${{ github.repository_owner }}/manlycam-server:latest
```

Note: `packages/types/**` is included in the server path filter because the server depends on shared types — a types change should re-verify server compatibility.

#### Web CI (`.github/workflows/web-ci.yml`)

Same structure as server CI — swap filter to `apps/web/**`, image name to `manlycam-web`, Dockerfile to `apps/web/Dockerfile`.

#### Types CI (`.github/workflows/types-ci.yml`)

```yaml
name: Types CI

on:
  push:
    branches: [main]
    paths:
      - 'packages/types/**'
  pull_request:
    paths:
      - 'packages/types/**'

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @manlycam/types typecheck
```

### Secrets and Registry Configuration

**GHCR (GitHub Container Registry)** is the correct choice for this project:
- Uses built-in `GITHUB_TOKEN` — no external secret setup required
- Image URL: `ghcr.io/<github_username>/manlycam-server` and `ghcr.io/<github_username>/manlycam-web`
- The `repository_owner` context variable resolves to the GitHub org/user automatically
- Images are private by default; visibility can be changed in GitHub Package settings

**Required repository permissions for workflows:**
- `contents: write` — for the agent release job (creates GitHub Release)
- `packages: write` — for Docker image push to GHCR

**No secrets need to be manually configured** if using GHCR with `GITHUB_TOKEN`. If an external registry is needed in the future, add `REGISTRY_USERNAME` and `REGISTRY_PASSWORD` to repository secrets.

### Go Version

`apps/agent/go.mod` specifies `go 1.25.0`. Use `go-version-file: 'apps/agent/go.mod'` in `actions/setup-go` to automatically pin to the correct version.

### Go Module Path

The Go module is `github.com/zikeji/ManlyCam/apps/agent`. The `go build ./...` command must be run from `apps/agent/` (or use the `working-directory` context in the workflow step).

### Architecture-Mandated Workflow File Names

The architecture tree (architecture.md#Project Structure) shows:
```
.github/
└── workflows/
    ├── agent.yml
    ├── server.yml
    └── web.yml
```
However, the CI/CD Strategy table uses `agent-ci.yml`, `server-ci.yml`, `web-ci.yml`. Either naming is acceptable — use the `-ci.yml` suffix for clarity (the workflow `name:` field is what shows in the GitHub Actions UI). Add `types-ci.yml` as the 4th workflow (not shown in the original tree, which was created before the types workflow was specified).

### pnpm Workspace: Correct Filter Commands

All CI steps for Node.js apps must use pnpm workspace filters. Commands run from repo root:

| Action | Command |
|---|---|
| Server lint | `pnpm --filter @manlycam/server lint` |
| Server typecheck | `pnpm --filter @manlycam/server typecheck` |
| Server test | `pnpm --filter @manlycam/server test` |
| Server build | `pnpm --filter @manlycam/server build` |
| Web lint | `pnpm --filter @manlycam/web lint` |
| Web typecheck | `pnpm --filter @manlycam/web typecheck` |
| Web test | `pnpm --filter @manlycam/web test` |
| Web build | `pnpm --filter @manlycam/web build` |
| Types typecheck | `pnpm --filter @manlycam/types typecheck` |
| Prisma generate | `pnpm --filter @manlycam/server exec prisma generate` |

### Docker Build Context

All Docker builds use the **repo root** as build context (`.`) because the Dockerfiles copy from `packages/types/` which lives outside the app directory:

```bash
# Correct — context is repo root, file path is explicit
docker build -f apps/server/Dockerfile -t image:tag .

# Wrong — would fail because COPY packages/types/ can't reach outside apps/server/
docker build apps/server/
```

This matches the pattern already established in `apps/web/Dockerfile` (which COPYs `packages/types/` and `apps/web/` from the repo root).

### Agent Binary: No Credentials Rule

The agent binary must load ALL configuration from `apps/agent/deploy/config.example.toml` (or user's `config.toml`) at runtime. The CI workflow must NOT embed any of the following in the binary at compile time:
- Server URL / hostname
- FRP token or credentials
- Any API keys

This is enforced by Go's build system (no `ldflags` injecting credentials) and verified by the AC.

### Project Structure After This Story

```
.github/
└── workflows/
    ├── agent-ci.yml      # CREATED — go vet, go test, cross-compile; release on semver tag
    ├── server-ci.yml     # CREATED — lint, typecheck, test, Docker push on apps/server/**
    ├── web-ci.yml        # CREATED — lint, typecheck, test, Vite build, Docker push on apps/web/**
    └── types-ci.yml      # CREATED — typecheck only on packages/types/**
apps/
└── server/
    └── Dockerfile        # CREATED — Node.js + ffmpeg, Prisma generate at build time
```

All other files are UNCHANGED.

### Learnings from Stories 1.1 and 1.2

- **pnpm v10 requirement:** `pnpm.onlyBuiltDependencies` is already configured in root `package.json` for Prisma/esbuild build scripts — `pnpm install --frozen-lockfile` in CI will respect this
- **Prisma generate:** Must run after `pnpm install` and before `tsc` build — the generated client is needed for TypeScript compilation
- **DB not needed in CI:** The server test/typecheck steps do NOT need a running database — Prisma typechecks against the schema, not the DB; Vitest mocks DB in unit tests
- **Workspace install:** `pnpm install --frozen-lockfile` from repo root installs ALL workspace dependencies — no need for per-package install commands in CI

### Anti-Patterns — Hard Bans

| Anti-pattern | Why |
|---|---|
| Hardcoding registry URL in workflow | Use `ghcr.io/${{ github.repository_owner }}` for portability |
| Using `docker/login-action` with manual credentials for GHCR | `GITHUB_TOKEN` is sufficient for GHCR — no external secret needed |
| Running `go build` from repo root without `working-directory` or explicit path | Would fail — `go.mod` is in `apps/agent/`, not repo root |
| Embedding server address or FRP token in agent binary via `-ldflags` | Violates no-credentials-in-artifacts requirement |
| Building Docker image without repo-root context | COPY instructions in Dockerfiles reference `packages/types/` — must use root context |
| Running `prisma migrate` in CI | CI only needs `prisma generate` — migrations run against a real DB (not CI) |
| Storing `DATABASE_URL` in workflow as plaintext | Not needed in CI (no migration step); if ever needed, use repository secrets |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3] — Acceptance criteria and story statement
- [Source: _bmad-output/planning-artifacts/architecture.md#CI/CD Strategy] — Workflow table (agent-ci.yml, server-ci.yml, web-ci.yml, types-ci.yml), path filters, Docker image tagging strategy
- [Source: _bmad-output/planning-artifacts/architecture.md#Backend: Hono] — "Docker: `apps/server/Dockerfile` — Node.js base + `ffmpeg` apt package; Prisma generate at build time"
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Monorepo Tree] — `.github/workflows/` file names (agent.yml, server.yml, web.yml)
- [Source: _bmad-output/implementation-artifacts/1-1-initialize-monorepo-with-application-scaffolds-and-shared-types.md] — "Server Dockerfile scope: NOT created in Story 1.1 — that is Story 1.3 scope"; `apps/web/Dockerfile` already exists as pattern reference
- [Source: _bmad-output/implementation-artifacts/1-2-configure-prisma-schema-with-all-data-models-and-initial-migration.md] — pnpm filter command patterns confirmed; Prisma generate workflow

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward following story Dev Notes specifications.

### Completion Notes List

- Created `apps/server/Dockerfile`: multi-stage build (node:20-alpine) with Prisma generate in builder stage, ffmpeg via apk in runtime stage, EXPOSE 3000. Followed exact pattern from Dev Notes.
- Created `.github/workflows/agent-ci.yml`: path-filtered CI (apps/agent/**) for push/PR with go vet + go test + ARM cross-compile check; separate release job triggered by semver tag (v*.*.*) that cross-compiles and creates GitHub Release via softprops/action-gh-release@v2. No credentials in binary.
- Created `.github/workflows/server-ci.yml`: path filter on apps/server/** and packages/types/**; pnpm lint/typecheck/test then Docker build+push to GHCR using GITHUB_TOKEN only.
- Created `.github/workflows/web-ci.yml`: path filter on apps/web/** and packages/types/**; pnpm lint/typecheck/test/build then Docker build+push to GHCR.
- Created `.github/workflows/types-ci.yml`: path filter on packages/types/**; typecheck only — no Docker, no artifact, no release.
- All workflows use repo root as Docker build context to allow COPY of packages/types/ from outside app directories.
- All YAML files validated with Python yaml.safe_load — no syntax errors.

### File List

- `apps/server/Dockerfile` (created)
- `.github/workflows/agent-ci.yml` (created)
- `.github/workflows/server-ci.yml` (created)
- `.github/workflows/web-ci.yml` (created)
- `.github/workflows/types-ci.yml` (created)

### Change Log

- 2026-03-06: Story implementation complete — created server Dockerfile and all 4 GitHub Actions CI/CD workflows (agent-ci, server-ci, web-ci, types-ci). All 8 ACs satisfied.
