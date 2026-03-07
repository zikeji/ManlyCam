#!/usr/bin/env node
import 'dotenv/config';
import { runAllowlistCommand } from './commands/allowlist.js';
import { runUsersCommand } from './commands/users.js';

const [, , subcommand, action, arg] = process.argv;

function showHelp() {
  console.error(`ManlyCam Admin CLI

Usage: manlycam-admin <subcommand> <action> <value>

Subcommands:
  allowlist     Manage domain and email allowlist
    add-domain <domain>         Add a domain to the allowlist (e.g., company.com)
    remove-domain <domain>      Remove a domain from the allowlist
    add-email <email>           Add an individual email to the allowlist
    remove-email <email>        Remove an individual email from the allowlist

  users         Manage user accounts
    ban <email>                 Ban a user (revokes all active sessions)
    unban <email>               Unban a previously banned user

Examples:
  manlycam-admin allowlist add-domain example.com
  manlycam-admin allowlist add-email guest@gmail.com
  manlycam-admin users ban user@company.com`);
}

async function main() {
  if (!subcommand || !action || !arg) {
    showHelp();
    process.exit(1);
  }

  if (subcommand === 'allowlist') {
    await runAllowlistCommand(action, arg);
  } else if (subcommand === 'users') {
    await runUsersCommand(action, arg);
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
