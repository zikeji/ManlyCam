import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  AbortMultipartUploadCommand,
  PutObjectAclCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
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
  acl,
}: {
  key: string;
  body: Buffer | import('node:stream').Readable;
  contentType: string;
  acl?: 'private' | 'public-read';
}): Promise<void> {
  const cmd = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    ...(acl ? { ACL: acl } : {}),
  });
  await s3Client.send(cmd);
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

export async function putObjectAcl({
  key,
  acl,
}: {
  key: string;
  acl: 'private' | 'public-read';
}): Promise<void> {
  const cmd = new PutObjectAclCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ACL: acl,
  });
  await s3Client.send(cmd);
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
