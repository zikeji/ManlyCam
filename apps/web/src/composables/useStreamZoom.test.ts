import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { useStreamZoom } from './useStreamZoom';

const MOCK_RECT: DOMRect = {
  width: 640,
  height: 360,
  left: 0,
  top: 0,
  right: 640,
  bottom: 360,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

function createMockContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(MOCK_RECT);
  return el;
}

describe('useStreamZoom', () => {
  let containerEl: HTMLElement;

  beforeEach(() => {
    containerEl = createMockContainer();
  });

  afterEach(() => {
    if (document.body.contains(containerEl)) {
      document.body.removeChild(containerEl);
    }
    vi.restoreAllMocks();
  });

  async function setupComposable() {
    const zoom = useStreamZoom();
    zoom.containerRef.value = containerEl;
    await flushPromises(); // let useEventListener register listeners
    return zoom;
  }

  // --- assignContainerRef ---

  it('assignContainerRef sets containerRef to the given HTMLElement', () => {
    const zoom = useStreamZoom();
    zoom.assignContainerRef(containerEl);
    expect(zoom.containerRef.value).toBe(containerEl);
  });

  it('assignContainerRef sets containerRef to null for non-HTMLElement values', () => {
    const zoom = useStreamZoom();
    zoom.assignContainerRef(null);
    expect(zoom.containerRef.value).toBeNull();
  });

  // --- Initialization ---

  it('initializes with scale=1, translateX=0, translateY=0', async () => {
    const { scale, translateX, translateY } = await setupComposable();
    expect(scale.value).toBe(1);
    expect(translateX.value).toBe(0);
    expect(translateY.value).toBe(0);
  });

  it('isDragging starts false', async () => {
    const { isDragging } = await setupComposable();
    expect(isDragging.value).toBe(false);
  });

  it('zoomTransform reflects initial state', async () => {
    const { zoomTransform } = await setupComposable();
    expect(zoomTransform.value).toBe('translate(0px, 0px) scale(1)');
  });

  // --- Wheel zoom ---

  it('zooms in on wheel scroll up (negative deltaY)', async () => {
    const { scale } = await setupComposable();
    containerEl.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 320,
        clientY: 180,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(scale.value).toBeCloseTo(1.1, 5);
  });

  it('zooms out on wheel scroll down', async () => {
    const { scale } = await setupComposable();
    // Zoom in first
    containerEl.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true }),
    );
    const zoomedIn = scale.value;
    expect(zoomedIn).toBeGreaterThan(1);

    // Then zoom out
    containerEl.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 200, bubbles: true, cancelable: true }),
    );
    expect(scale.value).toBeCloseTo(1, 5);
  });

  it('does not zoom below 1 on scroll down at min zoom', async () => {
    const { scale } = await setupComposable();
    containerEl.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 1000, bubbles: true, cancelable: true }),
    );
    expect(scale.value).toBe(1);
  });

  it('clamps scale at 5 on repeated scroll in', async () => {
    const { scale } = await setupComposable();
    for (let i = 0; i < 50; i++) {
      containerEl.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
      );
    }
    expect(scale.value).toBe(5);
  });

  it('cursor-centered zoom: translate is non-zero after off-center wheel zoom', async () => {
    const { translateX, translateY } = await setupComposable();
    // Cursor at (200, 100) — offset from center (320, 180)
    containerEl.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 200,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(translateX.value).not.toBe(0);
    expect(translateY.value).not.toBe(0);
  });

  it('cursor-centered zoom: correct translate values', async () => {
    const { translateX, translateY } = await setupComposable();
    // Container: 640x360 at (0,0). Cursor: (200, 100).
    // offsetX = 200-320 = -120, offsetY = 100-180 = -80
    // zoomFactor = 1.1, newScale = 1.1
    // tx = (0 - (-120)) * (1.1/1) + (-120) = 132 - 120 = 12
    // ty = (0 - (-80)) * (1.1/1) + (-80) = 88 - 80 = 8
    // clamp: maxX=32, maxY=18 → no clamping needed
    containerEl.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 200,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(translateX.value).toBeCloseTo(12, 5);
    expect(translateY.value).toBeCloseTo(8, 5);
  });

  it('center wheel zoom: translate stays zero (cursor at center)', async () => {
    const { translateX, translateY } = await setupComposable();
    // Cursor at center: offsetX=0, offsetY=0 → translate stays 0
    containerEl.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 320,
        clientY: 180,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(translateX.value).toBeCloseTo(0, 5);
    expect(translateY.value).toBeCloseTo(0, 5);
  });

  it('zoomTransform reflects updated scale and translate', async () => {
    const { scale, translateX, translateY, zoomTransform } = await setupComposable();
    scale.value = 2;
    translateX.value = 10;
    translateY.value = 20;
    await nextTick();
    expect(zoomTransform.value).toBe('translate(10px, 20px) scale(2)');
  });

  // --- Drag pan ---

  it('drag pan moves translate when scale > 1', async () => {
    const { scale, translateX, translateY } = await setupComposable();
    scale.value = 2;

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 150, clientY: 130, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 1, clientX: 150, clientY: 130, bubbles: true }),
    );

    expect(translateX.value).toBe(50);
    expect(translateY.value).toBe(30);
  });

  it('drag does not activate when scale === 1', async () => {
    const { isDragging, translateX } = await setupComposable();

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 200, clientY: 100, bubbles: true }),
    );

    expect(isDragging.value).toBe(false);
    expect(translateX.value).toBe(0);
  });

  it('isDragging is true while dragging and false after pointerup', async () => {
    const { scale, isDragging } = await setupComposable();
    scale.value = 2;

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, bubbles: true }),
    );
    expect(isDragging.value).toBe(true);

    containerEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    expect(isDragging.value).toBe(false);
  });

  it('pan clamp: translate cannot exceed container boundary at max scale', async () => {
    const { scale, translateX, translateY } = await setupComposable();
    scale.value = 5;
    // maxTranslateX = 640*(5-1)/2 = 1280; maxTranslateY = 360*(5-1)/2 = 720

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 9999,
        clientY: 9999,
        bubbles: true,
      }),
    );

    expect(translateX.value).toBe(1280);
    expect(translateY.value).toBe(720);
  });

  it('pan clamp negative: translate cannot go below negative boundary', async () => {
    const { scale, translateX, translateY } = await setupComposable();
    scale.value = 5;

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 9999,
        clientY: 9999,
        bubbles: true,
      }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 0, clientY: 0, bubbles: true }),
    );

    expect(translateX.value).toBe(-1280);
    expect(translateY.value).toBe(-720);
  });

  it('pointermove with unknown pointerId is a no-op', async () => {
    const { translateX } = await setupComposable();
    containerEl.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 99, clientX: 500, clientY: 200, bubbles: true }),
    );
    expect(translateX.value).toBe(0);
  });

  // --- Pointer cancel ---

  it('pointercancel clears dragging state', async () => {
    const { scale, isDragging } = await setupComposable();
    scale.value = 2;

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, bubbles: true }),
    );
    expect(isDragging.value).toBe(true);

    containerEl.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
    expect(isDragging.value).toBe(false);
  });

  // --- Double-click reset ---

  it('double-click resets zoom to 1x', async () => {
    const { scale, translateX, translateY } = await setupComposable();
    scale.value = 3;
    translateX.value = 100;
    translateY.value = 50;

    containerEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(scale.value).toBe(1);
    expect(translateX.value).toBe(0);
    expect(translateY.value).toBe(0);
  });

  // --- resetZoom() ---

  it('resetZoom() sets scale=1, both translates to 0, and animates via isResetting', async () => {
    vi.useFakeTimers();
    const { scale, translateX, translateY, isResetting, resetZoom } = await setupComposable();
    scale.value = 3;
    translateX.value = 100;
    translateY.value = 50;

    resetZoom();

    expect(scale.value).toBe(1);
    expect(translateX.value).toBe(0);
    expect(translateY.value).toBe(0);
    expect(isResetting.value).toBe(true); // transition active

    vi.advanceTimersByTime(300);
    expect(isResetting.value).toBe(false); // transition done
    vi.useRealTimers();
  });

  // --- Double-tap reset ---

  it('double-tap resets zoom within 300ms window', async () => {
    const { scale, translateX, translateY } = await setupComposable();
    scale.value = 2;
    translateX.value = 50;
    translateY.value = 25;

    vi.useFakeTimers();
    const t0 = 1000;
    vi.setSystemTime(t0);
    containerEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));

    vi.setSystemTime(t0 + 200); // 200ms — within 300ms window
    containerEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));

    expect(scale.value).toBe(1);
    expect(translateX.value).toBe(0);
    expect(translateY.value).toBe(0);
    vi.useRealTimers();
  });

  it('double-tap does NOT reset when second pointerup is after 300ms', async () => {
    const { scale } = await setupComposable();
    scale.value = 2;

    vi.useFakeTimers();
    const t0 = 1000;
    vi.setSystemTime(t0);
    containerEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));

    vi.setSystemTime(t0 + 400); // 400ms — outside 300ms window
    containerEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));

    expect(scale.value).toBe(2); // no reset
    vi.useRealTimers();
  });

  it('first pointerup is never treated as double-tap (no prior record)', async () => {
    const { scale } = await setupComposable();
    scale.value = 2;

    containerEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));

    expect(scale.value).toBe(2); // no reset on first tap
  });

  // --- Pinch zoom ---

  it('pinch zoom-in increases scale', async () => {
    const { scale } = await setupComposable();

    // Two fingers: start at distance 100
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 180, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 180, bubbles: true }),
    );

    // Spread fingers: distance goes from 100 to 150
    containerEl.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 50, clientY: 180, bubbles: true }),
    );

    expect(scale.value).toBeCloseTo(1.5, 5);
  });

  it('pinch zoom-out decreases scale but not below 1', async () => {
    const { scale } = await setupComposable();
    scale.value = 2;

    // Two fingers: start at distance 200
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 180, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 300, clientY: 180, bubbles: true }),
    );

    // Pinch close: fingers move toward each other, distance goes to 10 (below jitter threshold handled by scale clamp)
    containerEl.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 195, clientY: 180, bubbles: true }),
    );

    // scale = 2 * (105/200) = 1.05 — still above 1
    expect(scale.value).toBeGreaterThanOrEqual(1);
    expect(scale.value).toBeLessThan(2);
  });

  it('pinch below jitter threshold (< 2px change) does not update scale', async () => {
    const { scale } = await setupComposable();

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 180, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 180, bubbles: true }),
    );
    // Initial distance = 100

    // Move by 1px (below 2px threshold)
    containerEl.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 101, clientY: 180, bubbles: true }),
    );
    // New distance = |200-101| = 99; |99-100| = 1 < 2 → skip

    expect(scale.value).toBe(1);
  });

  it('pinch with single pointer does not trigger pinch logic', async () => {
    const { scale } = await setupComposable();

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 180, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 200, clientY: 180, bubbles: true }),
    );

    expect(scale.value).toBe(1);
  });

  it('pinch applies midpoint pan simultaneously (translate moves with fingers)', async () => {
    const { scale, translateX, translateY } = await setupComposable();
    scale.value = 2; // pan requires scale > 1 (clamp allows movement)

    // Two fingers: pointer 1 at (200, 180), pointer 2 at (400, 180) → horizontal distance 200
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 180, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 400, clientY: 180, bubbles: true }),
    );

    // Move pointer 1 straight down 10px: distance ≈ 200.25 (|Δ| < 2 → no scale change)
    // Midpoint delta: (0, 10) / 2 = (0, 5) → translateY should be 5
    containerEl.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 200, clientY: 190, bubbles: true }),
    );

    expect(scale.value).toBe(2); // no scale change (jitter threshold)
    expect(translateX.value).toBe(0);
    expect(translateY.value).toBe(5); // midpoint moved down by half the pointer delta
  });

  it('pinch disables isDragging flag', async () => {
    const { scale, isDragging } = await setupComposable();
    scale.value = 2;

    // First finger — starts drag
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 180, bubbles: true }),
    );
    expect(isDragging.value).toBe(true);

    // Second finger — switches to pinch
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 180, bubbles: true }),
    );
    expect(isDragging.value).toBe(false);
  });

  it('3+ finger gestures are ignored', async () => {
    const { scale } = await setupComposable();

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 180, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 180, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 3, clientX: 300, clientY: 180, bubbles: true }),
    );

    expect(scale.value).toBe(1);
  });

  it('drag re-enables when transitioning from 2 pointers to 1 while zoomed', async () => {
    const { scale, isDragging } = await setupComposable();
    scale.value = 2;

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 180, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 180, bubbles: true }),
    );
    expect(isDragging.value).toBe(false);

    containerEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true }));
    expect(isDragging.value).toBe(true);
  });

  it('lostpointercapture cleans up gesture state', async () => {
    const { scale, isDragging } = await setupComposable();
    scale.value = 2;

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 180, bubbles: true }),
    );
    expect(isDragging.value).toBe(true);

    containerEl.dispatchEvent(
      new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }),
    );
    expect(isDragging.value).toBe(false);
  });

  it('handles pinch with prevPinchDistance=0 gracefully', async () => {
    const { scale } = await setupComposable();

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 180, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 180, bubbles: true }),
    );
    containerEl.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 50, clientY: 180, bubbles: true }),
    );

    expect(scale.value).toBeGreaterThanOrEqual(1);
    expect(isFinite(scale.value)).toBe(true);
  });

  // --- setPointerCapture guard ---

  it('setPointerCapture is NOT called at scale=1 with a single pointer (protects child clicks)', async () => {
    await setupComposable();
    const spy = vi.fn();
    containerEl.setPointerCapture = spy;

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, bubbles: true }),
    );

    expect(spy).not.toHaveBeenCalled();
  });

  it('setPointerCapture IS called at scale>1 on first pan move (not on pointerdown)', async () => {
    const { scale } = await setupComposable();
    scale.value = 2;
    const spy = vi.fn();
    containerEl.setPointerCapture = spy;

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, bubbles: true }),
    );
    // Capture is deferred — must not be called yet on pointerdown
    expect(spy).not.toHaveBeenCalled();

    containerEl.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 110, clientY: 100, bubbles: true }),
    );
    expect(spy).toHaveBeenCalledWith(1);
  });

  it('setPointerCapture IS called on the second pointer for pinch at scale=1', async () => {
    await setupComposable();
    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 180, bubbles: true }),
    );

    const spy = vi.fn();
    containerEl.setPointerCapture = spy;

    containerEl.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 180, bubbles: true }),
    );

    expect(spy).toHaveBeenCalledWith(2);
  });

  it('double-tap from different pointerIds does not reset', async () => {
    const { scale } = await setupComposable();
    scale.value = 2;

    vi.useFakeTimers();
    const t0 = 1000;
    vi.setSystemTime(t0);

    containerEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));

    vi.setSystemTime(t0 + 200);
    containerEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true }));

    expect(scale.value).toBe(2);
    vi.useRealTimers();
  });
});
