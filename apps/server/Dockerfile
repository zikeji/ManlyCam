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

# Build shared types package first (server tsc paths resolve to dist/*.d.ts)
RUN pnpm --filter @manlycam/types build

# Compile TypeScript
RUN pnpm --filter @manlycam/server exec tsc && chmod +x apps/server/dist/cli/index.js

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

# Make the admin CLI available globally in the container
RUN ln -s /repo/node_modules/.bin/manlycam-admin /usr/local/bin/manlycam-admin

WORKDIR /repo/apps/server

EXPOSE 3000

CMD ["node", "dist/index.js"]
