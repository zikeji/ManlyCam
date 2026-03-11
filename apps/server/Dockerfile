# Stage 1: Web Build
FROM node:24-alpine AS web-builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

# Copy web app and shared types
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/ ./packages/types/
COPY apps/web/ ./apps/web/

RUN pnpm install --frozen-lockfile

# Build shared types package first
RUN pnpm --filter @manlycam/types build

# Build Vue app
RUN pnpm --filter @manlycam/web build

# Stage 2: Server Build
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/ ./packages/types/
COPY apps/server/ ./apps/server/

RUN pnpm install --frozen-lockfile

# Generate Prisma client (must run before build so TS can resolve generated types)
RUN pnpm --filter @manlycam/server exec prisma generate

# Build shared types package first
RUN pnpm --filter @manlycam/types build

# Compile TypeScript
RUN pnpm --filter @manlycam/server exec tsc && chmod +x apps/server/dist/cli/index.js

# Stage 3: Runtime
FROM node:24-alpine AS runner

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/ ./packages/types/
COPY apps/server/package.json ./apps/server/

# Copy compiled output and Prisma artifacts before install
# This ensures pnpm can link the 'manlycam-admin' bin to its target in dist/
COPY --from=builder /repo/apps/server/dist ./apps/server/dist
COPY --from=builder /repo/apps/server/prisma ./apps/server/prisma

RUN pnpm install --frozen-lockfile --prod

# Copy node_modules from builder to ensure Prisma client is present
COPY --from=builder /repo/node_modules/.pnpm ./node_modules/.pnpm

# Copy web dist
COPY --from=web-builder /repo/apps/web/dist ./apps/web/dist

# Make the admin CLI available globally in the container
# We link directly to the compiled JS file since pnpm workspace symlinks can be tricky in minimalist Docker copies
RUN ln -s /repo/apps/server/dist/cli/index.js /usr/local/bin/manlycam-admin

WORKDIR /repo/apps/server

# Copy and prepare entrypoint script
COPY apps/server/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/repo/apps/server/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
