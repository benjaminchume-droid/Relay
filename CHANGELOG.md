# Changelog

All notable changes to Relay will be documented in this file.

## [0.5.2] - 2026-07-30
### Added
- **Android Gradle Version Catalog**: Configured `libs.versions.toml` with targetSdk 34, compileSdk 34, minSdk 26, and AGP 8.3+.
- **Package Name & Application ID**: Standardized namespace and ID as `com.glassline.relay`.
- **Just-in-Time Runtime Permissions**: Camera, Microphone, Photos/Videos, Audio, Notifications, Contacts, and Device Info Consent.
- **Relay SDK Layer**: Standardized SDK communication (`relay.auth`, `relay.messages`, `relay.media`, `relay.profile`, `relay.communities`, etc.) enforcing Edge Function proxy architecture.
- **GitHub Actions CI/CD Pipeline**: Automated Gradle builds, linting, test validation, AAB & APK assembly, and GitHub Tag releases.
