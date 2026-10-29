import java.io.FileInputStream
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

// Load key.properties from rootProject, project dir, or parent directory
val keystorePropertiesFile = rootProject.file("key.properties").takeIf { it.exists() }
    ?: file("../key.properties").takeIf { it.exists() }
    ?: file("key.properties").takeIf { it.exists() }

val keystoreProperties = Properties()
if (keystorePropertiesFile != null) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.glassline.relay"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.glassline.relay"
        minSdk = 26
        targetSdk = 34
        versionCode = 522
        versionName = "0.5.2.2"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }

        buildConfigField("String", "SUPABASE_URL", "\"${System.getenv("SUPABASE_URL") ?: ""}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${System.getenv("SUPABASE_ANON_KEY") ?: ""}\"")
    }

    signingConfigs {
        create("release") {
            val storeFilePath = keystoreProperties.getProperty("storeFile")
                ?: System.getenv("KEYSTORE_FILE")
                ?: "upload-keystore.jks"

            val keystoreFile = file(storeFilePath).takeIf { it.exists() }
                ?: rootProject.file(storeFilePath).takeIf { it.exists() }
                ?: file("app/$storeFilePath").takeIf { it.exists() }
                ?: file("../$storeFilePath").takeIf { it.exists() }

            val envStorePass = System.getenv("KEYSTORE_PASSWORD") ?: System.getenv("ANDROID_RELEASE_KEYSTORE_PASSWORD") ?: ""
            val envKeyAlias = System.getenv("KEY_ALIAS") ?: System.getenv("ANDROID_RELEASE_KEY_ALIAS") ?: ""
            val envKeyPass = System.getenv("KEY_PASSWORD") ?: System.getenv("ANDROID_RELEASE_KEY_PASSWORD") ?: System.getenv("KEYSTORE_PASSWORD") ?: System.getenv("ANDROID_RELEASE_KEYSTORE_PASSWORD") ?: ""
            val envStoreType = System.getenv("KEYSTORE_TYPE") ?: ""

            val propStorePass = keystoreProperties.getProperty("storePassword")
            val propKeyAlias = keystoreProperties.getProperty("keyAlias")
            val propKeyPass = keystoreProperties.getProperty("keyPassword")
            val propStoreType = keystoreProperties.getProperty("storeType")

            val finalStorePass = if (!propStorePass.isNullOrEmpty()) propStorePass else envStorePass
            val finalKeyAlias = if (!propKeyAlias.isNullOrEmpty()) propKeyAlias else envKeyAlias
            val finalKeyPass = if (!propKeyPass.isNullOrEmpty()) propKeyPass else if (!propStorePass.isNullOrEmpty()) propStorePass else envKeyPass
            val finalStoreType = if (!propStoreType.isNullOrEmpty()) propStoreType else envStoreType

            storeFile = keystoreFile ?: file(storeFilePath)
            storePassword = finalStorePass
            keyAlias = finalKeyAlias
            keyPassword = finalKeyPass
            if (!finalStoreType.isNullOrEmpty()) {
                storeType = finalStoreType
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    kotlinOptions {
        jvmTarget = "21"
        freeCompilerArgs += listOf(
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi"
        )
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    bundle {
        language { enableSplit = true }
        density { enableSplit = true }
        abi { enableSplit = true }
    }
}

dependencies {
    implementation(project(":capacitor-android"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.coordinatorlayout:coordinatorlayout:1.2.0")
    implementation(libs.kotlinx.coroutines.android)
}

val capacitorBuildGradle = file("capacitor.build.gradle")
if (capacitorBuildGradle.exists()) {
    apply(from = capacitorBuildGradle)
}

gradle.taskGraph.whenReady {
    val isReleaseTaskRequested = allTasks.any { task ->
        val name = task.name
        (name.contains("Release", ignoreCase = false) &&
            (name.startsWith("assemble") || name.startsWith("bundle") || name.startsWith("package")))
    }
    if (isReleaseTaskRequested) {
        val releaseSigning = android.signingConfigs.getByName("release")
        val storeFile = releaseSigning.storeFile
        if (storeFile == null || !storeFile.exists()) {
            throw GradleException(
                "Release build failure: Release signing keystore was not found at '${storeFile?.absolutePath ?: "unconfigured"}'. " +
                "Ensure ANDROID_RELEASE_KEYSTORE_BASE64 or KEYSTORE_FILE is configured for release builds."
            )
        }
        if (releaseSigning.storePassword.isNullOrEmpty()) {
            throw GradleException(
                "Release build failure: Release keystore password (KEYSTORE_PASSWORD / ANDROID_RELEASE_KEYSTORE_PASSWORD) is missing or empty."
            )
        }
        if (releaseSigning.keyAlias.isNullOrEmpty()) {
            throw GradleException(
                "Release build failure: Release key alias (KEY_ALIAS / ANDROID_RELEASE_KEY_ALIAS) is missing or empty."
            )
        }
        if (releaseSigning.keyPassword.isNullOrEmpty()) {
            throw GradleException(
                "Release build failure: Release key password (KEY_PASSWORD / ANDROID_RELEASE_KEY_PASSWORD) is missing or empty."
            )
        }
    }
}

