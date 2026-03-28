import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { parseJsonBody } from './parse-body.js';
import type { AppEnv } from './types.js';

describe('parseJsonBody', () => {
  it('parses valid JSON body and returns typed value', async () => {
    const app = new Hono<AppEnv>();
    app.post('/test', async (c) => {
      const body = await parseJsonBody<{ name: string }>(c);
      return c.json({ name: body.name });
    });

    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'hello' }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { name: string };
    expect(data.name).toBe('hello');
  });

  it('throws AppError with INVALID_JSON when body is not valid JSON', async () => {
    const app = new Hono<AppEnv>();
    app.post('/test', async (c) => {
      await parseJsonBody(c);
      return c.json({ ok: true });
    });
    app.onError((err, c) => {
      return c.json({ code: (err as { code?: string }).code }, 400);
    });

    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe('INVALID_JSON');
  });
});
