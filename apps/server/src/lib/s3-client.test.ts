import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: {
    S3_ENDPOINT: 'https://s3.example.com',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'key',
    S3_SECRET_KEY: 'secret',
    S3_FORCE_PATH_STYLE: true,
    S3_BUCKET: 'test-bucket',
  },
}));

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn().mockResolvedValue({}) }));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...original,
    S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand: vi
      .fn()
      .mockImplementation((input: unknown) => ({ input, _tag: 'PutObject' })),
    GetObjectCommand: vi
      .fn()
      .mockImplementation((input: unknown) => ({ input, _tag: 'GetObject' })),
    DeleteObjectsCommand: vi
      .fn()
      .mockImplementation((input: unknown) => ({ input, _tag: 'DeleteObjects' })),
    AbortMultipartUploadCommand: vi
      .fn()
      .mockImplementation((input: unknown) => ({ input, _tag: 'AbortMultipartUpload' })),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://presigned.example.com/key'),
}));

import {
  s3Client,
  uploadToS3,
  presignGetObject,
  getS3Object,
  deleteS3Objects,
  abortMultipartUpload,
} from './s3-client.js';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

describe('s3Client singleton', () => {
  it('exports an S3Client instance', () => {
    expect(s3Client).toBeDefined();
    expect(S3Client).toHaveBeenCalled();
  });
});

describe('uploadToS3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  it('calls PutObjectCommand with key, body, contentType', async () => {
    const body = Buffer.from('data');
    await uploadToS3({ key: 'clips/test.mp4', body, contentType: 'video/mp4' });
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'clips/test.mp4',
        ContentType: 'video/mp4',
      }),
    );
    expect(mockSend).toHaveBeenCalled();
  });

  it('does not include ACL field', async () => {
    await uploadToS3({ key: 'clips/test.mp4', body: Buffer.from(''), contentType: 'video/mp4' });
    const call = vi.mocked(PutObjectCommand).mock.calls[0][0];
    expect(call).not.toHaveProperty('ACL');
  });
});

describe('presignGetObject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSignedUrl).mockResolvedValue('https://presigned.example.com/key');
  });

  it('returns signed URL', async () => {
    const url = await presignGetObject({ key: 'clips/test.mp4' });
    expect(url).toBe('https://presigned.example.com/key');
  });

  it('passes contentDisposition when provided', async () => {
    await presignGetObject({
      key: 'clips/test.mp4',
      contentDisposition: 'attachment; filename="test.mp4"',
    });
    expect(GetObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ ResponseContentDisposition: 'attachment; filename="test.mp4"' }),
    );
  });

  it('uses default expiresIn of 3600', async () => {
    await presignGetObject({ key: 'clips/test.mp4' });
    expect(getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      expiresIn: 3600,
    });
  });

  it('uses custom expiresIn', async () => {
    await presignGetObject({ key: 'clips/test.mp4', expiresIn: 1800 });
    expect(getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      expiresIn: 1800,
    });
  });

  it('does not pass ResponseContentDisposition when not provided', async () => {
    await presignGetObject({ key: 'clips/test.mp4' });
    const call = vi.mocked(GetObjectCommand).mock.calls[0][0];
    expect(call).not.toHaveProperty('ResponseContentDisposition');
  });
});

describe('getS3Object', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns body buffer and contentType', async () => {
    const fakeBytes = new Uint8Array([1, 2, 3]);
    mockSend.mockResolvedValue({
      Body: { transformToByteArray: vi.fn().mockResolvedValue(fakeBytes) },
      ContentType: 'image/jpeg',
    });
    const result = await getS3Object('clips/clip-001/thumbnail.jpg');
    expect(GetObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: 'test-bucket', Key: 'clips/clip-001/thumbnail.jpg' }),
    );
    expect(result.body).toEqual(Buffer.from(fakeBytes));
    expect(result.contentType).toBe('image/jpeg');
  });

  it('falls back to application/octet-stream when ContentType is absent', async () => {
    mockSend.mockResolvedValue({
      Body: { transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array()) },
      ContentType: undefined,
    });
    const result = await getS3Object('clips/clip-001/thumbnail.jpg');
    expect(result.contentType).toBe('application/octet-stream');
  });
});

describe('deleteS3Objects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  it('does nothing when keys array is empty', async () => {
    await deleteS3Objects([]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('calls DeleteObjectsCommand with provided keys', async () => {
    await deleteS3Objects(['clips/a.mp4', 'clips/b.jpg']);
    expect(DeleteObjectsCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Delete: {
          Objects: [{ Key: 'clips/a.mp4' }, { Key: 'clips/b.jpg' }],
          Quiet: true,
        },
      }),
    );
  });
});

describe('abortMultipartUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  it('calls AbortMultipartUploadCommand with key and uploadId', async () => {
    await abortMultipartUpload({ key: 'clips/test.mp4', uploadId: 'upload-001' });
    expect(AbortMultipartUploadCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'clips/test.mp4',
        UploadId: 'upload-001',
      }),
    );
  });
});
