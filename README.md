# AS-StorageBox

AS-StorageBox is a private cloud storage and selective sharing platform.

## Product goal
Each user has a private storage space. Users can create folders, upload files, and share either a single file or an entire folder without exposing unrelated content.

## Clients and services
- `apps/android` - Native Android client written in Kotlin.
- `apps/web` - Responsive PWA for iPhone, iPad, desktop and browsers.
- `services/api` - Shared backend/API for Android and Web.
- `packages/contracts` - Shared API schemas and permission definitions.
- `infra` - Database, object storage and deployment configuration.
- `docs` - Architecture, security and product documentation.

## Access model
Everything is private by default. Access is granted explicitly to a file or folder. Sharing one folder never grants access to sibling folders or the rest of the owner's storage.

Planned sharing modes include registered-user sharing and secure links, with optional expiration, password protection, read/download permissions and owner revocation.

## Repository layout
```text
AS-StorageBox/
├── apps/
│   ├── android/
│   └── web/
├── services/
│   └── api/
├── packages/
│   └── contracts/
├── infra/
└── docs/
```

## Roadmap
1. Foundation: authentication, profiles, file/folder model, permissions and upload/download.
2. Sharing: direct shares, secure links, expiration, passwords and revocation.
3. Storage UX: search, recent, favorites, trash, previews, progress and quota.
4. Production: resumable uploads, rate limiting, malware-scan hooks, backups, audit logs and observability.

## Source documentation rule
Source code must remain well documented. Important classes, functions, security decisions, data flows and non-obvious implementation details require explanatory comments.
