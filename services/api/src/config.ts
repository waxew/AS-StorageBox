import 'dotenv/config';
import { z } from 'zod';

// Centralized validation prevents the server from starting with incomplete or
// malformed security/storage configuration.
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(24),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.string().default('true').transform(v => v === 'true'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(1_073_741_824),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900)
});

export const config = schema.parse(process.env);
