import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const sharesRouter = Router();

const permissionsSchema = z.array(z.enum(['READ', 'DOWNLOAD', 'WRITE', 'MANAGE'])).min(1).default(['READ']);
const resourceSchema = z.object({
  resourceType: z.enum(['FILE', 'FOLDER']),
  resourceId: z.string().uuid()
});

async function ownerId(subject: string): Promise<string | null> {
  const result = await db.query('SELECT id FROM app_users WHERE auth_subject = $1 AND deleted_at IS NULL', [subject]);
  return result.rowCount ? result.rows[0].id : null;
}

async function ownerHasResource(userId: string, type: 'FILE' | 'FOLDER', resourceId: string): Promise<boolean> {
  const table = type === 'FILE' ? 'files' : 'folders';
  const result = await db.query(`SELECT 1 FROM ${table} WHERE id = $1 AND owner_id = $2 AND is_trashed = FALSE`, [resourceId, userId]);
  return Boolean(result.rowCount);
}

// Direct shares target an existing registered user. Email is resolved to an
// internal user id once; authorization never trusts an email supplied later.
sharesRouter.post('/direct', async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = resourceSchema.extend({
      recipientEmail: z.string().email(),
      permissions: permissionsSchema,
      expiresAt: z.string().datetime().nullable().optional()
    }).parse(req.body);
    const userId = await ownerId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    if (!(await ownerHasResource(userId, body.resourceType, body.resourceId))) return res.status(404).json({ error: 'RESOURCE_NOT_FOUND' });

    const recipient = await db.query('SELECT id FROM app_users WHERE lower(email) = lower($1) AND deleted_at IS NULL', [body.recipientEmail]);
    if (!recipient.rowCount) return res.status(404).json({ error: 'RECIPIENT_NOT_FOUND' });
    if (recipient.rows[0].id === userId) return res.status(400).json({ error: 'CANNOT_SHARE_WITH_SELF' });

    const result = await db.query(
      `INSERT INTO shares(owner_id, recipient_id, resource_type, file_id, folder_id, permissions, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6::share_permission[],$7)
       RETURNING id, resource_type AS "resourceType", permissions, expires_at AS "expiresAt", created_at AS "createdAt"`,
      [userId, recipient.rows[0].id, body.resourceType, body.resourceType === 'FILE' ? body.resourceId : null,
       body.resourceType === 'FOLDER' ? body.resourceId : null, body.permissions, body.expiresAt ?? null]
    );
    return res.status(201).json({ share: result.rows[0] });
  } catch (error) { next(error); }
});

// The raw secret is returned exactly once. Only its SHA-256 digest is persisted.
sharesRouter.post('/links', async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = resourceSchema.extend({
      permissions: permissionsSchema,
      expiresAt: z.string().datetime().nullable().optional(),
      maxDownloads: z.number().int().nonnegative().nullable().optional()
    }).parse(req.body);
    const userId = await ownerId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    if (!(await ownerHasResource(userId, body.resourceType, body.resourceId))) return res.status(404).json({ error: 'RESOURCE_NOT_FOUND' });

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const result = await db.query(
      `INSERT INTO share_links(owner_id, resource_type, file_id, folder_id, token_hash, permissions, expires_at, max_downloads)
       VALUES ($1,$2,$3,$4,$5,$6::share_permission[],$7,$8)
       RETURNING id, resource_type AS "resourceType", permissions, expires_at AS "expiresAt", max_downloads AS "maxDownloads", created_at AS "createdAt"`,
      [userId, body.resourceType, body.resourceType === 'FILE' ? body.resourceId : null,
       body.resourceType === 'FOLDER' ? body.resourceId : null, tokenHash, body.permissions, body.expiresAt ?? null, body.maxDownloads ?? null]
    );
    return res.status(201).json({ shareLink: result.rows[0], token });
  } catch (error) { next(error); }
});

sharesRouter.get('/mine', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = await ownerId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    const [direct, links] = await Promise.all([
      db.query(`SELECT id, recipient_id AS "recipientId", resource_type AS "resourceType", file_id AS "fileId", folder_id AS "folderId", permissions, expires_at AS "expiresAt", revoked_at AS "revokedAt", created_at AS "createdAt" FROM shares WHERE owner_id = $1 ORDER BY created_at DESC`, [userId]),
      db.query(`SELECT id, resource_type AS "resourceType", file_id AS "fileId", folder_id AS "folderId", permissions, expires_at AS "expiresAt", max_downloads AS "maxDownloads", download_count AS "downloadCount", revoked_at AS "revokedAt", created_at AS "createdAt" FROM share_links WHERE owner_id = $1 ORDER BY created_at DESC`, [userId])
    ]);
    return res.json({ direct: direct.rows, links: links.rows });
  } catch (error) { next(error); }
});

sharesRouter.delete('/direct/:shareId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { shareId } = z.object({ shareId: z.string().uuid() }).parse(req.params);
    const userId = await ownerId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    const result = await db.query('UPDATE shares SET revoked_at = now() WHERE id = $1 AND owner_id = $2 AND revoked_at IS NULL RETURNING id', [shareId, userId]);
    if (!result.rowCount) return res.status(404).json({ error: 'SHARE_NOT_FOUND' });
    return res.status(204).end();
  } catch (error) { next(error); }
});

sharesRouter.delete('/links/:linkId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { linkId } = z.object({ linkId: z.string().uuid() }).parse(req.params);
    const userId = await ownerId(req.auth!.subject);
    if (!userId) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    const result = await db.query('UPDATE share_links SET revoked_at = now() WHERE id = $1 AND owner_id = $2 AND revoked_at IS NULL RETURNING id', [linkId, userId]);
    if (!result.rowCount) return res.status(404).json({ error: 'SHARE_LINK_NOT_FOUND' });
    return res.status(204).end();
  } catch (error) { next(error); }
});
