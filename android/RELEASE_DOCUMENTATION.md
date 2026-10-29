# Relay Android Build, Signing & Release Infrastructure Documentation

This document outlines the complete production release, signing, versioning, and build workflow for the **Relay** Android application (`com.glassline.relay`).

---

## 1. Release Signing Architecture

Relay uses standard Android release signing practices supporting both local `key.properties` configuration and CI/CD environment variable injection with a graceful fallback to debug signing when credentials are absent.

### Key Files
- `android/key.properties`: Contains private keystore paths and passwords (ignored by Git).
- `android/key.properties.example`: Template for configuring local developer release keys.
- `upload-keystore.jks`: Android Java KeyStore binary file containing the signing key certificate.

### Signing Configuration Hierarchy
When Gradle runs `assembleRelease` or `bundleRelease`, `android/app/build.gradle.kts` resolves signing credentials in the following order:

1. **`key.properties` file**:
   Loads `storeFile`, `storePassword`, `keyAlias`, and `keyPassword` from `android/key.properties`.
2. **Environment Variables**:
   If properties are missing, falls back to environment variables:
   - `KEYSTORE_FILE`
   - `KEYSTORE_PASSWORD`
   - `KEY_ALIAS`
   - `KEY_PASSWORD`
3. **Debug Fallback**:
   If no valid keystore file is present on disk, Gradle falls back to the default debug key so unsigned/development release builds compile without errors.

---

## 2. Generating a New Upload Keystore

To create a new 2048-bit RSA upload keystore with 10,000 days validity:

```bash
cd android
keytool -genkey -v \
  -keystore upload-keystore.jks \
  -alias upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Prompts:
- **Keystore Password**: Choose a strong password.
- **Key Alias**: `upload` (or your chosen alias).
- **Certificate Info**: Fill in First/Last Name, Organizational Unit, Organization, City, State, Country Code.

---

## 3. Configuring Local Signing Credentials

1. Copy `android/key.properties.example` to `android/key.properties`:

   ```bash
   cp android/key.properties.example android/key.properties
   ```

2. Edit `android/key.properties`:

   ```properties
   storeFile=upload-keystore.jks
   storePassword=YourStrongKeystorePassword
   keyAlias=upload
   keyPassword=YourStrongKeyPassword
   ```

3. Ensure `upload-keystore.jks` is placed inside `android/` directory or specified as a valid relative path.

---

## 4. Version Management & Upgrade Rules

App versioning is defined inside `android/app/build.gradle.kts`:

```kotlin
defaultConfig {
    applicationId = "com.glassline.relay"
    minSdk = 26
    targetSdk = 34
    versionCode = 52
    versionName = "0.5.2"
}
```

### Versioning Guidelines
- **`versionCode`** (Mandatory Monotonic Integer):
  - Must increase strictly with **every single release** or update build submitted to Google Play or distributed to users.
  - Example sequence: `52` → `53` → `54` → `55` ...
- **`versionName`** (User-Visible Semantic Version String):
  - Follows `MAJOR.MINOR.PATCH` format.
  - Patch updates (bug fixes): `0.5.2` → `0.5.3`
  - Feature releases: `0.5.3` → `0.6.0`
  - Major overhaul: `0.6.0` → `1.0.0`

### Seamless In-Place App Upgrade Requirements
For end users to seamlessly update Relay over an existing installation without uninstalling:
1. **Same Application ID**: `com.glassline.relay` (never change this!).
2. **Same Signing Key**: Signed with the matching keystore certificate.
3. **Higher `versionCode`**: The new build must have a strictly higher `versionCode` than the installed version.

---

## 5. Building Release Artifacts

### Build Signed Release APK
Generates a standalone APK suitable for direct installation or sideloading:

```bash
cd android
./gradlew assembleRelease
```

**Output Artifact Path:**
`android/app/build/outputs/apk/release/app-release.apk`

### Build Signed Release AAB (Android App Bundle)
Generates an optimized App Bundle required for Google Play Store publishing:

```bash
cd android
./gradlew bundleRelease
```

**Output Artifact Path:**
`android/app/build/outputs/bundle/release/app-release.aab`

### Build Debug APK
For local development and testing:

```bash
cd android
./gradlew assembleDebug
```

**Output Artifact Path:**
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 6. CI/CD Integration (GitHub Actions / Cloud Build)

To automate signed releases in CI/CD without committing secrets to Git:

1. Encode your `upload-keystore.jks` to base64:

   ```bash
   base64 -w 0 android/upload-keystore.jks > keystore_base64.txt
   ```

2. Store secrets in repository settings / secret manager:
   - `KEYSTORE_BASE64`: Contents of `keystore_base64.txt`
   - `KEYSTORE_PASSWORD`: Your store password
   - `KEY_ALIAS`: Your key alias
   - `KEY_PASSWORD`: Your key password

3. Workflow step script:

   ```yaml
   - name: Decode Keystore
     run: |
       echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > android/upload-keystore.jks

   - name: Build Signed Release AAB
     env:
       KEYSTORE_FILE: upload-keystore.jks
       KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
       KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
       KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
     run: |
       cd android
       ./gradlew bundleRelease
   ```

---

## 7. Key Preservation & Disaster Recovery

### Key Safety & Preservation Rules
- **Backup**: Store `upload-keystore.jks` and passwords in at least two separate secure, encrypted locations (e.g., 1Password Vault, HashiCorp Vault, AWS Secrets Manager).
- **Google Play App Signing**: Enable **Play App Signing** in Google Play Console. When Play App Signing is enabled, Google manages your app signing key in high-security cloud infrastructure. If your local upload key is lost, you can request an Upload Key Reset through the Google Play Console support center without bricking user updates.

---

## 8. Google OAuth & Certificate Fingerprints

### CI/CD Production Release SHA-1 Fingerprint
The GitHub Actions release signing certificate SHA-1 fingerprint for Relay Android client (`com.glassline.relay`):

- **Formatted (Colons)**: `70:67:FD:A4:65:32:79:FA:00:79:03:56:0E:27:06:2D:72:48:75:36`
- **Raw Hex**: `7067FDA4653279FA007903560E27062D72487536`

### Usage for Google Sign-In & Supabase / Firebase OAuth:
1. **Google Cloud Console**:
   - Go to **APIs & Services > Credentials**.
   - Select or create an **Android Client ID**.
   - Set Application ID / Package Name to `com.glassline.relay`.
   - Add the SHA-1 fingerprint above (`70:67:FD:A4:65:32:79:FA:00:79:03:56:0E:27:06:2D:72:48:75:36`).
2. **Supabase / Firebase Auth Configuration**:
   - Paste the generated Google Client ID into your Supabase / Firebase Auth Provider settings to enable native Google OAuth for release APKs and App Bundles.

---

## 9. Asset & Icon Generation Script

Relay provides an automated script to regenerate all Android density launcher icons (`mipmap-mdpi`, `mipmap-hdpi`, `mipmap-xhdpi`, `mipmap-xxhdpi`, `mipmap-xxxhdpi`):

```bash
node scripts/generate_launcher_icons.cjs
```

Generated launcher files per density bucket:
- `ic_launcher.png`: Legacy squircle icon.
- `ic_launcher_round.png`: Round icon.
- `ic_launcher_foreground.png`: Adaptive foreground icon.
