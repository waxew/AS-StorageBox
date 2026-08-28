# Android client

Native Kotlin client for AS-StorageBox.

Planned foundation:

- Kotlin
- Jetpack Compose UI
- Material 3
- MVVM / clean layered architecture
- Retrofit/OkHttp API layer
- Room local metadata/cache
- WorkManager for durable transfers/background work
- Android Keystore-backed secure credential storage

Initial feature modules: authentication, home/files, folders, uploads, shared-with-me, share management, profile/settings and trash.

Implementation rule: network/storage operations stay outside composables. Authorization remains server-side; local UI checks are usability controls, not security boundaries.
