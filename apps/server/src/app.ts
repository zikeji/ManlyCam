import { Hono } from 'hono';
import { healthRouter } from './routes/health.js';

export function createApp(): Hono {
  const app = new Hono();

  app.route('/', healthRouter);

  return app;
}
