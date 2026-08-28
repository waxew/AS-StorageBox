import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createUploadUrl } from '../storage.js';

export const uploadsRouter = Router();

const schema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255).default('application/octet-stream'),
  sizeBytes: z.number().int().nonnegative()
});

uploadsRouter.post('/sessions', async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = schema.parse(req.body);
    if (body.sizeBytes > config.MAX_UPLOAD_BYTES) return res.status(413).json({ error: 'FILE_TOO_LARGE' });

    const user = await db.query(
      'SELECT id, storage_quota_bytes, storage_used_bytes FROM app_users WHERE auth_subject = $1 AND deleted_at IS NULL',
      [req.auth!.subject]
    );
    if (!user.rowCount) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    const u = user.rows[0];
    if (Number(u.storage_used_bytes) + body.sizeBytes > Number(u.storage_quota_bytes)) {
      return res.status(409).json({ error: 'STORAGE_QUOTA_EXCEEDED' });
    }

    if (body.folderId) {
      const folder = await db.query('SELECT 1 FROM folders WHERE id = $1 AND owner_id = $2 AND is_trashed = FALSE', [body.folderId, u.id]);
      if (!folder.rowCount) return res.status(404).json({ error: 'FOLDER_NOT_FOUND' });
    }

    // Object keys contain generated identifiers rather than user file names.
    // This avoids path traversal, collisions and accidental disclosure in logs.
    const objectKey = `users/${u.id}/${randomUUID()}`;
    const expiresAt = new Date(Date.now() + config.SIGNED_URL_TTL_SECONDS * 1000);

    const session = await db.query(
      `INSERT INTO upload_sessions(owner_id, folder_id, file_name, mime_type, expected_size_bytes, object_key, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [u.id, body.folderId ?? null, body.fileName, body.mimeType, body.sizeBytes, objectKey, expiresAt]
    );

    const uploadUrl = await createUploadUrl(objectKey, body.mimeType);
    return res.status(201).json({ sessionId: session.rows[0].id, uploadUrl, expiresAt: expiresAt.toISOString() });
  } catch (error) { next(error); }
});
