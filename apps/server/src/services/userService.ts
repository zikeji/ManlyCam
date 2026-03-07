import { prisma } from '../db/client.js';

export async function banUser(email: string): Promise<{ sessionCount: number }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`User not found: ${email}`);

  // TODO(story-3.4): WS hub will detect missing sessions on heartbeat and emit session:revoked
  const [, deletedSessions] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { bannedAt: new Date() },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return { sessionCount: (deletedSessions as { count: number }).count };
}

export async function unbanUser(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`User not found: ${email}`);
  await prisma.user.update({
    where: { id: user.id },
    data: { bannedAt: null },
  });
}
