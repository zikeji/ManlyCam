import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { UserPresence } from '@manlycam/types';

const makeUser = (id: string, displayName: string): UserPresence => ({
  id,
  displayName,
  avatarUrl: null,
  role: 'ViewerCompany',
  isMuted: false,
  userTag: null,
});

const john = makeUser('user-001', 'John Smith');
const jane = makeUser('user-002', 'Jane Doe');

// Build a fresh in-memory localStorage stub for each test
function makeStorageStub(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = v;
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

describe('useUserCache', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeStorageStub();
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns undefined for unknown IDs', async () => {
    const { lookupUser } = await import('./useUserCache');
    expect(lookupUser('unknown-id')).toBeUndefined();
  });

  it('cacheUsers stores users and lookupUser returns them', async () => {
    const { cacheUsers, lookupUser } = await import('./useUserCache');
    cacheUsers([john, jane]);
    expect(lookupUser('user-001')).toEqual(john);
    expect(lookupUser('user-002')).toEqual(jane);
  });

  it('cacheUsers overwrites existing entry with newer data', async () => {
    const { cacheUsers, lookupUser } = await import('./useUserCache');
    cacheUsers([john]);
    const updatedJohn = { ...john, displayName: 'Jonathan Smith' };
    cacheUsers([updatedJohn]);
    expect(lookupUser('user-001')?.displayName).toBe('Jonathan Smith');
  });

  it('persists to localStorage', async () => {
    const { cacheUsers } = await import('./useUserCache');
    cacheUsers([john]);
    const raw = storage.getItem('manlycam:user-cache');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('user-001');
  });

  it('loads from localStorage on module init', async () => {
    // Pre-populate localStorage before importing the module
    storage.setItem('manlycam:user-cache', JSON.stringify([john]));
    const { lookupUser } = await import('./useUserCache');
    expect(lookupUser('user-001')).toEqual(john);
  });

  it('handles corrupt localStorage gracefully', async () => {
    storage.setItem('manlycam:user-cache', 'not-valid-json{{{');
    // Should not throw; cache starts empty
    const { lookupUser } = await import('./useUserCache');
    expect(lookupUser('user-001')).toBeUndefined();
  });

  it('handles non-array localStorage value gracefully', async () => {
    // Valid JSON but not an array (e.g. an object) — falls through to the Array.isArray guard
    storage.setItem('manlycam:user-cache', JSON.stringify({ id: 'user-001' }));
    const { lookupUser } = await import('./useUserCache');
    expect(lookupUser('user-001')).toBeUndefined();
  });

  it('does not throw when localStorage.setItem throws (quota exceeded etc.)', async () => {
    const throwingStorage = {
      ...makeStorageStub(),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    vi.stubGlobal('localStorage', throwingStorage);
    const { cacheUsers } = await import('./useUserCache');
    expect(() => cacheUsers([john])).not.toThrow();
  });

  it('userCache ref is reactive — values visible via the ref', async () => {
    const { cacheUsers, userCache } = await import('./useUserCache');
    cacheUsers([john]);
    expect(userCache.value.get('user-001')).toEqual(john);
    cacheUsers([jane]);
    expect(userCache.value.get('user-002')).toEqual(jane);
  });
});
