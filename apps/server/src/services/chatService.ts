import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';
import { wsHub } from './wsHub.js';
import type { ChatMessage, UserTag, WsMessage } from '@manlycam/types';
import type { User } from '@prisma/client';

function computeUserTag(user: User): UserTag | null {
  if (user.userTagText) {
    return { text: user.userTagText, color: user.userTagColor ?? '#6B7280' };
  }
  if (user.role === 'ViewerGuest') {
    return { text: 'Guest', color: '#9CA3AF' };
  }
  return null;
}

export async function createMessage(params: {
  userId: string;
  content: string;
}): Promise<ChatMessage> {
  const { userId, content } = params;
  const id = ulid();

  const message = await prisma.message.create({
    data: { id, userId, content },
    include: { user: true },
  });

  const userTag = computeUserTag(message.user);

  const chatMessage: ChatMessage = {
    id: message.id,
    userId: message.userId,
    displayName: message.user.displayName,
    avatarUrl: message.user.avatarUrl,
    content: message.content,
    editHistory: null,
    updatedAt: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: message.createdAt.toISOString(),
    userTag,
  };

  const wsMessage: WsMessage = { type: 'chat:message', payload: chatMessage };
  wsHub.broadcast(wsMessage);

  return chatMessage;
}
