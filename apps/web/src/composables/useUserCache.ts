import { ref } from 'vue';
import type { UserPresence } from '@manlycam/types';

const CACHE_KEY = 'manlycam:user-cache';

function loadFromStorage(): Map<string, UserPresence> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Map();
    return new Map((arr as UserPresence[]).map((u) => [u.id, u]));
  } catch {
    return new Map();
  }
}

function saveToStorage(cache: Map<string, UserPresence>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...cache.values()]));
  } catch {
    // Ignore storage errors (private browsing, quota exceeded, etc.)
  }
}

// Module-level singleton — reactive Map backed by localStorage
export const userCache = ref<Map<string, UserPresence>>(loadFromStorage());

/**
 * Add or overwrite one or more users in the cache.
 * Newer data always wins (last write wins per ID).
 */
export function cacheUsers(users: UserPresence[]): void {
  for (const user of users) {
    userCache.value.set(user.id, user);
  }
  saveToStorage(userCache.value);
}

/**
 * Look up a single user by ID from the cache.
 * Accessing userCache.value inside a computed makes it a reactive dependency.
 */
export function lookupUser(id: string): UserPresence | undefined {
  return userCache.value.get(id);
}
