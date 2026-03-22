import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { wsHub } from '../services/wsHub.js';
import { prisma } from '../db/client.js';
import { streamService } from '../services/streamService.js';
import { pisugarStatus } from '../lib/pisugar.js';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { ulid } from '../lib/ulid.js';
import { computeUserTag } from '../lib/user-tag.js';
import type { AppEnv } from '../lib/types.js';
import type { PiSugarStatus, Role, UserPresence, WsMessage } from '@manlycam/types';
import { SYSTEM_USER_ID } from '@manlycam/types';
import type { User } from '@prisma/client';
import type { createNodeWebSocket } from '@hono/node-ws';

type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>['upgradeWebSocket'];

// WeakMap stores dispose + connection info per WS context object
const disposeMap = new WeakMap<
  object,
  { dispose: () => void; connectionId: string; userId: string }
>();

// Cached latest PiSugar status — included in admin init payload
let cachedPiSugarStatus: PiSugarStatus | null = null;

/* c8 ignore start -- PiSugar event subscription only active when FRP_PISUGAR_PORT is configured (Pi hardware) */
if (env.FRP_PISUGAR_PORT) {
  pisugarStatus.on('pisugarStatus', (status: PiSugarStatus) => {
    cachedPiSugarStatus = status;
    wsHub.broadcastToAdmin({ type: 'pisugar:status', payload: status });
  });
}
/* c8 ignore stop */

function userRowToPresence(user: User): UserPresence {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    role: user.role as Role,
    isMuted: user.mutedAt !== null,
    userTag: computeUserTag(user),
  };
}

export function createWsRouter(upgradeWebSocket: UpgradeWebSocket) {
  const wsRouter = new Hono<AppEnv>();

  wsRouter.get(
    '/ws',
    requireAuth,
    upgradeWebSocket((c) => {
      const rawUser = c.get('user')!;
      const connectionId = ulid();
      const userPresence: UserPresence = {
        id: rawUser.id,
        displayName: rawUser.displayName,
        avatarUrl: rawUser.avatarUrl ?? null,
        role: rawUser.role as Role,
        isMuted: rawUser.mutedAt !== null,
        userTag: computeUserTag(rawUser),
      };

      return {
        onOpen(_evt, ws) {
          // Check BEFORE adding — determines if user is already present
          const isFirstConnection = !wsHub.hasUserConnections(userPresence.id);

          const dispose = wsHub.addClient(
            connectionId,
            {
              send: (data) => ws.send(data),
              close: () => ws.close(),
            },
            userPresence,
          );
          disposeMap.set(ws as object, { dispose, connectionId, userId: userPresence.id });

          // Only broadcast join if this is the user's first active connection
          if (isFirstConnection) {
            wsHub.broadcastExcept(connectionId, { type: 'presence:join', payload: userPresence });
          }

          // Send presence seed to new client
          try {
            const seedMsg: WsMessage = { type: 'presence:seed', payload: wsHub.getPresenceList() };
            ws.send(JSON.stringify(seedMsg));

            const initMsg: WsMessage = { type: 'stream:state', payload: streamService.getState() };
            ws.send(JSON.stringify(initMsg));

            /* c8 ignore start -- cachedPiSugarStatus is only set when FRP_PISUGAR_PORT is configured (Pi hardware) */
            if (userPresence.role === 'Admin' && cachedPiSugarStatus !== null) {
              const piSugarMsg: WsMessage = {
                type: 'pisugar:status',
                payload: cachedPiSugarStatus,
              };
              ws.send(JSON.stringify(piSugarMsg));
            }
            /* c8 ignore stop */
          } catch (err) {
            logger.warn({ err }, 'Failed to send initial messages on WS open');
            ws.close();
          }
        },
        onClose(_evt, ws) {
          const entry = disposeMap.get(ws as object);
          if (entry) {
            entry.dispose();
            // Only broadcast leave if user has no remaining connections
            if (!wsHub.hasUserConnections(entry.userId)) {
              wsHub.broadcast({ type: 'presence:leave', payload: { userId: entry.userId } });
            }
            disposeMap.delete(ws as object);
          }
        },
        async onMessage(evt, ws) {
          /* c8 ignore next -- ArrayBuffer fallback: WebSocket test mocks only emit string data; ArrayBuffer path unreachable in jsdom */
          const raw = typeof evt.data === 'string' ? evt.data : String(evt.data);
          try {
            const msg = JSON.parse(raw) as { type: string; payload?: unknown };
            if (msg.type === 'typing:start') {
              wsHub.broadcastExcept(connectionId, {
                type: 'typing:start',
                payload: { userId: userPresence.id, displayName: userPresence.displayName },
              });
            }
            if (msg.type === 'typing:stop') {
              wsHub.broadcastExcept(connectionId, {
                type: 'typing:stop',
                payload: { userId: userPresence.id },
              });
            }
            if (msg.type === 'users:directory') {
              const users = await prisma.user.findMany({
                where: { bannedAt: null, id: { not: SYSTEM_USER_ID } },
              });
              const infoMsg: WsMessage = {
                type: 'users:info',
                payload: users.map(userRowToPresence),
              };
              ws.send(JSON.stringify(infoMsg));
            }
            if (msg.type === 'users:lookup') {
              const ids = (msg.payload as { ids: string[] }).ids;
              if (Array.isArray(ids) && ids.length > 0) {
                const users = await prisma.user.findMany({
                  where: { id: { in: ids, not: SYSTEM_USER_ID } },
                });
                const infoMsg: WsMessage = {
                  type: 'users:info',
                  payload: users.map(userRowToPresence),
                };
                ws.send(JSON.stringify(infoMsg));
              }
            }
          } catch {
            // Ignore malformed
          }
        },
      };
    }),
  );

  return wsRouter;
}
