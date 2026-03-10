import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { wsHub } from '../services/wsHub.js';
import { streamService } from '../services/streamService.js';
import { logger } from '../lib/logger.js';
import { ulid } from '../lib/ulid.js';
import type { AppEnv } from '../lib/types.js';
import type { Role, UserPresence, UserTag, WsMessage } from '@manlycam/types';
import type { createNodeWebSocket } from '@hono/node-ws';

type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>['upgradeWebSocket'];

// WeakMap stores dispose + connection info per WS context object
const disposeMap = new WeakMap<
  object,
  { dispose: () => void; connectionId: string; userId: string }
>();

function computeUserTag(user: {
  userTagText: string | null;
  userTagColor: string | null;
  role: string;
}): UserTag | null {
  if (user.userTagText) return { text: user.userTagText, color: user.userTagColor ?? '#6b7280' };
  if (user.role === 'ViewerGuest') return { text: 'Guest', color: '#6b7280' };
  return null;
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
        userTag: computeUserTag(rawUser),
      };

      return {
        onOpen(_evt, ws) {
          const dispose = wsHub.addClient(
            connectionId,
            { send: (data) => ws.send(data) },
            userPresence,
          );
          disposeMap.set(ws as object, { dispose, connectionId, userId: userPresence.id });

          // Broadcast join to all OTHER clients
          wsHub.broadcastExcept(connectionId, { type: 'presence:join', payload: userPresence });

          // Send presence seed to new client
          try {
            const seedMsg: WsMessage = { type: 'presence:seed', payload: wsHub.getPresenceList() };
            ws.send(JSON.stringify(seedMsg));

            const initMsg: WsMessage = { type: 'stream:state', payload: streamService.getState() };
            ws.send(JSON.stringify(initMsg));
          } catch (err) {
            logger.warn({ err }, 'Failed to send initial messages on WS open');
            ws.close();
          }
        },
        onClose(_evt, ws) {
          const entry = disposeMap.get(ws as object);
          if (entry) {
            entry.dispose();
            wsHub.broadcast({ type: 'presence:leave', payload: { userId: entry.userId } });
            disposeMap.delete(ws as object);
          }
        },
        onMessage(evt, _ws) {
          const raw = typeof evt.data === 'string' ? evt.data : String(evt.data);
          try {
            const msg = JSON.parse(raw) as { type: string };
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
          } catch {
            // Ignore malformed
          }
        },
      };
    }),
  );

  return wsRouter;
}
