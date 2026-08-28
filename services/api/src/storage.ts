import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';

// Keeping S3 details behind this module makes the rest of the API independent
// from a specific storage vendor such as AWS S3, Cloudflare R2 or MinIO.
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

// Download URLs are intentionally short-lived. ContentDisposition keeps the
// user's original filename without making that filename part of the object key.
export async function createDownloadUrl(objectKey: string, fileName: string): Promise<string> {
  const safeName = fileName.replace(/[\r\n"]/g, '_');
  const command = new GetObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: objectKey,
    ResponseContentDisposition: `attachment; filename="${safeName}"`
  });
  return getSignedUrl(client, command, { expiresIn: config.SIGNED_URL_TTL_SECONDS });
}

// Finalization uses HEAD to verify that object storage actually contains the
// uploaded bytes before metadata is promoted to a normal file record.
export async function inspectStoredObject(objectKey: string): Promise<{ sizeBytes: number; contentType?: string }> {
  const result = await client.send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: objectKey }));
  return { sizeBytes: Number(result.ContentLength ?? 0), contentType: result.ContentType };
}

export async function deleteStoredObject(objectKey: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: objectKey }));
}
