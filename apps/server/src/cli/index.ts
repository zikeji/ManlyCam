#!/usr/bin/env node
import 'dotenv/config';
import { runAllowlistCommand } from './commands/allowlist.js';
import { runUsersCommand } from './commands/users.js';

const [, , subcommand, action, arg] = process.argv;

async function main() {
  if (!subcommand || !action || !arg) {
    console.error('Usage: manlycam-admin <allowlist|users> <action> <value>');
    process.exit(1);
  }

  if (subcommand === 'allowlist') {
    await runAllowlistCommand(action, arg);
  } else if (subcommand === 'users') {
    await runUsersCommand(action, arg);
  } else {
    console.error(`Unknown subcommand: ${subcommand}`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`✗ Error: ${message}`);
  process.exit(1);
});
