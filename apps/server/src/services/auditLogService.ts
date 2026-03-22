import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorDisplayName: string;
  targetId: string | null;
  metadata: unknown | null;
  performedAt: string;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  nextCursor: string | null;
}

export async function getAuditLogPage({
  cursor,
  limit,
}: {
  cursor?: string;
  limit: number;
}): Promise<AuditLogPage> {
  const clampedLimit = Math.min(Math.max(limit, 1), 50);

  if (cursor !== undefined && !ULID_RE.test(cursor)) {
    throw new AppError('Invalid cursor format', 'VALIDATION_ERROR', 422);
  }

  let rows;
  try {
    rows = await prisma.auditLog.findMany({
      where: cursor ? { id: { lt: cursor } } : undefined,
      orderBy: { id: 'desc' },
      take: clampedLimit,
      include: { actor: { select: { displayName: true } } },
    });
  } catch {
    throw new AppError('Database query failed', 'DB_ERROR', 500);
  }

  const entries: AuditLogEntry[] = rows.map((e) => ({
    id: e.id,
    action: e.action,
    actorId: e.actorId,
    actorDisplayName: e.actor.displayName,
    targetId: e.targetId,
    metadata: e.metadata,
    performedAt: e.performedAt.toISOString(),
  }));

  const nextCursor = entries.length === clampedLimit ? entries[entries.length - 1].id : null;

  return { entries, nextCursor };
}
