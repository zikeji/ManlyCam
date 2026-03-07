import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { env } from '../env.js';
import { AppError } from '../lib/errors.js';
import { initiateOAuth, processOAuthCallback, destroySession } from '../services/authService.js';

export const authRouter = new Hono();

authRouter.get('/api/auth/google', (c) => {
  const { state, authUrl } = initiateOAuth();
  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  return c.redirect(authUrl);
});

authRouter.get('/api/auth/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const expectedState = getCookie(c, 'oauth_state');

  if (!code || !state || !expectedState) {
    throw new AppError('Missing OAuth parameters', 'UNAUTHORIZED', 401);
  }

  deleteCookie(c, 'oauth_state', { path: '/' });

  const { sessionId, redirectTo } = await processOAuthCallback(code, state, expectedState);

  if (sessionId) {
    setCookie(c, 'session_id', sessionId, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return c.redirect(redirectTo);
});

authRouter.post('/api/auth/logout', async (c) => {
  const sessionId = getCookie(c, 'session_id');
  if (sessionId) {
    await destroySession(sessionId);
  }
  deleteCookie(c, 'session_id', { path: '/' });
  return c.json({ ok: true });
});
