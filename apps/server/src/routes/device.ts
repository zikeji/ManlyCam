import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { openAgentTerminal, sendAgentShutdown } from '../lib/agentClient.js';
import { wsHub } from '../services/wsHub.js';
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { ulid } from '../lib/ulid.js';
import { AppError } from '../lib/errors.js';
import { env } from '../env.js';
import type { AppEnv } from '../lib/types.js';
import { Role } from '@manlycam/types';
import type { createNodeWebSocket } from '@hono/node-ws';
import type WebSocket from 'ws';

type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>['upgradeWebSocket'];

export function createDeviceRouter(upgradeWebSocket: UpgradeWebSocket) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth);
  router.use('*', requireRole(Role.Admin));

  router.get('/device/status', (c) => {
    return c.json({ agentEnabled: Boolean(env.FRP_AGENT_PORT && env.FRP_AGENT_TOKEN) });
  });

  router.post('/device/shutdown', async (c) => {
    const actor = c.get('user')!;

    try {
      await sendAgentShutdown();
    } catch (err) {
      logger.error({ err }, 'device: agent shutdown failed');
      try {
        await prisma.auditLog.create({
          data: {
            id: ulid(),
            action: 'device_shutdown_failed',
            actorId: actor.id,
            metadata: { reason: 'agent_unreachable' },
          },
        });
      } catch (auditErr) {
        logger.warn({ auditErr }, 'device: failed to write audit log entry');
      }
      throw new AppError('Device agent unreachable', 'AGENT_UNREACHABLE', 502);
    }

    try {
      await prisma.auditLog.create({
        data: { id: ulid(), action: 'device_shutdown', actorId: actor.id, metadata: {} },
      });
    } catch (err) {
      logger.warn({ err }, 'device: failed to write audit log entry');
    }

    wsHub.broadcast({ type: 'device:shutdown', payload: null });
    return c.json({ ok: true });
  });

  router.get(
    '/device/terminal',
    upgradeWebSocket(() => {
      let agent: WebSocket | null = null;
      let browserClosed = false;

      const closeAgent = () => {
        agent?.close();
        agent = null;
      };

      const closeBrowser = (
        ws: { close: (code?: number, reason?: string) => void },
        code?: number,
        reason?: string,
      ) => {
        try {
          if (code !== undefined) {
            ws.close(code, reason);
          } else {
            ws.close();
          }
        } catch {
          /* already closed */
        }
      };

      return {
        onOpen(_evt, ws) {
          openAgentTerminal()
            .then((a) => {
              if (browserClosed) {
                a.close();
                return;
              }
              agent = a;
              a.on('message', (data: Buffer, isBinary: boolean) => {
                if (browserClosed) return;
                try {
                  ws.send(isBinary ? new Uint8Array(data) : data.toString());
                } catch {
                  closeAgent();
                }
              });
              a.on('close', () => {
                if (!browserClosed) closeBrowser(ws);
              });
              a.on('error', () => {
                if (!browserClosed) closeBrowser(ws);
              });
            })
            .catch(() => {
              closeBrowser(ws, 4503, 'Device offline');
            });
        },
        onMessage(evt, _ws) {
          if (!agent || browserClosed) return;
          if (typeof evt.data !== 'string') return;
          let msg: { type?: string; cols?: unknown; rows?: unknown; data?: unknown };
          try {
            msg = JSON.parse(evt.data);
          } catch {
            return;
          }
          if (msg.type === 'input' && typeof msg.data === 'string') {
            agent.send(evt.data);
          } else if (
            msg.type === 'resize' &&
            typeof msg.cols === 'number' &&
            typeof msg.rows === 'number'
          ) {
            agent.send(evt.data);
          } else {
            logger.debug({ type: msg.type }, 'device: dropping unexpected terminal frame');
          }
        },
        onClose() {
          browserClosed = true;
          closeAgent();
        },
      };
    }),
  );

  return router;
}
