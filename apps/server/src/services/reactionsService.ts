import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';
import { wsHub } from './wsHub.js';
import { AppError } from '../lib/errors.js';
import { canModerateOver } from '../lib/roleUtils.js';
import type { Reaction, ReactionPayload, Role } from '@manlycam/types';

export async function addReaction(params: {
  messageId: string;
  userId: string;
  emoji: string;
}): Promise<ReactionPayload> {
  const { messageId, userId, emoji } = params;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { user: true },
  });
  if (!message || message.deletedAt) {
    throw new AppError('Message not found', 'NOT_FOUND', 404);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 'NOT_FOUND', 404);
  if (user.mutedAt) throw new AppError('Cannot react while muted', 'FORBIDDEN', 403);

  const reaction = await prisma.reaction.upsert({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
    update: {},
    create: { id: ulid(), messageId, userId, emoji },
    include: { user: { select: { displayName: true, role: true } } },
  });

  const payload: ReactionPayload = {
    messageId,
    userId,
    displayName: reaction.user.displayName,
    role: reaction.user.role as Role,
    emoji,
    createdAt: reaction.createdAt.toISOString(),
  };

  wsHub.broadcast({ type: 'reaction:add', payload });

  return payload;
}

export async function removeReaction(params: {
  messageId: string;
  userId: string;
  emoji: string;
}): Promise<void> {
  const { messageId, userId, emoji } = params;

  await prisma.reaction.deleteMany({ where: { messageId, userId, emoji } });

  wsHub.broadcast({ type: 'reaction:remove', payload: { messageId, userId, emoji } });
}

export async function removeReactionByMod(params: {
  messageId: string;
  targetUserId: string;
  emoji: string;
  modId: string;
  modRole: Role;
}): Promise<void> {
  const { messageId, targetUserId, emoji, modId, modRole } = params;

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) throw new AppError('User not found', 'NOT_FOUND', 404);
  if (!canModerateOver(modRole, targetUser.role as Role)) {
    throw new AppError(
      'Cannot remove reactions from users with equal or higher role.',
      'INSUFFICIENT_ROLE',
      403,
    );
  }

  await prisma.reaction.deleteMany({ where: { messageId, userId: targetUserId, emoji } });

  await prisma.auditLog.create({
    data: {
      id: ulid(),
      action: 'reaction_remove',
      actorId: modId,
      targetId: `${messageId}:${targetUserId}:${emoji}`,
    },
  });

  wsHub.broadcast({ type: 'reaction:remove', payload: { messageId, userId: targetUserId, emoji } });
}

export async function getReactionsForMessage(
  messageId: string,
  currentUserId?: string,
): Promise<Reaction[]> {
  const rows = await prisma.reaction.findMany({
    where: { messageId },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { displayName: true, role: true } } },
  });

  const grouped = new Map<
    string,
    {
      count: number;
      firstAt: Date;
      userIds: string[];
      userDisplayNames: string[];
      userRoles: Role[];
    }
  >();

  for (const r of rows) {
    const existing = grouped.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.userIds.push(r.userId);
      existing.userDisplayNames.push(r.user.displayName);
      existing.userRoles.push(r.user.role as Role);
    } else {
      grouped.set(r.emoji, {
        count: 1,
        firstAt: r.createdAt,
        userIds: [r.userId],
        userDisplayNames: [r.user.displayName],
        userRoles: [r.user.role as Role],
      });
    }
  }

  return Array.from(grouped.entries())
    .map(([emoji, data]) => ({
      emoji,
      count: data.count,
      userReacted: currentUserId ? data.userIds.includes(currentUserId) : false,
      userIds: data.userIds,
      userDisplayNames: data.userDisplayNames,
      userRoles: data.userRoles,
      firstReactedAt: data.firstAt.toISOString(),
    }))
    .sort((a, b) => new Date(a.firstReactedAt).getTime() - new Date(b.firstReactedAt).getTime());
}

export async function getReactionsForMessages(
  messageIds: string[],
  currentUserId?: string,
): Promise<Map<string, Reaction[]>> {
  if (messageIds.length === 0) return new Map();

  const rows = await prisma.reaction.findMany({
    where: { messageId: { in: messageIds } },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { displayName: true, role: true } } },
  });

  // Group by messageId, then by emoji
  const byMessage = new Map<
    string,
    Map<
      string,
      {
        count: number;
        firstAt: Date;
        userIds: string[];
        userDisplayNames: string[];
        userRoles: Role[];
      }
    >
  >();

  for (const r of rows) {
    if (!byMessage.has(r.messageId)) {
      byMessage.set(r.messageId, new Map());
    }
    const emojiMap = byMessage.get(r.messageId)!;
    const existing = emojiMap.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.userIds.push(r.userId);
      existing.userDisplayNames.push(r.user.displayName);
      existing.userRoles.push(r.user.role as Role);
    } else {
      emojiMap.set(r.emoji, {
        count: 1,
        firstAt: r.createdAt,
        userIds: [r.userId],
        userDisplayNames: [r.user.displayName],
        userRoles: [r.user.role as Role],
      });
    }
  }

  const result = new Map<string, Reaction[]>();
  for (const msgId of messageIds) {
    const emojiMap = byMessage.get(msgId);
    if (!emojiMap) {
      result.set(msgId, []);
      continue;
    }
    const reactions = Array.from(emojiMap.entries())
      .map(([emoji, data]) => ({
        emoji,
        count: data.count,
        userReacted: currentUserId ? data.userIds.includes(currentUserId) : false,
        userIds: data.userIds,
        userDisplayNames: data.userDisplayNames,
        userRoles: data.userRoles,
        firstReactedAt: data.firstAt.toISOString(),
      }))
      .sort((a, b) => new Date(a.firstReactedAt).getTime() - new Date(b.firstReactedAt).getTime());
    result.set(msgId, reactions);
  }
  return result;
}
