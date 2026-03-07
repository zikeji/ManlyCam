import { Hono } from 'hono';

export const healthRouter = new Hono();

healthRouter.get('/api/health', (c) => c.json({ ok: true, uptime: process.uptime() }));
