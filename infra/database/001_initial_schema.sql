-- AS-StorageBox initial PostgreSQL schema.
-- This migration defines identity-adjacent profile data, folders, files,
-- shares, secure links, upload sessions and audit records.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Application profile. Authentication itself may be provided by the selected
-- auth provider, but every authenticated identity maps to exactly one profile.
CREATE TABLE app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_subject TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    storage_quota_bytes BIGINT NOT NULL DEFAULT 1073741824 CHECK (storage_quota_bytes >= 0),
    storage_used_bytes BIGINT NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Folders form an ownership-scoped tree. A NULL parent_id means a root-level
-- folder. Ownership is denormalized intentionally to make authorization checks
-- explicit and efficient.
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 255),
    is_trashed BOOLEAN NOT NULL DEFAULT FALSE,
    trashed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT folders_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX idx_folders_owner_parent ON folders(owner_id, parent_id);
CREATE INDEX idx_folders_owner_trashed ON folders(owner_id, is_trashed);

-- Object bytes live in S3-compatible object storage. The database stores only
-- metadata and the opaque object key; clients never receive storage credentials.
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL CHECK (length(trim(original_name)) BETWEEN 1 AND 255),
    object_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    checksum_sha256 TEXT,
    is_trashed BOOLEAN NOT NULL DEFAULT FALSE,
    trashed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_files_owner_folder ON files(owner_id, folder_id);
CREATE INDEX idx_files_owner_created ON files(owner_id, created_at DESC);
CREATE INDEX idx_files_owner_trashed ON files(owner_id, is_trashed);

-- Permission values are additive. READ allows metadata/listing/preview.
-- DOWNLOAD allows obtaining file bytes. WRITE allows upload/rename inside a
-- shared folder. MANAGE is reserved for future delegated share administration.
CREATE TYPE share_permission AS ENUM ('READ', 'DOWNLOAD', 'WRITE', 'MANAGE');
CREATE TYPE shared_resource_type AS ENUM ('FILE', 'FOLDER');

-- A direct share grants a registered user access to exactly one resource.
-- Folder authorization code must treat descendants as in-scope while never
-- granting access to ancestors or sibling branches.
CREATE TABLE shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    resource_type shared_resource_type NOT NULL,
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    permissions share_permission[] NOT NULL DEFAULT ARRAY['READ']::share_permission[],
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT shares_exactly_one_resource CHECK (
        (resource_type = 'FILE' AND file_id IS NOT NULL AND folder_id IS NULL)
        OR
        (resource_type = 'FOLDER' AND folder_id IS NOT NULL AND file_id IS NULL)
    ),
    CONSTRAINT shares_not_to_owner CHECK (owner_id <> recipient_id)
);

CREATE INDEX idx_shares_recipient_active ON shares(recipient_id, revoked_at, expires_at);
CREATE INDEX idx_shares_owner ON shares(owner_id);

-- Public-looking URLs are still capability links. Only a hash of the secret
-- token is stored in the database so a database leak does not expose live links.
CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    resource_type shared_resource_type NOT NULL,
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    permissions share_permission[] NOT NULL DEFAULT ARRAY['READ']::share_permission[],
    expires_at TIMESTAMPTZ,
    max_downloads INTEGER CHECK (max_downloads IS NULL OR max_downloads >= 0),
    download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT share_links_exactly_one_resource CHECK (
        (resource_type = 'FILE' AND file_id IS NOT NULL AND folder_id IS NULL)
        OR
        (resource_type = 'FOLDER' AND folder_id IS NOT NULL AND file_id IS NULL)
    )
);

CREATE INDEX idx_share_links_owner ON share_links(owner_id);

-- Upload sessions support large/resumable uploads without routing file bytes
-- through the application server. The API issues short-lived signed object-store
-- operations and finalizes metadata only after upload validation.
CREATE TYPE upload_status AS ENUM ('PENDING', 'UPLOADING', 'COMPLETED', 'ABORTED', 'EXPIRED');

CREATE TABLE upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    expected_size_bytes BIGINT NOT NULL CHECK (expected_size_bytes >= 0),
    object_key TEXT NOT NULL UNIQUE,
    status upload_status NOT NULL DEFAULT 'PENDING',
    multipart_upload_id TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_upload_sessions_owner_status ON upload_sessions(owner_id, status);

-- Security-sensitive actions are recorded for troubleshooting and future user-
-- visible activity history. details must never contain passwords, raw auth tokens
-- or raw share-link secrets.
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_actor_created ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id, created_at DESC);
