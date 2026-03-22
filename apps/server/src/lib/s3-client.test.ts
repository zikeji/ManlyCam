import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: {
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'test-access-key',
    S3_SECRET_KEY: 'test-secret-key',
    S3_FORCE_PATH_STYLE: true,
  },
}));

describe('s3Client singleton', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports a single S3Client instance', async () => {
    const { s3Client } = await import('./s3-client.js');
    const { S3Client } = await import('@aws-sdk/client-s3');
    expect(s3Client).toBeInstanceOf(S3Client);
  });

  it('is the same instance on multiple imports', async () => {
    const { s3Client: a } = await import('./s3-client.js');
    const { s3Client: b } = await import('./s3-client.js');
    expect(a).toBe(b);
  });
});
