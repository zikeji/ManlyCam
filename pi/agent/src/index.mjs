import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exec } from 'node:child_process';

const require = createRequire(import.meta.url);

const CONFIG_PATH = process.env.AGENT_CONFIG ?? '/etc/manlycam/agent.json';
const LISTEN_PORT = Number(process.env.AGENT_PORT ?? 8424);
const AUTH_WINDOW_MS = 5_000;
const MAX_PTY_SESSIONS = 2;

export function loadConfig(path = CONFIG_PATH) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function tokensMatch(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function shutdownCommand(isRoot) {
  return isRoot ? 'systemctl poweroff' : 'sudo systemctl poweroff';
}

// Frame validation for client → agent messages after auth
export function validateClientFrame(msg) {
  switch (msg.type) {
    case 'input':
      return typeof msg.data === 'string' ? { ok: true } : { ok: false };
    case 'resize':
      return Number.isInteger(msg.cols) && Number.isInteger(msg.rows)
        ? { ok: true }
        : { ok: false };
    case 'shutdown':
      return { ok: true };
    default:
      return { ok: false };
  }
}

function safeSend(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function createSession({ config, isRoot, WebSocketServer, spawnPty, execImpl = exec }) {
  let activePtys = 0;

  const wss = new WebSocketServer({ host: '127.0.0.1', port: LISTEN_PORT });

  wss.on('connection', (ws) => {
    let authed = false;
    let pty = null;

    const authTimer = setTimeout(() => {
      if (!authed) ws.close();
    }, AUTH_WINDOW_MS);

    ws.on('close', () => {
      clearTimeout(authTimer);
      if (pty) {
        activePtys--;
        try {
          pty.kill();
        } catch {
          /* already dead */
        }
        pty = null;
      }
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (pty) pty.write(data.toString());
        return;
      }

      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (!authed) {
        if (msg.type === 'auth' && tokensMatch(msg.token ?? '', config.token)) {
          authed = true;
          clearTimeout(authTimer);
          // Spawn the shell immediately — the client resizes via 'resize' frames
          if (activePtys >= MAX_PTY_SESSIONS) {
            safeSend(ws, { type: 'error', message: 'no free pty slot' });
            ws.close();
            return;
          }
          activePtys++;
          try {
            pty = spawnPty({
              cols: 80,
              rows: 24,
              onData: (chunk) => {
                // Buffer → binary WS frame; text frames are reserved for JSON control
                if (ws.readyState === 1) ws.send(Buffer.from(chunk));
              },
              onExit: ({ exitCode }) => {
                activePtys--;
                pty = null;
                safeSend(ws, { type: 'exit', code: exitCode });
              },
            });
          } catch (err) {
            activePtys--;
            console.error('manlycam-agent: pty spawn failed:', err);
            safeSend(ws, { type: 'error', message: 'pty spawn failed' });
            ws.close();
            return;
          }
          safeSend(ws, { type: 'ready' });
        } else {
          safeSend(ws, { type: 'error', message: 'unauthorized' });
          ws.close();
        }
        return;
      }

      const check = validateClientFrame(msg);
      if (!check.ok) return;

      if (msg.type === 'input') {
        pty?.write(msg.data);
        return;
      }

      if (msg.type === 'resize') {
        try {
          pty?.resize(msg.cols, msg.rows);
        } catch {
          /* pty may have just exited */
        }
        return;
      }

      if (msg.type === 'shutdown') {
        safeSend(ws, { type: 'shutting-down' });
        execImpl(shutdownCommand(isRoot), () => {
          // Best-effort: if poweroff failed there is nothing more to do here;
          // the client sees the socket drop without a clean shutdown.
        });
        setTimeout(() => process.exit(0), 1_000);
      }
    });
  });

  return wss;
}

export { createSession };

async function main() {
  const config = loadConfig();
  const isRoot = process.getuid?.() === 0;

  const WebSocketServer = (await import('ws')).WebSocketServer;
  const nodePty = require('node-pty');
  const os = await import('node:os');

  const shell = process.env.SHELL || '/bin/bash';

  const spawnPty = ({ cols, rows, onData, onExit }) => {
    const ptyProcess = nodePty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
      env: process.env,
    });
    // onData/onExit return void — do not chain them
    ptyProcess.onData(onData);
    ptyProcess.onExit(onExit);
    return ptyProcess;
  };

  createSession({ config, isRoot, WebSocketServer, spawnPty });

  console.log(`manlycam-agent listening on 127.0.0.1:${LISTEN_PORT} (user: ${isRoot ? 'root' : process.env.USER ?? 'non-root'})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('manlycam-agent failed to start:', err);
    process.exit(1);
  });
}
