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

type MessageRow = {
  id: string;
  userId: string;
  content: string;
  editHistory: unknown;
  updatedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  user: User;
};

function toApiChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.user.displayName,
    avatarUrl: row.user.avatarUrl,
    content: row.content,
    editHistory: null,
    updatedAt: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: row.createdAt.toISOString(),
    userTag: computeUserTag(row.user),
  };
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

  const chatMessage = toApiChatMessage(message as MessageRow);

  const wsMessage: WsMessage = { type: 'chat:message', payload: chatMessage };
  wsHub.broadcast(wsMessage);

  return chatMessage;
}

export async function getHistory(params: {
  limit?: number;
  before?: string;
}): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const fetchLimit = Math.min(Math.max(params.limit ?? 50, 1), 100);

  const rows = await prisma.message.findMany({
    where: {
      deletedAt: null,
      ...(params.before ? { id: { lt: params.before } } : {}),
    },
    orderBy: { id: 'desc' },
    take: fetchLimit + 1,
    include: { user: true },
  });

  const hasMore = rows.length > fetchLimit;
  const messages = rows
    .slice(0, fetchLimit)
    .map((row) => toApiChatMessage(row as MessageRow))
    .reverse();

  return { messages, hasMore };
}
