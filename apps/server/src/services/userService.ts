import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';

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
