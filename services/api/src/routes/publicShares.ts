import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { createDownloadUrl } from '../storage.js';

export const publicSharesRouter=Router();
const tokenSchema=z.object({token:z.string().min(32).max(256)});
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');

// Public capability links are intentionally outside JWT middleware. Possession of
// the high-entropy token is the capability; only its digest exists in PostgreSQL.
publicSharesRouter.get('/:token',async(req,res,next)=>{try{
 const {token}=tokenSchema.parse(req.params); const r=await db.query(`SELECT l.id,l.resource_type AS "resourceType",l.file_id AS "fileId",l.folder_id AS "folderId",l.permissions,l.expires_at AS "expiresAt",f.original_name AS "fileName",d.name AS "folderName" FROM share_links l LEFT JOIN files f ON f.id=l.file_id LEFT JOIN folders d ON d.id=l.folder_id WHERE l.token_hash=$1 AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at>now())`,[digest(token)]); if(!r.rowCount)return res.status(404).json({error:'SHARE_LINK_NOT_FOUND'}); return res.json(r.rows[0]);
}catch(e){next(e)}});

publicSharesRouter.post('/:token/files/:fileId/download',async(req,res,next)=>{const client=await db.connect();try{
 const {token,fileId}=z.object({token:z.string().min(32).max(256),fileId:z.string().uuid()}).parse(req.params); await client.query('BEGIN');
 const r=await client.query(`WITH RECURSIVE ancestors AS (SELECT f.id,f.parent_id FROM folders f JOIN files x ON x.folder_id=f.id WHERE x.id=$2 UNION ALL SELECT p.id,p.parent_id FROM folders p JOIN ancestors a ON a.parent_id=p.id) SELECT l.id,x.object_key,x.original_name,l.max_downloads,l.download_count FROM share_links l JOIN files x ON x.id=$2 WHERE l.token_hash=$1 AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at>now()) AND 'DOWNLOAD'=ANY(l.permissions) AND (l.max_downloads IS NULL OR l.download_count<l.max_downloads) AND ((l.resource_type='FILE' AND l.file_id=x.id) OR (l.resource_type='FOLDER' AND l.folder_id IN(SELECT id FROM ancestors))) FOR UPDATE OF l`,[digest(token),fileId]);
 if(!r.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'FILE_NOT_ACCESSIBLE'});} await client.query('UPDATE share_links SET download_count=download_count+1 WHERE id=$1',[r.rows[0].id]); await client.query('COMMIT'); return res.json({downloadUrl:await createDownloadUrl(r.rows[0].object_key,r.rows[0].original_name)});
}catch(e){await client.query('ROLLBACK').catch(()=>undefined);next(e)}finally{client.release()}});
