import type { User } from '@prisma/client';

export type AppEnv = { Variables: { user: User | null } };
