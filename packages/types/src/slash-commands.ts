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
}

export interface SlashCommand {
  name: string;
  description: string;
  placeholder?: string;
  handler: (input: string, message: SimplifiedMessage, user: SimplifiedUser) => MessageResponse;
  gate?: { applicableRoles?: Role[] };
}
