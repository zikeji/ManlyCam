import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

const termInstances: FakeTerm[] = [];

class FakeTerm {
  handlers: Record<string, ((...args: [{ cols: number; rows: number }]) => void)[]> = {};
  written: (string | Uint8Array)[] = [];
  disposed = false;
  focused = false;
  loadedAddons: unknown[] = [];
  openedElement: Element | null = null;
  constructor(public options?: unknown) {
    termInstances.push(this);
  }
  loadAddon(addon: unknown) {
    this.loadedAddons.push(addon);
  }
  open(el: Element) {
    this.openedElement = el;
  }
  onData(cb: (data: string) => void) {
    (this.handlers.data = this.handlers.data ?? []).push(cb as never);
  }
  onResize(cb: (dims: { cols: number; rows: number }) => void) {
    (this.handlers.resize = this.handlers.resize ?? []).push(cb);
  }
  write(data: string | Uint8Array) {
    this.written.push(data);
  }
  focus() {
    this.focused = true;
  }
  dispose() {
    this.disposed = true;
  }
  simulateData(data: string) {
    for (const cb of this.handlers.data ?? []) cb(data as never);
  }
  simulateResize(cols: number, rows: number) {
    for (const cb of this.handlers.resize ?? []) cb({ cols, rows });
  }
}

class FakeFitAddon {
  fitted = 0;
  fit() {
    this.fitted++;
  }
  proposeDimensions() {
    return { cols: 80, rows: 24 };
  }
}

const sockets: FakeSocket[] = [];

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = 0;
  binaryType = 'blob';
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string | ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    sockets.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
  simulateMessage(data: string | ArrayBuffer) {
    this.onmessage?.({ data });
  }
  simulateDrop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

vi.mock('@xterm/xterm', () => ({
  Terminal: FakeTerm,
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: FakeFitAddon,
}));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

const mockUseMediaQuery = vi.hoisted(() => vi.fn(() => ref(false)));
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>();
  return {
    ...actual,
    useMediaQuery: mockUseMediaQuery,
    useResizeObserver: vi.fn(),
  };
});

vi.mock('@/components/ui/button', () => ({
  Button: { template: '<button><slot /></button>', props: ['variant', 'size', 'disabled'] },
}));

// VTU trigger can't set clientX (read-only MouseEvent props) — dispatch raw Events
function fire(el: Element, type: string, x: number, y: number): void {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, { clientX: x, clientY: y, pointerId: 1 });
  el.dispatchEvent(e);
}

import TerminalWindow from './TerminalWindow.vue';

// VTU find() can resolve a stale detached node when the component root is a Teleport —
// always re-query via findAll and take the live instance.
const getPanel = (w: { findAll: (s: string) => { element: HTMLElement }[] }): HTMLElement =>
  w.findAll('[data-testid="terminal-window"]')[0].element;
import { isTerminalOpen, openTerminal, closeTerminal } from '@/composables/useTerminalWindow';

describe('TerminalWindow', () => {
  let wrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    termInstances.length = 0;
    sockets.length = 0;
    isTerminalOpen.value = false;
    globalThis.localStorage?.clear();
    mockUseMediaQuery.mockReturnValue(ref(false));
    vi.stubGlobal('WebSocket', FakeSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    isTerminalOpen.value = false;
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const mountOpen = async () => {
    wrapper = mount(TerminalWindow, { global: { stubs: { teleport: true } } });
    openTerminal();
    await nextTick();
    await flushPromises();
  };

  it('renders hidden until opened', () => {
    wrapper = mount(TerminalWindow, { global: { stubs: { teleport: true } } });
    const panel = getPanel(wrapper);
    expect(panel.style.display).toBe('none');
  });

  it('creates one terminal, connects once on open, and shows Connected', async () => {
    await mountOpen();
    expect(termInstances).toHaveLength(1);
    expect(termInstances[0].openedElement).not.toBeNull();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe('ws://localhost:3000/api/admin/device/terminal');
    sockets[0].simulateOpen();
    await nextTick();
    expect(wrapper!.find('[data-testid="terminal-status"]').text()).toBe('Connected');
  });

  it('keeps the session alive across close/reopen (no teardown, no new socket)', async () => {
    await mountOpen();
    sockets[0].simulateOpen();
    termInstances[0].simulateData('ls\n');
    expect(sockets[0].sent).toContain(JSON.stringify({ type: 'input', data: 'ls\n' }));

    closeTerminal();
    await nextTick();
    expect(sockets[0].closed).toBe(false);
    expect(
      (wrapper!.find('[data-testid="terminal-window"]').element as HTMLElement).style.display,
    ).toBe('none');

    openTerminal();
    await nextTick();
    await flushPromises();
    expect(termInstances).toHaveLength(1); // same terminal, not recreated
    expect(sockets).toHaveLength(1); // same socket, not reconnected
    expect(
      (wrapper!.find('[data-testid="terminal-window"]').element as HTMLElement).style.display,
    ).toBe('');
  });

  it('reconnects after the socket drops, creating exactly one new socket', async () => {
    await mountOpen();
    sockets[0].simulateOpen();
    sockets[0].simulateDrop();
    await nextTick();
    expect(wrapper!.find('[data-testid="terminal-status"]').text()).toBe('Connection lost');

    await wrapper!.find('[data-testid="terminal-reconnect"]').trigger('click');
    await flushPromises();
    expect(sockets).toHaveLength(2);
    sockets[1].simulateOpen();
    await nextTick();
    expect(wrapper!.find('[data-testid="terminal-status"]').text()).toBe('Connected');
  });

  it('shows Agent unreachable when the socket closes before connecting', async () => {
    await mountOpen();
    sockets[0].simulateDrop();
    await nextTick();
    expect(wrapper!.text()).toContain('Agent unreachable');
  });

  it('writes binary frames to the terminal and marks exit as Session ended', async () => {
    await mountOpen();
    sockets[0].simulateOpen();
    sockets[0].simulateMessage(new TextEncoder().encode('hi').buffer as ArrayBuffer);
    sockets[0].simulateMessage(JSON.stringify({ type: 'exit' }));
    sockets[0].simulateMessage('not-json{{');

    expect(termInstances[0].written[0]).toBeInstanceOf(Uint8Array);
    await nextTick();
    expect(wrapper!.find('[data-testid="terminal-status"]').text()).toBe('Session ended');
  });

  it('sends resize frames when xterm resizes', async () => {
    await mountOpen();
    sockets[0].simulateOpen();
    termInstances[0].simulateResize(120, 40);
    expect(sockets[0].sent).toContain(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
  });

  it('closes via the close button (hides, session stays alive)', async () => {
    await mountOpen();
    sockets[0].simulateOpen();
    await wrapper!.find('[data-testid="terminal-close"]').trigger('click');
    expect(isTerminalOpen.value).toBe(false);
    expect(sockets[0].closed).toBe(false);
  });

  it('drags by the header and clamps within the viewport', async () => {
    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('innerHeight', 768);
    await mountOpen();
    const header = wrapper!.find('[data-testid="terminal-header"]');

    fire(header.element as HTMLElement, 'pointerdown', 100, 100);
    fire(header.element as HTMLElement, 'pointermove', 250, 140);
    fire(header.element as HTMLElement, 'pointerup', 0, 0);
    await nextTick();

    const style = (wrapper!.find('[data-testid="terminal-window"]').element as HTMLElement).style;
    // jsdom lacks localStorage → loadRect falls back to x:0/y:0; +150/+40 from the drag
    expect(style.left).toBe('150px');
    expect(style.top).toBe('40px');
  });

  it('resizes from the corner handle and respects the minimum size', async () => {
    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('innerHeight', 768);
    await mountOpen();
    const handle = wrapper!.find('[data-testid="terminal-resize-handle"]');

    fire(handle.element as HTMLElement, 'pointerdown', 500, 400);
    fire(handle.element as HTMLElement, 'pointermove', 200, 100);
    fire(handle.element as HTMLElement, 'pointerup', 0, 0);
    await nextTick();

    const style = (wrapper!.find('[data-testid="terminal-window"]').element as HTMLElement).style;
    // 720 - 300 = 420 wide; 480 - 300 = 180 → clamped to MIN_H 220
    // 720 - 300 = 420 wide; 480 - 300 = 180 → clamped to MIN_H 220
    expect(style.width).toBe('420px');
    expect(style.height).toBe('220px');
  });

  it('renders fullscreen on mobile and disables drag', async () => {
    mockUseMediaQuery.mockReturnValue(ref(true));
    await mountOpen();
    const panel = getPanel(wrapper!);
    expect(panel.className).toContain('inset-x-0');
    expect(panel.className).toContain('z-[60]');
    // header drag must be a no-op on mobile
    const before = panel.style.left;
    const header = wrapper!.find('[data-testid="terminal-header"]');
    fire(header.element as HTMLElement, 'pointerdown', 5, 5);
    fire(header.element as HTMLElement, 'pointermove', 200, 200);
    fire(header.element as HTMLElement, 'pointerup', 0, 0);
    await nextTick();
    expect(panel.style.left).toBe(before);
  });

  it('applies keyboard-aware height on mobile when visualViewport shrinks', async () => {
    mockUseMediaQuery.mockReturnValue(ref(true));
    const listeners: (() => void)[] = [];
    const fakeVv = {
      height: 600,
      offsetTop: 0,
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('visualViewport', fakeVv);
    await mountOpen();
    expect(listeners.length).toBeGreaterThan(0);
    fakeVv.height = 300; // keyboard opened
    listeners.forEach((cb) => cb());
    await nextTick();
    const panel = wrapper!.find('[data-testid="terminal-window"]');
    expect(panel.attributes('style')).toContain('height: 300px');
  });

  it('tracks visualViewport.offsetTop so the panel follows the layout-viewport scroll', async () => {
    mockUseMediaQuery.mockReturnValue(ref(true));
    const listeners: (() => void)[] = [];
    const fakeVv = {
      height: 600,
      offsetTop: 0,
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('visualViewport', fakeVv);
    await mountOpen();

    fakeVv.height = 300;
    fakeVv.offsetTop = 120; // browser scrolled the layout viewport to reveal the input
    listeners.forEach((cb) => cb());
    await nextTick();

    const panel = wrapper!.find('[data-testid="terminal-window"]');
    expect(panel.attributes('style')).toContain('top: 120px');
  });

  it('pins top:0 and pads height with a safety margin on Firefox when the keyboard opens', async () => {
    const uaSpy = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/115.0 Firefox/115.0');
    mockUseMediaQuery.mockReturnValue(ref(true));
    const listeners: (() => void)[] = [];
    const fakeVv = {
      height: 300, // jsdom's window.innerHeight is 768 — a big shrink, so a keyboard is inferred
      offsetTop: 289.23,
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('visualViewport', fakeVv);
    await mountOpen();
    uaSpy.mockRestore(); // isFirefox is captured once at setup — safe to restore now
    listeners.forEach((cb) => cb());
    await nextTick();

    const panel = wrapper!.find('[data-testid="terminal-window"]');
    expect(panel.attributes('style')).toContain('top: 0px');
    expect(panel.attributes('style')).toContain('height: 252px'); // 300 - 48px safety margin
  });

  it('does not pad height on Firefox when no keyboard-sized shrink is detected', async () => {
    const uaSpy = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/115.0 Firefox/115.0');
    mockUseMediaQuery.mockReturnValue(ref(true));
    const listeners: (() => void)[] = [];
    const fakeVv = {
      height: 760, // close to jsdom's 768 innerHeight — no keyboard
      offsetTop: 0,
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('visualViewport', fakeVv);
    await mountOpen();
    uaSpy.mockRestore();
    listeners.forEach((cb) => cb());
    await nextTick();

    const panel = wrapper!.find('[data-testid="terminal-window"]');
    expect(panel.attributes('style')).toContain('height: 760px');
  });

  it('keeps the tracked viewport top/height across close/reopen (tracking is not torn down)', async () => {
    mockUseMediaQuery.mockReturnValue(ref(true));
    const listeners: (() => void)[] = [];
    const fakeVv = {
      height: 300,
      offsetTop: 120,
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('visualViewport', fakeVv);
    await mountOpen();
    listeners.forEach((cb) => cb());
    await nextTick();

    closeTerminal();
    openTerminal();
    await nextTick();

    const panel = wrapper!.find('[data-testid="terminal-window"]');
    expect(panel.attributes('style')).toContain('top: 120px');
  });

  it('resets viewport top/height on unmount', async () => {
    mockUseMediaQuery.mockReturnValue(ref(true));
    const listeners: (() => void)[] = [];
    const fakeVv = {
      height: 300,
      offsetTop: 120,
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('visualViewport', fakeVv);
    await mountOpen();
    listeners.forEach((cb) => cb());
    await nextTick();

    wrapper!.unmount();
    wrapper = mount(TerminalWindow, { global: { stubs: { teleport: true } } });
    openTerminal();
    await nextTick();
    await flushPromises();

    const panel = wrapper!.find('[data-testid="terminal-window"]');
    expect(panel.attributes('style')).toContain('top: 0px');
  });

  it('locks body scroll on mobile while open, and unlocks on close', async () => {
    mockUseMediaQuery.mockReturnValue(ref(true));
    await mountOpen();
    expect(document.body.style.overflow).toBe('hidden');

    closeTerminal();
    await nextTick();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('locks html scroll on mobile while open (standards mode scrolls <html>, not <body>)', async () => {
    mockUseMediaQuery.mockReturnValue(ref(true));
    await mountOpen();
    expect(document.documentElement.style.overflow).toBe('hidden');

    closeTerminal();
    await nextTick();
    expect(document.documentElement.style.overflow).not.toBe('hidden');
  });

  it('does not lock body scroll on desktop', async () => {
    mockUseMediaQuery.mockReturnValue(ref(false));
    await mountOpen();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('unlocks body scroll on unmount', async () => {
    mockUseMediaQuery.mockReturnValue(ref(true));
    await mountOpen();
    expect(document.body.style.overflow).toBe('hidden');

    wrapper!.unmount();
    wrapper = null;
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
