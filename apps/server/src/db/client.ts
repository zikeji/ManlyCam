/* c8 ignore file -- Prisma singleton: initialized once at startup, always mocked in tests */
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
