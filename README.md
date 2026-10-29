# Relay - Liquid Glass Communication Platform

**Relay** is a communication platform developed by **Glass Line Studio**, featuring customizable Liquid Glass aesthetics, real-time messaging, communities, and Android client applications.

---

## Project Specifications

- **Application Name**: Relay
- **Developer**: Glass Line Studio
- **Package Name / Namespace**: `com.glassline.relay`
- **Application ID**: `com.glassline.relay`
- **Version**: `0.5.2` (Version Code: `52`)
- **Compile SDK**: `34`
- **Min SDK**: `26`
- **Target SDK**: `34`

---

## Key Architecture

### Web & Client Architecture
```text
React 18 + Vite + Tailwind CSS + Liquid Glass Material Engine
         │
         ▼
     Relay SDK (src/services/apiService.ts)
         │
         ▼
 Express Backend & Supabase Edge Functions (server.ts)
         │
         ▼
 Supabase PostgreSQL Database & Storage
```

### Android Architecture
```text
Android App (Jetpack Compose + Material 3)
         │
         ▼
    MVVM ViewModels & Repositories
         │
         ▼
     Relay SDK Layer
         │
         ▼
  Edge Functions & Supabase Backend
```

---

## Runtime Permissions & Privacy

Relay enforces **Just-in-Time** permission requests in compliance with Android privacy policies:

- **Camera**: `android.permission.CAMERA` (Photos, video stories, video calls)
- **Microphone**: `android.permission.RECORD_AUDIO` (Voice messages, voice calls)
- **Photos & Media**: `android.permission.READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`
- **Audio Files**: `android.permission.READ_MEDIA_AUDIO`
- **Notifications**: `android.permission.POST_NOTIFICATIONS`
- **Contacts**: `android.permission.READ_CONTACTS` (Optional find friends)
- **Device Information**: Explicit user consent modal before capturing hardware specs and telemetry metrics.

---

## GitHub Actions CI/CD Pipeline

The `.github/workflows/ci-cd.yml` workflow automatically executes:

1. **Build & Test Validation**:
   - JDK 17 setup with Gradle caching
   - Android Lint & static analysis
   - Unit test execution
   - Debug APK compilation & artifact upload

2. **Release Build Assembly**:
   - R8 code optimization & resource shrinking
   - Android App Bundle (`.aab`) & Universal APK generation
   - Keystore signing using GitHub Secrets

3. **Release Publishing**:
   - Automated GitHub Release tags on `v*` release pushes.

---

## Local Development & Build

### Web Client & Backend
```bash
npm install
npm run dev
```

### Android Project Build
```bash
cd android
./gradlew assembleDebug
./gradlew testDebugUnitTest
```

---

## License
Licensed under the Apache License, Version 2.0. Copyright 2026 Glass Line Studio.
