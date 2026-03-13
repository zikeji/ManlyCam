---
title: 'Stream Freeze Detection and Auto-Reconnect'
type: 'bugfix'
created: '2026-03-13'
status: 'completed'
baseline_commit: 'd492329f72bb8a988308149e0e9742b781466d88'
context:
  - 'project-context.md'
---

# Stream Freeze Detection and Auto-Reconnect

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When the browser tab is backgrounded on mobile (or idle for extended periods), the WebRTC/WHEP stream freezes silently. The user sees a frozen frame with no indication the stream is dead — especially problematic when Manly is sleeping still. Manual page reload is required.

**Approach:** Add client-side connection health monitoring to detect frozen streams (visibility change, WebRTC ICE state, video stalled detection) and trigger automatic reconnection with UI feedback via the existing "unreachable" overlay.

## Boundaries & Constraints

**Always:**

- Reuse existing `unreachable` state overlay for client-side reconnect UI
- Follow exponential backoff pattern from `useWebSocket.ts` for reconnect delays
- Clean up all event listeners on WHEP stop
- All new logic must be unit tested (composables have existing test coverage)

**Ask First:**

- Adding a new state to `ClientStreamState` type (vs. keeping client health separate)

**Never:**

- Do not modify server-side stream state logic
- Do not change the WHEP endpoint or protocol
- Do not add page reload as a recovery mechanism

## I/O & Edge-Case Matrix

| Scenario                                           | Input / State                                           | Expected Output / Behavior                               | Error Handling           |
| -------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- | ------------------------ |
| Tab backgrounded then foregrounded                 | `visibilitychange` → hidden → visible                   | Check stream health; reconnect if frozen                 | Silent reconnect attempt |
| WebRTC ICE connection fails                        | `iceconnectionstatechange` → `failed` or `disconnected` | Trigger reconnect, show unreachable overlay              | Retry with backoff       |
| Video element stalls                               | No `timeupdate` for 5s while "playing"                  | Trigger reconnect, show unreachable overlay              | Retry with backoff       |
| Rapid visibility toggles                           | Multiple `visibilitychange` events                      | Debounce health check, single reconnect attempt          | N/A                      |
| Reconnect succeeds                                 | Connection restored                                     | Hide overlay, resume playback                            | N/A                      |
| Server stream goes offline during client reconnect | Server sends `unreachable` state                        | Show server-side unreachable message (existing behavior) | N/A                      |

</frozen-after-approval>

## Code Map

- `apps/web/src/composables/useWhep.ts` -- WHEP client; add health monitoring and reconnect logic
- `apps/web/src/composables/useStream.ts` -- Server-driven stream state; may need client health integration
- `apps/web/src/components/stream/StreamPlayer.vue` -- Consumes stream state; integrate client health check
- `apps/web/src/components/stream/StateOverlay.vue` -- Existing overlay; no changes needed
- `apps/web/src/__tests__/useWhep.test.ts` -- Existing tests; extend for new health/reconnect logic

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/src/composables/useWhep.ts` -- Add connection health monitoring (ICE state, visibility change, video watchdog) and auto-reconnect with exponential backoff -- Core fix for silent stream freeze
- [x] ~~`apps/web/src/composables/useStream.ts`~~ -- Skipped: useWhep already exposes isHealthy ref directly
- [x] `apps/web/src/components/stream/StreamPlayer.vue` -- Integrate client health check, show unreachable overlay when client connection is unhealthy -- Wires up the UI feedback
- [x] `apps/web/src/composables/useWhep.test.ts` -- Add tests for visibility handling, ICE state monitoring, video watchdog, and reconnect logic -- Maintain test coverage

**Acceptance Criteria:**

- Given the stream is live, when the user backgrounds the tab for 30+ seconds and returns, then the stream auto-reconnects if frozen and shows reconnecting overlay during recovery
- Given the stream is live, when WebRTC ICE connection enters `failed` or `disconnected` state, then auto-reconnect triggers with unreachable overlay
- Given the stream appears frozen (no video frames), when 5 seconds pass with no `timeupdate`, then auto-reconnect triggers
- Given a reconnect is in progress, when it succeeds, then the unreachable overlay hides and playback resumes
- Given multiple visibility changes in quick succession, when the tab settles on visible, then only one health check runs

## Design Notes

**Visibility detection:** Use `document.visibilitychange` event. When transitioning to `visible`, check if stream is healthy before attempting reconnect.

**WebRTC health signals:**

- `iceconnectionstatechange` — states `failed`, `disconnected`, `closed` indicate problems
- `connectionstatechange` — states `failed`, `disconnected`, `closed` indicate problems

**Video stalled detection:** Set up a `timeupdate` watchdog. If no `timeupdate` fires for 5 seconds while the video element reports `!paused`, the stream is frozen. This catches cases where WebRTC stats look fine but the renderer is stuck.

**State coordination pattern:**

```
useWhep exposes: isHealthy: Ref<boolean>
StreamPlayer checks: streamState === 'live' && !isHealthy → show unreachable overlay
```

**Exponential backoff (from useWebSocket.ts):**

```ts
let reconnectDelay = 1000;
const MAX_DELAY = 30_000;
// On reconnect failure: reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY)
// On success: reconnectDelay = 1000
```

## Verification

**Commands:**

- `pnpm --filter web test` -- expected: all tests pass including new useWhep tests
- `pnpm --filter web typecheck` -- expected: no type errors
- `pnpm --filter web lint` -- expected: no lint errors

**Manual checks:**

- On mobile device, background the app for 30+ seconds, return — stream should reconnect if frozen
- On desktop, switch tabs for 30+ seconds, return — stream should reconnect if frozen
- Verify unreachable overlay appears during reconnect, disappears on success

## Review Notes

- Adversarial review completed
- Findings: 4 total (2 MEDIUM, 2 LOW), 4 fixed, 0 skipped
- Resolution approach: auto-fix
- F1 (MEDIUM): Added test for AC#5 rapid visibility toggle debouncing
- F2 (MEDIUM): Added test verifying `reconnectDelay` caps at `MAX_DELAY` (30s)
- F3 (LOW): Added rationale comment to `STALL_TIMEOUT_MS` constant
- F4 (LOW): Added test verifying DELETE to old session before new WHEP POST on auto-reconnect
