import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const foldersRouter = Router();

const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentId: z.string().uuid().nullable().optional()
});

// Resolve the application user at the boundary. Later this becomes shared
// middleware once all route groups require the same lookup.
async function currentUserId(subject: string): Promise<string | null> {
  const result = await db.query('SELECT id FROM app_users WHERE auth_subject = $1 AND deleted_at IS NULL', [subject]);
  return result.rows[0]?.id ?? null;
}

foldersRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = await currentUserId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });

    const parentId = typeof req.query.parentId === 'string' ? req.query.parentId : null;
    const result = await db.query(
      `SELECT id, parent_id AS "parentId", name, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM folders
       WHERE owner_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND is_trashed = FALSE
       ORDER BY name ASC`,
      [userId, parentId]
    );
    return res.json({ items: result.rows });
  } catch (error) { next(error); }
});

foldersRouter.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = createFolderSchema.parse(req.body);
    const userId = await currentUserId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });

    // A parent folder must belong to the caller. This explicit check prevents a
    // user from attaching their folder below another user's private tree.
    if (body.parentId) {
      const parent = await db.query('SELECT 1 FROM folders WHERE id = $1 AND owner_id = $2 AND is_trashed = FALSE', [body.parentId, userId]);
      if (!parent.rowCount) return res.status(404).json({ error: 'PARENT_FOLDER_NOT_FOUND' });
    }

    const result = await db.query(
      `INSERT INTO folders(owner_id, parent_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, parent_id AS "parentId", name, created_at AS "createdAt"`,
      [userId, body.parentId ?? null, body.name]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});
