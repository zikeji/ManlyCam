# Custom Slash Commands

Drop a `.js` file here and restart the server — it's automatically loaded as a `/commandname` in chat.

## Included Examples

| Command | Behavior |
|---|---|
| `/shrug [message]` | Appends `¯\_(ツ)_/¯` — posts as you |
| `/tableflip [message]` | Appends `(╯°□°）╯︵ ┻━┻` — posts as you |
| `/pet [message]` | Broadcasts a pet request as the System user; rate-limited to once per 5 minutes |
| `/treat [message]` | Broadcasts a treat request as the System user; rate-limited to once per hour |

## Quick Start

Create a `.js` file in this directory. Copy the JSDoc block below for editor autocompletion:

```javascript
// custom/hello.js
const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} SimplifiedMessage
 * @property {string} content - Full message content including the /command portion
 * @property {string} createdAt - ISO 8601 timestamp when the message was created
 * @property {string[]} mentionedUserIds - User IDs mentioned in the message
 */

/**
 * @typedef {Object} SimplifiedUser
 * @property {string} id - User ULID
 * @property {string} displayName - User's display name
 * @property {'Admin'|'Moderator'|'ViewerCompany'|'ViewerGuest'} role - User's role
 */

/**
 * @typedef {Object} MessageResponse
 * @property {string} content - The message content to post
 * @property {boolean} [ephemeral] - If true, only the invoking user sees it (not persisted). Mutually exclusive with impersonateUser.
 * @property {boolean} [impersonateUser] - If true, post as the invoking user instead of the System user. Default false.
 */

/**
 * @typedef {Object} SlashCommand
 * @property {string} name - Command name (used as /name in chat)
 * @property {string} description - Short description shown in autocomplete
 * @property {string} [placeholder] - Argument hint shown in autocomplete, e.g. "[message]"
 * @property {(input: string, message: SimplifiedMessage, user: SimplifiedUser) => MessageResponse} handler - Command handler
 * @property {{ applicableRoles?: ('Admin'|'Moderator'|'ViewerCompany'|'ViewerGuest')[] }} [gate] - Role visibility gate
 */

/** @type {SlashCommand} */
module.exports = {
  name: 'hello',
  description: 'Greets you by name',
  handler: (input, message, user) => {
    return { content: `Hello, ${user.displayName}!` };
  },
};
```

Restart the server to pick up new or changed commands.

## System User vs. Posting as Yourself

By default, command responses post as the **System** user (bot-like appearance). Set `impersonateUser: true` to post as the person who invoked the command instead:

```javascript
/** @type {SlashCommand} */
module.exports = {
  name: 'shrug',
  description: 'Appends a shrug to your message',
  placeholder: '[message]',
  handler: (input, _message, _user) => {
    const shrug = '¯\\_(ツ)_/¯';
    return { content: input ? `${input} ${shrug}` : shrug, impersonateUser: true };
  },
};
```

`ephemeral` and `impersonateUser` are mutually exclusive — if both are set, `ephemeral` wins.

## Ephemeral Responses

Set `ephemeral: true` to send a response visible only to the invoking user. It appears as a System message with a Dismiss option and is never persisted:

```javascript
/** @type {SlashCommand} */
module.exports = {
  name: 'whoami',
  description: 'Shows your role (only visible to you)',
  handler: (input, message, user) => {
    return { content: `You are ${user.displayName} (${user.role})`, ephemeral: true };
  },
};
```

## Role-Gating

Use `gate.applicableRoles` to restrict a command to specific roles. Users without a matching role won't see the command in autocomplete and will receive an error if they try to invoke it:

```javascript
/** @type {SlashCommand} */
module.exports = {
  name: 'announce',
  description: 'Post an admin-only announcement',
  gate: { applicableRoles: ['Admin'] },
  handler: (input, message, user) => {
    return { content: `📢 ${input}` };
  },
};
```

Available roles: `Admin`, `Moderator`, `ViewerCompany`, `ViewerGuest`

## User Mentions

Use `<@userId>` in content to @-mention a user. The chat renders it as a highlighted, clickable name. The invoking user's ID is available as `user.id`:

```javascript
/** @type {SlashCommand} */
module.exports = {
  name: 'wave',
  description: 'Wave at everyone',
  handler: (input, message, user) => {
    return { content: `<@${user.id}> waves hello! 👋` };
  },
};
```

## Persistent State and Rate Limiting

Command handlers have access to the full Node.js `require()` ecosystem. Use `__dirname` to resolve paths relative to this directory for storing persistent state across invocations:

```javascript
const fs = require('fs');
const path = require('path');

/** @type {SlashCommand} */
module.exports = {
  name: 'cheer',
  description: 'Cheer for Manly (once per hour)',
  handler: (input, message, user) => {
    const RATE_FILE = path.join(__dirname, '.last-cheer-timestamp');
    const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

    let last = 0;
    if (fs.existsSync(RATE_FILE)) {
      try { last = parseInt(fs.readFileSync(RATE_FILE, 'utf8'), 10); } catch {}
    }
    const now = Date.now();
    if (last && now - last < COOLDOWN_MS) {
      return { content: 'Cheer is on cooldown. Try again later!', ephemeral: true };
    }
    fs.writeFileSync(RATE_FILE, now.toString(), 'utf8');
    return { content: `<@${user.id}> cheers for Manly! 🎉` };
  },
};
```

State files (`.last-cheer-timestamp`) are written to this directory. If you're running in Docker, note that mounting a volume shadows the entire `custom/` directory — copy any built-ins you want to keep into your local folder first, and make sure the mount is **not** read-only. See the [deploy docs](../../docs/deploy/README.md#custom-slash-commands) for details.
