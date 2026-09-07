import { test, describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokensMatch, shutdownCommand, validateClientFrame, createSession, loadConfig } from './index.mjs';

describe('loadConfig', () => {
  it('reads token from a JSON config file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-test-'));
    const path = join(dir, 'agent.json');
    writeFileSync(path, JSON.stringify({ token: 'abc123', user: 'root' }));
    assert.deepEqual(loadConfig(path), { token: 'abc123', user: 'root' });
  });
});

describe('tokensMatch', () => {
  it('accepts equal tokens', () => {
    assert.equal(tokensMatch('secret', 'secret'), true);
  });
  it('rejects different tokens', () => {
    assert.equal(tokensMatch('secret', 'hunter2'), false);
  });
  it('rejects different-length tokens without throwing', () => {
    assert.equal(tokensMatch('short', 'a-much-longer-value'), false);
  });
  it('coerces non-strings safely', () => {
    assert.equal(tokensMatch(undefined, 'x'), false);
  });
});

describe('shutdownCommand', () => {
  it('uses systemctl directly as root', () => {
    assert.equal(shutdownCommand(true), 'systemctl poweroff');
  });
  it('uses sudo for non-root (backed by the sudoers drop)', () => {
    assert.equal(shutdownCommand(false), 'sudo systemctl poweroff');
  });
});

describe('validateClientFrame', () => {
  it('rejects the removed pty request frame', () => {
    assert.equal(validateClientFrame({ type: 'pty', cols: 80, rows: 24 }).ok, false);
  });
  it('accepts string input', () => {
    assert.deepEqual(validateClientFrame({ type: 'input', data: 'ls\n' }), { ok: true });
  });
  it('rejects non-string input', () => {
    assert.equal(validateClientFrame({ type: 'input', data: 42 }).ok, false);
  });
  it('accepts integer resize, rejects otherwise', () => {
    assert.deepEqual(validateClientFrame({ type: 'resize', cols: 80, rows: 24 }), { ok: true });
    assert.equal(validateClientFrame({ type: 'resize', cols: 80.5, rows: 24 }).ok, false);
  });
  it('accepts shutdown', () => {
    assert.deepEqual(validateClientFrame({ type: 'shutdown' }), { ok: true });
  });
  it('rejects unknown types', () => {
    assert.equal(validateClientFrame({ type: 'exec', data: 'rm -rf /' }).ok, false);
  });
});

// Minimal WS + WebSocketServer fakes for the session protocol tests
class FakeWs {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 1;
  sent = [];
  handlers = {};
  closed = false;
  on(event, cb) {
    (this.handlers[event] = this.handlers[event] ?? []).push(cb);
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    for (const cb of this.handlers.close ?? []) cb();
  }
  message(data, isBinary = false) {
    for (const cb of this.handlers.message ?? []) cb(data, isBinary);
  }
  lastJson() {
    return JSON.parse(this.sent[this.sent.length - 1]);
  }
}

class FakeWss {
  connectionHandler = null;
  constructor(options) {
    FakeWss.lastOptions = options;
    FakeWss.instances.push(this);
  }
  on(event, cb) {
    if (event === 'connection') this.connectionHandler = cb;
  }
  connect() {
    const ws = new FakeWs();
    this.connectionHandler(ws);
    return ws;
  }
  static instances = [];
  static lastOptions = null;
}

function makeDeps(overrides = {}) {
  const spawned = [];
  const execCalls = [];
  const deps = {
    config: { token: 'tok' },
    isRoot: true,
    WebSocketServer: FakeWss,
    spawnPty: ({ onData, onExit }) => {
      const pty = {
        writes: [],
        killed: false,
        write(d) {
          this.writes.push(d);
        },
        kill() {
          this.killed = true;
        },
        resize() {},
        onDataCbs: [],
        // Mirrors node-pty: onData/onExit return void (never chain them)
        onData(cb) {
          this.onDataCbs.push(cb);
        },
        onExitCbs: [],
        onExit(cb) {
          this.onExitCbs.push(cb);
        },
        emitData(chunk) {
          for (const cb of this.onDataCbs) cb(chunk);
        },
        emitExit(code) {
          for (const cb of this.onExitCbs) cb({ exitCode: code });
        },
      };
      pty.onData(onData);
      pty.onExit(onExit);
      spawned.push(pty);
      return pty;
    },
    execImpl: (cmd, cb) => {
      execCalls.push(cmd);
      cb?.(null);
    },
    ...overrides,
  };
  return { deps, spawned, execCalls };
}

describe('createSession protocol', () => {
  beforeEach(() => {
    FakeWss.instances = [];
  });

  const start = (overrides = {}) => {
    const { deps, spawned, execCalls } = makeDeps(overrides);
    const wss = createSession(deps);
    return { wss, spawned, execCalls };
  };

  it('binds to localhost on the configured port', () => {
    const { wss } = start();
    assert.deepEqual(FakeWss.lastOptions, { host: '127.0.0.1', port: 8424 });
    assert.ok(wss);
  });

  it('completes the auth handshake, replies ready, and spawns the shell', () => {
    const { wss, spawned } = start();
    const ws = wss.connect();
    ws.message(JSON.stringify({ type: 'auth', token: 'tok' }));
    assert.equal(ws.lastJson().type, 'ready');
    assert.equal(spawned.length, 1);
    assert.equal(ws.closed, false);
  });

  it('closes the connection on a bad token', () => {
    const { wss } = start();
    const ws = wss.connect();
    ws.message(JSON.stringify({ type: 'auth', token: 'wrong' }));
    assert.equal(ws.lastJson().type, 'error');
    assert.equal(ws.closed, true);
  });

  it('enforces the max concurrent pty cap across connections', () => {
    const { wss, spawned } = start();
    const connectAuthed = () => {
      const ws = wss.connect();
      ws.message(JSON.stringify({ type: 'auth', token: 'tok' }));
      return ws;
    };
    connectAuthed();
    connectAuthed();
    assert.equal(spawned.length, 2);
    const ws3 = connectAuthed();
    assert.equal(spawned.length, 2);
    assert.equal(ws3.lastJson().message, 'no free pty slot');
    assert.equal(ws3.closed, true);
    // Freeing one slot allows a new connection to spawn again
    spawned[0].emitExit(0);
    connectAuthed();
    assert.equal(spawned.length, 3);
  });

  it('relays pty output as binary and input as pty writes', () => {
    const { wss, spawned } = start();
    const ws = wss.connect();
    ws.message(JSON.stringify({ type: 'auth', token: 'tok' }));
    spawned[0].emitData('hello');
    // PTY output must be a binary frame (Buffer), not text — text frames are JSON control
    assert.ok(Buffer.isBuffer(ws.sent.at(-1)));
    assert.equal(ws.sent.at(-1).toString(), 'hello');
    ws.message(JSON.stringify({ type: 'input', data: 'ls\n' }));
    assert.deepEqual(spawned[0].writes, ['ls\n']);
  });

  it('forwards binary client frames to the pty', () => {
    const { wss, spawned } = start();
    const ws = wss.connect();
    ws.message(JSON.stringify({ type: 'auth', token: 'tok' }));
    ws.message(Buffer.from('raw bytes'), true);
    assert.deepEqual(spawned[0].writes, ['raw bytes']);
  });

  it('sends exit frame and frees the slot when the pty exits', () => {
    const { wss, spawned } = start();
    const ws = wss.connect();
    ws.message(JSON.stringify({ type: 'auth', token: 'tok' }));
    spawned[0].emitExit(0);
    assert.equal(ws.lastJson().type, 'exit');
    // Slot freed — a new connection can spawn again
    const ws2 = wss.connect();
    ws2.message(JSON.stringify({ type: 'auth', token: 'tok' }));
    assert.equal(spawned.length, 2);
  });

  it('handles resize, ignoring errors from a dead pty', () => {
    const { wss, spawned } = start();
    const ws = wss.connect();
    ws.message(JSON.stringify({ type: 'auth', token: 'tok' }));
    ws.message(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
    // pty gone → resize is a no-op, connection stays open
    spawned[0].emitExit(0);
    ws.message(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
    assert.equal(ws.closed, false);
  });

  it('executes the root shutdown command and acks before exiting', () => {
    let processExited = false;
    const { wss, execCalls } = start({
      isRoot: true,
      execImpl: (cmd) => execCalls.push(cmd),
    });
    const realExit = process.exit;
    process.exit = () => {
      processExited = true;
    };
    try {
      const ws = wss.connect();
      ws.message(JSON.stringify({ type: 'auth', token: 'tok' }));
      ws.message(JSON.stringify({ type: 'shutdown' }));
      assert.equal(ws.lastJson().type, 'shutting-down');
      assert.deepEqual(execCalls, ['systemctl poweroff']);
    } finally {
      process.exit = realExit;
    }
    assert.equal(processExited, false); // exit is deferred 1s, not synchronous
  });

  it('executes the sudo shutdown command when not root', () => {
    const { wss, execCalls } = start({ isRoot: false });
    const ws = wss.connect();
    ws.message(JSON.stringify({ type: 'auth', token: 'tok' }));
    ws.message(JSON.stringify({ type: 'shutdown' }));
    assert.deepEqual(execCalls, ['sudo systemctl poweroff']);
  });

  it('replies error and closes when the pty fails to spawn', () => {
    const { wss } = start({
      spawnPty: () => {
        throw new Error('node-pty blew up');
      },
    });
    const ws = wss.connect();
    ws.message(JSON.stringify({ type: 'auth', token: 'tok' }));
    assert.equal(ws.lastJson().type, 'error');
    assert.equal(ws.lastJson().message, 'pty spawn failed');
    assert.equal(ws.closed, true);
  });

  it('kills the pty when the client disconnects', () => {
    const { wss, spawned } = start();
    const ws = wss.connect();
    ws.message(JSON.stringify({ type: 'auth', token: 'tok' }));
    ws.close();
    assert.equal(spawned[0].killed, true);
  });

  it('ignores malformed frames', () => {
    const { wss } = start();
    const ws = wss.connect();
    ws.message('not-json{{');
    ws.message(JSON.stringify({ type: 'auth', token: 'tok' }));
    assert.equal(ws.lastJson().type, 'ready');
  });
});
