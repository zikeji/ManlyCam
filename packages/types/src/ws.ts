import type { Role } from './roles.js';

export const StreamStatus = {
  Live: 'live',
  Unreachable: 'unreachable',
  ExplicitOffline: 'explicit-offline',
} as const
export type StreamStatus = typeof StreamStatus[keyof typeof StreamStatus]

export interface UserTag {
  text: string
  color: string
}

export interface UserProfile {
  id: string
  displayName: string
  avatarUrl: string | null
  role: Role
  isMuted: boolean
  userTag: UserTag | null
}

// presence:join sends the same shape as a user profile
export type UserPresence = UserProfile

export interface ChatMessage {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  authorRole: Role
  content: string
  editHistory: { content: string; editedAt: string }[] | null // null = never edited
  updatedAt: string | null
  deletedAt: string | null
  deletedBy: string | null // differs from userId on mod-initiated deletes
  createdAt: string
  userTag: UserTag | null
}

export interface ChatEdit {
  messageId: string
  content: string
  editHistory: { content: string; editedAt: string }[]
  updatedAt: string
}

// Server-broadcast stream states only (3 values).
// 'connecting' is a CLIENT-ONLY UI state inferred before first stream:state message — do NOT add it here.
export interface StreamState {
  state: 'live' | 'unreachable' | 'explicit-offline'
  adminToggle?: 'live' | 'offline' // present on 'unreachable' to distinguish FR10 states
}

export type WsMessage =
  | { type: 'chat:message';       payload: ChatMessage }
  | { type: 'chat:edit';          payload: ChatEdit }
  | { type: 'chat:delete';        payload: { messageId: string } }
  | { type: 'stream:state';       payload: StreamState }
  | { type: 'presence:seed';      payload: UserPresence[] }
  | { type: 'presence:join';      payload: UserPresence }
  | { type: 'presence:leave';     payload: { userId: string } }
  | { type: 'typing:start';       payload: { userId: string; displayName: string } }
  | { type: 'typing:stop';        payload: { userId: string } }
  | { type: 'session:revoked';    payload: { reason: 'banned' } }
  | { type: 'moderation:muted';   payload: { userId: string } }
  | { type: 'moderation:unmuted'; payload: { userId: string } }
  | { type: 'user:update';        payload: UserProfile }
