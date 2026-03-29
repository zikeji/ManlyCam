import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { computeUserTag } from '../lib/user-tag.js';

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

interface AuditLogRow {
  id: string;
  action: string;
  actorId: string;
  targetId: string | null;
  metadata: unknown;
  performedAt: Date;
  actor: {
    displayName: string;
    avatarUrl: string | null;
    role: string;
    userTagText: string | null;
    userTagColor: string | null;
  };
}

interface TargetUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  userTagText: string | null;
  userTagColor: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorDisplayName: string;
  actorAvatarUrl: string | null;
  actorTag: { text: string; color: string } | null;
  targetId: string | null;
  targetDisplayName: string | null;
  targetAvatarUrl: string | null;
  targetTag: { text: string; color: string } | null;
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

  let rows: AuditLogRow[];
  try {
    rows = await prisma.auditLog.findMany({
      where: cursor ? { id: { lt: cursor } } : undefined,
      orderBy: { id: 'desc' },
      take: clampedLimit,
      include: {
        actor: {
          select: {
            displayName: true,
            avatarUrl: true,
            role: true,
            userTagText: true,
            userTagColor: true,
          },
        },
      },
    });
  } catch {
    throw new AppError('Database query failed', 'DB_ERROR', 500);
  }

  // Collect unique ULID targetIds for bulk resolution
  const ulidTargetIds = [
    ...new Set(
      rows.map((r) => r.targetId).filter((id): id is string => id !== null && ULID_RE.test(id)),
    ),
  ];

  let targetMap = new Map<string, TargetUser>();
  if (ulidTargetIds.length > 0) {
    try {
      const targets: TargetUser[] = await prisma.user.findMany({
        where: { id: { in: ulidTargetIds } },
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          role: true,
          userTagText: true,
          userTagColor: true,
        },
      });
      targetMap = new Map(targets.map((t) => [t.id, t]));
    } catch {
      /* c8 ignore next -- graceful degradation: target fields will be null */
      targetMap = new Map();
    }
  }

  const entries: AuditLogEntry[] = rows.map((e) => {
    const actorTag = computeUserTag(e.actor);
    const target = e.targetId ? (targetMap.get(e.targetId) ?? null) : null;
    const targetTag = target ? computeUserTag(target) : null;

    return {
      id: e.id,
      action: e.action,
      actorId: e.actorId,
      actorDisplayName: e.actor.displayName,
      actorAvatarUrl: e.actor.avatarUrl,
      actorTag,
      targetId: e.targetId,
      targetDisplayName: target?.displayName ?? null,
      targetAvatarUrl: target?.avatarUrl ?? null,
      targetTag,
      metadata: e.metadata,
      performedAt: e.performedAt.toISOString(),
    };
  });

  const nextCursor = entries.length === clampedLimit ? entries[entries.length - 1].id : null;

  return { entries, nextCursor };
}
