import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { logger } from '../lib/logger.js';

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
vi.mock('node:fs', () => ({ createReadStream: vi.fn(() => ({ pipe: vi.fn() })) }));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('data')),
  unlink: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../db/client.js';
import { streamConfig } from '../lib/stream-config.js';
import { uploadToS3, presignGetObject, deleteS3Objects } from '../lib/s3-client.js';
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
