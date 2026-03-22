import { prisma } from '../db/client.js';

export const streamConfig = {
  async get(key: string, defaultValue: string): Promise<string> {
    const row = await prisma.streamConfig.findUnique({ where: { key } });
    return row?.value ?? defaultValue;
  },
  async getOrNull(key: string): Promise<string | null> {
    const row = await prisma.streamConfig.findUnique({ where: { key } });
    return row?.value ?? null;
  },
  async set(key: string, value: string | null): Promise<void> {
    if (value === null) {
      await prisma.streamConfig.deleteMany({ where: { key } });
    } else {
      await prisma.streamConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
  },
  async getMany(keys: string[]): Promise<Record<string, string | null>> {
    const rows = await prisma.streamConfig.findMany({ where: { key: { in: keys } } });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return Object.fromEntries(keys.map((k) => [k, map[k] ?? null]));
  },
};
