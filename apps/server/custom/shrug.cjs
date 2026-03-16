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
  name: 'shrug',
  description: 'Appends ¯\\\\_(ツ)_/¯ to your message',
  placeholder: '[message]',
  handler: (input, _message, _user) => {
    const shrug = '¯\\_(ツ)_/¯';
    const content = input ? `${input} ${shrug}` : shrug;
    return { content, impersonateUser: true };
  },
};
