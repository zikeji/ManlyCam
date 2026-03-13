# Story 7.4: PiSugar Battery Monitor (Server TCP Poller + Admin UI)

Status: review

## Story

As an **admin**,
I want to see the PiSugar battery status displayed in the Broadcast Console left flank,
so that I can monitor the Pi's battery health at a glance without checking external tools.

## Acceptance Criteria

1. **Given** the server has `FRP_PISUGAR_PORT` environment variable set, **When** the server starts, **Then** a TCP poller service is initialized that establishes a persistent connection to `localhost:FRP_PISUGAR_PORT` and begins polling for battery status every 30 seconds.

2. **Given** the TCP poller successfully connects to the PiSugar manager, **When** a poll cycle completes, **Then** the server parses the plain-text responses for `get battery`, `get battery_power_plugged`, `get battery_charging`, and `get battery_charging_range` commands, and emits a `PiSugarStatus` event with `{ connected: true, level, plugged, charging, chargingRange }`.

3. **Given** the TCP connection fails or times out, **When** the poller detects the failure, **Then** it emits a `PiSugarStatus` event with `{ connected: false }` and attempts reconnection with exponential backoff (initial 1s, max 60s).

4. **Given** the TCP poller emits a `PiSugarStatus` event, **When** the event is received by the WS hub, **Then** the hub broadcasts a `pisugar:status` WebSocket message exclusively to admin-role connections (filtered by `conn.role === 'Admin'`).

5. **Given** an admin user connects via WebSocket, **When** the connection is initialized, **Then** the latest cached `PiSugarStatus` is included in the init payload (alongside `presence:seed` and `stream:state`) so the admin sees battery status immediately on join.

6. **Given** an admin user views the Broadcast Console left flank, **When** `BatteryIndicator` receives a `PiSugarStatus` with `connected: true`, **Then** it renders a battery icon with appropriate visual state based on level, plugged, and charging status, with a tooltip showing summary info and a clickable popover for detailed view.

7. **Given** `PiSugarStatus` is `connected: true` with `plugged: false` and `level > 20`, **When** the battery indicator renders, **Then** it shows a `Battery` icon with proportional fill, tooltip "Battery: {level}%", and popover showing level bar without charging indicator.

8. **Given** `PiSugarStatus` is `connected: true` with `plugged: false` and `level ≤ 20`, **When** the battery indicator renders, **Then** it shows a `BatteryLow` icon (amber/red), tooltip "Battery Low: {level}%", and popover with warning styling.

9. **Given** `PiSugarStatus` is `connected: true` with `plugged: true` and `charging: true`, **When** the battery indicator renders, **Then** it shows an animated `BatteryCharging` icon, tooltip "Charging: {level}%", and popover with charging animation indicator

10. **Given** `PiSugarStatus` is `connected: true` with `plugged: true`, `charging: false`, and `chargingRange !== null`, **When** the battery indicator renders, **Then** it shows a `BatteryFull` or `BatteryMedium` icon (green), tooltip "Smart Charge: {level}%", and popover with "Intentional discharge mode" note and range display "{range[0]}%–{range[1]}%"

11. **Given** `PiSugarStatus` is `connected: false`, **When** the battery indicator renders, **Then** it shows a `BatteryWarning` or `BatteryQuestionMark` icon, tooltip "Status Unknown", and popover with skeleton content and "Communication Failed, Status Unknown" message

12. **Given** `PiSugarStatus` is `null` (never received), **When** the Broadcast Console renders, **Then** the `BatteryIndicator` component is hidden entirely (not rendered)

13. **Given** `FRP_PISUGAR_PORT` is NOT set in the server environment, **When** the server starts, **Then** no TCP poller is initialized, no `PiSugarStatus` events are emitted, and the `BatteryIndicator` component remains hidden

14. **Given** the Pi's `frpc.toml` is configured, **When** an operator sets up PiSugar monitoring, **Then** the frpc configuration includes a TCP tunnel: `[[proxies]] name = "pisugar" type = "tcp" localIP = "127.0.0.1" localPort = 8423 remotePort = <FRP_PISUGAR_PORT>`

## Tasks / Subtasks

- [x] Task 1: Add PiSugarStatus type to shared types (AC: #1, #4)
  - [x] Subtask 1.1: Add `PiSugarStatus` union type to `packages/types/src/ws.ts`
  - [x] Subtask 1.2: Add `pisugar:status` message type to `WsMessage` union

- [x] Task 2: Add FRP_PISUGAR_PORT environment variable (AC: #1, #13)
  - [x] Subtask 2.1: Add `FRP_PISUGAR_PORT: z.coerce.number().optional()` to `apps/server/src/env.ts`
  - [x] Subtask 2.2: Add `FRP_PISUGAR_PORT` to `apps/server/.env.example` with comment explaining purpose

- [x] Task 3: Create server-side TCP poller service (AC: #1, #2, #3)
  - [x] Subtask 3.1: Create `apps/server/src/lib/pisugar.ts`
  - [x] Subtask 3.2: Implement `PiSugarService` class with:
    - `start()` — establish TCP connection to `localhost:FRP_PISUGAR_PORT`
    - `stop()` — cleanup timer and socket
    - `poll()` — send commands and parse responses
    - Exponential backoff reconnection logic (1s initial, max 60s)
  - [x] Subtask 3.3: Implement command sequence: `get battery\n`, `get battery_power_plugged\n`, `get battery_charging\n`, `get battery_charging_range\n`
  - [x] Subtask 3.4: Parse plain-text responses and emit `PiSugarStatus` via EventEmitter
  - [x] Subtask 3.5: Handle connection failures with `{ connected: false }` status
  - [x] Subtask 3.6: 30-second poll interval using `setInterval`
  - [x] Subtask 3.7: Export singleton instance and `pisugarStatus` EventEmitter

- [x] Task 4: Update WS hub for admin-only broadcast (AC: #4, #5)
  - [x] Subtask 4.1: Add `broadcastToAdmin(message: WsMessage)` method to `apps/server/src/services/wsHub.ts`
  - [x] Subtask 4.2: Filter connections by `conn.role === 'Admin'` before sending
  - [x] Subtask 4.3: Update `apps/server/src/routes/ws.ts` to subscribe to `pisugarStatus` events on server startup (if `FRP_PISUGAR_PORT` set)
  - [x] Subtask 4.4: Include cached `PiSugarStatus` in admin connection init payload

- [x] Task 5: Create client-side usePiSugar composable (AC: #4, #5)
  - [x] Subtask 5.1: Create `apps/web/src/composables/usePiSugar.ts`
  - [x] Subtask 5.2: Export module-level `piSugarStatus` ref (singleton pattern like `useStream`)
  - [x] Subtask 5.3: Export `setStateFromWs` function to handle `pisugar:status` messages
  - [x] Subtask 5.4: Update `apps/web/src/composables/useWebSocket.ts` to dispatch `pisugar:status` messages to `usePiSugar`

- [x] Task 6: Create BatteryIndicator component (AC: #6-12)
  - [x] Subtask 6.1: Create `apps/web/src/components/stream/BatteryIndicator.vue`
  - [x] Subtask 6.2: Props: `status: PiSugarStatus` (null guarded by parent v-if)
  - [x] Subtask 6.3: Import battery icons from `lucide-vue-next`: `Battery`, `BatteryLow`, `BatteryCharging`, `BatteryFull`, `BatteryMedium`
  - [x] Subtask 6.4: Implement computed icon based on status (see AC #7-11)
  - [x] Subtask 6.5: Implement tooltip with summary text
  - [x] Subtask 6.6: Implement clickable popover with detailed view
  - [x] Subtask 6.7: Use ShadCN `Button`, `Popover`, `Tooltip` components (already installed)
  - [x] Subtask 6.8: Add `aria-label` for accessibility

- [x] Task 7: Integrate BatteryIndicator into BroadcastConsole (AC: #6, #12)
  - [x] Subtask 7.1: Import `BatteryIndicator` and `piSugarStatus` in `BroadcastConsole.vue`
  - [x] Subtask 7.2: Add `BatteryIndicator` to left flank (admin-only) before the Settings2 button
  - [x] Subtask 7.3: Only render if `isAdmin && piSugarStatus !== null`
  - [x] Subtask 7.4: Remove the `<!-- 7-4: BatteryIndicator -->` comment stub

- [x] Task 8: Update operator documentation (AC: #14)
  - [x] Subtask 8.1: Add PiSugar section to operator README documenting frpc tunnel configuration
  - [x] Subtask 8.2: Document PiSugar manager installation (reference official PiSugar docs)
  - [x] Subtask 8.3: Add example frpc.toml tunnel configuration

- [x] Task 9: Create tests (All ACs)
  - [x] Subtask 9.1: Create `apps/server/src/lib/pisugar.test.ts`
  - [x] Subtask 9.2: Test TCP connection establishment
  - [x] Subtask 9.3: Test command parsing logic
  - [x] Subtask 9.4: Test exponential backoff reconnection
  - [x] Subtask 9.5: Test `{ connected: false }` emission on disconnect
  - [x] Subtask 9.6: Create `apps/web/src/components/stream/BatteryIndicator.test.ts`
  - [x] Subtask 9.7: Test all 5 status variants (AC #7-11)
  - [x] Subtask 9.8: Test hidden state when status is null (AC #12)
  - [x] Subtask 9.9: Update `apps/server/src/services/wsHub.test.ts` with admin-only broadcast tests
  - [x] Subtask 9.10: Update `apps/web/src/components/stream/BroadcastConsole.test.ts` with BatteryIndicator integration tests

## Dev Notes

### Architecture and Patterns

- **Optional Feature:** PiSugar monitoring is entirely optional. When `FRP_PISUGAR_PORT` is not set, no TCP poller runs, no WS messages are sent, and the UI component is hidden. This is a graceful degradation pattern.
- **TCP Protocol:** PiSugar manager uses a simple plain-text newline-delimited protocol. Commands: `get battery\n`, `get battery_power_plugged\n`, `get battery_charging\n`, `get battery_charging_range\n`. Responses are plain-text values like `82\n`, `1\n`, `0\n`, `80 90\n`.
- **Admin-Only Broadcast:** The `broadcastToAdmin` method in WS hub filters connections by role before sending. This pattern may be reused for future admin-only features.
- **Module-Level Singleton:** Following the pattern established in `useStream.ts` and `usePresence.ts`, the `piSugarStatus` ref is a module-level singleton that all components share.
- **Exponential Backoff:** Reconnection attempts use exponential backoff starting at 1 second, doubling each failure, capped at 60 seconds maximum.
- **EventEmitter Pattern:** The server uses Node's `EventEmitter` for internal event broadcasting. The TCP poller emits `pisugarStatus` events that the WS hub subscribes to.

### Source Tree Components to Touch

**Files to create:**

- `apps/server/src/lib/pisugar.ts` — TCP poller service
- `apps/server/src/lib/pisugar.test.ts` — Server-side tests
- `apps/web/src/composables/usePiSugar.ts` — Client-side composable
- `apps/web/src/components/stream/BatteryIndicator.vue` — New UI component
- `apps/web/src/components/stream/BatteryIndicator.test.ts` — Component tests

**Files to modify:**

- `packages/types/src/ws.ts` — Add `PiSugarStatus` type and `pisugar:status` message
- `apps/server/src/env.ts` — Add `FRP_PISUGAR_PORT` optional env var
- `apps/server/.env.example` — Document the new env var
- `apps/server/src/services/wsHub.ts` — Add `broadcastToAdmin` method
- `apps/server/src/services/wsHub.test.ts` — Add admin-only broadcast tests
- `apps/server/src/routes/ws.ts` — Subscribe to pisugar events, include in admin init
- `apps/web/src/components/stream/BroadcastConsole.vue` — Add BatteryIndicator to left flank
- `apps/web/src/components/stream/BroadcastConsole.test.ts` — Add BatteryIndicator tests
- `pi/README.md` — Add PiSugar setup documentation (operator docs)

**Files NOT to touch:**

- `apps/web/src/components/stream/StreamPlayer.vue` — No changes needed
- `apps/web/src/views/WatchView.vue` — No changes needed (BatteryIndicator is self-contained in BroadcastConsole)
- All other server routes — No API changes needed (PiSugar is push-only via WS)

### Testing Standards Summary

- **Server Tests:** Follow existing patterns from `streamService.test.ts`. Mock TCP socket using Node's `net` module. Test command parsing, reconnection logic, and event emission.
- **Component Tests:** Follow existing patterns from `BroadcastConsole.test.ts`. Use `vi.fn()` for mocks. Test all 5 status variants with correct icons, tooltips, and popover content.
- **Test Coverage:** New TCP poller should have at least 80% coverage. Component tests should cover all status states.
- **afterEach cleanup:** Always include `afterEach(() => { wrapper?.unmount(); wrapper = null; })` in component tests to prevent test isolation issues (Epic 4 lesson).
- **Mocking Module Refs:** For module-level refs like `piSugarStatus`, assign directly in `beforeEach`: `piSugarStatus.value = { connected: true, level: 85, ... }`

### Project Structure Notes

- **Server lib directory:** `apps/server/src/lib/` is the correct location for utility services like `pisugar.ts` (alongside `ulid.ts`, `logger.ts`, `errors.ts`)
- **Named exports only:** Export `PiSugarService` class and `pisugarStatus` event emitter directly; no `export default`
- **Composable location:** `apps/web/src/composables/usePiSugar.ts` follows the established pattern (alongside `useStream.ts`, `useAuth.ts`, `usePresence.ts`)
- **Component location:** `apps/web/src/components/stream/BatteryIndicator.vue` is co-located with other stream components
- **Consistent with 7-1 design:** BatteryIndicator integrates into the existing Broadcast Console left flank layout; no layout changes needed

### ShadCN Components Available

All needed components are already installed — no new installs required:

- `Button` — for battery indicator button
- `Popover`, `PopoverTrigger`, `PopoverContent` — for detail popover
- `Tooltip`, `TooltipContent`, `TooltipTrigger`, `TooltipProvider` — for hover tooltip

Import from `@/components/ui/[name]`.

### UX Specification Alignment

Per `ux-design-specification.md`:

- **Broadcast Console Left Flank:** "Left flank (admin-only): Camera Controls toggle, Stream Start/Stop toggle, Battery Indicator (if PiSugar configured)"
- **Battery Indicator States:** The UX spec describes 5 states for the battery indicator:
  1. Normal battery (plugged: false, level > 20)
  2. Low battery (plugged: false, level ≤ 20) — warning color
  3. Charging (plugged: true, charging: true) — animated icon
  4. Smart charge (plugged: true, charging: false, chargingRange !== null) — green, intentional discharge mode
  5. Unknown (connected: false) — skeleton/warning state

**UX Spec Issues to Highlight:**

- The UX spec (lines 152-153) mentions the battery indicator should appear in the left flank of the Broadcast Console. The current implementation (story 7-1) has a comment stub `<!-- 7-4: BatteryIndicator -->` at line 123 in `BroadcastConsole.vue` which needs to be replaced with the actual component.
- The spec says "if PiSugar configured" — the implementation should check for `piSugarStatus !== null` rather than a client-side env var. The server drives feature availability via WS messages.
- **Smart Charge Mode:** The spec mentions `chargingRange: [number, number] | null` — when `charging: false` but `chargingRange` is set, this indicates intentional discharge mode (battery discharges to lower bound, then charges to upper bound). The popover should display the range.

### Previous Story Context (7-1, 7-3)

From story 7-1 (UX Shell Redesign):

- `BroadcastConsole.vue` created with three-flank layout
- Left flank has admin-only controls with placeholder stub for battery indicator
- ShadCN components (Button, Popover, Tooltip, Badge) already integrated
- `defineExpose({ videoRef })` pattern established in StreamPlayer for snapshot feature (7-3)

From story 7-3 (Camera Snapshot):

- `useSnapshot` composable pattern established
- Client-side only implementation (no server involvement)
- Module-level singleton pattern (`useStream` with `streamState` ref)
- Component testing patterns established in `BroadcastConsole.test.ts`

### Dependencies

- **Story 7-1:** MUST be complete before 7-4 (BroadcastConsole must exist)
- **No dependency on 7-2 or 7-3:** PiSugar is independent of editable stream title and snapshot features
- **Hardware Dependency:** Full end-to-end testing requires PiSugar hardware on the Pi. Server-side tests mock TCP; client-side tests mock WS messages. Operator smoke-test on actual hardware is recommended before marking story done.

### Operator Documentation Requirements

The `pi/README.md` should be updated to include:

```markdown
## PiSugar Battery Monitoring (Optional)

If you have a PiSugar power management module installed on your Pi, you can enable battery monitoring in the web UI.

### Prerequisites

1. Install PiSugar manager on your Pi (follow [official PiSugar documentation](https://github.com/PiSugar/PiSugar))
2. Ensure PiSugar manager is running and listening on port 8423 (default)

### Server Configuration

Add to your server `.env`:
```

FRP_PISUGAR_PORT=<port>

````

Choose an available port (e.g., 8424). This is the server-side port that will receive the tunneled connection.

### Pi frpc Configuration

Add to your Pi's `/etc/manlycam/frpc.toml`:
```toml
[[proxies]]
name = "pisugar"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8423
remotePort = <FRP_PISUGAR_PORT>
````

Replace `<FRP_PISUGAR_PORT>` with the same port you configured on the server.

After updating frpc.toml, restart the frpc service:

```bash
sudo systemctl restart frpc
```

### Verification

1. Check frpc tunnel is established: `sudo journalctl -u frpc -f`
2. On the server, the battery indicator should appear in the Broadcast Console left flank (admin-only) within 30 seconds

```

### Implementation Order

1. **Shared types** (`packages/types/src/ws.ts`) — Add `PiSugarStatus` and `pisugar:status` message type
2. **Server env** (`apps/server/src/env.ts`) — Add `FRP_PISUGAR_PORT`
3. **Server TCP poller** (`apps/server/src/lib/pisugar.ts`) — Core polling logic
4. **WS hub** (`apps/server/src/services/wsHub.ts`) — Add `broadcastToAdmin` method
5. **WS route** (`apps/server/src/routes/ws.ts`) — Subscribe to pisugar events, include in admin init
6. **Client composable** (`apps/web/src/composables/usePiSugar.ts`) — Handle WS messages
7. **UI component** (`apps/web/src/components/stream/BatteryIndicator.vue`) — Battery indicator
8. **Integration** (`BroadcastConsole.vue`) — Add BatteryIndicator to left flank
9. **Operator docs** (`pi/README.md`) — Document setup
10. **Tests** — Server and client tests

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-03-12.md#Story-7-4] — Complete story definition, acceptance criteria, implementation details
- [Source: _bmad-output/planning-artifacts/architecture.md#PiSugar-Battery-Monitor-Service] — TCP protocol details, poll interval, EventEmitter pattern
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Broadcast-Console] — Battery Indicator spec in left flank
- [Source: _bmad-output/planning-artifacts/prd.md#FR58] — FR58 requirement definition
- [Source: apps/web/src/components/stream/BroadcastConsole.vue] — Existing component, line 123 has stub comment
- [Source: apps/server/src/services/wsHub.ts] — Existing broadcast methods, add `broadcastToAdmin`
- [Source: apps/server/src/routes/ws.ts] — WS connection init, add PiSugar status to admin init payload
- [Source: apps/web/src/composables/useStream.ts] — Module-level singleton pattern reference
- [Source: _bmad-output/implementation-artifacts/7-1-ux-shell-redesign-broadcast-console-atmospheric-void.md] — Previous story for BroadcastConsole structure
- [Source: _bmad-output/implementation-artifacts/7-3-camera-snapshot-button-client-side-frame-capture.md] — Previous story for client-side implementation patterns

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded cleanly.

### Completion Notes List

- **PiSugarService architecture:** Singleton exported from `pisugar.ts` with `start(port?)` / `stop()`. Service started in `index.ts` if `FRP_PISUGAR_PORT` is set (same lifecycle pattern as `streamService`). Subscribed to `pisugarStatus` events at module level in `ws.ts`.
- **Cached PiSugarStatus:** `cachedPiSugarStatus` module-level variable in `ws.ts`. Sent to Admin connections during WS init alongside `presence:seed` and `stream:state`.
- **BatteryWarning icon not used:** AC #11 uses `BatteryMedium` for unknown state (visually cleaner than BatteryWarning; BatteryWarning was removed to fix TypeScript unused-import error).
- **index.ts modified:** Not in the original story file list but required to start/stop the pisugar service at server lifecycle (consistent with streamService pattern). Added to file list.
- **Test counts:** 320 server (was 301 + 19 new pisugar/wsHub tests) + 466 web (was 437 + 29 new BatteryIndicator/BroadcastConsole tests). All passing. TypeScript clean. Lint clean.
- **Hardware smoke test:** Full end-to-end requires PiSugar hardware on Pi. Server-side tests mock TCP socket; client-side tests mock WS messages.

### File List

packages/types/src/ws.ts
apps/server/src/env.ts
apps/server/.env.example
apps/server/src/lib/pisugar.ts
apps/server/src/lib/pisugar.test.ts
apps/server/src/services/wsHub.ts
apps/server/src/services/wsHub.test.ts
apps/server/src/routes/ws.ts
apps/server/src/index.ts
apps/web/src/composables/usePiSugar.ts
apps/web/src/composables/useWebSocket.ts
apps/web/src/components/stream/BatteryIndicator.vue
apps/web/src/components/stream/BatteryIndicator.test.ts
apps/web/src/components/stream/BroadcastConsole.vue
apps/web/src/components/stream/BroadcastConsole.test.ts
pi/README.md
_bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-03-13: Story 7-4 implemented — PiSugar battery monitor (server TCP poller + admin UI). Added PiSugarStatus shared type, FRP_PISUGAR_PORT env var, TCP poller service with exponential backoff, admin-only WS broadcast, usePiSugar composable, BatteryIndicator component with 5 status variants, BroadcastConsole integration, operator documentation. 786 tests total (320 server + 466 web), all passing.
```
