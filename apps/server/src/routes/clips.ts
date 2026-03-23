import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { AppError } from '../lib/errors.js';
import {
  createClip,
  getClip,
  getClipDownloadUrl,
  getSegmentRange,
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
