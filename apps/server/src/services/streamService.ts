import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../db/client.js';
import { wsHub } from './wsHub.js';
import type { StreamState } from '@manlycam/types';

export class StreamService {
  private adminToggle: 'live' | 'offline' = 'live';
  private piReachable = false;
  private stopped = false;

  getState(): StreamState {
    if (this.adminToggle === 'offline')
      return { state: 'explicit-offline', piReachable: this.piReachable };
    if (this.piReachable) return { state: 'live' };
    return { state: 'unreachable', adminToggle: 'live' };
  }

  isPiReachable(): boolean {
    return this.piReachable;
  }

  async setAdminToggle(toggle: 'live' | 'offline'): Promise<void> {
    this.adminToggle = toggle;
    await prisma.streamConfig.upsert({
      where: { id: 'cfg' },
      update: { adminToggle: toggle },
      create: { id: 'cfg', adminToggle: toggle },
    });
    this.broadcastState();
  }

  async start(): Promise<void> {
    const config = await prisma.streamConfig.upsert({
      where: { id: 'cfg' },
      update: {},
      create: { id: 'cfg', adminToggle: 'live' },
    });
    this.adminToggle = config.adminToggle as 'live' | 'offline';
    this.pollLoop().catch((err) => {
      logger.error({ err }, 'mediamtx poll loop exited unexpectedly');
    });
  }

  stop(): void {
    this.stopped = true;
  }

  private broadcastState(): void {
    wsHub.broadcast({ type: 'stream:state', payload: this.getState() });
  }

  private async pollLoop(): Promise<void> {
    // Allow mediamtx time to start before first poll
    await new Promise((r) => setTimeout(r, 3000));
    while (!this.stopped) {
      await this.pollMediamtxState();
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  async pollMediamtxState(): Promise<void> {
    try {
      const res = await fetch(`${env.MTX_API_URL}/v3/paths/get/cam`);
      if (!res.ok) {
        this.updateReachable(false);
        return;
      }
      const data = (await res.json()) as { ready: boolean };
      this.updateReachable(data.ready === true);
    } catch {
      // mediamtx not yet running or restarting — treat as unreachable
      this.updateReachable(false);
    }
  }

  private async reapplyCameraSettings(): Promise<void> {
    try {
      const rows = await prisma.cameraSettings.findMany();
      if (rows.length === 0) return;
      const body: Record<string, unknown> = {};
      for (const row of rows) {
        body[row.key] = JSON.parse(row.value);
      }
      const res = await fetch(
        `http://${env.FRP_HOST}:${env.FRP_API_PORT}/v3/config/paths/patch/cam`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        logger.warn(
          { status: res.status },
          'stream: failed to re-apply camera settings on reconnect',
        );
      } else {
        logger.info({ count: rows.length }, 'stream: re-applied camera settings on Pi reconnect');
      }
    } catch (err) {
      logger.error({ err }, 'stream: error re-applying camera settings on Pi reconnect');
    }
  }

  private updateReachable(reachable: boolean): void {
    if (reachable !== this.piReachable) {
      this.piReachable = reachable;
      logger.info({ piReachable: reachable }, 'stream: Pi reachability changed');
      this.broadcastState();
      if (reachable) {
        this.reapplyCameraSettings().catch((err) => {
          logger.error({ err }, 'stream: reapplyCameraSettings rejected unexpectedly');
        });
      }
    }
  }
}

export const streamService = new StreamService();
