import type { Context, Next } from 'hono';
import { logger } from '../lib/logger.js';

export const requestLogger = async (c: Context, next: Next): Promise<void> => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  await next();
  const duration = Date.now() - start;
  logger.info({ method, path, status: c.res.status, duration }, 'request');
};
