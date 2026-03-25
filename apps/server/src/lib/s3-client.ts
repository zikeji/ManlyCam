import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.js';

export const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

export async function uploadToS3({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Buffer | import('node:stream').Readable;
  contentType: string;
}): Promise<void> {
  const cmd = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3Client.send(cmd);
}

export async function getS3Object(key: string): Promise<{ body: Buffer; contentType: string }> {
  const cmd = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
  const response = await s3Client.send(cmd);
  const bytes = await response.Body?.transformToByteArray();
  return {
    body: Buffer.from(bytes ?? /* c8 ignore next */ []),
    contentType: response.ContentType ?? 'application/octet-stream',
  };
}

export async function presignGetObject({
  key,
  expiresIn = 3600,
  contentDisposition,
}: {
  key: string;
  expiresIn?: number;
  contentDisposition?: string;
}): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ...(contentDisposition ? { ResponseContentDisposition: contentDisposition } : {}),
  });
  return getSignedUrl(s3Client, cmd, { expiresIn });
}

export async function deleteS3Objects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const cmd = new DeleteObjectsCommand({
    Bucket: env.S3_BUCKET,
    Delete: {
      Objects: keys.map((k) => ({ Key: k })),
      Quiet: true,
    },
  });
  await s3Client.send(cmd);
}

export async function abortMultipartUpload({
  key,
  uploadId,
}: {
  key: string;
  uploadId: string;
}): Promise<void> {
  const cmd = new AbortMultipartUploadCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    UploadId: uploadId,
  });
  await s3Client.send(cmd);
}
