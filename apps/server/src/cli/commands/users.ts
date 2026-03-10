import { banUser, unbanUser, updateUserRole } from '../../services/userService.js';
import { Role } from '@manlycam/types';

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (key && value) {
        flags[key] = value;
      }
    }
  }
  return flags;
}

export async function runUsersCommand(action: string, args: string | string[]): Promise<void> {
  const argArray = Array.isArray(args) ? args : [args];

  switch (action) {
    case 'ban': {
      const email = argArray[0];
      if (!email) throw new Error('Email is required for ban');
      const { sessionCount } = await banUser(email);
      console.log(`✓ User ${email} has been banned (${sessionCount} active session(s) revoked)`);
      break;
    }
    case 'unban': {
      const email = argArray[0];
      if (!email) throw new Error('Email is required for unban');
      await unbanUser(email);
      console.log(`✓ User ${email} has been unbanned`);
      break;
    }
    case 'grant-admin': {
      const flags = parseFlags(argArray);
      const email = flags.email;
      if (!email) throw new Error('Usage: grant-admin --email=<email>');
      await updateUserRole(email, Role.Admin);
      console.log(`✓ User ${email} has been granted Admin role`);
      break;
    }
    case 'set-role': {
      const flags = parseFlags(argArray);
      const email = flags.email;
      const role = flags.role as Role;
      if (!email || !role) {
        throw new Error('Usage: set-role --email=<email> --role=<role>');
      }
      if (!Object.values(Role).includes(role)) {
        throw new Error(`Invalid role: ${role}. Valid: ${Object.values(Role).join(', ')}`);
      }
      await updateUserRole(email, role);
      console.log(`✓ User ${email} role has been set to ${role}`);
      break;
    }
    default:
      throw new Error(`Unknown users action: ${action}. Valid: ban, unban, grant-admin, set-role`);
  }
}
