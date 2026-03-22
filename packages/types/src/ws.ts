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

export interface Reaction {
  emoji: string        // shortcode without colons, e.g. "thumbs_up"
  count: number
  userReacted: boolean // whether the viewing user has this reaction
  userIds: string[]    // all user IDs who added this reaction (for mod detail panel)
  userDisplayNames: string[] // parallel array of display names for userIds
  userRoles: Role[]    // parallel array of roles for userIds (for per-reactor mod × gating)
  firstReactedAt: string // ISO timestamp of first reaction (for sort stability)
}

export interface ReactionPayload {
  messageId: string
  userId: string
  displayName: string
  role: Role
  emoji: string
  createdAt: string
}

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
  reactions?: Reaction[]  // undefined = not loaded, [] = loaded but empty
  ephemeral?: boolean // client-only: not persisted, only sent to invoking user
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
  piReachable?: boolean // present on 'explicit-offline' to indicate Pi reachability for admin preview
  offlineEmoji?: string | null
  offlineTitle?: string | null
  offlineDescription?: string | null
}

export type PiSugarStatus =
  | { connected: true; level: number; plugged: boolean; charging: boolean; chargingRange: [number, number] | null }
  | { connected: false };

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
  | { type: 'pisugar:status';     payload: PiSugarStatus }
  | { type: 'users:directory' }
  | { type: 'users:lookup';       payload: { ids: string[] } }
  | { type: 'users:info';         payload: UserPresence[] }
  | { type: 'chat:ephemeral';     payload: ChatMessage }
  | { type: 'reaction:add';       payload: ReactionPayload }
  | { type: 'reaction:remove';    payload: { messageId: string; userId: string; emoji: string } }
