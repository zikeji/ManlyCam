import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AllowlistEntry } from '@prisma/client';

vi.mock('../db/client.js', () => ({
  prisma: {
    allowlistEntry: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => '01TESTULID00000000000000001') }));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
  },
}));

import { prisma } from '../db/client.js';
import { addDomain, removeDomain, addEmail, removeEmail } from './allowlistService.js';

describe('allowlistService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addDomain', () => {
    it('upserts with type="domain" and a ULID id', async () => {
      const mockEntry: AllowlistEntry = {
        id: '01TESTULID00000000000000001',
        type: 'domain',
        value: 'company.com',
        createdAt: new Date(),
      };
      vi.mocked(prisma.allowlistEntry.upsert).mockResolvedValue(mockEntry);
      await addDomain('company.com');
      expect(prisma.allowlistEntry.upsert).toHaveBeenCalledWith({
        where: { type_value: { type: 'domain', value: 'company.com' } },
        create: { id: '01TESTULID00000000000000001', type: 'domain', value: 'company.com' },
        update: {},
      });
    });

    it('handles duplicate gracefully (no error thrown)', async () => {
      const mockEntry: AllowlistEntry = {
        id: '01TESTULID00000000000000001',
        type: 'domain',
        value: 'company.com',
        createdAt: new Date(),
      };
      vi.mocked(prisma.allowlistEntry.upsert).mockResolvedValue(mockEntry);
      await expect(addDomain('company.com')).resolves.toBeUndefined();
    });

    it('throws on invalid domain format', async () => {
      await expect(addDomain('invalid domain!!!')).rejects.toThrow('Invalid domain format');
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
    it('upserts with type="email" and a ULID id, normalized to lowercase', async () => {
      const mockEntry: AllowlistEntry = {
        id: '01TESTULID00000000000000001',
        type: 'email',
        value: 'guest@gmail.com',
        createdAt: new Date(),
      };
      vi.mocked(prisma.allowlistEntry.upsert).mockResolvedValue(mockEntry);
      await addEmail('Guest@Gmail.com');
      expect(prisma.allowlistEntry.upsert).toHaveBeenCalledWith({
        where: { type_value: { type: 'email', value: 'guest@gmail.com' } },
        create: { id: '01TESTULID00000000000000001', type: 'email', value: 'guest@gmail.com' },
        update: {},
      });
    });

    it('handles duplicate gracefully (no error thrown)', async () => {
      const mockEntry: AllowlistEntry = {
        id: '01TESTULID00000000000000001',
        type: 'email',
        value: 'guest@gmail.com',
        createdAt: new Date(),
      };
      vi.mocked(prisma.allowlistEntry.upsert).mockResolvedValue(mockEntry);
      await expect(addEmail('guest@gmail.com')).resolves.toBeUndefined();
    });

    it('throws on invalid email format', async () => {
      await expect(addEmail('notanemail')).rejects.toThrow('Invalid email format');
      await expect(addEmail('missing@domain')).rejects.toThrow('Invalid email format');
    });
  });

  describe('removeEmail', () => {
    it('calls deleteMany for type="email" + normalized value', async () => {
      vi.mocked(prisma.allowlistEntry.deleteMany).mockResolvedValue({ count: 1 });
      await removeEmail('Guest@Gmail.com');
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
