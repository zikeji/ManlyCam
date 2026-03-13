import { EventEmitter } from 'node:events';
import * as net from 'node:net';
import type { PiSugarStatus } from '@manlycam/types';
import { env } from '../env.js';

// Module-level EventEmitter — WS hub subscribes to this for admin broadcasts
export const pisugarStatus = new EventEmitter();

// PiSugar manager response format: "key: value" — extract value portion
function parseValue(raw: string): string {
  const colonIdx = raw.indexOf(':');
  if (colonIdx !== -1) return raw.substring(colonIdx + 1).trim();
  return raw.trim();
}

function parseBool(val: string): boolean {
  return val === '1' || val === 'true';
}

export class PiSugarService {
  private socket: net.Socket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1_000;
  private readonly maxReconnectDelay = 60_000;
  private running = false;
  private dataBuffer = '';
  private resolveNext: ((line: string) => void) | null = null;
  private rejectNext: ((err: Error) => void) | null = null;

  constructor(private port: number) {}

  start(port?: number): void {
    if (port !== undefined) this.port = port;
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.clearTimers();
    this.socket?.destroy();
    this.socket = null;
  }

  private clearTimers(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private connect(): void {
    this.dataBuffer = '';
    const socket = net.createConnection(this.port, env.FRP_HOST);
    this.socket = socket;

    socket.on('connect', () => {
      this.reconnectDelay = 1_000;
      void this.poll();
      this.pollTimer = setInterval(() => void this.poll(), 30_000);
    });

    socket.on('data', (data: Buffer) => {
      this.dataBuffer += data.toString();
      const newlineIdx = this.dataBuffer.indexOf('\n');
      if (newlineIdx !== -1) {
        const line = this.dataBuffer.substring(0, newlineIdx).trim();
        this.dataBuffer = this.dataBuffer.substring(newlineIdx + 1);
        if (this.resolveNext) {
          const resolve = this.resolveNext;
          this.resolveNext = null;
          this.rejectNext = null;
          resolve(line);
        }
      }
    });

    socket.on('error', (err) => {
      if (this.rejectNext) {
        const reject = this.rejectNext;
        this.resolveNext = null;
        this.rejectNext = null;
        reject(err);
      }
    });

    socket.on('close', () => {
      if (this.rejectNext) {
        const reject = this.rejectNext;
        this.resolveNext = null;
        this.rejectNext = null;
        reject(new Error('Socket closed'));
      }
      this.handleDisconnect();
    });
  }

  private handleDisconnect(): void {
    this.clearTimers();
    this.socket?.destroy();
    this.socket = null;
    this.dataBuffer = '';
    pisugarStatus.emit('pisugarStatus', { connected: false } as PiSugarStatus);
    if (this.running) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        this.connect();
      }, this.reconnectDelay);
    }
  }

  async poll(): Promise<void> {
    try {
      const batteryRaw = await this.sendCommand('get battery');
      const pluggedRaw = await this.sendCommand('get battery_power_plugged');
      const allowChargingRaw = await this.sendCommand('get battery_allow_charging');
      const rangeRaw = await this.sendCommand('get battery_charging_range');

      const level = parseFloat(parseValue(batteryRaw));
      const plugged = parseBool(parseValue(pluggedRaw));
      // Per PiSugar docs: use battery_allow_charging (not battery_charging) for new models.
      // charging = true only when plugged in AND charging is permitted.
      const charging = plugged && parseBool(parseValue(allowChargingRaw));

      let chargingRange: [number, number] | null = null;
      // PiSugar manager returns comma-separated or space-separated range (e.g. "90,100" or "80 90")
      const rangeParts = parseValue(rangeRaw)
        .split(/[,\s]+/)
        .filter(Boolean);
      if (rangeParts.length === 2) {
        const lo = parseFloat(rangeParts[0]);
        const hi = parseFloat(rangeParts[1]);
        if (!isNaN(lo) && !isNaN(hi)) {
          chargingRange = [lo, hi];
        }
      }

      pisugarStatus.emit('pisugarStatus', {
        connected: true,
        level: isNaN(level) ? 0 : level,
        plugged,
        charging,
        chargingRange,
      } as PiSugarStatus);
    } catch {
      // Error/close handlers already emitted { connected: false } and scheduled reconnect
    }
  }

  private sendCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed || !this.socket.writable) {
        reject(new Error('Socket not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        this.resolveNext = null;
        this.rejectNext = null;
        reject(new Error('Command timeout'));
      }, 5_000);

      this.resolveNext = (line: string) => {
        clearTimeout(timeout);
        resolve(line);
      };
      this.rejectNext = (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      };

      this.socket.write(cmd + '\n');
    });
  }
}

export const pisugarService = new PiSugarService(0);
