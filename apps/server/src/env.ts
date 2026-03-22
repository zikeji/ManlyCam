/* istanbul ignore file -- env bootstrap: runs at startup, always mocked in tests; error path calls process.exit(1) */
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().min(1),
  BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  FRP_HOST: z.string().min(1).default('localhost'),
  FRP_RTSP_PORT: z.string().min(1),
  MTX_API_URL: z.string().url().default('http://127.0.0.1:9997'),
  MTX_WEBRTC_URL: z.string().url().default('http://127.0.0.1:8888'),
  FRP_API_PORT: z.string().min(1),
  PET_NAME: z.string().min(1),
  SITE_NAME: z.string().min(1),
  FRP_PISUGAR_PORT: z.coerce.number().optional(),
  S3_ENDPOINT: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_PUBLIC_BASE_URL: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
  MTX_HLS_URL: z.string().url().default('http://127.0.0.1:8090'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const missing = result.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`[ManlyCam] Missing or invalid environment variables:\n${missing}`);
  process.exit(1);
}

export const env = result.data;
