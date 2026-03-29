import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuditLogPage } from './auditLogService.js';
import { AppError } from '../lib/errors.js';

vi.mock('../db/client.js', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../db/client.js';

// Valid 26-char ULIDs (Crockford Base32)
const ULID_A = '01HX00000000000000000000AA';
const ULID_B = '01HX00000000000000000000BB';
const ULID_TARGET = '01HX00000000000000000000CC';

const makeEntry = (id: string, overrides = {}) => ({
  id,
  action: 'ban',
  actorId: 'actor-01',
  targetId: ULID_TARGET,
  metadata: null,
  performedAt: new Date('2026-01-01T10:00:00Z'),
  actor: {
    displayName: 'Admin User',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'Admin',
    userTagText: null,
    userTagColor: null,
  },
  ...overrides,
});

describe('getAuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  });

  it('returns entries mapped to flat AuditLogEntry shape with actor/target fields', async () => {
    const entry = makeEntry(ULID_A);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([entry] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: ULID_TARGET,
        displayName: 'Target User',
        avatarUrl: 'https://example.com/target.png',
        role: 'Viewer',
        userTagText: 'VIP',
        userTagColor: '#ff0000',
      },
    ] as never);

    const result = await getAuditLogPage({ limit: 10 });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual({
      id: ULID_A,
      action: 'ban',
      actorId: 'actor-01',
      actorDisplayName: 'Admin User',
      actorAvatarUrl: 'https://example.com/avatar.png',
      actorTag: null,
      targetId: ULID_TARGET,
      targetDisplayName: 'Target User',
      targetAvatarUrl: 'https://example.com/target.png',
      targetTag: { text: 'VIP', color: '#ff0000' },
      metadata: null,
      performedAt: '2026-01-01T10:00:00.000Z',
    });
    expect(result.entries[0]).not.toHaveProperty('actor');
  });

  it('returns actorTag when actor has userTagText', async () => {
    const entry = makeEntry(ULID_A, {
      actor: {
        displayName: 'Tagged Admin',
        avatarUrl: null,
        role: 'Admin',
        userTagText: 'Staff',
        userTagColor: '#00ff00',
      },
    });
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([entry] as never);

    const result = await getAuditLogPage({ limit: 10 });

    expect(result.entries[0].actorTag).toEqual({ text: 'Staff', color: '#00ff00' });
  });

  it('resolves ULID targetId to displayName and avatarUrl', async () => {
    const entry = makeEntry(ULID_A, { targetId: ULID_TARGET });
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([entry] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: ULID_TARGET,
        displayName: 'Resolved User',
        avatarUrl: 'https://example.com/resolved.png',
        role: 'Viewer',
        userTagText: null,
        userTagColor: null,
      },
    ] as never);

    const result = await getAuditLogPage({ limit: 10 });

    expect(result.entries[0].targetDisplayName).toBe('Resolved User');
    expect(result.entries[0].targetAvatarUrl).toBe('https://example.com/resolved.png');
    expect(result.entries[0].targetTag).toBeNull();
  });

  it('returns null target fields for non-ULID targetId', async () => {
    const entry = makeEntry(ULID_A, { targetId: 'messageId:userId:emoji' });
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([entry] as never);

    const result = await getAuditLogPage({ limit: 10 });

    expect(result.entries[0].targetDisplayName).toBeNull();
    expect(result.entries[0].targetAvatarUrl).toBeNull();
    expect(result.entries[0].targetTag).toBeNull();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('returns null target fields when targetId is null', async () => {
    const entry = makeEntry(ULID_A, { targetId: null });
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([entry] as never);

    const result = await getAuditLogPage({ limit: 10 });

    expect(result.entries[0].targetDisplayName).toBeNull();
    expect(result.entries[0].targetAvatarUrl).toBeNull();
    expect(result.entries[0].targetTag).toBeNull();
  });

  it('gracefully degrades when user.findMany fails', async () => {
    const entry = makeEntry(ULID_A, { targetId: ULID_TARGET });
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([entry] as never);
    vi.mocked(prisma.user.findMany).mockRejectedValue(new Error('DB error') as never);

    const result = await getAuditLogPage({ limit: 10 });

    expect(result.entries[0].targetDisplayName).toBeNull();
    expect(result.entries[0].targetAvatarUrl).toBeNull();
    expect(result.entries[0].targetTag).toBeNull();
  });

  it('deduplicates ULID targetIds before bulk user lookup', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      makeEntry(ULID_A, { targetId: ULID_TARGET }),
      makeEntry(ULID_B, { targetId: ULID_TARGET }),
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: ULID_TARGET,
        displayName: 'Shared Target',
        avatarUrl: null,
        role: 'Viewer',
        userTagText: null,
        userTagColor: null,
      },
    ] as never);

    const result = await getAuditLogPage({ limit: 10 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [ULID_TARGET] } } }),
    );
    expect(result.entries[0].targetDisplayName).toBe('Shared Target');
    expect(result.entries[1].targetDisplayName).toBe('Shared Target');
  });

  it('resolves mixed targetId types in a single page correctly', async () => {
    const NON_ULID = 'messageId:userId:emoji';
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      makeEntry(ULID_A, { targetId: ULID_TARGET }),
      makeEntry(ULID_B, { targetId: NON_ULID }),
      makeEntry('01HX00000000000000000000DD', { targetId: null }),
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: ULID_TARGET,
        displayName: 'Resolved User',
        avatarUrl: null,
        role: 'Viewer',
        userTagText: null,
        userTagColor: null,
      },
    ] as never);

    const result = await getAuditLogPage({ limit: 10 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [ULID_TARGET] } } }),
    );
    expect(result.entries[0].targetDisplayName).toBe('Resolved User');
    expect(result.entries[1].targetDisplayName).toBeNull();
    expect(result.entries[2].targetDisplayName).toBeNull();
  });

  it('queries without cursor when cursor is undefined', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

    await getAuditLogPage({ limit: 10 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('applies cursor as id lt filter', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

    await getAuditLogPage({ cursor: ULID_A, limit: 10 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { lt: ULID_A } } }),
    );
  });

  it('sorts by id desc', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

    await getAuditLogPage({ limit: 10 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'desc' } }),
    );
  });

  it('clamps limit to max 50', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

    await getAuditLogPage({ limit: 999 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  it('clamps limit to min 1', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

    await getAuditLogPage({ limit: 0 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
  });

  it('returns nextCursor as last entry id when entries.length equals limit', async () => {
    const entries = [makeEntry(ULID_A), makeEntry(ULID_B)];
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue(entries as never);

    const result = await getAuditLogPage({ limit: 2 });

    expect(result.nextCursor).toBe(ULID_B);
  });

  it('returns nextCursor null when entries.length is less than limit', async () => {
    const entries = [makeEntry(ULID_A)];
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue(entries as never);

    const result = await getAuditLogPage({ limit: 10 });

    expect(result.nextCursor).toBeNull();
  });

  it('returns empty entries and null nextCursor when no results', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

    const result = await getAuditLogPage({ limit: 50 });

    expect(result.entries).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it('throws AppError 422 for invalid cursor format', async () => {
    await expect(getAuditLogPage({ cursor: 'not-a-ulid', limit: 50 })).rejects.toMatchObject({
      statusCode: 422,
      code: 'VALIDATION_ERROR',
    });
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('throws AppError 422 for cursor that is too short', async () => {
    await expect(getAuditLogPage({ cursor: 'SHORT', limit: 50 })).rejects.toBeInstanceOf(AppError);
  });

  it('throws AppError 500 when database query fails', async () => {
    vi.mocked(prisma.auditLog.findMany).mockRejectedValue(
      new Error('DB connection failed') as never,
    );

    await expect(getAuditLogPage({ limit: 50 })).rejects.toMatchObject({
      statusCode: 500,
      code: 'DB_ERROR',
    });
  });
});
