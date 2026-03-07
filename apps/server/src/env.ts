import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().min(1),
  BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  HLS_SEGMENT_PATH: z.string().min(1),
  FRP_STREAM_PORT: z.string().min(1),
  FRP_API_PORT: z.string().min(1),
  AGENT_API_KEY: z.string().min(1),
  PET_NAME: z.string().min(1),
  SITE_NAME: z.string().min(1),
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
