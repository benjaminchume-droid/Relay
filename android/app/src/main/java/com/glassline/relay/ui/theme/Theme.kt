package com.glassline.relay.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val AzureBlue = Color(0xFF2563EB)
val LiquidWhite = Color(0xF8F2F5F8)
val GlassSurfaceLight = Color(0x99FFFFFF)
val GlassBorderLight = Color(0xB3FFFFFF)
val TextPrimaryLight = Color(0xFF1E293B)
val TextSecondaryLight = Color(0xFF64748B)

private val LightColorScheme = lightColorScheme(
    primary = AzureBlue,
    onPrimary = Color.White,
    background = LiquidWhite,
    onBackground = TextPrimaryLight,
    surface = GlassSurfaceLight,
    onSurface = TextPrimaryLight
)

private val DarkColorScheme = darkColorScheme(
    primary = AzureBlue,
    onPrimary = Color.White,
    background = Color(0xFF0F172A),
    onBackground = Color.White,
    surface = Color(0x331E293B),
    onSurface = Color.White
)

@Composable
fun RelayTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
