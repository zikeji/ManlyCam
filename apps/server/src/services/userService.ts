import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { wsHub } from './wsHub.js';
import { computeUserTag } from '../lib/user-tag.js';
import { AppError } from '../lib/errors.js';
import type { Role } from '@manlycam/types';

export async function banUser(email: string): Promise<{ sessionCount: number }> {
  const normalized = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error(`User not found: ${email}`);

  try {
    // TODO(story-3.4): WS hub will detect missing sessions on heartbeat and emit session:revoked
    const [, deletedSessions] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { bannedAt: new Date() },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    const sessionCount = (deletedSessions as { count: number }).count;
    logger.info({ userId: user.id, email: normalized, sessionCount }, 'user_banned');
    return { sessionCount };
  } catch (error) {
    // Handle race condition: user deleted between findUnique and transaction
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new Error(`User not found: ${email}`);
    }
    throw error;
  }
}

export async function unbanUser(email: string): Promise<void> {
  const normalized = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error(`User not found: ${email}`);
  await prisma.user.update({
    where: { id: user.id },
    data: { bannedAt: null },
  });
  logger.info({ userId: user.id, email: normalized }, 'user_unbanned');
}

export async function updateUserRole(email: string, role: Role): Promise<void> {
  const normalized = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error(`User not found: ${email}`);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role },
  });

  wsHub.broadcast({
    type: 'user:update',
    payload: {
      id: updated.id,
      displayName: updated.displayName,
      role: updated.role as Role,
      avatarUrl: updated.avatarUrl,
      isMuted: updated.mutedAt !== null,
      userTag: computeUserTag(updated),
    },
  });

  logger.info({ userId: user.id, email: normalized, role }, 'user_role_updated');
}

export async function updateUserRoleById(userId: string, role: Role): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User not found: ${userId}`);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  wsHub.broadcast({
    type: 'user:update',
    payload: {
      id: updated.id,
      displayName: updated.displayName,
      role: updated.role as Role,
      avatarUrl: updated.avatarUrl,
      isMuted: updated.mutedAt !== null,
      userTag: computeUserTag(updated),
    },
  });

  logger.info({ userId, role }, 'user_role_updated_by_id');
}

export async function updateUserTagById(
  userId: string,
  userTagText: string | null,
  userTagColor: string | null,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 'NOT_FOUND', 404);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { userTagText, userTagColor },
  });

  wsHub.broadcast({
    type: 'user:update',
    payload: {
      id: updated.id,
      displayName: updated.displayName,
      role: updated.role as Role,
      avatarUrl: updated.avatarUrl,
      isMuted: updated.mutedAt !== null,
      userTag: computeUserTag(updated),
    },
  });

  logger.info({ userId, userTagText, userTagColor }, 'user_tag_updated');
}

export async function getAllUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
  });
}
