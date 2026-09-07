import WebSocket from 'ws';
import { env } from '../env.js';

const CONNECT_TIMEOUT_MS = 5_000;
const AUTH_TIMEOUT_MS = 5_000;

type AgentMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'exit'; code: number }
  | { type: 'shutting-down' }
  | { type: string; [key: string]: unknown };

function agentUrl(): string {
  return `ws://${env.FRP_HOST}:${env.FRP_AGENT_PORT}`;
}

function connectAndAuth(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (!env.FRP_AGENT_PORT || !env.FRP_AGENT_TOKEN) {
      reject(new Error('Agent not configured'));
      return;
    }
    const ws = new WebSocket(agentUrl());
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      ws.terminate();
      reject(err);
    };

    const connectTimer = setTimeout(
      () => fail(new Error('Agent connect timeout')),
      CONNECT_TIMEOUT_MS,
    );
    const authTimer = setTimeout(
      () => fail(new Error('Agent auth timeout')),
      CONNECT_TIMEOUT_MS + AUTH_TIMEOUT_MS,
    );

    ws.on('open', () => {
      clearTimeout(connectTimer);
      ws.send(JSON.stringify({ type: 'auth', token: env.FRP_AGENT_TOKEN }));
    });

    ws.on('message', (data: Buffer) => {
      let msg: AgentMessage;
      try {
        msg = JSON.parse(data.toString()) as AgentMessage;
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        settled = true;
        clearTimeout(connectTimer);
        clearTimeout(authTimer);
        resolve(ws);
      } else if (msg.type === 'error') {
        fail(new Error(`Agent auth failed: ${msg.message}`));
      }
    });

    ws.on('error', (err: Error) => fail(err));
    ws.on('close', () => fail(new Error('Agent connection closed before ready')));
  });
}

export async function openAgentTerminal(): Promise<WebSocket> {
  return connectAndAuth();
}

export async function sendAgentShutdown(): Promise<void> {
  const ws = await connectAndAuth();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Agent shutdown ack timeout'));
    }, AUTH_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
    };

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as AgentMessage;
        if (msg.type === 'shutting-down') {
          if (settled) return;
          settled = true;
          cleanup();
          ws.close();
          resolve();
        } else if (msg.type === 'error') {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(`Agent shutdown failed: ${msg.message}`));
          ws.terminate();
        }
      } catch {
        // ignore malformed frames while waiting for ack
      }
    });

    ws.on('close', () => {
      if (settled) return;
      settled = true;
      cleanup();
      // Agent tearing down its socket after poweroff initiation counts as success
      resolve();
    });

    ws.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });

    ws.send(JSON.stringify({ type: 'shutdown' }));
  });
}
