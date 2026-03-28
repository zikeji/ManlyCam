import type { AllowlistEntry } from '@prisma/client';
import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

// Keep in sync with AllowlistPanel.vue EMAIL_REGEX / DOMAIN_REGEX
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export async function listEntries(): Promise<AllowlistEntry[]> {
  return prisma.allowlistEntry.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function findEntryByTypeValue(
  type: string,
  value: string,
): Promise<AllowlistEntry | null> {
  return prisma.allowlistEntry.findUnique({ where: { type_value: { type, value } } });
}

export async function removeById(id: string): Promise<void> {
  await prisma.allowlistEntry.delete({ where: { id } });
  // P2025 (record not found) bubbles to the route handler which converts it to 404
}

export async function addDomain(domain: string): Promise<void> {
  if (!DOMAIN_REGEX.test(domain)) {
    throw new AppError(`Invalid domain format: ${domain}`, 'VALIDATION_ERROR', 400);
  }
  await prisma.allowlistEntry.upsert({
    where: { type_value: { type: 'domain', value: domain } },
    create: { id: ulid(), type: 'domain', value: domain },
    update: {},
  });
  logger.info({ type: 'domain', value: domain }, 'allowlist_entry_added');
}

export async function removeDomain(domain: string): Promise<void> {
  const result = await prisma.allowlistEntry.deleteMany({
    where: { type: 'domain', value: domain },
  });
  if (result.count === 0) throw new AppError(`Domain not found: ${domain}`, 'NOT_FOUND', 404);
  logger.info({ type: 'domain', value: domain }, 'allowlist_entry_removed');
}

export async function addEmail(email: string): Promise<void> {
  const normalized = email.toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    throw new AppError(`Invalid email format: ${email}`, 'VALIDATION_ERROR', 400);
  }
  await prisma.allowlistEntry.upsert({
    where: { type_value: { type: 'email', value: normalized } },
    create: { id: ulid(), type: 'email', value: normalized },
    update: {},
  });
  logger.info({ type: 'email', value: normalized }, 'allowlist_entry_added');
}

export async function removeEmail(email: string): Promise<void> {
  const normalized = email.toLowerCase();
  const result = await prisma.allowlistEntry.deleteMany({
    where: { type: 'email', value: normalized },
  });
  if (result.count === 0) throw new AppError(`Email not found: ${email}`, 'NOT_FOUND', 404);
  logger.info({ type: 'email', value: normalized }, 'allowlist_entry_removed');
}
