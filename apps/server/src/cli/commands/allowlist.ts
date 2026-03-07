import { addDomain, removeDomain, addEmail, removeEmail } from '../../services/allowlistService.js';

export async function runAllowlistCommand(action: string, arg: string): Promise<void> {
  switch (action) {
    case 'add-domain':
      await addDomain(arg);
      console.log(`✓ Domain ${arg} added to allowlist`);
      break;
    case 'remove-domain':
      await removeDomain(arg);
      console.log(`✓ Domain ${arg} removed from allowlist`);
      break;
    case 'add-email':
      await addEmail(arg);
      console.log(`✓ Email ${arg} added to allowlist`);
      break;
    case 'remove-email':
      await removeEmail(arg);
      console.log(`✓ Email ${arg} removed from allowlist`);
      break;
    default:
      throw new Error(
        `Unknown allowlist action: ${action}. Valid: add-domain, remove-domain, add-email, remove-email`,
      );
  }
}
