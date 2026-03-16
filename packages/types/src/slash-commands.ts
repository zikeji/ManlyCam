import type { Role } from './roles.js';

export interface SimplifiedMessage {
  content: string;
  createdAt: string;
  mentionedUserIds: string[];
}

export interface SimplifiedUser {
  id: string;
  displayName: string;
  role: Role;
}

export interface MessageResponse {
  content: string;
  ephemeral?: boolean;
  /**
   * If true, the response is posted as the invoking user rather than the system user.
   * Mutually exclusive with ephemeral — if both are set, ephemeral wins and a warning is logged.
   * Defaults to false (system user).
   */
  impersonateUser?: boolean;
}

/** Well-known ID of the seeded system user. */
export const SYSTEM_USER_ID = '015YP4KB00MANLY0CAM0SYSTEM';

export interface SlashCommand {
  name: string;
  description: string;
  placeholder?: string;
  handler: (input: string, message: SimplifiedMessage, user: SimplifiedUser) => MessageResponse;
  gate?: { applicableRoles?: Role[] };
}
