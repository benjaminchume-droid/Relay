package com.glassline.relay.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glassline.relay.ui.components.GlassCard

@Composable
fun ProfileScreen(
    onNavigateToPermissions: () -> Unit = {}
) {
    var isOnlineToggle by remember { mutableStateOf(true) }
    var isP2PEnabled by remember { mutableStateOf(true) }
    var isLocationSharing by remember { mutableStateOf(true) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFFF1F5F9),
                        Color(0xFFE2E8F0),
                        Color(0xFFCBD5E1)
                    )
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            // Header Title
            Text(
                text = "Profile & Settings",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0F172A)
            )
            Text(
                text = "Manage your Relay identity and Android permissions",
                fontSize = 12.sp,
                color = Color(0xFF64748B),
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // User Info Card
            GlassCard(
                cornerRadius = 20.dp,
                backgroundColor = Color.White.copy(alpha = 0.85f),
                borderColor = Color.White,
                modifier = Modifier.padding(bottom = 16.dp)
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFF0284C7),
                        modifier = Modifier.size(72.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("B", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 28.sp)
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Text("Benjamin Chume", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color(0xFF0F172A))
                    Text("@benjamin_relay", fontSize = 13.sp, color = Color(0xFF64748B))

                    Spacer(modifier = Modifier.height(6.dp))

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFFE0F2FE)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("IP Sensing Active (UK)", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF0369A1))
                        }
                    }
                }
            }

            // Android Runtime Permissions Entry Card
            GlassCard(
                onClick = onNavigateToPermissions,
                cornerRadius = 16.dp,
                backgroundColor = Color(0xFFE0F2FE).copy(alpha = 0.7f),
                borderColor = Color(0xFFBAE6FD),
                modifier = Modifier.padding(bottom = 16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFF0284C7),
                        modifier = Modifier.size(42.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Lock, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                        }
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text("App Permissions & Privacy", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF0F172A))
                        Text("Location, Camera, Mic, Contacts & Device permissions", fontSize = 12.sp, color = Color(0xFF0369A1))
                    }

                    Icon(Icons.Default.KeyboardArrowRight, contentDescription = null, tint = Color(0xFF0284C7))
                }
            }

            // Quick Toggles Section
            Text("Preferences", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color(0xFF0F172A), modifier = Modifier.padding(bottom = 8.dp))

            GlassCard(
                cornerRadius = 16.dp,
                backgroundColor = Color.White.copy(alpha = 0.8f),
                borderColor = Color.White,
                modifier = Modifier.padding(bottom = 16.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Online Status Visibility", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Text("Show when you are active on Relay", fontSize = 11.sp, color = Color.Gray)
                        }
                        Switch(checked = isOnlineToggle, onCheckedChange = { isOnlineToggle = it })
                    }

                    Divider(color = Color(0xFFF1F5F9))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("P2P Direct Sync", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Text("Peer-to-peer data relaying for fast messaging", fontSize = 11.sp, color = Color.Gray)
                        }
                        Switch(checked = isP2PEnabled, onCheckedChange = { isP2PEnabled = it })
                    }

                    Divider(color = Color(0xFFF1F5F9))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("IP & Location Sensing", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Text("Auto-detect network IP for nearby channels", fontSize = 11.sp, color = Color.Gray)
                        }
                        Switch(checked = isLocationSharing, onCheckedChange = { isLocationSharing = it })
                    }
                }
            }

            // Build Info
            GlassCard(
                cornerRadius = 16.dp,
                backgroundColor = Color.White.copy(alpha = 0.5f),
                borderColor = Color.White
            ) {
                Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Glassline Relay v1.0.0 (Build 100)", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF64748B))
                    Text("Android Native Compose & Web Hybrid Engine", fontSize = 11.sp, color = Color(0xFF94A3B8))
                }
            }
        }
    }
}
