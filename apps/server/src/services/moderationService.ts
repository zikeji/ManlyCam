import type { Role } from '@manlycam/types';
import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';
import { wsHub } from './wsHub.js';
import { AppError } from '../lib/errors.js';
import { canModerateOver, ROLE_RANK } from '../lib/roleUtils.js';

interface MuteParams {
  actorId: string;
  actorRole: Role;
  targetUserId: string;
}

export async function muteUser({ actorId, actorRole, targetUserId }: MuteParams): Promise<void> {
  if (ROLE_RANK[actorRole] < ROLE_RANK.Moderator) {
    throw new AppError('Insufficient permissions.', 'FORBIDDEN', 403);
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new AppError('User not found.', 'NOT_FOUND', 404);
  if (!canModerateOver(actorRole, target.role as Role)) {
    throw new AppError(
      'Cannot moderate users with equal or higher role.',
      'INSUFFICIENT_ROLE',
      403,
    );
  }

  await prisma.user.update({ where: { id: targetUserId }, data: { mutedAt: new Date() } });
  await prisma.auditLog.create({
    data: { id: ulid(), action: 'mute', actorId, targetId: targetUserId },
  });
  wsHub.broadcast({ type: 'moderation:muted', payload: { userId: targetUserId } });
}

export async function unmuteUser({ actorId, actorRole, targetUserId }: MuteParams): Promise<void> {
  if (ROLE_RANK[actorRole] < ROLE_RANK.Moderator) {
    throw new AppError('Insufficient permissions.', 'FORBIDDEN', 403);
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new AppError('User not found.', 'NOT_FOUND', 404);
  if (!canModerateOver(actorRole, target.role as Role)) {
    throw new AppError(
      'Cannot moderate users with equal or higher role.',
      'INSUFFICIENT_ROLE',
      403,
    );
  }

  await prisma.user.update({ where: { id: targetUserId }, data: { mutedAt: null } });
  await prisma.auditLog.create({
    data: { id: ulid(), action: 'unmute', actorId, targetId: targetUserId },
  });
  wsHub.broadcast({ type: 'moderation:unmuted', payload: { userId: targetUserId } });
}

export async function banUser({ actorId, actorRole, targetUserId }: MuteParams): Promise<void> {
  if (ROLE_RANK[actorRole] < ROLE_RANK.Moderator) {
    throw new AppError('Insufficient permissions.', 'FORBIDDEN', 403);
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new AppError('User not found.', 'NOT_FOUND', 404);
  if (!canModerateOver(actorRole, target.role as Role)) {
    throw new AppError(
      'Cannot moderate users with equal or higher role.',
      'INSUFFICIENT_ROLE',
      403,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: { bannedAt: new Date() },
    });
    await tx.session.deleteMany({
      where: { userId: targetUserId },
    });
    await tx.auditLog.create({
      data: { id: ulid(), action: 'ban', actorId, targetId: targetUserId },
    });
  });

  wsHub.revokeUserSessions(targetUserId, 'banned');
}
