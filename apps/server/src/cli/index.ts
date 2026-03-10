#!/usr/bin/env node
import 'dotenv/config';
import { runAllowlistCommand } from './commands/allowlist.js';
import { runUsersCommand } from './commands/users.js';

const subcommand = process.argv[2];
const action = process.argv[3];
const args = process.argv.slice(4);

function showHelp() {
  console.error(`ManlyCam Admin CLI

Usage: manlycam-admin <subcommand> <action> [args]

Subcommands:
  allowlist     Manage domain and email allowlist
    add-domain <domain>         Add a domain to the allowlist (e.g., company.com)
    remove-domain <domain>      Remove a domain from the allowlist
    add-email <email>           Add an individual email to the allowlist
    remove-email <email>        Remove an individual email from the allowlist

  users         Manage user accounts
    ban <email>                 Ban a user (revokes all active sessions)
    unban <email>               Unban a previously banned user
    grant-admin --email=<email> Grant Admin role to a user
    set-role --email=<email> --role=<role> Set role for a user

Roles: Admin, Moderator, ViewerCompany, ViewerGuest

Examples:
  manlycam-admin allowlist add-domain example.com
  manlycam-admin users grant-admin --email=admin@example.com
  manlycam-admin users set-role --email=user@example.com --role=Moderator`);
}

async function main() {
  if (!subcommand || !action) {
    showHelp();
    process.exit(1);
  }

  if (subcommand === 'allowlist') {
    const arg = args[0];
    if (!arg) {
      showHelp();
      process.exit(1);
    }
    await runAllowlistCommand(action, arg);
  } else if (subcommand === 'users') {
    await runUsersCommand(action, args);
  } else {
    console.error(`Unknown subcommand: ${subcommand}`);
    showHelp();
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`✗ Error: ${message}`);
  process.exit(1);
});
