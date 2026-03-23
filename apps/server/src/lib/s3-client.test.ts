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
    PutObjectAclCommand: vi
      .fn()
      .mockImplementation((input: unknown) => ({ input, _tag: 'PutObjectAcl' })),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://presigned.example.com/key'),
}));

import {
  s3Client,
  uploadToS3,
  presignGetObject,
  putObjectAcl,
  deleteS3Objects,
  abortMultipartUpload,
} from './s3-client.js';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  AbortMultipartUploadCommand,
  PutObjectAclCommand,
  GetObjectCommand,
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

  it('includes ACL when provided', async () => {
    const body = Buffer.from('img');
    await uploadToS3({
      key: 'clips/thumb.jpg',
      body,
      contentType: 'image/jpeg',
      acl: 'public-read',
    });
    expect(PutObjectCommand).toHaveBeenCalledWith(expect.objectContaining({ ACL: 'public-read' }));
  });

  it('does not include ACL when not provided', async () => {
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

describe('putObjectAcl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  it('calls PutObjectAclCommand with key and ACL', async () => {
    await putObjectAcl({ key: 'clips/thumb.jpg', acl: 'public-read' });
    expect(PutObjectAclCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'clips/thumb.jpg',
        ACL: 'public-read',
      }),
    );
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
