# Story 8-4: Programmable Slash Commands

Status: ready-for-dev

## Story

As an **admin**,
I want to define custom slash commands via JavaScript files that users can invoke in chat,
So that I can create custom text expansions and interactions without modifying the codebase.

## Acceptance Criteria

1. **Given** an admin creates a JavaScript file in `apps/server/custom/`, **When** the server starts, **Then** the command is loaded and available to users based on its `gate.applicableRoles` setting.

2. **Given** a command file exports the following interface:

   ```typescript
   interface SlashCommand {
     name: string; // e.g., "shrug"
     description: string; // e.g., "Appends ¯\\_(ツ)_/¯"
     placeholder?: string; // e.g., "[message]" - shown in autocomplete as "/shrug [message]"
     handler: (input: string, message: SimplifiedMessage, user: SimplifiedUser) => MessageResponse;
     gate?: { applicableRoles?: Role[] }; // optional visibility gate
   }

   interface SimplifiedMessage {
     content: string; // full message including /command portion
     createdAt: string; // ISO timestamp
     mentionedUserIds: string[]; // from Story 8-2
   }

   interface SimplifiedUser {
     id: string;
     displayName: string;
     role: Role;
   }

   interface MessageResponse {
     content: string;
     ephemeral?: boolean; // if true, only invoker sees it (not persisted); defaults to false
   }
   ```

   **When** the command is invoked, **Then** the handler receives the input text (after the command), the full message context, and a simplified user object.

3. **Given** a user types `/` in the chat input **and at least 1 command exists**, **When** the autocomplete popup appears, **Then** it shows all commands visible to the user's role with format: `/command-name {placeholder}` (or just `/command-name` if no placeholder).

4. **Given** a command defines `placeholder: "[message]"`, **When** the autocomplete popup displays the command, **Then** it shows as `/shrug [message]` with the description alongside.

5. **Given** an admin creates multiple commands with the same name, **When** the server loads commands, **Then** all commands with that name are loaded (no deduplication).

6. **Given** a user types `/` and multiple commands share the same name, **When** the autocomplete popup appears, **Then** all commands with that name are shown (differentiated by description).

7. **Given** a user types `/shrug` and submits the message, **When** the command is processed, **Then** the handler's returned `content` is posted as the chat message instead of the raw input.

8. **Given** a command specifies `gate: { applicableRoles: ['admin', 'moderator'] }`, **When** a viewer without those roles types `/`, **Then** that command does not appear in their autocomplete list.

9. **Given** a command file has invalid syntax or missing required fields, **When** the server loads commands, **Then** an error is logged and the invalid command is skipped (server does not crash).

10. **Given** a command handler returns `{ content: "Only you see this", ephemeral: true }`, **When** the command is processed, **Then** only the invoking user sees the message via WebSocket (not broadcast to others) and the message is not persisted to the database.

11. **Given** a command handler returns `{ content: "Everyone sees this" }` or `{ content: "...", ephemeral: false }`, **When** the command is processed, **Then** the message is broadcast to all connected users and persisted normally.

12. **And** example commands are provided in `apps/server/custom/`: `shrug.js` (appends `¯\\_(ツ)_/¯`), `tableflip.js` (appends `(╯°□°）╯︵ ┻━┻`).

13. **And** the custom commands folder is located at `apps/server/custom/` with a `.gitkeep` and `.gitignore` that ignores all files except `shrug.js` and `tableflip.js`.

14. **And** Docker deployment documentation is updated to explain how to mount the `custom/` folder for custom commands.

## Tasks / Subtasks

- [ ] Task 1: Define types for slash commands (AC: #2)
  - [ ] Subtask 1.1: Add `SlashCommand`, `SimplifiedMessage`, `SimplifiedUser`, `MessageResponse` types to `packages/types/src/slash-commands.ts`
  - [ ] Subtask 1.2: Export from `packages/types/src/index.ts`
  - [ ] Subtask 1.3: Add `Role` import for gate type

- [ ] Task 2: Create custom commands folder structure (AC: #12, #13)
  - [ ] Subtask 2.1: Create `apps/server/custom/` directory
  - [ ] Subtask 2.2: Create `apps/server/custom/.gitkeep` (empty file)
  - [ ] Subtask 2.3: Create `apps/server/custom/.gitignore` that ignores everything except `shrug.js` and `tableflip.js`
  - [ ] Subtask 2.4: Create `apps/server/custom/shrug.js` — appends `¯\\_(ツ)_/¯`
  - [ ] Subtask 2.5: Create `apps/server/custom/tableflip.js` — appends `(╯°□°）╯︵ ┻━┻`

- [ ] Task 3: Create slash command loader service (AC: #1, #5, #9)
  - [ ] Subtask 3.1: Create `apps/server/src/services/slashCommands.ts`
  - [ ] Subtask 3.2: Implement `loadCommands(): SlashCommand[]` that reads `.js` files from `apps/server/custom/`
  - [ ] Subtask 3.3: Validate each command has required `name`, `description`, `handler` fields
  - [ ] Subtask 3.4: Log errors for invalid commands, skip them without crashing
  - [ ] Subtask 3.5: Store loaded commands in module-level `commands: SlashCommand[]` array
  - [ ] Subtask 3.6: Export `getCommands(): SlashCommand[]` and `reloadCommands(): void`

- [ ] Task 4: Add commands API endpoint (AC: #3, #4, #6, #8)
  - [ ] Subtask 4.1: Create `apps/server/src/routes/commands.ts`
  - [ ] Subtask 4.2: Add `GET /api/commands` endpoint that returns commands filtered by user's role
  - [ ] Subtask 4.3: Filter out commands where `gate.applicableRoles` doesn't include user's role
  - [ ] Subtask 4.4: Return `{ commands: Array<{ name, description, placeholder }> }`
  - [ ] Subtask 4.5: Mount route in `apps/server/src/index.ts`

- [ ] Task 5: Create slash command execution service (AC: #2, #7, #10, #11)
  - [ ] Subtask 5.1: Add `executeCommand(params)` to `slashCommands.ts`
  - [ ] Subtask 5.2: Parse command name from message (first word after `/`)
  - [ ] Subtask 5.3: Find matching command(s), use first match
  - [ ] Subtask 5.4: Build `SimplifiedMessage` with content, createdAt, mentionedUserIds
  - [ ] Subtask 5.5: Build `SimplifiedUser` from session user
  - [ ] Subtask 5.6: Call `handler(input, message, user)` and get `MessageResponse`
  - [ ] Subtask 5.7: If `ephemeral: true`, send only to invoking user via WebSocket
  - [ ] Subtask 5.8: If `ephemeral: false` or omitted, broadcast and persist as normal message

- [ ] Task 6: Integrate command execution into message creation (AC: #7, #10, #11)
  - [ ] Subtask 6.1: In `chatService.ts`, check if message starts with `/`
  - [ ] Subtask 6.2: If slash command, call `executeCommand()` instead of normal create
  - [ ] Subtask 6.3: For ephemeral responses, skip database write
  - [ ] Subtask 6.4: For normal responses, use returned `content` as message content

- [ ] Task 7: Add WS message type for ephemeral responses (AC: #10)
  - [ ] Subtask 7.1: Add `{ type: 'chat:ephemeral'; payload: { content: string; createdAt: string } }` to `WsMessage` union
  - [ ] Subtask 7.2: Add `sendToUser(userId: string, message: WsMessage)` method to `WsHub`

- [ ] Task 8: Create CommandAutocomplete Vue component (AC: #3, #4, #6)
  - [ ] Subtask 8.1: Create `apps/web/src/components/chat/CommandAutocomplete.vue`
  - [ ] Subtask 8.2: Fetch commands from `GET /api/commands` on mount
  - [ ] Subtask 8.3: Accept props: `visible: boolean`, `query: string`, `position: { top: number; left: number }`
  - [ ] Subtask 8.4: Emit events: `select(command)`, `close()`
  - [ ] Subtask 8.5: Filter commands by query (starts-with match on name)
  - [ ] Subtask 8.6: Display format: `/name {placeholder} — description`
  - [ ] Subtask 8.7: Handle duplicate names by showing all with descriptions

- [ ] Task 9: Integrate command autocomplete into ChatInput (AC: #3)
  - [ ] Subtask 9.1: In `ChatInput.vue`, detect `/` at start of message
  - [ ] Subtask 9.2: Show `CommandAutocomplete` when `/` is typed AND commands exist
  - [ ] Subtask 9.3: On select, replace `/query` with `/command-name ` (with trailing space)
  - [ ] Subtask 9.4: Close autocomplete on: select, Escape, space, non-`/` character

- [ ] Task 10: Handle ephemeral messages in client (AC: #10)
  - [ ] Subtask 10.1: In `useWebSocket.ts` or `ChatPanel.vue`, handle `chat:ephemeral` message type
  - [ ] Subtask 10.2: Display ephemeral message in chat with distinct styling (e.g., italic, different opacity)
  - [ ] Subtask 10.3: Ephemeral messages are NOT added to `messages` ref (not persisted)

- [ ] Task 11: Update tests (AC: All)
  - [ ] Subtask 11.1: Create `slashCommands.test.ts` — test command loading, validation, execution
  - [ ] Subtask 11.2: Create `commands.test.ts` (route) — test role-based filtering
  - [ ] Subtask 11.3: Create `CommandAutocomplete.test.ts` — test filtering and selection
  - [ ] Subtask 11.4: Update `ChatInput.test.ts` — test `/` trigger detection
  - [ ] Subtask 11.5: Test ephemeral message handling in `ChatPanel.test.ts`

- [ ] Task 12: Update deployment documentation (AC: #14)
  - [ ] Subtask 12.1: Update `docs/deployment.md` to document `custom/` folder mounting
  - [ ] Subtask 12.2: Add Docker volume mount example: `-v /path/to/custom:/app/custom`
  - [ ] Subtask 12.3: Document that `shrug.js` and `tableflip.js` are examples that can be removed

- [ ] Task 13: Visual and accessibility verification (AC: All)
  - [ ] Subtask 13.1: Manual test: type `/`, verify commands appear (if any exist)
  - [ ] Subtask 13.2: Manual test: run `/shrug hello`, verify `hello ¯\_(ツ)_/¯` is sent
  - [ ] Subtask 13.3: Manual test: create custom command file, restart server, verify it loads
  - [ ] Subtask 13.4: Manual test: ephemeral command, verify only invoker sees it
  - [ ] Subtask 13.5: Manual test: delete all commands, verify `/` shows no popup
  - [ ] Subtask 13.6: Accessibility: verify autocomplete has `role="listbox"`

## Dev Notes

### Architecture and Patterns

- **Command location:** Commands are always loaded from `apps/server/custom/` relative to the server's working directory. No environment variable configuration.
- **Example commands:** `shrug.js` and `tableflip.js` are shipped as examples. Admins can delete them or add their own.
- **Docker mounting:** In Docker, the `custom/` folder can be mounted as a volume to provide custom commands without rebuilding the image.
- **Command loading:** Commands are loaded at server startup. No hot-reloading — server restart required to pick up new/changed commands.
- **Handler execution:** Handlers run in the Node.js server context with full access to `require()`, file system, etc. This is intentional for admin-defined extensibility.
- **Role-based visibility:** Commands without a `gate` are visible to all users. Commands with `gate.applicableRoles` are only visible to users with one of those roles.
- **Duplicate names:** Multiple commands can share the same name. When executed, the first matching command (by file load order) is used. Autocomplete shows all duplicates.

### Custom Folder Structure

```
apps/server/custom/
├── .gitkeep           # Keeps folder in git
├── .gitignore         # Ignores everything except examples
├── shrug.js           # Example command
├── tableflip.js       # Example command
└── (user commands)    # Any .js files added by admin
```

**.gitignore contents:**

```gitignore
# Ignore everything in this folder
*

# Except these files
!.gitkeep
!.gitignore
!shrug.js
!tableflip.js
```

### SimplifiedMessage Interface

```typescript
interface SimplifiedMessage {
  content: string; // Full message: "/shrug hello world"
  createdAt: string; // ISO 8601 timestamp when message was created
  mentionedUserIds: string[]; // User IDs mentioned in the message (from Story 8-2)
}
```

The `content` includes the full message with the `/command` portion. The `input` parameter in the handler is the text _after_ the command name (e.g., for `/shrug hello`, `input = "hello"`).

### SimplifiedUser Interface

```typescript
interface SimplifiedUser {
  id: string; // User ULID
  displayName: string; // User's display name
  role: Role; // 'Admin' | 'Moderator' | 'ViewerCompany' | 'ViewerGuest'
}
```

This is a minimal user object passed to command handlers. It doesn't include sensitive fields like email or Google sub.

### Command File Example

```javascript
// apps/server/custom/shrug.js
module.exports = {
  name: 'shrug',
  description: 'Appends ¯\\_(ツ)_/¯ to your message',
  placeholder: '[message]',
  handler: (input, message, user) => {
    const shrug = '¯\\_(ツ)_/¯';
    const content = input ? `${input} ${shrug}` : shrug;
    return { content };
  },
};
```

```javascript
// apps/server/custom/me.js (example ephemeral command)
module.exports = {
  name: 'me',
  description: 'Shows your user info (only visible to you)',
  handler: (input, message, user) => {
    return {
      content: `You are ${user.displayName} (${user.role})`,
      ephemeral: true,
    };
  },
};
```

### Slash Commands Service

```typescript
// apps/server/src/services/slashCommands.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  SlashCommand,
  SimplifiedMessage,
  SimplifiedUser,
  MessageResponse,
  Role,
} from '@manlycam/types';
import { AppError } from '../lib/errors.js';
import { wsHub } from './wsHub.js';
import { logger } from '../lib/logger.js';

let commands: SlashCommand[] = [];

const CUSTOM_PATH = path.resolve('./custom');

export function loadCommands(): void {
  commands = [];

  if (!fs.existsSync(CUSTOM_PATH)) {
    logger.warn({ path: CUSTOM_PATH }, 'Custom commands directory not found');
    return;
  }

  const files = fs.readdirSync(CUSTOM_PATH).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    try {
      const filePath = path.join(CUSTOM_PATH, file);
      // Clear require cache for development
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);

      if (!command.name || typeof command.name !== 'string') {
        throw new Error('Missing or invalid "name" field');
      }
      if (!command.description || typeof command.description !== 'string') {
        throw new Error('Missing or invalid "description" field');
      }
      if (typeof command.handler !== 'function') {
        throw new Error('Missing or invalid "handler" function');
      }

      commands.push(command as SlashCommand);
      logger.info({ name: command.name, file }, 'Loaded slash command');
    } catch (err) {
      logger.error({ err, file }, 'Failed to load slash command');
    }
  }
}

export function getCommands(): SlashCommand[] {
  return commands;
}

export function getCommandsForRole(
  role: Role,
): Array<{ name: string; description: string; placeholder?: string }> {
  return commands
    .filter((cmd) => {
      if (!cmd.gate?.applicableRoles) return true;
      return cmd.gate.applicableRoles.includes(role);
    })
    .map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      placeholder: cmd.placeholder,
    }));
}

interface ExecuteCommandParams {
  content: string;
  userId: string;
  userDisplayName: string;
  userRole: Role;
  mentionedUserIds: string[];
}

export function executeCommand(params: ExecuteCommandParams): MessageResponse | null {
  const { content, userId, userDisplayName, userRole, mentionedUserIds } = params;

  if (!content.startsWith('/')) return null;

  const match = content.match(/^\/(\w+)/);
  if (!match) return null;

  const commandName = match[1];
  const input = content.slice(commandName.length + 2).trim();

  const command = commands.find((cmd) => cmd.name === commandName);
  if (!command) return null;

  if (command.gate?.applicableRoles && !command.gate.applicableRoles.includes(userRole)) {
    throw new AppError('You do not have permission to use this command', 'FORBIDDEN', 403);
  }

  const message: SimplifiedMessage = {
    content,
    createdAt: new Date().toISOString(),
    mentionedUserIds,
  };

  const user: SimplifiedUser = {
    id: userId,
    displayName: userDisplayName,
    role: userRole,
  };

  try {
    return command.handler(input, message, user);
  } catch (err) {
    logger.error({ err, command: commandName }, 'Slash command handler error');
    throw new AppError('Command execution failed', 'INTERNAL_ERROR', 500);
  }
}

loadCommands();
```

### Ephemeral Message Handling

```typescript
// In chatService.ts
const response = executeCommand({
  content,
  userId,
  userDisplayName: user.displayName,
  userRole: user.role as Role,
  mentionedUserIds,
});

if (response) {
  if (response.ephemeral) {
    wsHub.sendToUser(userId, {
      type: 'chat:ephemeral',
      payload: {
        content: response.content,
        createdAt: new Date().toISOString(),
      },
    });
    return null;
  }
  content = response.content;
}
```

### Docker Volume Mount

```yaml
# docker-compose.yml
services:
  manlycam:
    volumes:
      - ./custom:/app/custom:ro # Mount custom commands (read-only recommended)
```

### Source Tree Components to Touch

**Files to create:**

- `packages/types/src/slash-commands.ts` — Type definitions
- `apps/server/custom/.gitkeep` — Keeps folder in git
- `apps/server/custom/.gitignore` — Ignores user commands
- `apps/server/custom/shrug.js` — Example command
- `apps/server/custom/tableflip.js` — Example command
- `apps/server/src/services/slashCommands.ts` — Command loader and executor
- `apps/server/src/routes/commands.ts` — Commands API endpoint
- `apps/web/src/components/chat/CommandAutocomplete.vue` — Autocomplete component

**Files to modify:**

- `packages/types/src/index.ts` — Export slash-commands types
- `packages/types/src/ws.ts` — Add `chat:ephemeral` message type
- `apps/server/src/services/chatService.ts` — Integrate command execution
- `apps/server/src/services/wsHub.ts` — Add `sendToUser()` method
- `apps/server/src/index.ts` — Mount commands route
- `apps/web/src/components/chat/ChatInput.vue` — Integrate command autocomplete
- `apps/web/src/composables/useChat.ts` or `ChatPanel.vue` — Handle ephemeral messages
- `docs/deployment.md` — Document custom folder mounting

### Testing Standards

- **Command loading:** Test valid/invalid command files, missing fields, syntax errors
- **Role filtering:** Test that commands with `gate.applicableRoles` are hidden from unauthorized users
- **Ephemeral messages:** Test that `ephemeral: true` responses don't persist to database
- **Handler errors:** Test that handler exceptions return appropriate error responses
- **Empty commands:** Test that `/` trigger shows nothing when no commands exist

### References

- [Source: epics.md#Story 8-4] — Original story requirements
- [Source: apps/server/src/services/chatService.ts] — Message creation integration point
- [Source: apps/server/src/services/wsHub.ts] — WebSocket hub for sendToUser
- [Source: packages/types/src/ws.ts] — WsMessage type for ephemeral message
- [Source: docs/deployment.md] — Deployment documentation to update

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
