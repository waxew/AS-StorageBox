import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createDownloadUrl, deleteStoredObject } from '../storage.js';

export const filesRouter = Router();

async function currentUserId(subject: string): Promise<string | null> {
  const result = await db.query(
    'SELECT id FROM app_users WHERE auth_subject = $1 AND deleted_at IS NULL',
    [subject]
  );
  return result.rowCount ? result.rows[0].id : null;
}

// Returns active files in one folder. Root-level files use folderId=null.
filesRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = z.object({ folderId: z.string().uuid().optional() }).parse(req.query);
    const userId = await currentUserId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });

    const result = query.folderId
      ? await db.query(
          `SELECT id, folder_id AS "folderId", original_name AS "name", mime_type AS "mimeType",
                  size_bytes AS "sizeBytes", created_at AS "createdAt", updated_at AS "updatedAt"
             FROM files
            WHERE owner_id = $1 AND folder_id = $2 AND is_trashed = FALSE
            ORDER BY created_at DESC`,
          [userId, query.folderId]
        )
      : await db.query(
          `SELECT id, folder_id AS "folderId", original_name AS "name", mime_type AS "mimeType",
                  size_bytes AS "sizeBytes", created_at AS "createdAt", updated_at AS "updatedAt"
             FROM files
            WHERE owner_id = $1 AND folder_id IS NULL AND is_trashed = FALSE
            ORDER BY created_at DESC`,
          [userId]
        );

    return res.json({ files: result.rows });
  } catch (error) { next(error); }
});

// Owner-only metadata lookup.
filesRouter.get('/:fileId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(req.params);
    const userId = await currentUserId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });

    const result = await db.query(
      `SELECT id, folder_id AS "folderId", original_name AS "name", mime_type AS "mimeType",
              size_bytes AS "sizeBytes", is_trashed AS "isTrashed", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM files WHERE id = $1 AND owner_id = $2`,
      [fileId, userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'FILE_NOT_FOUND' });
    return res.json(result.rows[0]);
  } catch (error) { next(error); }
});

// Signed URLs are short-lived and generated only after resource authorization.
filesRouter.post('/:fileId/download', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(req.params);
    const userId = await currentUserId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });

    const result = await db.query(
      `SELECT object_key, original_name FROM files
        WHERE id = $1 AND owner_id = $2 AND is_trashed = FALSE`,
      [fileId, userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'FILE_NOT_FOUND' });

    const downloadUrl = await createDownloadUrl(result.rows[0].object_key, result.rows[0].original_name);
    return res.json({ downloadUrl });
  } catch (error) { next(error); }
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  folderId: z.string().uuid().nullable().optional()
}).refine((value) => value.name !== undefined || value.folderId !== undefined, 'No changes supplied');

// Rename and move are owner-only in v1. Shared-folder write support will call
// the same domain rules after delegated WRITE authorization is enabled.
filesRouter.patch('/:fileId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(req.params);
    const body = patchSchema.parse(req.body);
    const userId = await currentUserId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });

    if (body.folderId) {
      const folder = await db.query(
        'SELECT 1 FROM folders WHERE id = $1 AND owner_id = $2 AND is_trashed = FALSE',
        [body.folderId, userId]
      );
      if (!folder.rowCount) return res.status(404).json({ error: 'FOLDER_NOT_FOUND' });
    }

    const result = await db.query(
      `UPDATE files
          SET original_name = COALESCE($3, original_name),
              folder_id = CASE WHEN $4::boolean THEN $5::uuid ELSE folder_id END,
              updated_at = now()
        WHERE id = $1 AND owner_id = $2 AND is_trashed = FALSE
      RETURNING id, folder_id AS "folderId", original_name AS "name", updated_at AS "updatedAt"`,
      [fileId, userId, body.name ?? null, body.folderId !== undefined, body.folderId ?? null]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'FILE_NOT_FOUND' });
    return res.json(result.rows[0]);
  } catch (error) { next(error); }
});

filesRouter.post('/:fileId/trash', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(req.params);
    const userId = await currentUserId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    const result = await db.query(
      `UPDATE files SET is_trashed = TRUE, trashed_at = now(), updated_at = now()
        WHERE id = $1 AND owner_id = $2 AND is_trashed = FALSE RETURNING id`,
      [fileId, userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'FILE_NOT_FOUND' });
    return res.status(204).end();
  } catch (error) { next(error); }
});

filesRouter.post('/:fileId/restore', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(req.params);
    const userId = await currentUserId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    const result = await db.query(
      `UPDATE files SET is_trashed = FALSE, trashed_at = NULL, updated_at = now()
        WHERE id = $1 AND owner_id = $2 AND is_trashed = TRUE RETURNING id`,
      [fileId, userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'FILE_NOT_FOUND' });
    return res.status(204).end();
  } catch (error) { next(error); }
});

// Permanent deletion removes metadata and object bytes. Quota is reduced in the
// same transaction before object deletion. Production reconciliation can repair
// rare object-store failures after the database commit.
filesRouter.delete('/:fileId', async (req: AuthenticatedRequest, res, next) => {
  const client = await db.connect();
  try {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(req.params);
    const userId = await currentUserId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });

    await client.query('BEGIN');
    const file = await client.query(
      'SELECT object_key, size_bytes FROM files WHERE id = $1 AND owner_id = $2 FOR UPDATE',
      [fileId, userId]
    );
    if (!file.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'FILE_NOT_FOUND' });
    }
    await client.query('DELETE FROM files WHERE id = $1 AND owner_id = $2', [fileId, userId]);
    await client.query(
      'UPDATE app_users SET storage_used_bytes = GREATEST(0, storage_used_bytes - $2), updated_at = now() WHERE id = $1',
      [userId, file.rows[0].size_bytes]
    );
    await client.query('COMMIT');
    await deleteStoredObject(file.rows[0].object_key);
    return res.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally { client.release(); }
});
