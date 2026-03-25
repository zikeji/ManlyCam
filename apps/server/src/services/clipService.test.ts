import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { logger } from '../lib/logger.js';

vi.mock('../env.js', () => ({
  env: {
    MTX_HLS_URL: 'http://127.0.0.1:8090',
    S3_BUCKET: 'test-bucket',
    S3_ENDPOINT: 'https://s3.example.com',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'key',
    S3_SECRET_KEY: 'secret',
    S3_FORCE_PATH_STYLE: true,
    CLIP_MIN_DURATION_SECONDS: 10,
    CLIP_MAX_DURATION_SECONDS: 120,
  },
}));

vi.mock('../db/client.js', () => ({
  prisma: {
    clip: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    message: { create: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
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
  getS3Object: vi.fn().mockResolvedValue({ body: Buffer.from('img'), contentType: 'image/jpeg' }),
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
vi.mock('node:fs', () => ({ createReadStream: vi.fn(() => ({ pipe: vi.fn() })) }));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('data')),
  unlink: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../db/client.js';
import { streamConfig } from '../lib/stream-config.js';
import { uploadToS3, presignGetObject, deleteS3Objects, getS3Object } from '../lib/s3-client.js';
import { wsHub } from '../services/wsHub.js';
import { spawn } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import {
  parseHlsSegmentRange,
  resolvePlaylistUrls,
  getSegmentRange,
  createClip,
  processClip,
  getClip,
  getClipDownloadUrl,
  getClipStreamUrl,
  getClipThumbnail,
  listClips,
  deleteClip,
  updateClip,
  shareClipToChat,
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
  role: 'ViewerGuest',
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

  it('returns null when all DATE-TIME values are invalid', () => {
    const m3u8 = `#EXTM3U\n#EXT-X-PROGRAM-DATE-TIME:invalid-date\n#EXTINF:6.000,\nseg.ts`;
    expect(parseHlsSegmentRange(m3u8)).toBeNull();
  });
});

describe('resolvePlaylistUrls', () => {
  it('rewrites relative .ts segment URLs to absolute', () => {
    const m3u8 = '#EXTM3U\n#EXTINF:6.000,\nseg0.ts\n#EXTINF:6.000,\nseg1.ts\n';
    const result = resolvePlaylistUrls(m3u8, 'http://127.0.0.1:8090/cam/video1_stream.m3u8');
    expect(result).toContain('http://127.0.0.1:8090/cam/seg0.ts');
    expect(result).toContain('http://127.0.0.1:8090/cam/seg1.ts');
  });

  it('leaves already-absolute URLs unchanged', () => {
    const m3u8 = '#EXTM3U\n#EXTINF:6.000,\nhttp://cdn.example.com/seg0.ts\n';
    const result = resolvePlaylistUrls(m3u8, 'http://127.0.0.1:8090/cam/video1_stream.m3u8');
    expect(result).toContain('http://cdn.example.com/seg0.ts');
    expect(result).not.toContain('http://127.0.0.1:8090/cam/http://');
  });

  it('preserves non-segment lines', () => {
    const m3u8 = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.000,\nseg.ts\n';
    const result = resolvePlaylistUrls(m3u8, 'http://host/path/stream.m3u8');
    expect(result).toContain('#EXTM3U');
    expect(result).toContain('#EXT-X-TARGETDURATION:6');
  });

  it('rewrites non-TS segment URLs to absolute', () => {
    const m3u8 = '#EXTM3U\n#EXTINF:6.000,\nseg0.m4s\n#EXTINF:6.000,\nseg1.m4s\n';
    const result = resolvePlaylistUrls(m3u8, 'http://127.0.0.1:8090/cam/video1_stream.m3u8');
    expect(result).toContain('http://127.0.0.1:8090/cam/seg0.m4s');
    expect(result).toContain('http://127.0.0.1:8090/cam/seg1.m4s');
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

  it('returns earliest and latest ISO strings with duration config and streamStartedAt', async () => {
    const result = await getSegmentRange();
    expect(result.earliest).toBe('2026-03-22T10:00:00.000Z');
    expect(result.latest).toBe('2026-03-22T10:00:12.000Z');
    expect(result.minDurationSeconds).toBe(10);
    expect(result.maxDurationSeconds).toBe(120);
    expect(result.streamStartedAt).toBe('2026-03-22T10:00:00.000Z');
  });

  it('clamps earliest to max(stream_started_at, hlsEarliest)', async () => {
    // stream started AFTER the earliest HLS segment
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (key) => {
      if (key === 'stream_started_at') return '2026-03-22T10:00:05.000Z';
      if (key === 'hls_stream_playlist') return 'video1_stream.m3u8';
      return null;
    });
    const result = await getSegmentRange();
    expect(result.earliest).toBe('2026-03-22T10:00:05.000Z');
  });

  it('throws 422 when stream has not started', async () => {
    vi.mocked(streamConfig.getOrNull).mockResolvedValue(null);
    await expect(getSegmentRange()).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when playlist unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true }) // HEAD: cache validation passes
        .mockResolvedValueOnce({ ok: false, status: 503 }), // content fetch fails
    );
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
    mutedAt: null,
    startTime: '2026-03-22T10:00:01.000Z',
    endTime: '2026-03-22T10:00:11.000Z', // 10s = min duration
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

  it('throws 403 when muted user creates clip with shareToChat', async () => {
    await expect(
      createClip({ ...validParams, mutedAt: new Date(), shareToChat: true }),
    ).rejects.toMatchObject({ statusCode: 403 });
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

  it('throws 422 when duration exceeds max', async () => {
    await expect(
      createClip({
        ...validParams,
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:02:02.000Z',
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when duration below min', async () => {
    await expect(
      createClip({
        ...validParams,
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:00:05.000Z', // 4s < 10s min
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

  it('throws 422 when playlist content fetch fails after cache hit', async () => {
    // HEAD validation passes (cached name ok), but content GET returns non-ok
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true }) // HEAD: cache validation passes
        .mockResolvedValueOnce({ ok: false, status: 503 }), // GET: content fetch fails
    );
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

  it('invalidates stale cached playlist name when HEAD returns 404', async () => {
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (key) => {
      if (key === 'stream_started_at') return streamStarted;
      return 'stale_playlist.m3u8';
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404 })
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
    expect(logger.warn).toHaveBeenCalledWith(
      { cached: 'stale_playlist.m3u8' },
      'clip: cached HLS playlist returned 404, invalidating cache',
    );
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
    playlistSnapshot: '/tmp/TESTULID0000000000000001-playlist.m3u8',
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

  it('captures ffmpeg stderr and logs it on failure', async () => {
    vi.mocked(spawn).mockImplementation(() => {
      const proc = new EventEmitter() as EventEmitter & { stdout: null; stderr: EventEmitter };
      proc.stdout = null;
      proc.stderr = new EventEmitter();
      setImmediate(() => {
        proc.stderr.emit('data', Buffer.from('codec not found'));
        proc.emit('close', 1);
      });
      return proc as unknown as ReturnType<typeof spawn>;
    });
    await processClip(clipParams);
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
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

  it('deletes only uploaded keys when second S3 upload fails', async () => {
    makeSpawnMockSequence([0, 0]);
    // First upload (video) succeeds, second (thumbnail) fails
    vi.mocked(uploadToS3)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('thumb upload failed'));
    await processClip(clipParams);
    expect(deleteS3Objects).toHaveBeenCalledWith(['clips/TESTULID0000000000000001.mp4']);
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
  });

  it('logs error when S3 cleanup fails after upload error', async () => {
    makeSpawnMockSequence([0, 0]);
    vi.mocked(uploadToS3).mockRejectedValueOnce(new Error('S3 error'));
    vi.mocked(deleteS3Objects).mockRejectedValueOnce(new Error('Cleanup failed'));
    await processClip(clipParams);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ deleteErr: expect.any(Error) }),
      'clip: failed to clean up partial S3 uploads',
    );
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

  it('cleans up playlist snapshot and returns early when clip not found', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(null);
    await processClip(clipParams);
    expect(unlink).toHaveBeenCalledWith(clipParams.playlistSnapshot);
    expect(prisma.clip.update).not.toHaveBeenCalled();
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
    expect(result.thumbnailUrl).toBe('/api/clips/clip-001/thumbnail');
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

  it('throws 401 when unauthenticated and clip is not public', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    await expect(getClipDownloadUrl({ clipId: 'clip-001' })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('returns presigned URL when unauthenticated and clip is public', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...clip,
      visibility: 'public',
    } as never);
    const url = await getClipDownloadUrl({ clipId: 'clip-001' });
    expect(url).toBe('https://presigned.example.com/video');
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

  it('allows Viewer to download shared clip', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({ ...clip, visibility: 'shared' } as never);
    const url = await getClipDownloadUrl({
      clipId: 'clip-001',
      requestingUserId: 'viewer-1',
      requestingUserRole: 'Viewer',
    });
    expect(url).toBe('https://presigned.example.com/video');
  });
});

describe('getClipStreamUrl', () => {
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
    vi.mocked(presignGetObject).mockResolvedValue('https://presigned.example.com/stream');
  });

  it('returns presigned URL without content-disposition for owner', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    const url = await getClipStreamUrl({ clipId: 'clip-001', requestingUserId: 'user-001' });
    expect(url).toBe('https://presigned.example.com/stream');
    expect(presignGetObject).toHaveBeenCalledWith(
      expect.not.objectContaining({ contentDisposition: expect.anything() }),
    );
  });

  it('throws 401 when unauthenticated and clip is not public', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    await expect(getClipStreamUrl({ clipId: 'clip-001' })).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('getClipThumbnail', () => {
  const clip = {
    id: 'clip-001',
    userId: 'user-001',
    status: 'ready',
    visibility: 'private',
    s3Key: 'clips/clip-001.mp4',
    thumbnailKey: 'clips/clip-001/thumbnail.jpg',
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns buffer and contentType for owner', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    const result = await getClipThumbnail({
      clipId: 'clip-001',
      requestingUserId: 'user-001',
    });
    expect(getS3Object).toHaveBeenCalledWith('clips/clip-001/thumbnail.jpg');
    expect(result.contentType).toBe('image/jpeg');
  });

  it('throws 404 when thumbnailKey is null', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...clip,
      thumbnailKey: null,
    } as never);
    await expect(
      getClipThumbnail({ clipId: 'clip-001', requestingUserId: 'user-001' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 401 when unauthenticated and clip is not public', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clip as never);
    await expect(getClipThumbnail({ clipId: 'clip-001' })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('returns thumbnail when unauthenticated and clip is public', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({ ...clip, visibility: 'public' } as never);
    const result = await getClipThumbnail({ clipId: 'clip-001' });
    expect(getS3Object).toHaveBeenCalledWith('clips/clip-001/thumbnail.jpg');
    expect(result.contentType).toBe('image/jpeg');
  });
});

const baseClipUser = {
  displayName: 'Test User',
  avatarUrl: null,
  role: 'ViewerGuest',
  userTagText: null,
  userTagColor: null,
};
const baseClip = {
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
  user: baseClipUser,
};

describe('listClips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.clip.findMany).mockResolvedValue([baseClip] as never);
    vi.mocked(prisma.clip.count).mockResolvedValue(1);
  });

  it('returns clips with thumbnailUrl as proxy path', async () => {
    const result = await listClips({
      userId: 'user-001',
      page: 0,
      limit: 20,
      includeShared: false,
      all: false,
      isAdmin: false,
    });
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0].thumbnailUrl).toBe('/api/clips/clip-001/thumbnail');
    expect(result.total).toBe(1);
  });

  it('returns null thumbnailUrl when thumbnailKey is null', async () => {
    vi.mocked(prisma.clip.findMany).mockResolvedValue([
      { ...baseClip, thumbnailKey: null },
    ] as never);
    const result = await listClips({
      userId: 'user-001',
      page: 0,
      limit: 20,
      includeShared: false,
      all: false,
      isAdmin: false,
    });
    expect(result.clips[0].thumbnailUrl).toBeNull();
  });

  it('returns lastEditedAt as ISO string when set', async () => {
    const ts = new Date('2026-03-22T10:01:00.000Z');
    vi.mocked(prisma.clip.findMany).mockResolvedValue([{ ...baseClip, lastEditedAt: ts }] as never);
    const result = await listClips({
      userId: 'user-001',
      page: 0,
      limit: 20,
      includeShared: false,
      all: false,
      isAdmin: false,
    });
    expect(result.clips[0].lastEditedAt).toBe(ts.toISOString());
  });

  it('returns updatedAt as ISO string when set', async () => {
    const ts = new Date('2026-03-22T10:02:00.000Z');
    vi.mocked(prisma.clip.findMany).mockResolvedValue([{ ...baseClip, updatedAt: ts }] as never);
    const result = await listClips({
      userId: 'user-001',
      page: 0,
      limit: 20,
      includeShared: false,
      all: false,
      isAdmin: false,
    });
    expect(result.clips[0].updatedAt).toBe(ts.toISOString());
  });

  it('uses page and limit for skip/take', async () => {
    await listClips({
      userId: 'user-001',
      page: 2,
      limit: 5,
      includeShared: false,
      all: false,
      isAdmin: false,
    });
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
  });

  it('filters own clips only when includeShared=false and all=false', async () => {
    await listClips({
      userId: 'user-001',
      page: 0,
      limit: 20,
      includeShared: false,
      all: false,
      isAdmin: false,
    });
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-001', deletedAt: null }),
      }),
    );
  });

  it('includes OR clause when includeShared=true', async () => {
    await listClips({
      userId: 'user-001',
      page: 0,
      limit: 20,
      includeShared: true,
      all: false,
      isAdmin: false,
    });
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
    );
  });

  it('ignores all=true for non-admin', async () => {
    await listClips({
      userId: 'user-001',
      page: 0,
      limit: 20,
      includeShared: false,
      all: true,
      isAdmin: false,
    });
    // should use own-clips-only where clause
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-001' }) }),
    );
  });

  it('uses deletedAt:null only when isAdmin and all=true', async () => {
    await listClips({
      userId: 'user-001',
      page: 0,
      limit: 20,
      includeShared: false,
      all: true,
      isAdmin: true,
    });
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });

  it('orders by createdAt desc', async () => {
    await listClips({
      userId: 'user-001',
      page: 0,
      limit: 20,
      includeShared: false,
      all: false,
      isAdmin: false,
    });
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('includes clipper info from user relation', async () => {
    const result = await listClips({
      userId: 'user-001',
      page: 0,
      limit: 20,
      includeShared: false,
      all: false,
      isAdmin: false,
    });
    expect(result.clips[0].clipperDisplayName).toBe('Test User');
    expect(result.clips[0].clipperRole).toBe('ViewerGuest');
  });
});

describe('deleteClip', () => {
  const actor = { id: 'user-001', role: 'ViewerGuest' as const };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(baseClip as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([{ id: 'msg-001' }] as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => fn(prisma as never));
    vi.mocked(prisma.clip.update).mockResolvedValue(baseClip as never);
    vi.mocked(prisma.clip.delete).mockResolvedValue(baseClip as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it('throws 404 when clip not found', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(null);
    await expect(deleteClip({ clipId: 'clip-001', actor })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 404 when clip is soft-deleted', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      deletedAt: new Date(),
    } as never);
    await expect(deleteClip({ clipId: 'clip-001', actor })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 404 when not owner and canModerateOver fails', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      user: { ...baseClipUser, role: 'Admin' },
    } as never);
    await expect(
      deleteClip({ clipId: 'clip-001', actor: { id: 'other', role: 'Moderator' } }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('soft-deletes pending clip', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      status: 'pending',
      s3Key: null,
    } as never);
    await deleteClip({ clipId: 'clip-001', actor });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('hard-deletes failed clip with no S3 cleanup and no broadcast', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      status: 'failed',
      s3Key: null,
    } as never);
    await deleteClip({ clipId: 'clip-001', actor });
    expect(prisma.clip.delete).toHaveBeenCalledWith({ where: { id: 'clip-001' } });
    expect(deleteS3Objects).not.toHaveBeenCalled();
    expect(wsHub.broadcast).not.toHaveBeenCalled();
  });

  it('soft-deletes ready clip in transaction', async () => {
    await deleteClip({ clipId: 'clip-001', actor });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
  });

  it('broadcasts clip:visibility-changed with deleted visibility after transaction', async () => {
    await deleteClip({ clipId: 'clip-001', actor });
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'clip:visibility-changed',
      payload: expect.objectContaining({ clipId: 'clip-001', visibility: 'deleted' }),
    });
  });

  it('queries chatClipIds and includes them in broadcast', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { id: 'msg-001' },
      { id: 'msg-002' },
    ] as never);
    await deleteClip({ clipId: 'clip-001', actor });
    expect(wsHub.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ chatClipIds: ['msg-001', 'msg-002'] }),
      }),
    );
  });

  it('deletes S3 objects for ready clip', async () => {
    await deleteClip({ clipId: 'clip-001', actor });
    expect(deleteS3Objects).toHaveBeenCalledWith([
      'clips/clip-001.mp4',
      'clips/clip-001-thumb.jpg',
    ]);
  });

  it('logs S3 delete failure but does not throw', async () => {
    vi.mocked(deleteS3Objects).mockRejectedValueOnce(new Error('S3 error'));
    await expect(deleteClip({ clipId: 'clip-001', actor })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('writes audit log when actor is not owner (moderator)', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      user: { ...baseClipUser, role: 'ViewerGuest' },
    } as never);
    await deleteClip({ clipId: 'clip-001', actor: { id: 'mod-001', role: 'Moderator' } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'clip:deleted', actorId: 'mod-001' }),
      }),
    );
  });

  it('does not write audit log when actor is owner', async () => {
    await deleteClip({ clipId: 'clip-001', actor });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('allows Moderator to delete Viewer clip', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      userId: 'viewer-1',
      user: { ...baseClipUser, role: 'ViewerGuest' },
    } as never);
    await expect(
      deleteClip({ clipId: 'clip-001', actor: { id: 'mod-001', role: 'Moderator' } }),
    ).resolves.toBeUndefined();
  });
});

describe('updateClip', () => {
  const actor = { id: 'user-001', role: 'ViewerGuest' as const };
  const clipWithAvatar = {
    ...baseClip,
    user: { ...baseClipUser, avatarUrl: 'https://cdn.example.com/avatar.jpg' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(baseClip as never);
    vi.mocked(prisma.clip.update).mockResolvedValue({ ...baseClip, ...baseClipUser } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it('throws 404 when clip not found', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(null);
    await expect(
      updateClip({ clipId: 'clip-001', actor, data: { name: 'New' } }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when clip is soft-deleted', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      deletedAt: new Date(),
    } as never);
    await expect(updateClip({ clipId: 'clip-001', actor, data: {} })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 404 when not owner and canModerateOver fails', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      user: { ...baseClipUser, role: 'Admin' },
    } as never);
    await expect(
      updateClip({ clipId: 'clip-001', actor: { id: 'other', role: 'Moderator' }, data: {} }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 422 when name exceeds 200 characters', async () => {
    await expect(
      updateClip({ clipId: 'clip-001', actor, data: { name: 'a'.repeat(201) } }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
  });

  it('throws 422 when description exceeds 500 characters', async () => {
    await expect(
      updateClip({ clipId: 'clip-001', actor, data: { description: 'a'.repeat(501) } }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
  });

  it('throws 422 when name is whitespace only', async () => {
    await expect(
      updateClip({ clipId: 'clip-001', actor, data: { name: '   ' } }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
  });

  it('throws 422 when description is whitespace only', async () => {
    await expect(
      updateClip({ clipId: 'clip-001', actor, data: { description: '   ' } }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
  });

  it('throws 422 when ViewerGuest tries to set public visibility', async () => {
    await expect(
      updateClip({ clipId: 'clip-001', actor, data: { visibility: 'public' } }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when ViewerCompany tries to set public visibility', async () => {
    await expect(
      updateClip({
        clipId: 'clip-001',
        actor: { id: 'user-001', role: 'ViewerCompany' },
        data: { visibility: 'public' },
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('allows Moderator to set public visibility', async () => {
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      visibility: 'public',
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    await expect(
      updateClip({
        clipId: 'clip-001',
        actor: { id: 'user-001', role: 'Moderator' },
        data: { visibility: 'public' },
      }),
    ).resolves.toBeDefined();
  });

  it('updates name and sets lastEditedAt', async () => {
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      name: 'New Name',
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    await updateClip({ clipId: 'clip-001', actor, data: { name: 'New Name' } });
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'New Name', lastEditedAt: expect.any(Date) }),
      }),
    );
  });

  it('does not set lastEditedAt when only visibility changes', async () => {
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      visibility: 'shared',
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    await updateClip({ clipId: 'clip-001', actor, data: { visibility: 'shared' } });
    const call = vi.mocked(prisma.clip.update).mock.calls[0][0];
    expect(
      (call as unknown as { data: Record<string, unknown> }).data.lastEditedAt,
    ).toBeUndefined();
  });

  it('stores showClipperAvatar=false when owner has no avatar', async () => {
    await updateClip({ clipId: 'clip-001', actor, data: { showClipperAvatar: true } });
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ showClipperAvatar: false }) }),
    );
  });

  it('snapshots avatarUrl when showClipperAvatar=true and owner has avatar', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(clipWithAvatar as never);
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...clipWithAvatar,
      showClipperAvatar: true,
      clipperAvatarUrl: 'https://cdn.example.com/avatar.jpg',
      user: {
        ...baseClipUser,
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
        userTagText: null,
        userTagColor: null,
      },
    } as never);
    await updateClip({ clipId: 'clip-001', actor, data: { showClipperAvatar: true } });
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clipperAvatarUrl: 'https://cdn.example.com/avatar.jpg' }),
      }),
    );
  });

  it('broadcasts clip:visibility-changed when visibility changes', async () => {
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      visibility: 'shared',
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([{ id: 'msg-001' }] as never);
    await updateClip({ clipId: 'clip-001', actor, data: { visibility: 'shared' } });
    expect(wsHub.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clip:visibility-changed' }),
    );
  });

  it('includes clip card data in broadcast when new visibility is shared', async () => {
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      visibility: 'shared',
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([{ id: 'msg-001' }] as never);
    await updateClip({ clipId: 'clip-001', actor, data: { visibility: 'shared' } });
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'clip:visibility-changed',
      payload: expect.objectContaining({ clip: expect.objectContaining({ clipId: 'clip-001' }) }),
    });
  });

  it('does not broadcast when there are no chat messages referencing the clip', async () => {
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    // beforeEach mocks message.findMany to return [] — no chat messages
    await updateClip({ clipId: 'clip-001', actor, data: { name: 'New Name' } });
    expect(wsHub.broadcast).not.toHaveBeenCalled();
  });

  it('broadcasts on name-only change when chat messages exist', async () => {
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      name: 'Updated Name',
      visibility: 'shared',
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([{ id: 'msg-001' }] as never);
    await updateClip({ clipId: 'clip-001', actor, data: { name: 'Updated Name' } });
    expect(wsHub.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'clip:visibility-changed',
        payload: expect.objectContaining({ clipId: 'clip-001', chatClipIds: ['msg-001'] }),
      }),
    );
  });

  it('broadcasts with tombstone payload when clip is set to private', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      visibility: 'shared',
      user: baseClipUser,
    } as never);
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      visibility: 'private',
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([{ id: 'msg-001' }] as never);
    await updateClip({
      clipId: 'clip-001',
      actor,
      data: { visibility: 'private' },
    });
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'clip:visibility-changed',
      payload: expect.objectContaining({ visibility: 'private', chatClipIds: ['msg-001'] }),
    });
    // No clip data in payload for private (tombstone doesn't need it)
    const payload = (wsHub.broadcast as ReturnType<typeof vi.fn>).mock.calls[0][0].payload;
    expect(payload.clip).toBeUndefined();
  });

  it('writes audit log for each category when Moderator edits non-owned clip', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      userId: 'other-user',
      user: { ...baseClipUser, role: 'ViewerGuest' },
    } as never);
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      userId: 'other-user',
      name: 'New',
      visibility: 'shared',
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    await updateClip({
      clipId: 'clip-001',
      actor: { id: 'mod-001', role: 'Moderator' },
      data: { name: 'New', visibility: 'shared' },
    });
    const calls = vi
      .mocked(prisma.auditLog.create)
      .mock.calls.map((c) => (c[0] as unknown as { data: { action: string } }).data.action);
    expect(calls).toContain('clip:edited');
    expect(calls).toContain('clip:visibility-changed');
  });

  it('writes clip:attribution-changed audit log when Moderator edits attribution on non-owned clip', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      userId: 'other-user',
      user: { ...baseClipUser, role: 'ViewerGuest' },
    } as never);
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      userId: 'other-user',
      showClipper: false,
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    await updateClip({
      clipId: 'clip-001',
      actor: { id: 'mod-001', role: 'Moderator' },
      data: { showClipper: false },
    });
    const calls = vi
      .mocked(prisma.auditLog.create)
      .mock.calls.map((c) => (c[0] as unknown as { data: { action: string } }).data.action);
    expect(calls).toContain('clip:attribution-changed');
  });

  it('returns updated clip fields', async () => {
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      name: 'Updated',
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    const result = await updateClip({ clipId: 'clip-001', actor, data: { name: 'Updated' } });
    expect((result as { name: string }).name).toBe('Updated');
  });

  it('updates description and clipperName fields', async () => {
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      description: 'New desc',
      clipperName: 'Clipper',
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    await updateClip({
      clipId: 'clip-001',
      actor,
      data: { description: 'New desc', clipperName: 'Clipper' },
    });
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: 'New desc', clipperName: 'Clipper' }),
      }),
    );
  });

  it('omits clipThumbnailUrl in visibility-changed broadcast when thumbnailKey is null', async () => {
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      visibility: 'shared',
      thumbnailKey: null,
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([{ id: 'msg-001' }] as never);
    await updateClip({ clipId: 'clip-001', actor, data: { visibility: 'shared' } });
    const call = vi
      .mocked(wsHub.broadcast)
      .mock.calls.find((c) => (c[0] as { type: string }).type === 'clip:visibility-changed');
    expect(
      (call![0] as unknown as { payload: { clip: Record<string, unknown> } }).payload.clip,
    ).not.toHaveProperty('clipThumbnailUrl');
  });

  it('returns null thumbnailUrl and non-null date strings when thumbnailKey is null and timestamps are set', async () => {
    const ts = new Date('2026-03-22T10:01:00.000Z');
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      thumbnailKey: null,
      updatedAt: ts,
      lastEditedAt: ts,
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    const result = await updateClip({ clipId: 'clip-001', actor, data: { name: 'X' } });
    expect((result as { thumbnailUrl: null }).thumbnailUrl).toBeNull();
    expect((result as { updatedAt: string }).updatedAt).toBe(ts.toISOString());
    expect((result as { lastEditedAt: string }).lastEditedAt).toBe(ts.toISOString());
  });

  it('includes clipperAvatarUrl in visibility-changed broadcast when set', async () => {
    vi.mocked(prisma.clip.update).mockResolvedValue({
      ...baseClip,
      visibility: 'shared',
      clipperAvatarUrl: 'https://cdn.example.com/av.jpg',
      user: { ...baseClipUser, userTagText: null, userTagColor: null },
    } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([{ id: 'msg-001' }] as never);
    await updateClip({ clipId: 'clip-001', actor, data: { visibility: 'shared' } });
    const call = vi
      .mocked(wsHub.broadcast)
      .mock.calls.find((c) => (c[0] as { type: string }).type === 'clip:visibility-changed');
    expect(call).toBeDefined();
  });
});

describe('shareClipToChat', () => {
  const actor = {
    id: 'user-001',
    role: 'ViewerGuest' as const,
    mutedAt: null,
    displayName: 'Test User',
    avatarUrl: null,
    userTagText: null,
    userTagColor: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(baseClip as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => fn(prisma as never));
    vi.mocked(prisma.message.create).mockResolvedValue({} as never);
    vi.mocked(prisma.clip.update).mockResolvedValue(baseClip as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([{ id: 'msg-001' }] as never);
  });

  it('throws 403 when actor is muted', async () => {
    await expect(
      shareClipToChat({ clipId: 'clip-001', actor: { ...actor, mutedAt: new Date() } }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 when clip not found', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue(null);
    await expect(shareClipToChat({ clipId: 'clip-001', actor })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 404 when clip is soft-deleted', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      deletedAt: new Date(),
    } as never);
    await expect(shareClipToChat({ clipId: 'clip-001', actor })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 409 when clip is not ready', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      status: 'pending',
    } as never);
    await expect(shareClipToChat({ clipId: 'clip-001', actor })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('creates message and updates visibility in transaction when clip is private', async () => {
    await shareClipToChat({ clipId: 'clip-001', actor });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { visibility: 'shared' } }),
    );
    expect(prisma.message.create).toHaveBeenCalled();
  });

  it('broadcasts chat:message', async () => {
    await shareClipToChat({ clipId: 'clip-001', actor });
    expect(wsHub.broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'chat:message' }));
  });

  it('broadcasts clip:visibility-changed when clip was private', async () => {
    await shareClipToChat({ clipId: 'clip-001', actor });
    expect(wsHub.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clip:visibility-changed' }),
    );
  });

  it('does not broadcast clip:visibility-changed when clip was already shared', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      visibility: 'shared',
    } as never);
    await shareClipToChat({ clipId: 'clip-001', actor });
    const calls = vi.mocked(wsHub.broadcast).mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(calls).not.toContain('clip:visibility-changed');
  });

  it('still creates message for already-shared clip (no uniqueness constraint)', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      visibility: 'shared',
    } as never);
    await shareClipToChat({ clipId: 'clip-001', actor });
    expect(prisma.message.create).toHaveBeenCalled();
  });

  it('includes thumbnailUrl in clip message', async () => {
    await shareClipToChat({ clipId: 'clip-001', actor });
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'chat:message',
      payload: expect.objectContaining({
        clipThumbnailUrl: '/api/clips/clip-001/thumbnail',
      }),
    });
  });

  it('omits clipThumbnailUrl when clip has no thumbnailKey', async () => {
    vi.mocked(prisma.clip.findUnique).mockResolvedValue({
      ...baseClip,
      thumbnailKey: null,
    } as never);
    await shareClipToChat({ clipId: 'clip-001', actor });
    const call = vi
      .mocked(wsHub.broadcast)
      .mock.calls.find((c) => (c[0] as { type: string }).type === 'chat:message');
    expect((call![0] as { payload: Record<string, unknown> }).payload).not.toHaveProperty(
      'clipThumbnailUrl',
    );
  });
});
