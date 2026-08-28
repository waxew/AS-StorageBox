import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createDownloadUrl } from '../storage.js';

export const sharedWithMeRouter = Router();

async function recipientId(subject:string){const r=await db.query('SELECT id FROM app_users WHERE auth_subject=$1 AND deleted_at IS NULL',[subject]);return r.rowCount?r.rows[0].id:null;}

// Lists only active grants addressed to the authenticated user.
sharedWithMeRouter.get('/',async(req:AuthenticatedRequest,res,next)=>{try{
 const uid=await recipientId(req.auth!.subject); if(!uid)return res.status(404).json({error:'PROFILE_NOT_FOUND'});
 const r=await db.query(`SELECT s.id,s.resource_type AS "resourceType",s.file_id AS "fileId",s.folder_id AS "folderId",s.permissions,s.expires_at AS "expiresAt",u.display_name AS "ownerName" FROM shares s JOIN app_users u ON u.id=s.owner_id WHERE s.recipient_id=$1 AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now()) ORDER BY s.created_at DESC`,[uid]);
 return res.json({shares:r.rows});
}catch(e){next(e)}});

// Download is permitted for a directly shared file, or a file contained anywhere
// below a shared folder. The recursive query walks upward from the file folder and
// therefore cannot leak an owner's sibling/parent branches.
sharedWithMeRouter.post('/files/:fileId/download',async(req:AuthenticatedRequest,res,next)=>{try{
 const {fileId}=z.object({fileId:z.string().uuid()}).parse(req.params); const uid=await recipientId(req.auth!.subject); if(!uid)return res.status(404).json({error:'PROFILE_NOT_FOUND'});
 const r=await db.query(`WITH RECURSIVE ancestors AS (SELECT f.id,f.parent_id FROM folders f JOIN files x ON x.folder_id=f.id WHERE x.id=$1 UNION ALL SELECT p.id,p.parent_id FROM folders p JOIN ancestors a ON a.parent_id=p.id) SELECT x.object_key,x.original_name FROM files x WHERE x.id=$1 AND x.is_trashed=FALSE AND EXISTS(SELECT 1 FROM shares s WHERE s.recipient_id=$2 AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now()) AND 'DOWNLOAD'=ANY(s.permissions) AND ((s.resource_type='FILE' AND s.file_id=x.id) OR (s.resource_type='FOLDER' AND s.folder_id IN(SELECT id FROM ancestors))))`,[fileId,uid]);
 if(!r.rowCount)return res.status(404).json({error:'FILE_NOT_ACCESSIBLE'}); return res.json({downloadUrl:await createDownloadUrl(r.rows[0].object_key,r.rows[0].original_name)});
}catch(e){next(e)}});
