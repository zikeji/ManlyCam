import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('../env.js', () => ({
  env: {
    MTX_HLS_URL: 'http://127.0.0.1:8090',
    S3_PUBLIC_BASE_URL: 'https://cdn.example.com',
    S3_BUCKET: 'test-bucket',
    S3_ENDPOINT: 'https://s3.example.com',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'key',
    S3_SECRET_KEY: 'secret',
    S3_FORCE_PATH_STYLE: true,
  },
}));

vi.mock('../db/client.js', () => ({
  prisma: {
    clip: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    message: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../lib/stream-config.js', () => ({
  streamConfig: {
    getOrNull: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'TESTULID0000000000000001') }));
vi.mock('../lib/s3-client.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  presignGetObject: vi.fn().mockResolvedValue('https://presigned.example.com/video'),
  deleteS3Objects: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn(), sendToUser: vi.fn() },
}));
vi.mock('../lib/user-tag.js', () => ({
  computeUserTag: vi.fn().mockReturnValue(null),
}));
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('data')),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../db/client.js';
import { streamConfig } from '../lib/stream-config.js';
import { uploadToS3, presignGetObject, deleteS3Objects } from '../lib/s3-client.js';
import { wsHub } from '../services/wsHub.js';
import { spawn } from 'node:child_process';
import {
  parseHlsSegmentRange,
  getSegmentRange,
  createClip,
  processClip,
  getClip,
  getClipDownloadUrl,
} from './clipService.js';

const M3U8_WITH_TIMESTAMPS = `
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-PROGRAM-DATE-TIME:2026-03-22T10:00:00.000Z
#EXTINF:6.000,
seg0.ts
#EXT-X-PROGRAM-DATE-TIME:2026-03-22T10:00:06.000Z
#EXTINF:6.000,
seg1.ts
`;

const mockUser = {
  id: 'user-001',
  displayName: 'Test User',
  avatarUrl: null,
  role: 'Viewer',
  mutedAt: null,
  bannedAt: null,
  userTagText: null,
  userTagColor: null,
  createdAt: new Date(),
  lastSeenAt: null,
  googleSub: 'sub',
  email: 'test@example.com',
};

function makeSpawnMockSequence(codes: number[]) {
  let call = 0;
  vi.mocked(spawn).mockImplementation(() => {
    const code = codes[call++] ?? 0;
    const proc = new EventEmitter() as EventEmitter & { stdout: null; stderr: null };
    proc.stdout = null;
    proc.stderr = null;
    setImmediate(() => proc.emit('close', code));
    return proc as unknown as ReturnType<typeof spawn>;
  });
}

describe('parseHlsSegmentRange', () => {
  it('returns null when no DATE-TIME tags present', () => {
    expect(parseHlsSegmentRange('#EXTM3U\n#EXTINF:6.000,\nseg.ts')).toBeNull();
  });

  it('returns earliest and latest from segment timestamps', () => {
    const result = parseHlsSegmentRange(M3U8_WITH_TIMESTAMPS);
    expect(result).not.toBeNull();
    expect(result!.earliest.toISOString()).toBe('2026-03-22T10:00:00.000Z');
    // latest = last timestamp (10:00:06) + 6s duration = 10:00:12
    expect(result!.latest.toISOString()).toBe('2026-03-22T10:00:12.000Z');
  });

  it('handles single segment (latest = timestamp + duration)', () => {
    const m3u8 = `#EXTM3U\n#EXT-X-PROGRAM-DATE-TIME:2026-03-22T10:00:00.000Z\n#EXTINF:10.0,\nseg.ts`;
    const result = parseHlsSegmentRange(m3u8);
    expect(result!.latest.getTime() - result!.earliest.getTime()).toBe(10000);
  });
});

describe('getSegmentRange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (key) => {
      if (key === 'stream_started_at') return '2026-03-22T10:00:00.000Z';
      if (key === 'hls_stream_playlist') return 'video1_stream.m3u8';
      return null;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => M3U8_WITH_TIMESTAMPS }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns earliest and latest ISO strings', async () => {
    const result = await getSegmentRange();
    expect(result.earliest).toBe('2026-03-22T10:00:00.000Z');
    expect(result.latest).toBe('2026-03-22T10:00:12.000Z');
  });

  it('throws 422 when stream has not started', async () => {
    vi.mocked(streamConfig.getOrNull).mockResolvedValue(null);
    await expect(getSegmentRange()).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when playlist unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(getSegmentRange()).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when segment range cannot be parsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => '#EXTM3U\n#EXTINF:6,\nseg.ts' }),
    );
    await expect(getSegmentRange()).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('createClip', () => {
  const streamStarted = '2026-03-22T10:00:00.000Z';
  const validParams = {
    userId: 'user-001',
    userRole: 'ViewerGuest' as const,
    startTime: '2026-03-22T10:00:01.000Z',
    endTime: '2026-03-22T10:00:07.000Z',
    name: 'Test Clip',
    shareToChat: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (key) => {
      if (key === 'stream_started_at') return streamStarted;
      if (key === 'hls_stream_playlist') return 'video1_stream.m3u8';
      return null;
    });
    vi.mocked(prisma.clip.count).mockResolvedValue(0);
    vi.mocked(prisma.clip.create).mockResolvedValue({ id: 'TESTULID0000000000000001' } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => M3U8_WITH_TIMESTAMPS,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns pending clip on valid request', async () => {
    const result = await createClip(validParams);
    expect(result).toEqual({ id: 'TESTULID0000000000000001', status: 'pending' });
    expect(prisma.clip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending', shareToChat: false }),
      }),
    );
  });

  it('throws 429 when Viewer exceeds rate limit', async () => {
    vi.mocked(prisma.clip.count).mockResolvedValue(5);
    await expect(createClip(validParams)).rejects.toMatchObject({ statusCode: 429 });
  });

  it('does not rate limit Moderator', async () => {
    vi.mocked(prisma.clip.count).mockResolvedValue(5);
    const result = await createClip({ ...validParams, userRole: 'Moderator' });
    expect(result.status).toBe('pending');
  });

  it('does not rate limit Admin', async () => {
    vi.mocked(prisma.clip.count).mockResolvedValue(5);
    const result = await createClip({ ...validParams, userRole: 'Admin' });
    expect(result.status).toBe('pending');
  });

  it('throws 422 when stream has not started', async () => {
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (key) => {
      if (key === 'hls_stream_playlist') return 'video1_stream.m3u8';
      return null;
    });
    await expect(createClip(validParams)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when startTime before stream start', async () => {
    await expect(
      createClip({ ...validParams, startTime: '2026-03-22T09:59:59.000Z' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when endTime <= startTime', async () => {
    await expect(
      createClip({ ...validParams, endTime: '2026-03-22T10:00:01.000Z' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when duration > 2 minutes', async () => {
    await expect(
      createClip({
        ...validParams,
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:02:02.000Z',
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when name exceeds 200 chars', async () => {
    await expect(createClip({ ...validParams, name: 'a'.repeat(201) })).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('throws 422 when description exceeds 500 chars', async () => {
    await expect(
      createClip({ ...validParams, description: 'a'.repeat(501) }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when startTime is invalid ISO', async () => {
    await expect(createClip({ ...validParams, startTime: 'not-a-date' })).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('throws 422 when playlist unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(createClip(validParams)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when segment range cannot be parsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => '#EXTM3U\n#EXTINF:6,\nseg.ts' }),
    );
    await expect(createClip(validParams)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when times outside segment range', async () => {
    await expect(
      createClip({
        ...validParams,
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:00:20.000Z', // beyond 10:00:12
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('fetches and caches stream playlist name when not cached', async () => {
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (key) => {
      if (key === 'stream_started_at') return streamStarted;
      return null; // no cached playlist name
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '#EXTM3U\nvideo1_stream.m3u8\n',
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => M3U8_WITH_TIMESTAMPS,
        }),
    );
    await createClip(validParams);
    expect(streamConfig.set).toHaveBeenCalledWith('hls_stream_playlist', 'video1_stream.m3u8');
  });

  it('throws 422 when index.m3u8 unavailable (cache miss)', async () => {
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (key) => {
      if (key === 'stream_started_at') return streamStarted;
      return null;
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(createClip(validParams)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when index.m3u8 has no stream playlist (cache miss)', async () => {
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (key) => {
      if (key === 'stream_started_at') return streamStarted;
      return null;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => '#EXTM3U\n# comment\n' }),
    );
    await expect(createClip(validParams)).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('processClip', () => {
  const clipParams = {
    clipId: 'TESTULID0000000000000001',
    seekOffsetSeconds: 1,
    durationSeconds: 6,
    playlistUrl: 'http://127.0.0.1:8090/cam/video1_stream.m3u8',
  };

  const pendingClip = {
    id: 'TESTULID0000000000000001',
    userId: 'user-001',
    name: 'Test Clip',
    description: null,
    status: 'pending',
    visibility: 'private',
    s3Key: null,
    thumbnailKey: null,
    durationSeconds: null,
    shareToChat: false,
    showClipper: false,
    showClipperAvatar: false,
    clipperName: null,
    clipperAvatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
    lastEditedAt: null,
    deletedAt: null,
    user: mockUser,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(pendingClip as never);
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...pendingClip,
      status: 'ready',
      s3Key: 'clips/TESTULID0000000000000001.mp4',
      thumbnailKey: 'clips/TESTULID0000000000000001-thumb.jpg',
      durationSeconds: 6,
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => fn(prisma as never));
    vi.mocked(prisma.message.create).mockResolvedValue({} as never);
  });

  it('processes clip successfully: ffmpeg + S3 + sendToUser when shareToChat=false', async () => {
    makeSpawnMockSequence([0, 0]); // video + thumbnail
    await processClip(clipParams);
    expect(uploadToS3).toHaveBeenCalledTimes(2);
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ready' }),
      }),
    );
    expect(wsHub.sendToUser).toHaveBeenCalledWith(
      'user-001',
      expect.objectContaining({
        type: 'clip:status-changed',
        payload: expect.objectContaining({ status: 'ready' }),
      }),
    );
    expect(wsHub.broadcast).not.toHaveBeenCalled();
  });

  it('broadcasts to all when shareToChat=true', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...pendingClip,
      shareToChat: true,
    } as never);
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...pendingClip,
      shareToChat: true,
      status: 'ready',
      s3Key: 'clips/TESTULID0000000000000001.mp4',
      thumbnailKey: 'clips/TESTULID0000000000000001-thumb.jpg',
      durationSeconds: 6,
    } as never);
    makeSpawnMockSequence([0, 0]);
    await processClip(clipParams);
    expect(wsHub.broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'chat:message' }));
    expect(wsHub.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clip:status-changed' }),
    );
    expect(wsHub.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clip:visibility-changed' }),
    );
  });

  it('retries ffmpeg once and succeeds on second attempt', async () => {
    makeSpawnMockSequence([1, 0, 0, 0]); // video fail, video success, thumb success
    await processClip(clipParams);
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ready' }) }),
    );
  });

  it('sets status failed after two ffmpeg failures', async () => {
    makeSpawnMockSequence([1, 1]); // both fail
    await processClip(clipParams);
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
    expect(wsHub.sendToUser).toHaveBeenCalledWith(
      'user-001',
      expect.objectContaining({ payload: expect.objectContaining({ status: 'failed' }) }),
    );
  });

  it('sets status failed and cleans up when S3 upload fails', async () => {
    makeSpawnMockSequence([0, 0]);
    vi.mocked(uploadToS3).mockRejectedValueOnce(new Error('S3 error'));
    await processClip(clipParams);
    expect(deleteS3Objects).toHaveBeenCalled();
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
  });

  it('handles ffmpeg spawn error', async () => {
    vi.mocked(spawn).mockImplementation(() => {
      const p = new EventEmitter();
      setImmediate(() => p.emit('error', new Error('spawn ENOENT')));
      return p as unknown as ReturnType<typeof spawn>;
    });
    await processClip(clipParams);
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
  });
});

describe('getClip', () => {
  const clip = {
    id: 'clip-001',
    userId: 'user-001',
    name: 'My Clip',
    description: null,
    status: 'ready',
    visibility: 'private',
    s3Key: 'clips/clip-001.mp4',
    thumbnailKey: 'clips/clip-001-thumb.jpg',
    durationSeconds: 10,
    shareToChat: false,
    showClipper: false,
    showClipperAvatar: false,
    clipperName: null,
    clipperAvatarUrl: null,
    createdAt: new Date('2026-03-22T10:00:00.000Z'),
    updatedAt: null,
    lastEditedAt: null,
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns clip for owner', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    const result = await getClip({
      clipId: 'clip-001',
      requestingUserId: 'user-001',
      requestingUserRole: 'Viewer',
    });
    expect(result).toMatchObject({ id: 'clip-001', name: 'My Clip' });
    expect(result.thumbnailUrl).toBe('https://cdn.example.com/clips/clip-001-thumb.jpg');
  });

  it('returns clip for Admin', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...clip,
      visibility: 'private',
    } as never);
    const result = await getClip({
      clipId: 'clip-001',
      requestingUserId: 'other',
      requestingUserRole: 'Admin',
    });
    expect(result.id).toBe('clip-001');
  });

  it('throws 404 for Moderator viewing others private clip', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    await expect(
      getClip({ clipId: 'clip-001', requestingUserId: 'other', requestingUserRole: 'Moderator' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns shared clip for Moderator', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({ ...clip, visibility: 'shared' } as never);
    const result = await getClip({
      clipId: 'clip-001',
      requestingUserId: 'other',
      requestingUserRole: 'Moderator',
    });
    expect(result.id).toBe('clip-001');
  });

  it('throws 401 for unauthenticated user and non-public clip', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    await expect(getClip({ clipId: 'clip-001' })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('returns clip for unauthenticated user when public', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({ ...clip, visibility: 'public' } as never);
    const result = await getClip({ clipId: 'clip-001' });
    expect(result.id).toBe('clip-001');
  });

  it('throws 404 when clip not found', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(null);
    await expect(
      getClip({ clipId: 'clip-001', requestingUserId: 'user-001' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when clip soft-deleted', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...clip,
      deletedAt: new Date(),
    } as never);
    await expect(
      getClip({ clipId: 'clip-001', requestingUserId: 'user-001' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 for authenticated viewer viewing others private clip', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    await expect(
      getClip({ clipId: 'clip-001', requestingUserId: 'other', requestingUserRole: 'Viewer' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns null thumbnailUrl when thumbnailKey is null', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({ ...clip, thumbnailKey: null } as never);
    const result = await getClip({ clipId: 'clip-001', requestingUserId: 'user-001' });
    expect(result.thumbnailUrl).toBeNull();
  });

  it('includes updatedAt ISO string when not null', async () => {
    const updatedAt = new Date('2026-03-22T11:00:00.000Z');
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({ ...clip, updatedAt } as never);
    const result = await getClip({ clipId: 'clip-001', requestingUserId: 'user-001' });
    expect(result.updatedAt).toBe('2026-03-22T11:00:00.000Z');
  });
});

describe('getClipDownloadUrl', () => {
  const clip = {
    id: 'clip-001',
    userId: 'user-001',
    name: 'My Test Clip',
    status: 'ready',
    visibility: 'private',
    s3Key: 'clips/clip-001.mp4',
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(presignGetObject).mockResolvedValue('https://presigned.example.com/video');
  });

  it('throws 401 when unauthenticated', async () => {
    await expect(getClipDownloadUrl({ clipId: 'clip-001' })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('throws 404 when clip not found', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(null);
    await expect(
      getClipDownloadUrl({ clipId: 'clip-001', requestingUserId: 'user-001' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when soft-deleted', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...clip,
      deletedAt: new Date(),
    } as never);
    await expect(
      getClipDownloadUrl({ clipId: 'clip-001', requestingUserId: 'user-001' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when no access', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    await expect(
      getClipDownloadUrl({
        clipId: 'clip-001',
        requestingUserId: 'other',
        requestingUserRole: 'Viewer',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 when clip not ready', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({ ...clip, status: 'pending' } as never);
    await expect(
      getClipDownloadUrl({ clipId: 'clip-001', requestingUserId: 'user-001' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 404 when s3Key is null', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({ ...clip, s3Key: null } as never);
    await expect(
      getClipDownloadUrl({ clipId: 'clip-001', requestingUserId: 'user-001' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns presigned URL for owner', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    const url = await getClipDownloadUrl({ clipId: 'clip-001', requestingUserId: 'user-001' });
    expect(url).toBe('https://presigned.example.com/video');
    expect(presignGetObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'clips/clip-001.mp4',
        contentDisposition: 'attachment; filename="my-test-clip.mp4"',
      }),
    );
  });

  it('returns presigned URL for Admin', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    const url = await getClipDownloadUrl({
      clipId: 'clip-001',
      requestingUserId: 'admin-1',
      requestingUserRole: 'Admin',
    });
    expect(url).toBe('https://presigned.example.com/video');
  });

  it('uses clipId as filename when name slugifies to empty', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({ ...clip, name: '!!!' } as never);
    await getClipDownloadUrl({ clipId: 'clip-001', requestingUserId: 'user-001' });
    expect(presignGetObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentDisposition: 'attachment; filename="clip-001.mp4"' }),
    );
  });

  it('allows Moderator to download shared clip', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({ ...clip, visibility: 'shared' } as never);
    const url = await getClipDownloadUrl({
      clipId: 'clip-001',
      requestingUserId: 'mod-1',
      requestingUserRole: 'Moderator',
    });
    expect(url).toBe('https://presigned.example.com/video');
  });

  it('allows anyone to download public clip', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({ ...clip, visibility: 'public' } as never);
    const url = await getClipDownloadUrl({
      clipId: 'clip-001',
      requestingUserId: 'viewer-1',
      requestingUserRole: 'Viewer',
    });
    expect(url).toBe('https://presigned.example.com/video');
  });
});
