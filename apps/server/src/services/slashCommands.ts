import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type {
  SlashCommand,
  SimplifiedMessage,
  SimplifiedUser,
  MessageResponse,
  Role,
} from '@manlycam/types';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const require = createRequire(import.meta.url);

let commands: SlashCommand[] = [];

const CUSTOM_PATH = path.resolve('./custom');

export function loadCommands(): void {
  commands = [];

  if (!fs.existsSync(CUSTOM_PATH)) {
    logger.warn({ path: CUSTOM_PATH }, 'Custom commands directory not found');
    return;
  }

  const files = fs.readdirSync(CUSTOM_PATH).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    try {
      const filePath = path.join(CUSTOM_PATH, file);
      // Clear require cache so reloadCommands() picks up file changes
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath) as Partial<SlashCommand>;

      if (!command.name || typeof command.name !== 'string') {
        throw new Error('Missing or invalid "name" field');
      }
      if (!command.description || typeof command.description !== 'string') {
        throw new Error('Missing or invalid "description" field');
      }
      if (typeof command.handler !== 'function') {
        throw new Error('Missing or invalid "handler" function');
      }

      commands.push(command as SlashCommand);
      logger.info({ name: command.name, file }, 'Loaded slash command');
    } catch (err) {
      logger.error({ err, file }, 'Failed to load slash command');
    }
  }
}

export function getCommands(): SlashCommand[] {
  return commands;
}

export function getCommandsForRole(
  role: Role,
): Array<{ name: string; description: string; placeholder?: string }> {
  return commands
    .filter((cmd) => {
      if (!cmd.gate?.applicableRoles) return true;
      return cmd.gate.applicableRoles.includes(role);
    })
    .map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      placeholder: cmd.placeholder,
    }));
}

export function reloadCommands(): void {
  loadCommands();
}

interface ExecuteCommandParams {
  content: string;
  userId: string;
  userDisplayName: string;
  userRole: Role;
  mentionedUserIds: string[];
}

export function executeCommand(params: ExecuteCommandParams): MessageResponse | null {
  const { content, userId, userDisplayName, userRole, mentionedUserIds } = params;

  if (!content.startsWith('/')) return null;

  const match = content.match(/^\/(\w+)/);
  if (!match) return null;

  const commandName = match[1];
  const input = content.slice(commandName.length + 2).trim();

  const command = commands.find((cmd) => cmd.name === commandName);
  if (!command) return null;

  if (command.gate?.applicableRoles && !command.gate.applicableRoles.includes(userRole)) {
    throw new AppError('You do not have permission to use this command', 'FORBIDDEN', 403);
  }

  const message: SimplifiedMessage = {
    content,
    createdAt: new Date().toISOString(),
    mentionedUserIds,
  };

  const user: SimplifiedUser = {
    id: userId,
    displayName: userDisplayName,
    role: userRole,
  };

  try {
    return command.handler(input, message, user);
  } catch (err) {
    logger.error({ err, command: commandName }, 'Slash command handler error');
    throw new AppError('Command execution failed', 'INTERNAL_ERROR', 500);
  }
}

loadCommands();
