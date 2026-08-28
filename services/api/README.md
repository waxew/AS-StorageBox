# AS-StorageBox API

Shared backend for Android and Web clients.

Responsibilities:

- Authentication and sessions
- Profiles
- Folder/file metadata
- Upload/download authorization
- Object-storage integration
- Sharing and permission evaluation
- Quotas
- Trash lifecycle
- Audit events

Suggested initial API namespaces:

```text
/api/v1/auth
/api/v1/me
/api/v1/folders
/api/v1/files
/api/v1/uploads
/api/v1/shares
/api/v1/shared-with-me
/api/v1/trash
```

The backend is the security boundary. Every file/folder operation must resolve the authenticated principal and evaluate ownership/share permissions before returning metadata or authorizing object access.
