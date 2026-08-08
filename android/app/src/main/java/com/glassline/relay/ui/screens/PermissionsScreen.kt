package com.glassline.relay.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glassline.relay.ui.components.GlassCard

data class PermissionItem(
    val id: String,
    val title: String,
    val description: String,
    val icon: ImageVector,
    var isGranted: Boolean
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PermissionsScreen(
    onNavigateBack: () -> Unit = {}
) {
    BackHandler {
        onNavigateBack()
    }

    val permissionsList = remember {
        mutableStateListOf(
            PermissionItem("location", "Location & IP Sensing", "Detect region, local timezone, and near-me channels via IP & GPS.", Icons.Default.LocationOn, true),
            PermissionItem("camera", "Camera Access", "Scan QR codes and record status media stories.", Icons.Default.Check, true),
            PermissionItem("mic", "Microphone", "Voice messages and peer-to-peer audio calls.", Icons.Default.Call, true),
            PermissionItem("contacts", "Contacts Sync", "Discover friends on Relay who are in your address book.", Icons.Default.Person, false),
            PermissionItem("notifications", "Push Notifications", "Receive instant alerts for messages and thread replies.", Icons.Default.Notifications, true),
            PermissionItem("storage", "Media Storage", "Save and upload encrypted media attachments.", Icons.Default.AddCircle, true)
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFFE0F2FE),
                        Color(0xFFF0F9FF),
                        Color(0xFFF8FAFC)
                    )
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color(0xFF0F172A))
                }

                Spacer(modifier = Modifier.width(8.dp))

                Column {
                    Text("App Permissions", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A))
                    Text("Manage Android runtime hardware permissions", fontSize = 12.sp, color = Color(0xFF64748B))
                }
            }

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(permissionsList) { perm ->
                    GlassCard(
                        cornerRadius = 16.dp,
                        backgroundColor = Color.White.copy(alpha = 0.8f),
                        borderColor = Color.White
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = if (perm.isGranted) Color(0xFF0284C7) else Color(0xFF94A3B8),
                                modifier = Modifier.size(42.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(perm.icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                                }
                            }

                            Spacer(modifier = Modifier.width(12.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Text(perm.title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF0F172A))
                                Text(perm.description, fontSize = 11.sp, color = Color(0xFF64748B))
                            }

                            Spacer(modifier = Modifier.width(8.dp))

                            Switch(
                                checked = perm.isGranted,
                                onCheckedChange = { checked ->
                                    val idx = permissionsList.indexOf(perm)
                                    if (idx >= 0) {
                                        permissionsList[idx] = perm.copy(isGranted = checked)
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
