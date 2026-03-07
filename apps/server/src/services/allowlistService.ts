import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';
import { logger } from '../lib/logger.js';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export async function addDomain(domain: string): Promise<void> {
  if (!DOMAIN_REGEX.test(domain)) {
    throw new Error(`Invalid domain format: ${domain}`);
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
  if (result.count === 0) throw new Error(`Domain not found: ${domain}`);
  logger.info({ type: 'domain', value: domain }, 'allowlist_entry_removed');
}

export async function addEmail(email: string): Promise<void> {
  const normalized = email.toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    throw new Error(`Invalid email format: ${email}`);
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
  if (result.count === 0) throw new Error(`Email not found: ${email}`);
  logger.info({ type: 'email', value: normalized }, 'allowlist_entry_removed');
}
