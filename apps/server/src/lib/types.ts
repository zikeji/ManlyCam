/* istanbul ignore file -- type definitions only, no runtime code */
import type { User } from '@prisma/client';

export type AppEnv = { Variables: { user: User | null } };
