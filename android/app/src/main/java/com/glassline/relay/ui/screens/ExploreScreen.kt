package com.glassline.relay.ui.screens

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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glassline.relay.ui.components.GlassCard

data class PublicChannel(
    val id: String,
    val name: String,
    val description: String,
    val membersCount: Int,
    val isJoined: Boolean = false
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen() {
    var searchQuery by remember { mutableStateOf("") }

    val channels = remember {
        mutableStateListOf(
            PublicChannel("c1", "Global Tech Enthusiasts", "Discuss AI, Kotlin, React, and glassmorphic UI designs.", 1240, false),
            PublicChannel("c2", "Web3 & Decentralized Relays", "Peer-to-peer relaying, privacy protocols, and crypto.", 850, true),
            PublicChannel("c3", "Local Developers Hub", "Meetups, co-working spaces, and code reviews in your city.", 430, false),
            PublicChannel("c4", "Open Source Glassline", "Contributions, bug reports, and roadmap updates.", 2900, true)
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFFECFDF5),
                        Color(0xFFF0FDF4),
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
            Text(
                text = "Explore & Discover",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0F172A)
            )
            Text(
                text = "Find public channels, users, and location-aware relays",
                fontSize = 12.sp,
                color = Color(0xFF64748B),
                modifier = Modifier.padding(bottom = 12.dp)
            )

            // Search Bar
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search channels, topics, or handles...", fontSize = 13.sp) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Color.Gray) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
                shape = RoundedCornerShape(16.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White.copy(alpha = 0.8f),
                    unfocusedContainerColor = Color.White.copy(alpha = 0.6f),
                    focusedBorderColor = Color(0xFF10B981),
                    unfocusedBorderColor = Color.White
                )
            )

            // Public Channels Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Featured Public Relays",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0F172A)
                )
                Text(
                    text = "${channels.size} active",
                    fontSize = 12.sp,
                    color = Color(0xFF64748B)
                )
            }

            // Channel Cards
            val filtered = channels.filter {
                it.name.contains(searchQuery, ignoreCase = true) || it.description.contains(searchQuery, ignoreCase = true)
            }

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(filtered) { channel ->
                    GlassCard(
                        cornerRadius = 16.dp,
                        backgroundColor = Color.White.copy(alpha = 0.75f),
                        borderColor = Color.White
                    ) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFF10B981),
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Default.Share, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                                        }
                                    }

                                    Column {
                                        Text(
                                            text = channel.name,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp,
                                            color = Color(0xFF0F172A)
                                        )
                                        Text(
                                            text = "${channel.membersCount} members",
                                            fontSize = 11.sp,
                                            color = Color(0xFF64748B)
                                        )
                                    }
                                }

                                Button(
                                    onClick = {
                                        val idx = channels.indexOf(channel)
                                        if (idx >= 0) {
                                            channels[idx] = channel.copy(isJoined = !channel.isJoined)
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = if (channel.isJoined) Color(0xFFE2E8F0) else Color(0xFF10B981),
                                        contentColor = if (channel.isJoined) Color(0xFF475569) else Color.White
                                    ),
                                    shape = RoundedCornerShape(12.dp),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                ) {
                                    Text(
                                        text = if (channel.isJoined) "Joined" else "Join",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Text(
                                text = channel.description,
                                fontSize = 12.sp,
                                color = Color(0xFF475569)
                            )
                        }
                    }
                }
            }
        }
    }
}
