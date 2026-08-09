pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Relay"
include(":app")

include(":capacitor-android")
project(":capacitor-android").projectDir = java.io.File("../node_modules/@capacitor/android/capacitor")
