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
 * @property {boolean} [impersonateUser] - If true, post as the invoking user instead of the system user. Default false.
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
  name: 'treat',
  description: 'Request Manly receive treats.',
  placeholder: '[message]',
  handler: (input, _message, user) => {
    const RATE_LIMIT_FILE = path.join(__dirname, '.last-treat-timestamp');
    const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour

    let lastTreat = 0;
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      try {
        lastTreat = parseInt(fs.readFileSync(RATE_LIMIT_FILE, 'utf8'), 10);
      } catch (e) {
        lastTreat = 0;
      }
    }
    const now = Date.now();
    if (lastTreat && now - lastTreat < RATE_LIMIT_MS) {
      return {
        content: 'Manly ate recently! Please wait a bit before trying again.',
        ephemeral: true,
      };
    }
    fs.writeFileSync(RATE_LIMIT_FILE, now.toString(), 'utf8');
    return {
      content: `<@${user.id}> has requested Manly receive treats! ${input ? `\nThey say: “${input}”` : ''}`,
    };
  },
};
