# Relay Release Documentation

For complete details on Android Release Build, Signing Credentials, Versioning, and Deployment Infrastructure, please refer to:

👉 **[android/RELEASE_DOCUMENTATION.md](android/RELEASE_DOCUMENTATION.md)**

Quick Commands:
- Generate icons: `node scripts/generate_launcher_icons.cjs`
- Build Release APK: `cd android && ./gradlew assembleRelease`
- Build Release AAB: `cd android && ./gradlew bundleRelease`
