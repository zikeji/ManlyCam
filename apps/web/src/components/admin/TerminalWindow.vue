<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick, computed } from 'vue';
import { useMediaQuery, useResizeObserver, useScrollLock } from '@vueuse/core';
import { X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { isTerminalOpen, closeTerminal } from '@/composables/useTerminalWindow';
import type { Terminal as XTerm } from '@xterm/xterm';

// Matches WatchView's isDesktop threshold (min-width: 1024px), not an
// arbitrary phone-portrait width — a phone in landscape is commonly
// 800-930px wide, which fell between a narrower breakpoint and 1024px
// and rendered as the desktop draggable window instead of fullscreen.
const isMobile = useMediaQuery('(max-width: 1023px)');

const containerRef = ref<HTMLDivElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);
const headerRef = ref<HTMLDivElement | null>(null);
const status = ref<'idle' | 'connecting' | 'connected' | 'ended' | 'lost' | 'unreachable'>('idle');

const statusLabel = computed(
  () =>
    ({
      idle: '',
      connecting: 'Connecting…',
      connected: 'Connected',
      ended: 'Session ended',
      lost: 'Connection lost',
      unreachable: 'Agent unreachable',
    })[status.value],
);

const DESKTOP_DEFAULT = { x: 0, y: 0, w: 720, h: 480 };
const MIN_W = 320;
const MIN_H = 220;
const RECT_KEY = 'manlycam-terminal-rect';

const rect = ref({ ...DESKTOP_DEFAULT });
let rectLoaded = false;

function loadRect(): void {
  if (rectLoaded) return;
  rectLoaded = true;
  try {
    const raw = localStorage.getItem(RECT_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<typeof rect.value>;
      rect.value = {
        x: Number(saved.x) || 0,
        y: Number(saved.y) || 0,
        w: Number(saved.w) || DESKTOP_DEFAULT.w,
        h: Number(saved.h) || DESKTOP_DEFAULT.h,
      };
    } else {
      rect.value = {
        ...DESKTOP_DEFAULT,
        x: Math.max(0, window.innerWidth - DESKTOP_DEFAULT.w - 24),
        y: Math.max(0, window.innerHeight - DESKTOP_DEFAULT.h - 80),
      };
    }
  } catch {
    rect.value = { ...DESKTOP_DEFAULT };
  }
}

function clampRect(): void {
  rect.value.w = Math.max(MIN_W, Math.min(rect.value.w, window.innerWidth - 16));
  rect.value.h = Math.max(MIN_H, Math.min(rect.value.h, window.innerHeight - 16));
  rect.value.x = Math.max(-rect.value.w + 80, Math.min(rect.value.x, window.innerWidth - 80));
  rect.value.y = Math.max(0, Math.min(rect.value.y, window.innerHeight - 48));
}

function persistRect(): void {
  try {
    localStorage.setItem(RECT_KEY, JSON.stringify(rect.value));
  } catch {
    /* storage unavailable */
  }
}

// ── Drag (desktop header) ────────────────────────────────────────────────────────
let dragStart: { px: number; py: number; x: number; y: number } | null = null;

function onHeaderPointerDown(e: PointerEvent): void {
  if (isMobile.value || (e.target as HTMLElement).closest('button')) return;
  dragStart = { px: e.clientX, py: e.clientY, x: rect.value.x, y: rect.value.y };
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
}

function onHeaderPointerMove(e: PointerEvent): void {
  if (!dragStart) return;
  rect.value.x = dragStart.x + (e.clientX - dragStart.px);
  rect.value.y = dragStart.y + (e.clientY - dragStart.py);
  clampRect();
}

function onHeaderPointerUp(): void {
  if (!dragStart) return;
  dragStart = null;
  persistRect();
}

// ── Resize (desktop corner handle) ───────────────────────────────────────────────
let resizeStart: { px: number; py: number; w: number; h: number } | null = null;

function onResizePointerDown(e: PointerEvent): void {
  if (isMobile.value) return;
  resizeStart = { px: e.clientX, py: e.clientY, w: rect.value.w, h: rect.value.h };
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
}

function onResizePointerMove(e: PointerEvent): void {
  if (!resizeStart) return;
  rect.value.w = resizeStart.w + (e.clientX - resizeStart.px);
  rect.value.h = resizeStart.h + (e.clientY - resizeStart.py);
  clampRect();
}

function onResizePointerUp(): void {
  if (!resizeStart) return;
  resizeStart = null;
  persistRect();
}

// ── Terminal session (kept alive across open/close) ─────────────────────────────
let term: XTerm | null = null;
let fitAddon: import('@xterm/addon-fit').FitAddon | null = null;
let socket: WebSocket | null = null;
let socketGeneration = 0;
let keyboardViewport: VisualViewport | null = null;
let keyboardHandler: (() => void) | null = null;
const mobileViewportH = ref(0);
const mobileViewportTop = ref(0);
// Firefox Android's visualViewport.offsetTop is unreliable while the keyboard is
// open (longstanding, unresolved Mozilla bug 1007286) — it reports wildly different
// values for what is visually the same moment, so it can't be trusted for exact
// positioning. Firefox's reported height does shrink sanely though, so we keep
// using it, pinned at top:0, minus a safety margin — since we can't verify the
// exact covered region on Firefox, this trades a bit of unused space for the
// content staying reachable instead of being clipped by an inaccurate reading.
const isFirefox = /firefox/i.test(navigator.userAgent);
const FIREFOX_KEYBOARD_SAFETY_MARGIN_PX = 48;

const mobilePanelStyle = computed(() => {
  if (!isMobile.value) return undefined;
  // Track the visual viewport so the keyboard never covers the input line;
  // fall back to dynamic viewport height where visualViewport is unavailable.
  // `top` must track visualViewport.offsetTop too — mobile browsers scroll the
  // layout viewport to bring the focused input above the keyboard, so a fixed
  // `top: 0` (layout-viewport-relative) drifts away from what's actually visible,
  // leaving a real gap at the bottom where the page behind shows through.
  return {
    top: `${mobileViewportTop.value}px`,
    height: mobileViewportH.value > 0 ? `${mobileViewportH.value}px` : '100dvh',
  };
});

function trackKeyboardViewport(): void {
  if (keyboardHandler !== null || !window.visualViewport) return;
  keyboardViewport = window.visualViewport;
  keyboardHandler = () => {
    // visualViewport.height shrinks when the mobile keyboard opens — fit above it
    if (keyboardViewport) {
      if (isFirefox) {
        // Only pad when a keyboard-sized shrink actually shows up — otherwise the
        // margin would permanently eat into the panel even with no keyboard open.
        const keyboardLikelyOpen = window.innerHeight - keyboardViewport.height > 40;
        mobileViewportH.value = keyboardLikelyOpen
          ? Math.max(0, keyboardViewport.height - FIREFOX_KEYBOARD_SAFETY_MARGIN_PX)
          : keyboardViewport.height;
        mobileViewportTop.value = 0;
      } else {
        mobileViewportH.value = keyboardViewport.height;
        mobileViewportTop.value = keyboardViewport.offsetTop ?? 0;
      }
    }
  };
  keyboardHandler();
  keyboardViewport.addEventListener('resize', keyboardHandler);
  keyboardViewport.addEventListener('scroll', keyboardHandler);
}

function untrackKeyboardViewport(): void {
  if (keyboardViewport && keyboardHandler) {
    keyboardViewport.removeEventListener('resize', keyboardHandler);
    keyboardViewport.removeEventListener('scroll', keyboardHandler);
  }
  keyboardViewport = null;
  keyboardHandler = null;
  mobileViewportH.value = 0;
  mobileViewportTop.value = 0;
}

function ensureTerm(): void {
  if (term) return;
  // Dynamic import keeps xterm out of the initial bundle and test environment
  void (async () => {
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);
    await import('@xterm/xterm/css/xterm.css');
    if (term || !containerRef.value) return;
    term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      theme: { background: '#1c1917', foreground: '#e7e5e4', cursor: '#e7e5e4' },
    });
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.value);
    term.onData((data) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'input', data }));
      }
    });
    term.onResize(({ cols, rows }) => sendResize(cols, rows));
    if (isTerminalOpen.value) {
      fitAddon.fit();
      term.focus();
    }
  })();
}

function sendResize(cols?: number, rows?: number): void {
  if (!socket || socket.readyState !== WebSocket.OPEN || !fitAddon) return;
  const dims = fitAddon.proposeDimensions();
  socket.send(
    JSON.stringify({ type: 'resize', cols: cols ?? dims?.cols ?? 80, rows: rows ?? dims?.rows ?? 24 }),
  );
}

function connectSocket(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  status.value = 'connecting';
  const generation = ++socketGeneration;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${proto}//${window.location.host}/api/admin/device/terminal`);
  socket.binaryType = 'arraybuffer';

  socket.onopen = () => {
    if (generation !== socketGeneration) return;
    status.value = 'connected';
    sendResize();
    term?.focus();
  };
  socket.onmessage = (evt: MessageEvent<string | ArrayBuffer>) => {
    if (generation !== socketGeneration) return;
    if (typeof evt.data !== 'string') {
      term?.write(new Uint8Array(evt.data));
      return;
    }
    try {
      const msg = JSON.parse(evt.data) as { type: string; message?: string };
      if (msg.type === 'exit') {
        term?.write('\r\n\x1b[33m[session ended]\x1b[0m\r\n');
        status.value = 'ended';
      } else if (msg.type === 'error') {
        term?.write(`\r\n\x1b[31m[error] ${msg.message ?? 'unknown'}\x1b[0m\r\n`);
      }
    } catch {
      // ignore malformed frames
    }
  };
  socket.onclose = () => {
    if (generation !== socketGeneration) return;
    if (socket) socket.onclose = null;
    if (status.value === 'connected') {
      status.value = 'lost';
      term?.write('\r\n\x1b[31m[connection lost]\x1b[0m\r\n');
    } else if (status.value === 'connecting') {
      status.value = 'unreachable';
    }
  };
  socket.onerror = () => {
    socket?.close();
  };
}

// Locks the background page while the mobile terminal is open — without this, a
// drag on the panel scrolls the page underneath (revealing it, and shifting the
// browser toolbar) since the panel itself has no scrollable content of its own.
// Both html and body must be locked: this page renders in standards mode, where
// <html> (not <body>) is the actual scrolling element, so body-only was a no-op.
const bodyScrollLocked = useScrollLock(document.body);
const htmlScrollLocked = useScrollLock(document.documentElement);

watch([isTerminalOpen, isMobile], ([open, mobile]) => {
  const locked = open && mobile;
  bodyScrollLocked.value = locked;
  htmlScrollLocked.value = locked;
});

// Fit on container size changes (drag resize, window resize, keyboard)
useResizeObserver(containerRef, () => {
  if (!isTerminalOpen.value || !fitAddon || !containerRef.value) return;
  if (containerRef.value.clientWidth === 0) return;
  fitAddon.fit();
  sendResize();
});

watch(isTerminalOpen, async (open) => {
  if (!open) return; // closing only hides the panel — the session stays alive
  if (isMobile.value) {
    trackKeyboardViewport();
  } else {
    loadRect();
    clampRect();
  }
  ensureTerm();
  await nextTick();
  fitAddon?.fit();
  term?.focus();
  connectSocket();
});

function onWindowResize(): void {
  if (isMobile.value || !isTerminalOpen.value) return;
  clampRect();
  persistRect();
}

function reconnect(): void {
  connectSocket();
}

window.addEventListener('resize', onWindowResize);

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize);
  socketGeneration++;
  socket?.close();
  socket = null;
  term?.dispose();
  term = null;
  untrackKeyboardViewport();
});
</script>

<template>
  <!-- Body-level portal: escapes ancestor stacking contexts / containing blocks so
       fixed positioning is viewport-true and we stack above the Sheet drawer -->
  <Teleport to="body">
  <!-- Fills the full mobile viewport behind the panel so the safety margin's
       unused space reads as terminal, not page bleeding through underneath. -->
  <div
    v-if="isMobile"
    v-show="isTerminalOpen"
    class="fixed inset-0 z-[59] bg-[#1c1917] pointer-events-auto touch-none"
    data-testid="terminal-mobile-backdrop"
  />
  <div
    v-show="isTerminalOpen"
    ref="panelRef"
    data-testid="terminal-window"
    :class="
      isMobile
        ? 'fixed inset-x-0 z-[60] flex flex-col bg-[#1c1917] pointer-events-auto touch-none'
        : 'fixed z-50 flex flex-col bg-[#1c1917] rounded-md border border-border shadow-lg pointer-events-auto'
    "
    :style="
      isMobile
        ? mobilePanelStyle
        : { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` }
    "
  >
    <div
      ref="headerRef"
      class="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border touch-none"
      :class="!isMobile && 'cursor-move select-none'"
      data-testid="terminal-header"
      @pointerdown="onHeaderPointerDown"
      @pointermove="onHeaderPointerMove"
      @pointerup="onHeaderPointerUp"
      @pointercancel="onHeaderPointerUp"
    >
      <span class="text-sm font-semibold">Terminal</span>
      <span
        v-if="statusLabel"
        class="text-xs"
        :class="{
          'text-green-500': status === 'connected',
          'text-yellow-500': status === 'ended' || status === 'lost',
          'text-destructive': status === 'unreachable',
          'text-muted-foreground': status === 'connecting',
        }"
        data-testid="terminal-status"
        >{{ statusLabel }}</span
      >
      <span class="flex-1" />
      <Button
        v-if="status === 'lost' || status === 'unreachable'"
        variant="outline"
        size="sm"
        class="h-7"
        data-testid="terminal-reconnect"
        @click="reconnect"
      >
        Reconnect
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="w-8 h-8"
        aria-label="Close terminal"
        data-testid="terminal-close"
        @click="closeTerminal"
      >
        <X class="w-4 h-4" />
      </Button>
    </div>
    <div class="flex-1 min-h-0 p-1">
      <div
        ref="containerRef"
        class="w-full h-full bg-[#1c1917] rounded overflow-hidden"
        data-testid="terminal-container"
      />
    </div>
    <div
      v-if="!isMobile"
      class="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize touch-none"
      data-testid="terminal-resize-handle"
      @pointerdown="onResizePointerDown"
      @pointermove="onResizePointerMove"
      @pointerup="onResizePointerUp"
      @pointercancel="onResizePointerUp"
    />
  </div>
  </Teleport>
</template>
