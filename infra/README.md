# Infrastructure

Infrastructure definitions and deployment documentation belong here.

Logical services:

- PostgreSQL for application metadata.
- S3-compatible object storage for file contents.
- API runtime.
- Web/PWA hosting.
- Optional cache/queue when background processing is introduced.

Provider-specific credentials, signing keys and production secrets must never be committed to this repository. Only safe templates such as `.env.example` may be versioned.
