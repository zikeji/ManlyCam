import { EventEmitter } from 'node:events';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../db/client.js';
import { streamConfig } from '../lib/stream-config.js';
import { ulid } from '../lib/ulid.js';
import { wsHub } from './wsHub.js';
import type { StreamState } from '@manlycam/types';

export class StreamService {
  private adminToggle: 'live' | 'offline' = 'live';
  private piReachable = false;
  private stopped = false;
  private offlineEmoji: string | null = null;
  private offlineTitle: string | null = null;
  private offlineDescription: string | null = null;
  private prevLive = false;
  private liveEmitter = new EventEmitter();
  private reachabilityEmitter = new EventEmitter();

  getState(): StreamState {
    if (this.adminToggle === 'offline')
      return {
        state: 'explicit-offline',
        piReachable: this.piReachable,
        offlineEmoji: this.offlineEmoji,
        offlineTitle: this.offlineTitle,
        offlineDescription: this.offlineDescription,
      };
    if (this.piReachable) return { state: 'live' };
    return { state: 'unreachable', adminToggle: 'live' };
  }

  isPiReachable(): boolean {
    return this.piReachable;
  }

  async setAdminToggle(toggle: 'live' | 'offline', actorId: string): Promise<void> {
    this.adminToggle = toggle;
    await prisma.$transaction(async (tx) => {
      await streamConfig.setWithClient(tx, 'adminToggle', toggle);
      if (toggle === 'live') {
        await streamConfig.setWithClient(tx, 'stream_started_at', new Date().toISOString());
      }
      await tx.auditLog.create({
        data: {
          id: ulid(),
          action: toggle === 'live' ? 'stream_start' : 'stream_stop',
          actorId,
        },
      });
    });
    if (toggle === 'live') {
      void (async () => {
        try {
          await this.cacheHlsPlaylistName();
        } catch (err) {
          logger.warn(
            { err },
            'stream: failed to cache HLS playlist name on live toggle (will retry on first clip)',
          );
        }
      })();
    }
    if (toggle === 'offline') {
      void (async () => {
        try {
          await this.flushHlsPath();
        } catch (err) {
          logger.error({ err }, 'stream: failed to flush HLS path on offline toggle');
        }
      })();
    }
    this.broadcastState();
  }

  async cacheHlsPlaylistName(): Promise<void> {
    const indexUrl = `${env.MTX_HLS_URL}/cam/index.m3u8`;
    const res = await fetch(indexUrl);
    if (!res.ok) {
      logger.warn({ status: res.status }, 'stream: failed to fetch HLS master playlist');
      return;
    }
    const text = await res.text();
    const match = text.match(/^([^\s#][^\s]*\.m3u8)$/m);
    if (!match) {
      logger.warn(
        { text },
        'stream: could not parse stream playlist filename from master playlist',
      );
      return;
    }
    const playlistName = match[1];
    await streamConfig.set('hls_stream_playlist', playlistName);
    logger.info({ playlistName }, 'stream: cached HLS stream playlist name');
  }

  async flushHlsPath(): Promise<void> {
    const res = await fetch(`${env.MTX_API_URL}/v3/hlsmuxers/delete/cam`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'stream: HLS path flush returned non-ok status');
    }
  }

  async start(): Promise<void> {
    this.adminToggle = (await streamConfig.get('adminToggle', 'live')) as 'live' | 'offline';
    const offlineFields = await streamConfig.getMany([
      'offlineEmoji',
      'offlineTitle',
      'offlineDescription',
    ]);
    this.offlineEmoji = offlineFields['offlineEmoji'];
    this.offlineTitle = offlineFields['offlineTitle'];
    this.offlineDescription = offlineFields['offlineDescription'];
    void (async () => {
      try {
        await this.pollLoop();
      } catch (err) {
        /* c8 ignore next -- pollLoop only throws in catastrophic failure; happy-path coverage impossible in unit tests */
        logger.error({ err }, 'mediamtx poll loop exited unexpectedly');
      }
    })();
  }

  stop(): void {
    this.stopped = true;
  }

  getOfflineMessage(): { emoji: string | null; title: string | null; description: string | null } {
    return {
      emoji: this.offlineEmoji,
      title: this.offlineTitle,
      description: this.offlineDescription,
    };
  }

  async setOfflineMessage({
    emoji,
    title,
    description,
    actorId,
  }: {
    emoji: string | null;
    title: string | null;
    description: string | null;
    actorId: string;
  }): Promise<void> {
    this.offlineEmoji = emoji;
    this.offlineTitle = title;
    this.offlineDescription = description;
    await prisma.$transaction(async (tx) => {
      await streamConfig.setWithClient(tx, 'offlineEmoji', emoji);
      await streamConfig.setWithClient(tx, 'offlineTitle', title);
      await streamConfig.setWithClient(tx, 'offlineDescription', description);
      await tx.auditLog.create({
        data: {
          id: ulid(),
          action: 'offline_message_update',
          actorId,
          metadata: { emoji, title, description },
        },
      });
    });
    this.broadcastState();
  }

  waitForLive(timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const onLive = () => {
        clearTimeout(timer);
        resolve(true);
      };
      timer = setTimeout(() => {
        this.liveEmitter.removeListener('live', onLive);
        resolve(false);
      }, timeoutMs);
      this.liveEmitter.once('live', onLive);
    });
  }

  subscribeReachability(cb: (live: boolean) => void): () => void {
    this.reachabilityEmitter.on('change', cb);
    return () => this.reachabilityEmitter.off('change', cb);
  }

  private broadcastState(): void {
    const state = this.getState();
    wsHub.broadcast({ type: 'stream:state', payload: state });
    const nowLive = state.state === 'live';
    if (!this.prevLive && nowLive) {
      this.liveEmitter.emit('live');
    }
    this.prevLive = nowLive;
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
      this.reachabilityEmitter.emit('change', reachable);
      if (reachable) {
        /* c8 ignore next -- reapplyCameraSettings only rejects in catastrophic async failure; happy-path coverage via pollMediamtxState test */
        this.reapplyCameraSettings().catch((err) => {
          logger.error({ err }, 'stream: reapplyCameraSettings rejected unexpectedly');
        });
      }
    }
  }
}

export const streamService = new StreamService();
