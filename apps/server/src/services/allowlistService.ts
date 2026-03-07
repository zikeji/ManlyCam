import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';

export async function addDomain(domain: string): Promise<void> {
  await prisma.allowlistEntry.upsert({
    where: { type_value: { type: 'domain', value: domain } },
    create: { id: ulid(), type: 'domain', value: domain },
    update: {},
  });
}

export async function removeDomain(domain: string): Promise<void> {
  const result = await prisma.allowlistEntry.deleteMany({
    where: { type: 'domain', value: domain },
  });
  if (result.count === 0) throw new Error(`Domain not found: ${domain}`);
}

export async function addEmail(email: string): Promise<void> {
  await prisma.allowlistEntry.upsert({
    where: { type_value: { type: 'email', value: email } },
    create: { id: ulid(), type: 'email', value: email },
    update: {},
  });
}

export async function removeEmail(email: string): Promise<void> {
  const result = await prisma.allowlistEntry.deleteMany({
    where: { type: 'email', value: email },
  });
  if (result.count === 0) throw new Error(`Email not found: ${email}`);
}
