import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';

// Keeping S3 details behind this module makes the rest of the API independent
// from a specific storage vendor.
const client = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY }
});

export async function createUploadUrl(objectKey: string, mimeType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: objectKey,
    ContentType: mimeType
  });
  return getSignedUrl(client, command, { expiresIn: config.SIGNED_URL_TTL_SECONDS });
}
