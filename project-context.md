# Project Context

This file provides high-level context about the ManlyCam project for AI agents and new developers.

## Coding Standards & Conventions

- **Language**: TypeScript
- **Frameworks**:
    - **Frontend**: Vue.js with Vite
    - **Backend**: Hono on Cloudflare Workers
    - **Database**: Prisma
- **Monorepo**: PNPM workspaces
- **Styling**: Tailwind CSS with shadcn-vue components.
- **Linting**: ESLint and Prettier are configured at the root. Run `pnpm lint` and `pnpm format`.
- **Types**: Shared types are located in `packages/types`.

## Architectural Principles

1.  **Thin Server, Smart Client**: The server is primarily a data API. Business logic, where feasible, resides in the client application.
2.  **Real-time First**: WebSockets are the primary means of communication for state changes. Use the `wsHub` on the server and the `useWebSocket` composable on the client.
3.  **Immutable-ish State**: Client-side state management should treat objects as immutable. Avoid direct mutations of state properties.
4.  **Role-Based Access Control (RBAC)**: All sensitive operations must be gated by role checks on the server. Role definitions are centralized in `packages/types/src/roles.ts`.
