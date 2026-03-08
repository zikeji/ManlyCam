import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { wsHub } from '../services/wsHub.js';
import { streamService } from '../services/streamService.js';
import type { AppEnv } from '../lib/types.js';
import type { WsMessage } from '@manlycam/types';
import type { createNodeWebSocket } from '@hono/node-ws';

type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>['upgradeWebSocket'];

// WeakMap stores the dispose fn per WS context object — avoids modifying the WS object itself
const disposeMap = new WeakMap<object, () => void>();

export function createWsRouter(upgradeWebSocket: UpgradeWebSocket) {
  const wsRouter = new Hono<AppEnv>();

  wsRouter.get(
    '/ws',
    requireAuth,
    upgradeWebSocket((_c) => ({
      onOpen(_evt, ws) {
        const dispose = wsHub.addClient({ send: (data) => ws.send(data) });
        disposeMap.set(ws as object, dispose);

        const initMsg: WsMessage = { type: 'stream:state', payload: streamService.getState() };
        ws.send(JSON.stringify(initMsg));
      },
      onClose(_evt, ws) {
        disposeMap.get(ws as object)?.();
      },
    })),
  );

  return wsRouter;
}
