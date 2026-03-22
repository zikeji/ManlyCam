import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';
import { wsHub } from './wsHub.js';
import { AppError } from '../lib/errors.js';
import { canModerateOver } from '../lib/roleUtils.js';
import { computeUserTag } from '../lib/user-tag.js';
import { executeCommand } from './slashCommands.js';
import { getReactionsForMessages } from './reactionsService.js';
import { env } from '../env.js';
import { SYSTEM_USER_ID } from '@manlycam/types';
import type {
  TextChatMessage,
  ClipChatMessage,
  ChatMessage,
  ChatEdit,
  Reaction,
  Role,
  WsMessage,
} from '@manlycam/types';
import { ROLE_RANK } from '@manlycam/types';
import type { User } from '@prisma/client';

type EditHistoryEntry = { content: string; editedAt: string };

type ClipRow = {
  id: string;
  name: string;
  visibility: string;
  deletedAt: Date | null;
  thumbnailKey: string | null;
  durationSeconds: number | null;
  showClipper: boolean;
  showClipperAvatar: boolean;
  clipperName: string | null;
  clipperAvatarUrl: string | null;
};

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
  clipId?: string | null;
  messageType?: string;
  clip?: ClipRow | null;
};

const CLIP_SELECT = {
  id: true,
  name: true,
  visibility: true,
  deletedAt: true,
  thumbnailKey: true,
  durationSeconds: true,
  showClipper: true,
  showClipperAvatar: true,
  clipperName: true,
  clipperAvatarUrl: true,
} as const;

function toApiChatMessage(
  row: MessageRow,
  reactions?: Reaction[],
): TextChatMessage | ClipChatMessage {
  const base = {
    id: row.id,
    userId: row.userId,
    displayName: row.user.displayName,
    avatarUrl: row.user.avatarUrl,
    authorRole: row.user.role as Role,
    editHistory: (row.editHistory as { content: string; editedAt: string }[] | null) ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    deletedAt: null,
    deletedBy: null,
    createdAt: row.createdAt.toISOString(),
    userTag: computeUserTag(row.user),
    reactions: reactions ?? [],
  };

  if (row.messageType === 'clip') {
    const clip = row.clip ?? null;
    const isTombstone = !clip || clip.visibility === 'private' || clip.deletedAt !== null;

    const msg: ClipChatMessage = {
      ...base,
      messageType: 'clip',
      content: row.content,
      clipId: row.clipId ?? '',
      clipName: clip?.name ?? '',
      clipDurationSeconds: clip?.durationSeconds ?? null,
    };

    if (isTombstone) msg.tombstone = true;
    if (clip?.thumbnailKey) msg.clipThumbnailUrl = `${env.S3_PUBLIC_BASE_URL}/${clip.thumbnailKey}`;
    if (clip?.showClipper && clip.clipperName) msg.clipperName = clip.clipperName;
    if (clip?.showClipperAvatar && clip.clipperAvatarUrl)
      msg.clipperAvatarUrl = clip.clipperAvatarUrl;

    return msg;
  }

  return {
    ...base,
    messageType: 'text',
    content: row.content,
  };
}

export async function createMessage(params: {
  userId: string;
  userDisplayName: string;
  userRole: Role;
  content: string;
}): Promise<ChatMessage | null> {
  const { userId, userDisplayName, userRole } = params;
  let { content } = params;

  // Extract mentioned user IDs from <@ID> tokens in content
  const mentionedUserIds = Array.from(content.matchAll(/<@([^>]+)>/g), (m) => m[1]);

  // Check for slash command
  let messageAuthorId = userId;
  if (content.startsWith('/')) {
    const result = executeCommand({
      content,
      userId,
      userDisplayName,
      userRole,
      mentionedUserIds,
    });
    if (result !== null) {
      if (result.response.ephemeral) {
        const ephemeralMsg: TextChatMessage = {
          id: ulid(),
          userId: SYSTEM_USER_ID,
          displayName: 'System',
          avatarUrl: null,
          authorRole: 'System' as Role,
          messageType: 'text',
          content: result.response.content,
          editHistory: null,
          updatedAt: null,
          deletedAt: null,
          deletedBy: null,
          createdAt: new Date().toISOString(),
          userTag: null,
          ephemeral: true,
        };
        wsHub.sendToUser(userId, { type: 'chat:ephemeral', payload: ephemeralMsg });
        return null;
      }
      content = result.response.content;
      messageAuthorId = result.authorUserId;
    }
  }

  const id = ulid();
  const message = await prisma.message.create({
    data: { id, userId: messageAuthorId, content },
    include: { user: true, clip: { select: CLIP_SELECT } },
  });

  const chatMessage = toApiChatMessage(message as MessageRow);

  const wsMessage: WsMessage = { type: 'chat:message', payload: chatMessage };
  wsHub.broadcast(wsMessage);

  return chatMessage;
}

export async function getHistory(params: {
  limit?: number;
  before?: string;
  userId?: string;
}): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const fetchLimit = Math.min(Math.max(params.limit ?? 50, 1), 100);

  const rows = await prisma.message.findMany({
    where: {
      deletedAt: null,
      ...(params.before ? { id: { lt: params.before } } : {}),
    },
    orderBy: { id: 'desc' },
    take: fetchLimit + 1,
    include: { user: true, clip: { select: CLIP_SELECT } },
  });

  const hasMore = rows.length > fetchLimit;
  const pageRows = rows.slice(0, fetchLimit);

  const messageIds = pageRows.map((r) => r.id);
  const reactionsMap = await getReactionsForMessages(messageIds, params.userId);

  const messages = pageRows
    .map((row) => {
      /* c8 ignore next -- ?? [] fallback hit when message has no reactions; Map returns undefined for missing keys */
      const reactions = reactionsMap.get(row.id) ?? [];
      return toApiChatMessage(row as MessageRow, reactions);
    })
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
    // System messages: Admin-only delete
    if (existing.userId === SYSTEM_USER_ID) {
      if (callerRole !== 'Admin') {
        throw new AppError('Only admins can delete system messages.', 'INSUFFICIENT_ROLE', 403);
      }
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
