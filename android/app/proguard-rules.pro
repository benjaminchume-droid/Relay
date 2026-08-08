# R8 and ProGuard rules for Relay (com.glassline.relay)

-keep class com.glassline.relay.** { *; }

# Keep Compose models
-keepclassmembers class * {
    @androidx.compose.runtime.Composable *;
}

# Keep Hilt generated classes
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.internal.UnsafeCasts { *; }

# Keep Network DTO models
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
