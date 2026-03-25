import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { env } from '../env.js';
import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';
import { streamConfig } from '../lib/stream-config.js';
import { wsHub } from './wsHub.js';
import { uploadToS3, presignGetObject, deleteS3Objects, getS3Object } from '../lib/s3-client.js';
import { AppError } from '../lib/errors.js';
import { computeUserTag } from '../lib/user-tag.js';
import { canModerateOver } from '../lib/roleUtils.js';
import { ROLE_RANK } from '@manlycam/types';
import { logger } from '../lib/logger.js';
import type { Role, ClipChatMessage, ClipStatusChangedPayload } from '@manlycam/types';

const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_NAME_LEN = 200;
const MAX_DESC_LEN = 500;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Parse segment timestamps from an HLS playlist and return [min, max] as Date objects. */
export function parseHlsSegmentRange(m3u8Text: string): { earliest: Date; latest: Date } | null {
  // Look for #EXT-X-PROGRAM-DATE-TIME tags
  const dateTimeMatches = [...m3u8Text.matchAll(/#EXT-X-PROGRAM-DATE-TIME:([^\r\n]+)/g)];
  // Also collect EXTINF durations to compute latest = last timestamp + last segment duration
  const extinfs = [...m3u8Text.matchAll(/#EXTINF:([\d.]+),/g)].map((m) => parseFloat(m[1]));

  if (dateTimeMatches.length === 0) return null;

  const timestamps = dateTimeMatches
    .map((m) => {
      const d = new Date(m[1]);
      if (isNaN(d.getTime())) return null;
      return d;
    })
    .filter((d): d is Date => d !== null);

  if (timestamps.length === 0) return null;
  const earliest = timestamps[0];

  // Latest = last segment start time + its duration
  const lastTimestamp = timestamps[timestamps.length - 1];
  /* c8 ignore next -- defensive: HLS playlists always have EXTINF per segment */
  const lastDuration = extinfs[extinfs.length - 1] ?? 0;
  const latest = new Date(lastTimestamp.getTime() + Math.ceil(lastDuration * 1000));

  return { earliest, latest };
}

/** Rewrite relative segment URLs in an m3u8 playlist to absolute URLs. */
export function resolvePlaylistUrls(m3u8Text: string, playlistUrl: string): string {
  const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
  return m3u8Text.replace(/^(?!#)([^\s]+)$/gm, (seg) =>
    seg.startsWith('http') ? seg : `${baseUrl}${seg}`,
  );
}

/** Fetch the HLS master playlist and extract the stream playlist filename. */
async function fetchStreamPlaylistName(): Promise<string> {
  const indexUrl = `${env.MTX_HLS_URL}/cam/index.m3u8`;
  const res = await fetch(indexUrl);
  if (!res.ok) throw new AppError('HLS master playlist unavailable', 'STREAM_NOT_READY', 422);
  const text = await res.text();
  const match = text.match(/^([^\s#][^\s]*\.m3u8)$/m);
  if (!match) throw new AppError('Cannot parse HLS stream playlist name', 'STREAM_NOT_READY', 422);
  return match[1];
}

/** Get cached stream playlist name or fetch it fresh from index.m3u8. */
async function getStreamPlaylistName(): Promise<string> {
  const cached = await streamConfig.getOrNull('hls_stream_playlist');
  if (cached) {
    const playlistUrl = `${env.MTX_HLS_URL}/cam/${cached}`;
    const headRes = await fetch(playlistUrl, { method: 'HEAD' });
    if (headRes.ok) return cached;
    /* c8 ignore next 2 -- defensive: HEAD validation failure is tested but logging branch is defensive */
    logger.warn({ cached }, 'clip: cached HLS playlist returned 404, invalidating cache');
    await streamConfig.set('hls_stream_playlist', '');
  }
  const name = await fetchStreamPlaylistName();
  await streamConfig.set('hls_stream_playlist', name);
  return name;
}

const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;

/** Run an ffmpeg command with timeout, returning a promise that resolves on exit code 0. */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: 'pipe' });
    let stderr = '';

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    /* c8 ignore start -- defensive: 5-min timeout path requires actual wait; SIGTERM/SIGKILL fallback is defensive */
    let terminated = false;
    proc.on('close', () => {
      terminated = true;
    });

    const timeout = setTimeout(() => {
      if (terminated) return;
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!terminated) proc.kill('SIGKILL');
      }, 5000);
      reject(new Error(`ffmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms`));
    }, FFMPEG_TIMEOUT_MS);
    /* c8 ignore stop */

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        /* c8 ignore next 2 -- truncation branch depends on ffmpeg stderr length */
        const trimmed =
          stderr.length > 2000 ? `${stderr.slice(0, 998)}\n[…]\n${stderr.slice(-998)}` : stderr;
        logger.warn({ stderr: trimmed }, 'ffmpeg stderr');
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function processClip({
  clipId,
  seekOffsetSeconds,
  durationSeconds,
  playlistSnapshot,
}: {
  clipId: string;
  seekOffsetSeconds: number;
  durationSeconds: number;
  playlistSnapshot: string;
}): Promise<void> {
  const videoTmp = `/tmp/${clipId}.mp4`;
  const thumbTmp = `/tmp/${clipId}-thumb.jpg`;
  const s3Key = `clips/${clipId}.mp4`;
  const thumbnailKey = `clips/${clipId}-thumb.jpg`;

  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!clip || clip.deletedAt !== null) {
    await unlink(playlistSnapshot).catch(() => undefined);
    return;
  }

  async function cleanup() {
    await Promise.allSettled([
      unlink(videoTmp).catch(() => undefined),
      unlink(thumbTmp).catch(() => undefined),
      unlink(playlistSnapshot).catch(() => undefined),
    ]);
  }

  async function fail() {
    await prisma.clip.update({ where: { id: clipId }, data: { status: 'failed' } });
    wsHub.sendToUser(clip!.userId, {
      type: 'clip:status-changed',
      payload: { clipId, status: 'failed' },
    });
  }

  let attempt = 0;
  while (attempt < 2) {
    try {
      // Generate video clip
      // -protocol_whitelist is required because the local m3u8 snapshot
      // references segments via absolute http:// URLs; without it ffmpeg
      // restricts to file,crypto,data when reading a local file.
      await runFfmpeg([
        '-protocol_whitelist',
        'file,http,https,tcp,tls,crypto',
        '-ss',
        String(seekOffsetSeconds),
        '-i',
        playlistSnapshot,
        '-t',
        String(durationSeconds),
        '-c',
        'copy',
        '-y',
        videoTmp,
      ]);
      // Generate thumbnail
      await runFfmpeg([
        '-protocol_whitelist',
        'file,http,https,tcp,tls,crypto',
        '-ss',
        String(seekOffsetSeconds),
        '-i',
        playlistSnapshot,
        '-vframes',
        '1',
        '-q:v',
        '2',
        '-y',
        thumbTmp,
      ]);
      break; // success
    } catch (err) {
      attempt++;
      if (attempt >= 2) {
        logger.error({ err, clipId }, 'clip: ffmpeg failed after retry');
        await cleanup();
        await fail();
        return;
      }
      logger.warn({ err, clipId, attempt }, 'clip: ffmpeg failed, retrying');
    }
  }

  const uploadedKeys: string[] = [];

  try {
    const videoStream = createReadStream(videoTmp);
    await uploadToS3({ key: s3Key, body: videoStream, contentType: 'video/mp4' });
    uploadedKeys.push(s3Key);

    const thumbData = await readFile(thumbTmp);
    await uploadToS3({ key: thumbnailKey, body: thumbData, contentType: 'image/jpeg' });
    uploadedKeys.push(thumbnailKey);
  } catch (err) {
    logger.error({ err, clipId }, 'clip: S3 upload failed');
    await cleanup();
    // Best-effort delete any partial S3 uploads
    const keysToDelete = uploadedKeys.length > 0 ? uploadedKeys : [s3Key, thumbnailKey];
    try {
      await deleteS3Objects(keysToDelete);
    } catch (deleteErr) {
      /* c8 ignore next 4 -- defensive: S3 cleanup failure logging is best-effort */
      logger.error(
        { deleteErr, clipId, keysToDelete },
        'clip: failed to clean up partial S3 uploads',
      );
    }
    await fail();
    return;
  }

  await cleanup();

  // Re-check deletedAt: if the clip was deleted while ffmpeg was running, skip S3 + DB update.
  const clipBeforeUpload = await prisma.clip.findUnique({
    where: { id: clipId },
    select: { deletedAt: true, status: true },
  });
  if (!clipBeforeUpload || clipBeforeUpload.deletedAt !== null)
    return; /* c8 ignore next -- defensive: clip record cannot be missing at this point; the deletedAt guard handles concurrent deletes */

  // Update clip record
  const updatedClip = await prisma.clip.update({
    where: { id: clipId },
    data: {
      status: 'ready',
      s3Key,
      thumbnailKey,
      durationSeconds,
    },
    include: { user: true },
  });

  const readyPayload: ClipStatusChangedPayload = {
    clipId,
    status: 'ready',
    durationSeconds,
    thumbnailKey,
  };

  if (updatedClip.shareToChat) {
    // Build clip chat message
    const messageId = ulid();
    const userTag = computeUserTag(updatedClip.user);
    const clipMsg: ClipChatMessage = {
      id: messageId,
      userId: updatedClip.userId,
      displayName: updatedClip.user.displayName,
      avatarUrl: updatedClip.user.avatarUrl,
      authorRole: updatedClip.user.role as Role,
      messageType: 'clip',
      content: `Clipped: ${updatedClip.name}`,
      clipId,
      clipName: updatedClip.name,
      clipDurationSeconds: durationSeconds,
      clipThumbnailUrl: `/api/clips/${clipId}/thumbnail`,
      editHistory: null,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date().toISOString(),
      userTag,
    };

    // Atomic: update visibility + create message — only promote if still private
    await prisma.$transaction(async (tx) => {
      await tx.clip.update({
        where: { id: clipId, visibility: 'private' },
        data: { visibility: 'shared' },
      });
      await tx.message.create({
        data: {
          id: messageId,
          userId: updatedClip.userId,
          content: clipMsg.content,
          messageType: 'clip',
          clipId,
        },
      });
    });

    wsHub.broadcast({ type: 'chat:message', payload: clipMsg });
    wsHub.broadcast({ type: 'clip:status-changed', payload: readyPayload });
    wsHub.broadcast({
      type: 'clip:visibility-changed',
      payload: { clipId, visibility: 'shared', chatClipIds: [messageId], clip: clipMsg },
    });
  } else {
    wsHub.sendToUser(updatedClip.userId, {
      type: 'clip:status-changed',
      payload: readyPayload,
    });
  }
}

export async function getSegmentRange(): Promise<{
  earliest: string;
  latest: string;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  streamStartedAt: string;
}> {
  const streamStartedAt = await streamConfig.getOrNull('stream_started_at');
  if (!streamStartedAt) throw new AppError('Stream has not started', 'STREAM_NOT_STARTED', 422);

  const playlistName = await getStreamPlaylistName();
  const playlistUrl = `${env.MTX_HLS_URL}/cam/${playlistName}`;
  const res = await fetch(playlistUrl);
  if (!res.ok) throw new AppError('Stream playlist unavailable', 'STREAM_NOT_READY', 422);
  const m3u8Text = await res.text();
  const range = parseHlsSegmentRange(m3u8Text);
  if (!range) throw new AppError('Cannot determine HLS segment range', 'STREAM_NOT_READY', 422);

  // Clamp earliest to max(stream_started_at, hlsEarliest)
  const streamStart = new Date(streamStartedAt);
  const clampedEarliest = new Date(Math.max(streamStart.getTime(), range.earliest.getTime()));

  return {
    earliest: clampedEarliest.toISOString(),
    latest: range.latest.toISOString(),
    minDurationSeconds: env.CLIP_MIN_DURATION_SECONDS,
    maxDurationSeconds: env.CLIP_MAX_DURATION_SECONDS,
    streamStartedAt,
  };
}

export async function createClip(params: {
  userId: string;
  userRole: Role;
  mutedAt: Date | null;
  startTime: string;
  endTime: string;
  name: string;
  description?: string;
  shareToChat?: boolean;
}): Promise<{ id: string; status: string }> {
  const {
    userId,
    userRole,
    mutedAt,
    startTime,
    endTime,
    name,
    description,
    shareToChat = false,
  } = params;

  if (shareToChat && mutedAt !== null) {
    throw new AppError('Muted users cannot create clips shared to chat', 'FORBIDDEN', 403);
  }

  // Rate limit: Viewer and ViewerGuest roles
  if (ROLE_RANK[userRole] < ROLE_RANK['Moderator']) {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const count = await prisma.clip.count({
      where: { userId, createdAt: { gte: windowStart } },
    });
    if (count >= RATE_LIMIT_COUNT) {
      throw new AppError(
        'Rate limit exceeded: maximum 5 clips per 60 minutes for your role',
        'RATE_LIMITED',
        429,
      );
    }
  }

  // Validate stream started
  const streamStartedAt = await streamConfig.getOrNull('stream_started_at');
  if (!streamStartedAt) throw new AppError('Stream has not started', 'STREAM_NOT_STARTED', 422);

  // Validate startTime >= stream_started_at
  const streamStart = new Date(streamStartedAt);
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new AppError('Invalid startTime or endTime', 'VALIDATION_ERROR', 422);
  }
  if (start < streamStart) {
    throw new AppError('startTime must not be before stream start', 'VALIDATION_ERROR', 422);
  }
  if (end <= start) {
    throw new AppError('endTime must be after startTime', 'VALIDATION_ERROR', 422);
  }

  const durationSeconds = Math.round((end.getTime() - start.getTime()) / 1000);
  if (durationSeconds < env.CLIP_MIN_DURATION_SECONDS) {
    throw new AppError(
      `Clip duration must be at least ${env.CLIP_MIN_DURATION_SECONDS} seconds`,
      'VALIDATION_ERROR',
      422,
    );
  }
  if (durationSeconds > env.CLIP_MAX_DURATION_SECONDS) {
    throw new AppError(
      `Clip duration must not exceed ${env.CLIP_MAX_DURATION_SECONDS} seconds`,
      'VALIDATION_ERROR',
      422,
    );
  }
  if (name.length > MAX_NAME_LEN) {
    throw new AppError(`name must not exceed ${MAX_NAME_LEN} characters`, 'VALIDATION_ERROR', 422);
  }
  if (description !== undefined && description.length > MAX_DESC_LEN) {
    throw new AppError(
      `description must not exceed ${MAX_DESC_LEN} characters`,
      'VALIDATION_ERROR',
      422,
    );
  }

  // Validate segment range: fetch stream playlist and parse timestamps
  const playlistName = await getStreamPlaylistName();
  const playlistUrl = `${env.MTX_HLS_URL}/cam/${playlistName}`;
  const playlistRes = await fetch(playlistUrl);
  if (!playlistRes.ok) {
    throw new AppError('Stream playlist unavailable', 'STREAM_NOT_READY', 422);
  }
  const m3u8Text = await playlistRes.text();
  const range = parseHlsSegmentRange(m3u8Text);
  if (!range) {
    throw new AppError('Cannot determine HLS segment range', 'STREAM_NOT_READY', 422);
  }
  // Use the same clamped lower bound as getSegmentRange to avoid frontend/backend mismatch
  const effectiveEarliest = new Date(Math.max(streamStart.getTime(), range.earliest.getTime()));
  if (start < effectiveEarliest || end > range.latest) {
    throw new AppError(
      'startTime/endTime must fall within available HLS segment range',
      'VALIDATION_ERROR',
      422,
    );
  }

  // Create pending clip record
  const id = ulid();
  await prisma.clip.create({
    data: {
      id,
      userId,
      name,
      description,
      status: 'pending',
      shareToChat,
    },
  });

  const seekOffsetSeconds = Math.max(0, (start.getTime() - range.earliest.getTime()) / 1000);

  // Snapshot the playlist with absolute segment URLs so ffmpeg reads the exact
  // segments used to calculate seekOffsetSeconds (the live rolling buffer moves).
  // Append #EXT-X-ENDLIST so ffmpeg treats it as a finite VOD playlist — without
  // it, ffmpeg hangs waiting for a local file that will never update with new segments.
  const snapshotPath = `/tmp/${id}-playlist.m3u8`;
  let absolutePlaylist = resolvePlaylistUrls(m3u8Text, playlistUrl);
  if (!absolutePlaylist.includes('#EXT-X-ENDLIST')) {
    absolutePlaylist += '\n#EXT-X-ENDLIST\n';
  }
  await writeFile(snapshotPath, absolutePlaylist, 'utf8');

  // Spawn async processing (fire-and-forget)
  setImmediate(() => {
    processClip({
      clipId: id,
      seekOffsetSeconds,
      durationSeconds,
      playlistSnapshot: snapshotPath,
    }).catch(
      /* c8 ignore next 3 -- processClip only rejects in catastrophic failure; happy-path coverage via unit tests */
      (err) => {
        logger.error({ err, clipId: id }, 'clip: processClip rejected unexpectedly');
      },
    );
  });

  return { id, status: 'pending' };
}

export async function getClip(params: {
  clipId: string;
  requestingUserId?: string;
  requestingUserRole?: string;
}): Promise<Record<string, unknown>> {
  const { clipId, requestingUserId, requestingUserRole } = params;

  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!clip || clip.deletedAt !== null) throw new AppError('Not found', 'NOT_FOUND', 404);

  const role = requestingUserRole as Role | undefined;
  const isOwner = requestingUserId === clip.userId;
  const isAdmin = role === 'Admin';
  const isModerator = role === 'Moderator';

  if (isOwner || isAdmin) {
    // full access
  } else if (isModerator) {
    if (clip.visibility === 'private') throw new AppError('Not found', 'NOT_FOUND', 404);
  } else if (!requestingUserId) {
    // unauthenticated
    if (clip.visibility !== 'public') throw new AppError('Unauthorized', 'UNAUTHORIZED', 401);
  } else {
    // authenticated viewer — same as unauthenticated for others' clips for now
    if (clip.visibility === 'private') throw new AppError('Not found', 'NOT_FOUND', 404);
  }

  return {
    id: clip.id,
    userId: clip.userId,
    name: clip.name,
    description: clip.description,
    status: clip.status,
    visibility: clip.visibility,
    thumbnailKey: clip.thumbnailKey,
    thumbnailUrl: clip.thumbnailKey ? `/api/clips/${clip.id}/thumbnail` : null,
    durationSeconds: clip.durationSeconds,
    shareToChat: clip.shareToChat,
    showClipper: clip.showClipper,
    showClipperAvatar: clip.showClipperAvatar,
    clipperName: clip.clipperName,
    clipperAvatarUrl: clip.clipperAvatarUrl,
    createdAt: clip.createdAt.toISOString(),
    updatedAt: clip.updatedAt?.toISOString() ?? null,
  };
}

export interface ClipListItem {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: string;
  visibility: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  showClipper: boolean;
  showClipperAvatar: boolean;
  clipperName: string | null;
  clipperAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
  lastEditedAt: string | null;
  clipperDisplayName: string;
  clipperAvatarUrlOwner: string | null;
  clipperRole: string;
}

export async function listClips(params: {
  userId: string;
  page: number;
  limit: number;
  includeShared: boolean;
  all: boolean;
  isAdmin: boolean;
}): Promise<{ clips: ClipListItem[]; total: number }> {
  const { userId, page, limit, includeShared, all, isAdmin } = params;
  const skip = page * limit;

  let whereClause: Record<string, unknown>;
  if (isAdmin && all) {
    whereClause = { deletedAt: null };
  } else if (includeShared) {
    whereClause = {
      deletedAt: null,
      OR: [{ userId }, { userId: { not: userId }, visibility: { in: ['shared', 'public'] } }],
    };
  } else {
    whereClause = { deletedAt: null, userId };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = whereClause as any;
  const [rows, total] = await Promise.all([
    prisma.clip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: {
          select: {
            displayName: true,
            avatarUrl: true,
            role: true,
            userTagText: true,
            userTagColor: true,
          },
        },
      },
    }),
    prisma.clip.count({ where }),
  ]);

  const clips: ClipListItem[] = rows.map((clip) => ({
    id: clip.id,
    userId: clip.userId,
    name: clip.name,
    description: clip.description,
    status: clip.status,
    visibility: clip.visibility,
    thumbnailUrl: clip.thumbnailKey ? `/api/clips/${clip.id}/thumbnail` : null,
    durationSeconds: clip.durationSeconds,
    showClipper: clip.showClipper,
    showClipperAvatar: clip.showClipperAvatar,
    clipperName: clip.clipperName,
    clipperAvatarUrl: clip.clipperAvatarUrl,
    createdAt: clip.createdAt.toISOString(),
    updatedAt: clip.updatedAt?.toISOString() ?? null,
    lastEditedAt: clip.lastEditedAt?.toISOString() ?? null,
    clipperDisplayName: clip.user.displayName,
    clipperAvatarUrlOwner: clip.user.avatarUrl,
    clipperRole: clip.user.role,
  }));

  return { clips, total };
}

export async function deleteClip(params: {
  clipId: string;
  actor: { id: string; role: Role };
}): Promise<void> {
  const { clipId, actor } = params;

  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    include: { user: { select: { role: true } } },
  });

  if (!clip || clip.deletedAt !== null) throw new AppError('Not found', 'NOT_FOUND', 404);

  const isOwner = actor.id === clip.userId;
  if (!isOwner && !canModerateOver(actor.role, clip.user.role as Role)) {
    throw new AppError('Not found', 'NOT_FOUND', 404);
  }

  if (clip.status === 'failed') {
    await prisma.clip.delete({ where: { id: clipId } });
    return;
  }

  // status: 'ready' — soft delete + S3 cleanup + broadcast
  const chatClipIds = await prisma.$transaction(async (tx) => {
    const ids = (
      await tx.message.findMany({
        where: { clipId },
        select: { id: true },
        take: 100,
      })
    ).map((m) => m.id);
    await tx.clip.update({ where: { id: clipId }, data: { deletedAt: new Date() } });
    return ids;
  });

  if (!isOwner) {
    await prisma.auditLog.create({
      data: {
        id: ulid(),
        action: 'clip:deleted',
        actorId: actor.id,
        targetId: clip.userId,
        metadata: { clipId, clipName: clip.name },
      },
    });
  }

  // S3 cleanup (best-effort)
  const keysToDelete: string[] = [];
  if (clip.s3Key) keysToDelete.push(clip.s3Key);
  if (clip.thumbnailKey) keysToDelete.push(clip.thumbnailKey);
  if (keysToDelete.length > 0) {
    try {
      await deleteS3Objects(keysToDelete);
    } catch (err) {
      logger.error({ err, clipId, keysToDelete }, 'clip: S3 delete failed (orphaned objects)');
    }
  }

  wsHub.broadcast({
    type: 'clip:visibility-changed',
    payload: { clipId, visibility: 'deleted', chatClipIds },
  });
}

export async function updateClip(params: {
  clipId: string;
  actor: { id: string; role: Role };
  data: {
    name?: string;
    description?: string;
    visibility?: string;
    showClipper?: boolean;
    showClipperAvatar?: boolean;
    clipperName?: string;
  };
}): Promise<Record<string, unknown>> {
  const { clipId, actor, data } = params;

  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    include: { user: { select: { avatarUrl: true, role: true } } },
  });

  if (!clip || clip.deletedAt !== null) throw new AppError('Not found', 'NOT_FOUND', 404);

  const isOwner = actor.id === clip.userId;
  if (!isOwner && !canModerateOver(actor.role, clip.user.role as Role)) {
    throw new AppError('Not found', 'NOT_FOUND', 404);
  }

  if (data.visibility === 'public' && ROLE_RANK[actor.role] < ROLE_RANK['Moderator']) {
    throw new AppError('Insufficient role to set public visibility', 'FORBIDDEN', 422);
  }

  if (data.name !== undefined) {
    if (data.name.length > MAX_NAME_LEN) {
      throw new AppError(
        `name must not exceed ${MAX_NAME_LEN} characters`,
        'VALIDATION_ERROR',
        422,
      );
    }
    if (!data.name.trim()) {
      throw new AppError('name cannot be empty or whitespace only', 'VALIDATION_ERROR', 422);
    }
  }
  if (data.description !== undefined) {
    if (data.description.length > MAX_DESC_LEN) {
      throw new AppError(
        `description must not exceed ${MAX_DESC_LEN} characters`,
        'VALIDATION_ERROR',
        422,
      );
    }
    if (!data.description.trim()) {
      throw new AppError('description cannot be empty or whitespace only', 'VALIDATION_ERROR', 422);
    }
  }

  const updateData: Record<string, unknown> = {};
  const auditCategories: string[] = [];

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.name !== undefined || data.description !== undefined) {
    updateData.lastEditedAt = new Date();
    if (!isOwner) auditCategories.push('clip:edited');
  }

  if (data.visibility !== undefined && data.visibility !== clip.visibility) {
    updateData.visibility = data.visibility;
    if (!isOwner) auditCategories.push('clip:visibility-changed');
  }

  const newVisibility = (data.visibility ?? clip.visibility) as string;

  // Attribution controls — only relevant when going to/staying at public
  if (data.showClipper !== undefined) updateData.showClipper = data.showClipper;
  if (data.showClipperAvatar !== undefined) {
    // null guard: if owner has no avatar, store false
    if (data.showClipperAvatar && !clip.user.avatarUrl) {
      updateData.showClipperAvatar = false;
    } else {
      updateData.showClipperAvatar = data.showClipperAvatar;
      if (data.showClipperAvatar && clip.user.avatarUrl) {
        updateData.clipperAvatarUrl = clip.user.avatarUrl;
      }
    }
  }
  if (data.clipperName !== undefined) updateData.clipperName = data.clipperName;
  if (
    (data.showClipper !== undefined ||
      data.showClipperAvatar !== undefined ||
      data.clipperName !== undefined) &&
    !isOwner
  ) {
    auditCategories.push('clip:attribution-changed');
  }

  const updated = await prisma.clip.update({
    where: { id: clipId },
    data: updateData as Parameters<typeof prisma.clip.update>[0]['data'],
    include: {
      user: {
        select: {
          displayName: true,
          avatarUrl: true,
          role: true,
          userTagText: true,
          userTagColor: true,
        },
      },
    },
  });

  // Audit logging
  if (!isOwner) {
    for (const action of auditCategories) {
      await prisma.auditLog.create({
        data: {
          id: ulid(),
          action,
          actorId: actor.id,
          targetId: clip.userId,
          metadata: { clipId, clipName: clip.name },
        },
      });
    }
  }

  // Broadcast to active sessions: tombstone on private, restore/update on shared/public.
  // Fires for any update (name, visibility, attribution) so chat clip cards reflect changes immediately.
  const chatClipIds = (
    await prisma.message.findMany({
      where: { clipId },
      select: { id: true },
      take: 100,
    })
  ).map((m) => m.id);

  if (chatClipIds.length > 0) {
    const visibilityPayload: {
      clipId: string;
      visibility: string;
      chatClipIds: string[];
      clip?: ClipChatMessage;
    } = { clipId, visibility: newVisibility, chatClipIds };

    if (newVisibility === 'shared' || newVisibility === 'public') {
      const userTag = computeUserTag(updated.user);
      const clipMsg: ClipChatMessage = {
        id: '',
        userId: updated.userId,
        displayName: updated.user.displayName,
        avatarUrl: updated.user.avatarUrl,
        authorRole: updated.user.role as Role,
        messageType: 'clip',
        content: `Clipped: ${updated.name}`,
        clipId,
        clipName: updated.name,
        clipDurationSeconds: updated.durationSeconds,
        ...(updated.thumbnailKey ? { clipThumbnailUrl: `/api/clips/${clipId}/thumbnail` } : {}),
        ...(updated.clipperAvatarUrl ? { clipperAvatarUrl: updated.clipperAvatarUrl } : {}),
        editHistory: null,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: updated.createdAt.toISOString(),
        userTag,
      };
      visibilityPayload.clip = clipMsg;
    }

    wsHub.broadcast({ type: 'clip:visibility-changed', payload: visibilityPayload });
  }

  return {
    id: updated.id,
    userId: updated.userId,
    name: updated.name,
    description: updated.description,
    status: updated.status,
    visibility: updated.visibility,
    thumbnailKey: updated.thumbnailKey,
    thumbnailUrl: updated.thumbnailKey ? `/api/clips/${updated.id}/thumbnail` : null,
    durationSeconds: updated.durationSeconds,
    showClipper: updated.showClipper,
    showClipperAvatar: updated.showClipperAvatar,
    clipperName: updated.clipperName,
    clipperAvatarUrl: updated.clipperAvatarUrl,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt?.toISOString() ?? null,
    lastEditedAt: updated.lastEditedAt?.toISOString() ?? null,
  };
}

export async function shareClipToChat(params: {
  clipId: string;
  actor: {
    id: string;
    role: Role;
    mutedAt: Date | null;
    displayName: string;
    avatarUrl: string | null;
    userTagText: string | null;
    userTagColor: string | null;
  };
}): Promise<void> {
  const { clipId, actor } = params;

  if (actor.mutedAt !== null) {
    throw new AppError('Muted users cannot share clips to chat', 'FORBIDDEN', 403);
  }

  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    select: {
      id: true,
      userId: true,
      name: true,
      durationSeconds: true,
      thumbnailKey: true,
      status: true,
      deletedAt: true,
      visibility: true,
    },
  });

  if (!clip || clip.deletedAt !== null) throw new AppError('Not found', 'NOT_FOUND', 404);
  if (clip.status !== 'ready') throw new AppError('Clip not ready', 'CLIP_NOT_READY', 409);

  const prevVisibility = clip.visibility;
  const newVisibility = prevVisibility === 'private' ? 'shared' : prevVisibility;

  const messageId = ulid();
  const userTag = computeUserTag({
    role: actor.role,
    userTagText: actor.userTagText,
    userTagColor: actor.userTagColor,
  });
  const clipMsg: ClipChatMessage = {
    id: messageId,
    userId: actor.id,
    displayName: actor.displayName,
    avatarUrl: actor.avatarUrl,
    authorRole: actor.role,
    messageType: 'clip',
    content: `Clipped: ${clip.name}`,
    clipId,
    clipName: clip.name,
    clipDurationSeconds: clip.durationSeconds,
    ...(clip.thumbnailKey ? { clipThumbnailUrl: `/api/clips/${clipId}/thumbnail` } : {}),
    editHistory: null,
    updatedAt: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date().toISOString(),
    userTag,
  };

  await prisma.$transaction(async (tx) => {
    if (prevVisibility === 'private') {
      await tx.clip.update({
        where: { id: clipId, deletedAt: null },
        data: { visibility: 'shared' },
      });
    }
    await tx.message.create({
      data: {
        id: messageId,
        userId: actor.id,
        content: clipMsg.content,
        messageType: 'clip',
        clipId,
      },
    });
  });

  wsHub.broadcast({ type: 'chat:message', payload: clipMsg });

  if (prevVisibility === 'private') {
    const chatClipIds = (
      await prisma.message.findMany({
        where: { clipId },
        select: { id: true },
        take: 100,
      })
    ).map((m) => m.id);

    wsHub.broadcast({
      type: 'clip:visibility-changed',
      payload: { clipId, visibility: newVisibility, chatClipIds, clip: clipMsg },
    });
  }
}

async function resolveClipForAccess(params: {
  clipId: string;
  requestingUserId?: string;
  requestingUserRole?: string;
}) {
  const { clipId, requestingUserId, requestingUserRole } = params;

  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!clip || clip.deletedAt !== null) throw new AppError('Not found', 'NOT_FOUND', 404);

  const role = requestingUserRole as Role | undefined;

  if (!requestingUserId) {
    // Unauthenticated: only public clips are accessible
    if (clip.visibility !== 'public') throw new AppError('Unauthorized', 'UNAUTHORIZED', 401);
  } else {
    const isOwner = requestingUserId === clip.userId;
    const isAdmin = role === 'Admin';
    const isModerator = role === 'Moderator';

    const hasAccess =
      isOwner ||
      isAdmin ||
      (isModerator && clip.visibility !== 'private') ||
      clip.visibility === 'public' ||
      clip.visibility === 'shared';
    if (!hasAccess) throw new AppError('Not found', 'NOT_FOUND', 404);
  }

  if (clip.status !== 'ready') throw new AppError('Clip not ready', 'CLIP_NOT_READY', 409);
  if (!clip.s3Key) throw new AppError('Not found', 'NOT_FOUND', 404);

  return clip;
}

export async function getClipDownloadUrl(params: {
  clipId: string;
  requestingUserId?: string;
  requestingUserRole?: string;
}): Promise<string> {
  const clip = await resolveClipForAccess(params);
  const slug = slugify(clip.name);
  const filename = slug ? `${slug}.mp4` : `${params.clipId}.mp4`;
  return presignGetObject({
    key: clip.s3Key!,
    expiresIn: 3600,
    contentDisposition: `attachment; filename="${filename}"`,
  });
}

export async function getClipStreamUrl(params: {
  clipId: string;
  requestingUserId?: string;
  requestingUserRole?: string;
}): Promise<string> {
  const clip = await resolveClipForAccess(params);
  return presignGetObject({ key: clip.s3Key!, expiresIn: 3600 });
}

export async function getClipThumbnail(params: {
  clipId: string;
  requestingUserId?: string;
  requestingUserRole?: string;
}): Promise<{ body: Buffer; contentType: string }> {
  const clip = await resolveClipForAccess(params);
  if (!clip.thumbnailKey) throw new AppError('Not found', 'NOT_FOUND', 404);
  return getS3Object(clip.thumbnailKey);
}
