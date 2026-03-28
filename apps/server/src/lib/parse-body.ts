import type { Context } from 'hono';
import { AppError } from './errors.js';
import type { AppEnv } from './types.js';

export async function parseJsonBody<T>(c: Context<AppEnv>): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new AppError('Invalid JSON in request body', 'INVALID_JSON', 400);
  }
}
