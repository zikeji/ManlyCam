import { apiFetch } from '@/lib/api';
import { messages } from './useChat';
import type { Reaction, ReactionPayload } from '@manlycam/types';

// Module-level WS handlers — imported by useWebSocket.ts
// currentUserId is passed at call time from the WS handler (has access to user.value)

export const handleReactionAdd = (payload: ReactionPayload, currentUserId?: string): void => {
  const idx = messages.value.findIndex((m) => m.id === payload.messageId);
  if (idx === -1) return;

  const message = messages.value[idx];
  const reactions: Reaction[] = message.reactions ? [...message.reactions] : [];
  const existing = reactions.find((r) => r.emoji === payload.emoji);

  if (existing) {
    if (!existing.userIds.includes(payload.userId)) {
      existing.count++;
      existing.userIds = [...existing.userIds, payload.userId];
      existing.userDisplayNames = [...(existing.userDisplayNames ?? []), payload.displayName];
      existing.userRoles = [...(existing.userRoles ?? []), payload.role];
      existing.userReacted =
        existing.userReacted || (currentUserId ? payload.userId === currentUserId : false);
    }
  } else {
    reactions.push({
      emoji: payload.emoji,
      count: 1,
      userReacted: currentUserId ? payload.userId === currentUserId : false,
      userIds: [payload.userId],
      userDisplayNames: [payload.displayName],
      userRoles: [payload.role],
      firstReactedAt: payload.createdAt,
    });
  }

  messages.value[idx] = { ...message, reactions };
};

export const handleReactionRemove = (
  payload: { messageId: string; userId: string; emoji: string },
  currentUserId?: string,
): void => {
  const idx = messages.value.findIndex((m) => m.id === payload.messageId);
  if (idx === -1) return;

  const message = messages.value[idx];
  let reactions: Reaction[] = message.reactions ? [...message.reactions] : [];

  const existing = reactions.find((r) => r.emoji === payload.emoji);
  if (existing && existing.userIds.includes(payload.userId)) {
    const removedIdx = existing.userIds.indexOf(payload.userId);
    const newUserIds = existing.userIds.filter((id) => id !== payload.userId);
    const newUserDisplayNames = (existing.userDisplayNames ?? []).filter(
      (_, i) => i !== removedIdx,
    );
    const newUserRoles = (existing.userRoles ?? []).filter((_, i) => i !== removedIdx);
    if (newUserIds.length === 0) {
      reactions = reactions.filter((r) => r.emoji !== payload.emoji);
    } else {
      const updatedReaction: Reaction = {
        ...existing,
        count: newUserIds.length,
        userIds: newUserIds,
        userDisplayNames: newUserDisplayNames,
        userRoles: newUserRoles,
        userReacted: currentUserId ? newUserIds.includes(currentUserId) : existing.userReacted,
      };
      reactions = reactions.map((r) => (r.emoji === payload.emoji ? updatedReaction : r));
    }
  }

  messages.value[idx] = { ...message, reactions };
};

export function useReactions() {
  async function addReaction(messageId: string, emoji: string): Promise<void> {
    await apiFetch(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
  }

  async function removeReaction(messageId: string, emoji: string): Promise<void> {
    await apiFetch(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
    });
  }

  async function modRemoveReaction(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<void> {
    await apiFetch(
      `/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/users/${userId}`,
      { method: 'DELETE' },
    );
  }

  return { addReaction, removeReaction, modRemoveReaction };
}
