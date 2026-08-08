package com.glassline.relay.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glassline.relay.ui.components.GlassCard

data class StatusUpdate(
    val id: String,
    val userName: String,
    val userHandle: String,
    val textContent: String,
    val timestamp: String,
    val isMyStatus: Boolean = false
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusScreen() {
    var showAddModal by remember { mutableStateOf(false) }
    var newStatusText by remember { mutableStateOf("") }
    var selectedStatus by remember { mutableStateOf<StatusUpdate?>(null) }

    val statusList = remember {
        mutableStateListOf(
            StatusUpdate("s1", "Alice Vance", "@alice_vance", "Building real-time glassmorphic relays today 🚀", "12 mins ago"),
            StatusUpdate("s2", "David Kim", "@dkim_dev", "Location sensing with IP and GPS precision working great!", "1 hour ago"),
            StatusUpdate("s3", "Elena Rostova", "@elena_r", "Coffee & Kotlin Compose code review session.", "3 hours ago")
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFFFAF5FF),
                        Color(0xFFF3E8FF),
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
                    .padding(bottom = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Status Updates",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0F172A)
                    )
                    Text(
                        text = "Ephemeral status & location feeds",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )
                }

                Surface(
                    shape = CircleShape,
                    color = Color(0xFF9333EA),
                    modifier = Modifier.size(40.dp)
                ) {
                    IconButton(onClick = { showAddModal = true }) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Add Status",
                            tint = Color.White
                        )
                    }
                }
            }

            // My Status Card
            GlassCard(
                onClick = { showAddModal = true },
                cornerRadius = 16.dp,
                backgroundColor = Color.White.copy(alpha = 0.8f),
                borderColor = Color(0xFFE9D5FF),
                modifier = Modifier.padding(bottom = 16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF9333EA),
                            modifier = Modifier.size(48.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text("ME", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            }
                        }
                        Box(
                            modifier = Modifier
                                .size(16.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF22C55E))
                                .align(Alignment.BottomEnd)
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text("My Status", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF0F172A))
                        Text("Tap to update your current status or mood", fontSize = 12.sp, color = Color(0xFF64748B))
                    }

                    Icon(Icons.Default.AddCircle, contentDescription = null, tint = Color(0xFF9333EA))
                }
            }

            // Recent Updates Header
            Text(
                text = "Recent Updates",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0F172A),
                modifier = Modifier.padding(bottom = 8.dp)
            )

            // Status List
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(statusList) { status ->
                    GlassCard(
                        onClick = { selectedStatus = status },
                        cornerRadius = 16.dp,
                        backgroundColor = Color.White.copy(alpha = 0.7f),
                        borderColor = Color.White
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFA855F7),
                                modifier = Modifier.size(42.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        text = status.userName.take(1).uppercase(),
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 16.sp
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.width(12.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(status.userName, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = Color(0xFF0F172A))
                                    Text(status.timestamp, fontSize = 11.sp, color = Color(0xFF94A3B8))
                                }
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(status.textContent, fontSize = 13.sp, color = Color(0xFF475569), maxLines = 2)
                            }
                        }
                    }
                }
            }
        }

        // Add Status Dialog
        if (showAddModal) {
            AlertDialog(
                onDismissRequest = { showAddModal = false },
                title = { Text("Update Your Status", fontWeight = FontWeight.Bold) },
                text = {
                    Column {
                        OutlinedTextField(
                            value = newStatusText,
                            onValueChange = { newStatusText = it },
                            placeholder = { Text("What's happening right now?") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (newStatusText.isNotBlank()) {
                                statusList.add(
                                    0,
                                    StatusUpdate("mine_${System.currentTimeMillis()}", "Me", "@me", newStatusText, "Just now", true)
                                )
                                newStatusText = ""
                                showAddModal = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9333EA))
                    ) {
                        Text("Post Status")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showAddModal = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        // View Status Dialog
        if (selectedStatus != null) {
            AlertDialog(
                onDismissRequest = { selectedStatus = null },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(shape = CircleShape, color = Color(0xFF9333EA), modifier = Modifier.size(32.dp)) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(selectedStatus!!.userName.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                            }
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(selectedStatus!!.userName, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Text(selectedStatus!!.timestamp, fontSize = 11.sp, color = Color.Gray)
                        }
                    }
                },
                text = {
                    Text(
                        selectedStatus!!.textContent,
                        fontSize = 16.sp,
                        color = Color(0xFF0F172A),
                        modifier = Modifier.padding(vertical = 12.dp)
                    )
                },
                confirmButton = {
                    TextButton(onClick = { selectedStatus = null }) {
                        Text("Close")
                    }
                }
            )
        }
    }
}
