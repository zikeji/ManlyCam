import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { env } from '../env.js';
import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';
import { streamConfig } from '../lib/stream-config.js';
import { wsHub } from './wsHub.js';
import { uploadToS3, presignGetObject, deleteS3Objects } from '../lib/s3-client.js';
import { AppError } from '../lib/errors.js';
import { computeUserTag } from '../lib/user-tag.js';
import { ROLE_RANK } from '@manlycam/types';
import { logger } from '../lib/logger.js';
import type { Role, ClipChatMessage, ClipStatusChangedPayload } from '@manlycam/types';

const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_DURATION_S = 15 * 60;
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

  const timestamps = dateTimeMatches.map((m) => new Date(m[1]));
  const earliest = timestamps[0];

  // Latest = last segment start time + its duration
  const lastTimestamp = timestamps[timestamps.length - 1];
  /* c8 ignore next -- defensive: HLS playlists always have EXTINF per segment */
  const lastDuration = extinfs[extinfs.length - 1] ?? 0;
  const latest = new Date(lastTimestamp.getTime() + Math.ceil(lastDuration * 1000));

  return { earliest, latest };
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
  if (cached) return cached;
  // Cache miss: fetch from index.m3u8 and store
  const name = await fetchStreamPlaylistName();
  await streamConfig.set('hls_stream_playlist', name);
  return name;
}

/** Run an ffmpeg command, returning a promise that resolves on exit code 0. */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: 'pipe' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

export async function processClip({
  clipId,
  seekOffsetSeconds,
  durationSeconds,
  playlistUrl,
}: {
  clipId: string;
  seekOffsetSeconds: number;
  durationSeconds: number;
  playlistUrl: string;
}): Promise<void> {
  const videoTmp = `/tmp/${clipId}.mp4`;
  const thumbTmp = `/tmp/${clipId}-thumb.jpg`;
  const s3Key = `clips/${clipId}.mp4`;
  const thumbnailKey = `clips/${clipId}-thumb.jpg`;

  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  /* c8 ignore next -- defensive: clip was just created, can only be null in catastrophic race */
  if (!clip) return;

  async function cleanup() {
    await Promise.allSettled([
      unlink(videoTmp).catch(() => undefined),
      unlink(thumbTmp).catch(() => undefined),
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
      await runFfmpeg([
        '-ss',
        String(seekOffsetSeconds),
        '-i',
        playlistUrl,
        '-t',
        String(durationSeconds),
        '-c',
        'copy',
        '-y',
        videoTmp,
      ]);
      // Generate thumbnail
      await runFfmpeg([
        '-ss',
        String(seekOffsetSeconds),
        '-i',
        playlistUrl,
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

  try {
    // Upload video (private)
    const videoData = await readFile(videoTmp);
    await uploadToS3({ key: s3Key, body: videoData, contentType: 'video/mp4', acl: 'private' });

    // Upload thumbnail (public-read)
    const thumbData = await readFile(thumbTmp);
    await uploadToS3({
      key: thumbnailKey,
      body: thumbData,
      contentType: 'image/jpeg',
      acl: 'public-read',
    });
  } catch (err) {
    logger.error({ err, clipId }, 'clip: S3 upload failed');
    await cleanup();
    // Best-effort delete any partial S3 uploads
    await deleteS3Objects([s3Key, thumbnailKey]).catch(() => undefined);
    await fail();
    return;
  }

  await cleanup();

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
      clipThumbnailUrl: `${env.S3_PUBLIC_BASE_URL}/${thumbnailKey}`,
      editHistory: null,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date().toISOString(),
      userTag,
    };

    // Atomic: update visibility + create message
    await prisma.$transaction(async (tx) => {
      await tx.clip.update({
        where: { id: clipId },
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
      payload: { clipId, visibility: 'shared', clip: clipMsg },
    });
  } else {
    wsHub.sendToUser(updatedClip.userId, {
      type: 'clip:status-changed',
      payload: readyPayload,
    });
  }
}

export async function getSegmentRange(): Promise<{ earliest: string; latest: string }> {
  const streamStartedAt = await streamConfig.getOrNull('stream_started_at');
  if (!streamStartedAt) throw new AppError('Stream has not started', 'STREAM_NOT_STARTED', 422);

  const playlistName = await getStreamPlaylistName();
  const playlistUrl = `${env.MTX_HLS_URL}/cam/${playlistName}`;
  const res = await fetch(playlistUrl);
  if (!res.ok) throw new AppError('Stream playlist unavailable', 'STREAM_NOT_READY', 422);
  const m3u8Text = await res.text();
  const range = parseHlsSegmentRange(m3u8Text);
  if (!range) throw new AppError('Cannot determine HLS segment range', 'STREAM_NOT_READY', 422);

  return { earliest: range.earliest.toISOString(), latest: range.latest.toISOString() };
}

export async function createClip(params: {
  userId: string;
  userRole: Role;
  startTime: string;
  endTime: string;
  name: string;
  description?: string;
  shareToChat?: boolean;
}): Promise<{ id: string; status: string }> {
  const { userId, userRole, startTime, endTime, name, description, shareToChat = false } = params;

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
  if (durationSeconds > MAX_DURATION_S) {
    throw new AppError('Clip duration must not exceed 15 minutes', 'VALIDATION_ERROR', 422);
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
  if (start < range.earliest || end > range.latest) {
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

  // Spawn async processing (fire-and-forget)
  setImmediate(() => {
    processClip({ clipId: id, seekOffsetSeconds, durationSeconds, playlistUrl }).catch(
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
    thumbnailUrl: clip.thumbnailKey ? `${env.S3_PUBLIC_BASE_URL}/${clip.thumbnailKey}` : null,
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

export async function getClipDownloadUrl(params: {
  clipId: string;
  requestingUserId?: string;
  requestingUserRole?: string;
}): Promise<string> {
  const { clipId, requestingUserId, requestingUserRole } = params;

  if (!requestingUserId) throw new AppError('Unauthorized', 'UNAUTHORIZED', 401);

  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!clip || clip.deletedAt !== null) throw new AppError('Not found', 'NOT_FOUND', 404);

  const role = requestingUserRole as Role | undefined;
  const isOwner = requestingUserId === clip.userId;
  const isAdmin = role === 'Admin';
  const isModerator = role === 'Moderator';

  const hasAccess =
    isOwner ||
    isAdmin ||
    (isModerator && clip.visibility !== 'private') ||
    clip.visibility === 'public';
  if (!hasAccess) throw new AppError('Not found', 'NOT_FOUND', 404);

  if (clip.status !== 'ready') throw new AppError('Clip not ready', 'CLIP_NOT_READY', 409);
  if (!clip.s3Key) throw new AppError('Not found', 'NOT_FOUND', 404);

  const slug = slugify(clip.name);
  const filename = slug ? `${slug}.mp4` : `${clipId}.mp4`;

  return presignGetObject({
    key: clip.s3Key,
    expiresIn: 3600,
    contentDisposition: `attachment; filename="${filename}"`,
  });
}
