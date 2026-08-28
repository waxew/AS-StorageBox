# AS-StorageBox API v1

All private endpoints require authentication. Resource authorization is evaluated server-side for every request; hiding UI controls is never considered authorization.

Base prefix: `/api/v1`

## Profile

- `GET /me` - Current profile and storage usage.
- `PATCH /me` - Update display name/avatar metadata.

## Folders

- `GET /folders?parentId=<uuid|null>` - List an owned folder or an accessible shared folder.
- `POST /folders` - Create a folder.
- `PATCH /folders/:id` - Rename/move an owned folder.
- `DELETE /folders/:id` - Move an owned folder to trash.
- `POST /folders/:id/restore` - Restore from trash.

Moving a folder must reject cycles and cross-owner parent relationships.

## Files

- `GET /files/:id` - Metadata.
- `GET /files/:id/download` - Obtain a short-lived download URL after authorization.
- `PATCH /files/:id` - Rename/move an owned file.
- `DELETE /files/:id` - Move to trash.
- `POST /files/:id/restore` - Restore from trash.

Object-store keys are internal identifiers and must not be accepted as authorization targets from clients.

## Uploads

- `POST /uploads/initiate` - Validate quota/target folder and create an upload session.
- `POST /uploads/:id/parts` - Issue signed multipart part operations when required.
- `POST /uploads/:id/complete` - Validate uploaded object and create file metadata.
- `DELETE /uploads/:id` - Abort an incomplete upload.

Large files should use multipart/resumable upload. Signed operations are short-lived and scoped to one generated object key.

## Direct shares

- `GET /shares/outgoing` - Resources shared by the current user.
- `GET /shares/incoming` - Resources shared with the current user.
- `POST /shares` - Share a file/folder with a registered user.
- `PATCH /shares/:id` - Change permissions or expiration.
- `DELETE /shares/:id` - Revoke access.

## Secure links

- `POST /share-links` - Create a link and return its secret URL once.
- `GET /share-links` - List owner's link metadata without secret tokens.
- `PATCH /share-links/:id` - Change policy.
- `DELETE /share-links/:id` - Revoke link.
- `GET /public/s/:token` - Resolve link and return permitted metadata.
- `POST /public/s/:token/unlock` - Verify optional password and establish short-lived access.

Raw link tokens and passwords must never be written to logs.

## Authorization invariants

1. Owner access is scoped by `owner_id` and cannot be inferred from a supplied path.
2. A file share authorizes only that file.
3. A folder share authorizes the shared folder and descendants, never its parent or siblings.
4. Expired or revoked shares authorize nothing.
5. `READ` does not imply `DOWNLOAD`.
6. `WRITE` operations on shared folders cannot escape the shared subtree.
7. A client cannot grant permissions it does not have; initial v1 share creation is owner-only.
8. Every download and mutation is re-authorized at request time.

## Security defaults

- HTTPS only in production.
- Short-lived access tokens; refresh tokens stored using platform-secure mechanisms.
- Rate limits on auth, public links and download URL issuance.
- Passwords hashed with a modern password KDF.
- Share-link secrets generated with cryptographically secure randomness and stored only as hashes.
- Object storage remains private; clients use narrowly scoped signed URLs.
- File names are metadata, never object-store paths.
- MIME type supplied by a client is untrusted.
- Audit security-sensitive actions without recording secrets.
