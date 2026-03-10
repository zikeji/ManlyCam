import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';
import { wsHub } from './wsHub.js';
import { AppError } from '../lib/errors.js';
import { canModerateOver } from '../lib/roleUtils.js';
import type { ChatMessage, ChatEdit, Role, UserTag, WsMessage } from '@manlycam/types';
import { ROLE_RANK } from '@manlycam/types';
import type { User } from '@prisma/client';

type EditHistoryEntry = { content: string; editedAt: string };

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
    authorRole: row.user.role as Role,
    content: row.content,
    editHistory: (row.editHistory as { content: string; editedAt: string }[] | null) ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
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

export async function editMessage(params: {
  messageId: string;
  userId: string;
  content: string;
}): Promise<ChatEdit> {
  const { messageId, userId, content } = params;

  const existing = await prisma.message.findUnique({ where: { id: messageId } });
  if (!existing) throw new AppError('Message not found', 'NOT_FOUND', 404);
  if (existing.userId !== userId) throw new AppError('Forbidden', 'FORBIDDEN', 403);
  if (existing.deletedAt) throw new AppError('Message not found', 'NOT_FOUND', 404);

  const prev = (existing.editHistory as EditHistoryEntry[] | null) ?? [];
  const entry: EditHistoryEntry = { content: existing.content, editedAt: new Date().toISOString() };
  const newHistory = [...prev, entry];
  const now = new Date();

  await prisma.message.update({
    where: { id: messageId },
    data: { content, editHistory: newHistory, updatedAt: now },
  });

  const chatEdit: ChatEdit = {
    messageId,
    content,
    editHistory: newHistory,
    updatedAt: now.toISOString(),
  };

  wsHub.broadcast({ type: 'chat:edit', payload: chatEdit });

  return chatEdit;
}

export async function deleteMessage(params: {
  messageId: string;
  userId: string;
  callerRole: Role;
}): Promise<void> {
  const { messageId, userId, callerRole } = params;

  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    include: { user: true },
  });
  if (!existing) throw new AppError('Message not found', 'NOT_FOUND', 404);
  if (existing.deletedAt) throw new AppError('Message not found', 'NOT_FOUND', 404);

  if (existing.userId === userId) {
    // Self-delete: no role check, no audit log
    await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
  } else {
    // Moderator-initiated delete
    if (ROLE_RANK[callerRole] < ROLE_RANK.Moderator) {
      throw new AppError('Insufficient permissions.', 'FORBIDDEN', 403);
    }
    if (!canModerateOver(callerRole, existing.user.role as Role)) {
      throw new AppError(
        'Cannot delete messages from users with equal or higher role.',
        'INSUFFICIENT_ROLE',
        403,
      );
    }
    await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    await prisma.auditLog.create({
      data: { id: ulid(), action: 'message_delete', actorId: userId, targetId: messageId },
    });
  }

  wsHub.broadcast({ type: 'chat:delete', payload: { messageId } });
}
