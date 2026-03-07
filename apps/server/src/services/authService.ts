import { randomBytes } from 'node:crypto';
import { env } from '../env.js';
import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';
import { AppError } from '../lib/errors.js';

interface GoogleProfile {
  googleSub: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export function initiateOAuth(): { state: string; authUrl: string } {
  const state = randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.BASE_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return { state, authUrl };
}

export async function handleCallback(
  code: string,
  state: string,
  expectedState: string,
): Promise<GoogleProfile> {
  if (state !== expectedState) {
    throw new AppError('Invalid OAuth state', 'UNAUTHORIZED', 401);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.BASE_URL}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    throw new AppError('Failed to exchange OAuth code', 'UNAUTHORIZED', 401);
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!userRes.ok) {
    throw new AppError('Failed to fetch Google user profile', 'UNAUTHORIZED', 401);
  }

  const { sub, email, name, picture } = (await userRes.json()) as {
    sub: string;
    email: string;
    name: string;
    picture?: string;
  };

  return {
    googleSub: sub,
    email,
    displayName: name,
    avatarUrl: picture ?? null,
  };
}

export async function createSession(userId: string): Promise<string> {
  const sessionId = ulid();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { id: sessionId, userId, expiresAt },
  });
  return sessionId;
}

export async function destroySession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function getSessionUser(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    return null;
  }
  return session.user;
}

export async function processOAuthCallback(
  code: string,
  state: string,
  expectedState: string,
): Promise<{ sessionId: string | null; redirectTo: string }> {
  const profile = await handleCallback(code, state, expectedState);

  const existingUser = await prisma.user.findUnique({
    where: { googleSub: profile.googleSub },
  });

  if (existingUser) {
    // Returning user: skip allowlist, only check ban
    if (existingUser.bannedAt) {
      return { sessionId: null, redirectTo: '/banned' };
    }
    const updated = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        lastSeenAt: new Date(),
      },
    });
    // TODO(story 3.4): broadcast user:update WS message when WS hub is available
    const sessionId = await createSession(updated.id);
    return { sessionId, redirectTo: '/' };
  }

  // New user: enforce allowlist
  const emailDomain = profile.email.split('@')[1] ?? '';
  const domainEntry = await prisma.allowlistEntry.findFirst({
    where: { type: 'domain', value: emailDomain },
  });

  let role: string;
  if (domainEntry) {
    role = 'ViewerCompany';
  } else {
    const emailEntry = await prisma.allowlistEntry.findFirst({
      where: { type: 'email', value: profile.email },
    });
    if (!emailEntry) {
      return { sessionId: null, redirectTo: '/rejected' };
    }
    role = 'ViewerGuest';
  }

  const userId = ulid();
  const newUser = await prisma.user.create({
    data: {
      id: userId,
      googleSub: profile.googleSub,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      role,
    },
  });
  const sessionId = await createSession(newUser.id);
  return { sessionId, redirectTo: '/' };
}
