import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    allowlistEntry: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => '01TESTULID00000000000000001') }));

import { prisma } from '../db/client.js';
import { addDomain, removeDomain, addEmail, removeEmail } from './allowlistService.js';

describe('allowlistService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addDomain', () => {
    it('upserts with type="domain" and a ULID id', async () => {
      vi.mocked(prisma.allowlistEntry.upsert).mockResolvedValue({} as never);
      await addDomain('company.com');
      expect(prisma.allowlistEntry.upsert).toHaveBeenCalledWith({
        where: { type_value: { type: 'domain', value: 'company.com' } },
        create: { id: '01TESTULID00000000000000001', type: 'domain', value: 'company.com' },
        update: {},
      });
    });

    it('handles duplicate gracefully (no error thrown)', async () => {
      vi.mocked(prisma.allowlistEntry.upsert).mockResolvedValue({} as never);
      await expect(addDomain('company.com')).resolves.toBeUndefined();
    });
  });

  describe('removeDomain', () => {
    it('calls deleteMany for type="domain" + value', async () => {
      vi.mocked(prisma.allowlistEntry.deleteMany).mockResolvedValue({ count: 1 });
      await removeDomain('company.com');
      expect(prisma.allowlistEntry.deleteMany).toHaveBeenCalledWith({
        where: { type: 'domain', value: 'company.com' },
      });
    });

    it('throws if zero rows deleted', async () => {
      vi.mocked(prisma.allowlistEntry.deleteMany).mockResolvedValue({ count: 0 });
      await expect(removeDomain('notexist.com')).rejects.toThrow('Domain not found: notexist.com');
    });
  });

  describe('addEmail', () => {
    it('upserts with type="email" and a ULID id', async () => {
      vi.mocked(prisma.allowlistEntry.upsert).mockResolvedValue({} as never);
      await addEmail('guest@gmail.com');
      expect(prisma.allowlistEntry.upsert).toHaveBeenCalledWith({
        where: { type_value: { type: 'email', value: 'guest@gmail.com' } },
        create: { id: '01TESTULID00000000000000001', type: 'email', value: 'guest@gmail.com' },
        update: {},
      });
    });

    it('handles duplicate gracefully (no error thrown)', async () => {
      vi.mocked(prisma.allowlistEntry.upsert).mockResolvedValue({} as never);
      await expect(addEmail('guest@gmail.com')).resolves.toBeUndefined();
    });
  });

  describe('removeEmail', () => {
    it('calls deleteMany for type="email" + value', async () => {
      vi.mocked(prisma.allowlistEntry.deleteMany).mockResolvedValue({ count: 1 });
      await removeEmail('guest@gmail.com');
      expect(prisma.allowlistEntry.deleteMany).toHaveBeenCalledWith({
        where: { type: 'email', value: 'guest@gmail.com' },
      });
    });

    it('throws if zero rows deleted', async () => {
      vi.mocked(prisma.allowlistEntry.deleteMany).mockResolvedValue({ count: 0 });
      await expect(removeEmail('notexist@gmail.com')).rejects.toThrow(
        'Email not found: notexist@gmail.com',
      );
    });
  });
});
