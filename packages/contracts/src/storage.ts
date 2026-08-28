// Shared transport contracts for AS-StorageBox clients and API.
// Keep this package framework-agnostic so Web and backend can consume it and
// equivalent Kotlin DTOs can be generated/maintained from the same definitions.

export type UUID = string;
export type ISODateTime = string;

export type SharePermission = 'READ' | 'DOWNLOAD' | 'WRITE' | 'MANAGE';
export type SharedResourceType = 'FILE' | 'FOLDER';

export interface UserProfile {
  id: UUID;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  storageQuotaBytes: number;
  storageUsedBytes: number;
}

export interface FolderItem {
  id: UUID;
  ownerId: UUID;
  parentId: UUID | null;
  name: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface FileItem {
  id: UUID;
  ownerId: UUID;
  folderId: UUID | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface FolderContents {
  folder: FolderItem | null;
  folders: FolderItem[];
  files: FileItem[];
}

export interface CreateFolderRequest {
  parentId: UUID | null;
  name: string;
}

// Upload initiation returns temporary object-storage instructions. The API must
// verify ownership/quota before issuing them and again before finalization.
export interface InitiateUploadRequest {
  folderId: UUID | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string;
}

export interface InitiateUploadResponse {
  uploadSessionId: UUID;
  objectKey: string;
  expiresAt: ISODateTime;
  uploadUrl?: string;
  multipartUploadId?: string;
}

export interface CompleteUploadRequest {
  uploadSessionId: UUID;
  checksumSha256?: string;
}

export interface DirectShareRequest {
  resourceType: SharedResourceType;
  resourceId: UUID;
  recipientUserId: UUID;
  permissions: SharePermission[];
  expiresAt?: ISODateTime | null;
}

export interface SecureLinkRequest {
  resourceType: SharedResourceType;
  resourceId: UUID;
  permissions: SharePermission[];
  expiresAt?: ISODateTime | null;
  password?: string;
  maxDownloads?: number | null;
}

export interface ShareSummary {
  id: UUID;
  resourceType: SharedResourceType;
  resourceId: UUID;
  permissions: SharePermission[];
  expiresAt: ISODateTime | null;
  revokedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

// The secret token is returned only when a link is created. It must never be
// persisted in plaintext by the API; only a cryptographic hash belongs in DB.
export interface CreatedSecureLink extends ShareSummary {
  url: string;
}

export interface ApiError {
  code:
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'INVALID_INPUT'
    | 'QUOTA_EXCEEDED'
    | 'SHARE_EXPIRED'
    | 'SHARE_REVOKED'
    | 'UPLOAD_EXPIRED'
    | 'CONFLICT'
    | 'INTERNAL_ERROR';
  message: string;
  requestId?: string;
}
