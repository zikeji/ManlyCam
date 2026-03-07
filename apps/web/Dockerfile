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
