import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createUploadUrl, inspectStoredObject } from '../storage.js';

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

    // Generated object keys avoid path traversal, collisions and filename leaks.
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

// Finalization is deliberately separate from PUT upload. The API verifies the
// object exists and has exactly the expected byte length before charging quota.
uploadsRouter.post('/sessions/:sessionId/complete', async (req: AuthenticatedRequest, res, next) => {
  const client = await db.connect();
  try {
    const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(req.params);
    const userResult = await db.query('SELECT id FROM app_users WHERE auth_subject = $1 AND deleted_at IS NULL', [req.auth!.subject]);
    if (!userResult.rowCount) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    const userId = userResult.rows[0].id;

    await client.query('BEGIN');
    const sessionResult = await client.query(
      `SELECT * FROM upload_sessions
        WHERE id = $1 AND owner_id = $2 AND status IN ('PENDING','UPLOADING') AND expires_at > now()
        FOR UPDATE`,
      [sessionId, userId]
    );
    if (!sessionResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'UPLOAD_SESSION_NOT_FOUND' });
    }
    const session = sessionResult.rows[0];
    const stored = await inspectStoredObject(session.object_key);
    if (stored.sizeBytes !== Number(session.expected_size_bytes)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'UPLOAD_SIZE_MISMATCH' });
    }

    // Re-check quota under row lock so concurrent uploads cannot exceed quota.
    const quota = await client.query('SELECT storage_quota_bytes, storage_used_bytes FROM app_users WHERE id = $1 FOR UPDATE', [userId]);
    if (Number(quota.rows[0].storage_used_bytes) + stored.sizeBytes > Number(quota.rows[0].storage_quota_bytes)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'STORAGE_QUOTA_EXCEEDED' });
    }

    const file = await client.query(
      `INSERT INTO files(owner_id, folder_id, original_name, object_key, mime_type, size_bytes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, folder_id AS "folderId", original_name AS "name", mime_type AS "mimeType", size_bytes AS "sizeBytes", created_at AS "createdAt"`,
      [userId, session.folder_id, session.file_name, session.object_key, stored.contentType ?? session.mime_type, stored.sizeBytes]
    );
    await client.query('UPDATE app_users SET storage_used_bytes = storage_used_bytes + $2, updated_at = now() WHERE id = $1', [userId, stored.sizeBytes]);
    await client.query("UPDATE upload_sessions SET status = 'COMPLETED', completed_at = now() WHERE id = $1", [sessionId]);
    await client.query('COMMIT');
    return res.status(201).json({ file: file.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally { client.release(); }
});
