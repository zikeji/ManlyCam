import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { AppError } from '../lib/errors.js';
import {
  createClip,
  getClip,
  getClipDownloadUrl,
  getSegmentRange,
  listClips,
  deleteClip,
  updateClip,
  shareClipToChat,
} from '../services/clipService.js';
import type { AppEnv } from '../lib/types.js';
import type { Role } from '@manlycam/types';

export function createClipsRouter() {
  const clipsRouter = new Hono<AppEnv>();

  clipsRouter.get('/api/clips/segment-range', requireAuth, async (c) => {
    const range = await getSegmentRange();
    return c.json(range, 200);
  });

  clipsRouter.post('/api/clips', requireAuth, async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json<Record<string, unknown>>();
    } catch {
      throw new AppError('Invalid JSON in request body', 'INVALID_JSON', 400);
    }
    if (!body || typeof body !== 'object') {
      throw new AppError('Request body must be a JSON object', 'VALIDATION_ERROR', 400);
    }

    const { startTime, endTime, name, description, shareToChat } = body;

    if (typeof startTime !== 'string' || !startTime) {
      throw new AppError('startTime is required', 'VALIDATION_ERROR', 422);
    }
    if (typeof endTime !== 'string' || !endTime) {
      throw new AppError('endTime is required', 'VALIDATION_ERROR', 422);
    }
    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError('name is required', 'VALIDATION_ERROR', 422);
    }
    if (description !== undefined && typeof description !== 'string') {
      throw new AppError('description must be a string', 'VALIDATION_ERROR', 422);
    }
    if (shareToChat !== undefined && typeof shareToChat !== 'boolean') {
      throw new AppError('shareToChat must be a boolean', 'VALIDATION_ERROR', 422);
    }

    const user = c.get('user')!;
    const result = await createClip({
      userId: user.id,
      userRole: user.role as Role,
      startTime,
      endTime,
      name: name.trim(),
      description: typeof description === 'string' ? description : undefined,
      shareToChat: shareToChat === true,
    });

    return c.json(result, 201);
  });

  clipsRouter.get('/api/clips/:clipId', async (c) => {
    const clipId = c.req.param('clipId');
    const user = c.get('user');

    const clip = await getClip({
      clipId,
      requestingUserId: user?.id,
      requestingUserRole: user?.role,
    });

    return c.json(clip, 200);
  });

  clipsRouter.get('/api/clips', requireAuth, async (c) => {
    const user = c.get('user')!;
    const pageStr = c.req.query('page') ?? '0';
    const limitStr = c.req.query('limit') ?? '20';
    const page = Math.max(0, parseInt(pageStr, 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr, 10) || 20));
    const includeShared = c.req.query('includeShared') === 'true';
    const allParam = c.req.query('all') === 'true';
    const isAdmin = (user.role as Role) === 'Admin';

    const result = await listClips({
      userId: user.id,
      page,
      limit,
      includeShared,
      all: allParam,
      isAdmin,
    });
    return c.json(result, 200);
  });

  clipsRouter.patch('/api/clips/:clipId', requireAuth, async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json<Record<string, unknown>>();
    } catch {
      throw new AppError('Invalid JSON in request body', 'INVALID_JSON', 400);
    }
    /* c8 ignore next 3 -- Hono always returns an object from .json(), never null/primitive */
    if (!body || typeof body !== 'object') {
      throw new AppError('Request body must be a JSON object', 'VALIDATION_ERROR', 400);
    }

    const { name, description, visibility, showClipper, showClipperAvatar, clipperName } = body;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      throw new AppError('name must be a non-empty string', 'VALIDATION_ERROR', 422);
    }
    if (description !== undefined && typeof description !== 'string') {
      throw new AppError('description must be a string', 'VALIDATION_ERROR', 422);
    }
    if (
      visibility !== undefined &&
      !['private', 'shared', 'public'].includes(visibility as string)
    ) {
      throw new AppError('visibility must be private, shared, or public', 'VALIDATION_ERROR', 422);
    }
    if (showClipper !== undefined && typeof showClipper !== 'boolean') {
      throw new AppError('showClipper must be a boolean', 'VALIDATION_ERROR', 422);
    }
    if (showClipperAvatar !== undefined && typeof showClipperAvatar !== 'boolean') {
      throw new AppError('showClipperAvatar must be a boolean', 'VALIDATION_ERROR', 422);
    }
    if (clipperName !== undefined && typeof clipperName !== 'string') {
      throw new AppError('clipperName must be a string', 'VALIDATION_ERROR', 422);
    }

    const user = c.get('user')!;
    const clipId = c.req.param('clipId');

    const result = await updateClip({
      clipId,
      actor: { id: user.id, role: user.role as Role },
      data: {
        ...(name !== undefined ? { name: (name as string).trim() } : {}),
        ...(description !== undefined ? { description: description as string } : {}),
        ...(visibility !== undefined ? { visibility: visibility as string } : {}),
        ...(showClipper !== undefined ? { showClipper: showClipper as boolean } : {}),
        ...(showClipperAvatar !== undefined
          ? { showClipperAvatar: showClipperAvatar as boolean }
          : {}),
        ...(clipperName !== undefined ? { clipperName: clipperName as string } : {}),
      },
    });

    return c.json(result, 200);
  });

  clipsRouter.delete('/api/clips/:clipId', requireAuth, async (c) => {
    const user = c.get('user')!;
    const clipId = c.req.param('clipId');
    await deleteClip({ clipId, actor: { id: user.id, role: user.role as Role } });
    return c.body(null, 204);
  });

  clipsRouter.post('/api/clips/:clipId/share', requireAuth, async (c) => {
    const user = c.get('user')!;
    const clipId = c.req.param('clipId');
    await shareClipToChat({
      clipId,
      actor: {
        id: user.id,
        role: user.role as Role,
        mutedAt: user.mutedAt,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        userTagText: user.userTagText ?? null,
        userTagColor: user.userTagColor ?? null,
      },
    });
    return c.body(null, 204);
  });

  clipsRouter.get('/api/clips/:clipId/download', async (c) => {
    const clipId = c.req.param('clipId');
    const user = c.get('user');

    const url = await getClipDownloadUrl({
      clipId,
      requestingUserId: user?.id,
      requestingUserRole: user?.role,
    });

    return c.redirect(url, 302);
  });

  return clipsRouter;
}
