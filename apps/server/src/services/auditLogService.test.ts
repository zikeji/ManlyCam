import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuditLogPage } from './auditLogService.js';
import { AppError } from '../lib/errors.js';

vi.mock('../db/client.js', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../db/client.js';

// Valid 26-char ULIDs (Crockford Base32)
const ULID_A = '01HX00000000000000000000AA';
const ULID_B = '01HX00000000000000000000BB';

const makeEntry = (id: string, overrides = {}) => ({
  id,
  action: 'ban',
  actorId: 'actor-01',
  targetId: 'target-01',
  metadata: null,
  performedAt: new Date('2026-01-01T10:00:00Z'),
  actor: { displayName: 'Admin User' },
  ...overrides,
});

describe('getAuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns entries mapped to flat AuditLogEntry shape', async () => {
    const entry = makeEntry(ULID_A);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([entry] as never);

    const result = await getAuditLogPage({ limit: 10 });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual({
      id: ULID_A,
      action: 'ban',
      actorId: 'actor-01',
      actorDisplayName: 'Admin User',
      targetId: 'target-01',
      metadata: null,
      performedAt: '2026-01-01T10:00:00.000Z',
    });
    expect(result.entries[0]).not.toHaveProperty('actor');
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
});
