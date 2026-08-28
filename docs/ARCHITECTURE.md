# AS-StorageBox Architecture

## 1. System overview

```text
Android (Kotlin) ─┐
                  ├── HTTPS API ── Authentication/Authorization
Web / PWA ────────┘       │
                           ├── PostgreSQL (metadata)
                           └── Object Storage (file bytes)
```

Android and Web must use the same API and permission rules. Clients never decide whether a user is authorized to read a file; authorization is enforced by the backend.

## 2. Storage separation

File metadata and file bytes are deliberately separated:

- PostgreSQL stores users, folders, file records, ownership, shares, quotas and audit information.
- S3-compatible object storage stores the actual uploaded bytes.
- Database records use opaque object keys rather than public storage URLs.

This lets us change storage providers later without redesigning the clients or database.

## 3. Core entities

- User
- UserProfile
- Folder
- FileObject
- Share
- ShareRecipient
- ShareLink
- UploadSession
- StorageQuota
- AuditEvent

Every Folder and FileObject has exactly one owner. A folder can reference a parent folder. Files reference their containing folder.

## 4. Permission model

Default: `PRIVATE`.

Initial capabilities:

- VIEW
- DOWNLOAD
- UPLOAD (for collaborative folders in a later version)
- EDIT
- DELETE
- SHARE

The owner implicitly has all capabilities. Recipients receive only capabilities explicitly granted by a valid share.

For a shared folder, permissions may inherit to descendants, but never to its parent or siblings.

## 5. Secure sharing

A public-looking share URL must contain a cryptographically random token. The database should store a hash of the token rather than the raw token. Links can have:

- expiration time;
- password protection;
- maximum-use/download limits;
- disabled/revoked state;
- explicit permissions.

Direct shares should reference the recipient's internal user ID rather than trusting an email address at access time.

## 6. Upload architecture

Large uploads should eventually use multipart/resumable upload. The API creates an upload session and authorizes the object key. The client transfers data through controlled/presigned storage requests and then asks the API to finalize metadata.

Never load large files entirely into API server memory.

## 7. Web/PWA

The web client is responsive and installable as a PWA where supported. iPhone users can use Safari and optionally add it to the Home Screen. A custom domain is not required during development; a deployment-provider URL can be used first and a domain attached later.

## 8. Android

Android will be native Kotlin with a layered architecture:

```text
UI / Compose
   ↓
ViewModel
   ↓
Use cases
   ↓
Repositories
   ↓
Remote API + local cache
```

The local database/cache is not the authoritative cloud database. It exists for performance, offline metadata and upload/download state.

## 9. Security baseline

- TLS only in production.
- Passwords are never stored in plaintext.
- Short-lived access tokens plus controlled refresh sessions.
- Server-side authorization on every protected resource.
- Random non-sequential public IDs.
- File name and MIME validation.
- Upload size/quota enforcement.
- Rate limiting for authentication and share-link endpoints.
- Audit records for security-sensitive operations.
- Secrets stay outside Git and are supplied through environment variables/secret stores.

## 10. Deployment flexibility

The architecture avoids binding the product to one vendor. PostgreSQL and S3-compatible storage interfaces allow us to begin with a managed provider and migrate later if storage volume or cost changes.
