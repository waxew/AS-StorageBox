# Shared contracts

This package is reserved for versioned API contracts and shared schema definitions.

It will define request/response shapes, error codes, pagination, file/folder DTOs, share permissions and upload-session contracts. Keeping contracts explicit prevents Android, Web and API implementations from drifting apart.

Security-sensitive authorization logic itself remains on the server and is not delegated to this client-consumable package.
