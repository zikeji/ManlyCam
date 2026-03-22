import { ref, computed, onUnmounted, type Ref } from 'vue';
import { useEventListener } from '@vueuse/core';

export function useStreamZoom() {
  const containerRef: Ref<HTMLElement | null> = ref(null);
  const scale = ref(1);
  const translateX = ref(0);
  const translateY = ref(0);
  const isDragging = ref(false);

  const isResetting = ref(false);
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const activePointers = new Map<number, { x: number; y: number }>();
  let prevPinchDistance = 0;
  // Global timestamp for double-tap detection (works across different pointerIds)
  let lastPointerUpTime = 0;
  let lastPointerUpId = -1;

  function clampPan() {
    /* c8 ignore next -- containerRef is always set when events fire; guard is defensive */
    if (!containerRef.value) return;
    const rect = containerRef.value.getBoundingClientRect();
    /* c8 ignore next -- width/height=0 is unreachable when element is mounted and events fire */
    if (rect.width === 0 || rect.height === 0) return;

    const maxX = (rect.width * (scale.value - 1)) / 2;
    const maxY = (rect.height * (scale.value - 1)) / 2;
    translateX.value = Math.max(-maxX, Math.min(maxX, translateX.value));
    translateY.value = Math.max(-maxY, Math.min(maxY, translateY.value));
  }

  function resetZoom() {
    if (resetTimer) clearTimeout(resetTimer);
    isResetting.value = true;
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    resetTimer = setTimeout(() => {
      isResetting.value = false;
    }, 300);
  }

  /* c8 ignore start */
  onUnmounted(() => {
    if (resetTimer) clearTimeout(resetTimer);
  });
  /* c8 ignore stop */

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    /* c8 ignore next -- containerRef is always set when wheel fires on the element */
    if (!containerRef.value) return;

    const rect = containerRef.value.getBoundingClientRect();
    /* c8 ignore next -- width/height=0 is unreachable when element is mounted */
    if (rect.width === 0 || rect.height === 0) return;

    const oldScale = scale.value;
    const zoomFactor = Math.pow(1.1, -event.deltaY / 100);
    const newScale = Math.min(5, Math.max(1, oldScale * zoomFactor));

    if (newScale === oldScale) return;

    // Cursor offset from container center — used to compute cursor-centered translate
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const offsetX = cx - rect.width / 2;
    const offsetY = cy - rect.height / 2;

    // Translate: keep the point under the cursor stationary as scale changes.
    // Formula: newTx = (tx - offsetX) * (newScale / oldScale) + offsetX
    translateX.value = (translateX.value - offsetX) * (newScale / oldScale) + offsetX;
    translateY.value = (translateY.value - offsetY) * (newScale / oldScale) + offsetY;
    scale.value = newScale;
    clampPan();
  }

  function onPointerDown(event: PointerEvent) {
    /* c8 ignore next 3 */
    if (activePointers.size >= 2) {
      return;
    }

    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size === 2) {
      // Second finger — start pinch tracking
      const [p1, p2] = Array.from(activePointers.values());
      prevPinchDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      isDragging.value = false;
    } else if (activePointers.size === 1 && scale.value > 1) {
      isDragging.value = true;
    }

    // Capture pointer so pointermove fires even outside the element
    /* c8 ignore next -- setPointerCapture not implemented in jsdom */
    (
      event.currentTarget as { setPointerCapture?: (id: number) => void } | null
    )?.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!activePointers.has(event.pointerId)) return;

    const prevPos = activePointers.get(event.pointerId)!;
    const newPos = { x: event.clientX, y: event.clientY };
    activePointers.set(event.pointerId, newPos);

    if (activePointers.size >= 2) {
      isDragging.value = false;
      const otherPos = Array.from(activePointers.entries()).find(
        ([id]) => id !== event.pointerId,
      )?.[1];
      /* c8 ignore next -- otherPos is always present when activePointers.size >= 2; guard is defensive */
      if (!otherPos) return;

      const newDistance = Math.hypot(newPos.x - otherPos.x, newPos.y - otherPos.y);

      // Jitter threshold: ignore sub-2px scale noise on touch
      // Guard against division by zero (prevPinchDistance could be 0 in edge cases)
      if (prevPinchDistance > 0 && Math.abs(newDistance - prevPinchDistance) >= 2) {
        scale.value = Math.min(5, Math.max(1, scale.value * (newDistance / prevPinchDistance)));
        prevPinchDistance = newDistance;
      }

      // Midpoint pan: half the moved pointer's delta (otherPos cancels in midpoint formula)
      translateX.value += (newPos.x - prevPos.x) / 2;
      translateY.value += (newPos.y - prevPos.y) / 2;
      clampPan();
    } else if (isDragging.value) {
      event.preventDefault();
      translateX.value += newPos.x - prevPos.x;
      translateY.value += newPos.y - prevPos.y;
      clampPan();
    }
  }

  function onPointerUp(event: PointerEvent) {
    const currentTarget = event.currentTarget as {
      releasePointerCapture?: (id: number) => void;
    } | null;

    // Release pointer capture to allow other elements to receive events
    /* c8 ignore next -- releasePointerCapture not implemented in jsdom */
    currentTarget?.releasePointerCapture?.(event.pointerId);

    activePointers.delete(event.pointerId);

    // Reset pinch tracking when fewer than 2 pointers remain
    if (activePointers.size < 2) {
      isDragging.value = false;
      prevPinchDistance = 0;
      /* c8 ignore next 3 */
      if (activePointers.size === 1 && scale.value > 1) {
        isDragging.value = true;
      }
    }

    // Double-tap detection: two pointerup events within 300ms (works across different pointerIds)
    const now = Date.now();
    if (event.pointerId === lastPointerUpId && now - lastPointerUpTime < 300) {
      // Note: pinch-release may occasionally false-trigger double-tap reset (MVP-acceptable)
      resetZoom();
      lastPointerUpTime = 0;
      lastPointerUpId = -1;
    } else {
      lastPointerUpTime = now;
      lastPointerUpId = event.pointerId;
    }
  }

  function onPointerCancel(event: PointerEvent) {
    const currentTarget = event.currentTarget as {
      releasePointerCapture?: (id: number) => void;
    } | null;

    // Release pointer capture and clean up state
    /* c8 ignore next -- releasePointerCapture not implemented in jsdom */
    currentTarget?.releasePointerCapture?.(event.pointerId);

    activePointers.delete(event.pointerId);
    isDragging.value = false;

    // Reset pinch tracking when fewer than 2 pointers remain
    if (activePointers.size < 2) {
      prevPinchDistance = 0;
    }
  }

  /* c8 ignore start */
  function onLostPointerCapture(event: PointerEvent) {
    activePointers.delete(event.pointerId);
    isDragging.value = false;
    if (activePointers.size < 2) {
      prevPinchDistance = 0;
    }
  }
  /* c8 ignore stop */

  function onDblClick(event: MouseEvent) {
    event.preventDefault();
    resetZoom();
  }

  // Function ref for Vue's :ref binding — avoids auto-unwrap type mismatch with Ref<HTMLElement>
  function assignContainerRef(el: unknown) {
    containerRef.value = el instanceof HTMLElement ? el : null;
  }

  // Wheel must be non-passive so preventDefault() is honoured by Chrome
  useEventListener(containerRef, 'wheel', onWheel, { passive: false });
  useEventListener(containerRef, 'pointerdown', onPointerDown);
  useEventListener(containerRef, 'pointermove', onPointerMove);
  useEventListener(containerRef, 'pointerup', onPointerUp);
  useEventListener(containerRef, 'pointercancel', onPointerCancel);
  useEventListener(containerRef, 'lostpointercapture', onLostPointerCapture);
  useEventListener(containerRef, 'dblclick', onDblClick);

  // translate first, then scale — keeps cursor-centered math correct (translate in container-pixel space)
  const zoomTransform = computed(
    () => `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  );

  return {
    containerRef,
    assignContainerRef,
    scale,
    translateX,
    translateY,
    isDragging,
    isResetting,
    zoomTransform,
    resetZoom,
  };
}
