package com.glassline.relay.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glassline.relay.ui.components.GlassCard

data class CommunityItem(
    val id: String,
    val name: String,
    val handle: String,
    val description: String,
    val memberCount: Int,
    val isJoined: Boolean,
    val isOwner: Boolean,
    val isPrivate: Boolean
)

data class CommunityPostItem(
    val id: String,
    val authorName: String,
    val title: String?,
    val content: String,
    val likesCount: Int,
    val commentsCount: Int,
    val timestamp: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommunitiesScreen(
    onNavigateBack: () -> Unit = {}
) {
    var selectedCommunity by remember { mutableStateOf<CommunityItem?>(null) }
    var showCommunityInfoModal by remember { mutableStateOf(false) }
    var showCreateThreadModal by remember { mutableStateOf(false) }

    // System Back Button Handling
    BackHandler(enabled = showCommunityInfoModal || showCreateThreadModal || selectedCommunity != null) {
        when {
            showCommunityInfoModal -> showCommunityInfoModal = false
            showCreateThreadModal -> showCreateThreadModal = false
            selectedCommunity != null -> selectedCommunity = null
            else -> onNavigateBack()
        }
    }

    val sampleCommunities = remember {
        listOf(
            CommunityItem(
                id = "c1",
                name = "Tech Innovators",
                handle = "@tech-hub",
                description = "Exploring cutting edge AI & software architecture.",
                memberCount = 1240,
                isJoined = true,
                isOwner = true,
                isPrivate = false
            ),
            CommunityItem(
                id = "c2",
                name = "Design System Guild",
                handle = "@design-systems",
                description = "UI/UX, Glassmorphism, and Jetpack Compose patterns.",
                memberCount = 850,
                isJoined = true,
                isOwner = false,
                isPrivate = false
            )
        )
    }

    val samplePosts = remember {
        mutableStateListOf(
            CommunityPostItem(
                id = "p1",
                authorName = "Alex Vance",
                title = "Welcome to Relay v0.5.2!",
                content = "Check out our new liquid glass layout and community features.",
                likesCount = 24,
                commentsCount = 5,
                timestamp = "10m ago"
            )
        )
    }

    Box(modifier = Modifier.fillMaxSize().background(Color(0xFFF2F5F8))) {
        if (selectedCommunity == null) {
            // Communities Directory
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                Text(
                    text = "Communities",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1E293B)
                )
                Text(
                    text = "Vertical directory of your channels & hubs",
                    fontSize = 12.sp,
                    color = Color(0xFF64748B),
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(sampleCommunities) { comm ->
                        GlassCard(
                            onClick = { selectedCommunity = comm }
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(48.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(Color(0xFF2563EB)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = comm.name.take(1),
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 20.sp
                                    )
                                }

                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .padding(start = 12.dp)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            text = comm.name,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp,
                                            color = Color(0xFF1E293B)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFFEFF6FF)
                                        ) {
                                            Text(
                                                text = "Joined",
                                                color = Color(0xFF2563EB),
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                    Text(
                                        text = "${comm.handle} • ${comm.memberCount} members",
                                        fontSize = 11.sp,
                                        color = Color(0xFF64748B)
                                    )
                                }
                                Icon(
                                    imageVector = Icons.Default.ChevronRight,
                                    contentDescription = "Open",
                                    tint = Color.Gray
                                )
                            }
                        }
                    }
                }
            }
        } else {
            // Community Chat Feed Screen
            val currentComm = selectedCommunity!!

            Column(modifier = Modifier.fillMaxSize()) {
                // Top bar: Clicking bar OR 3-dots icon opens Community Info Screen
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = Color.White.copy(alpha = 0.85f),
                    shadowElevation = 2.dp
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = { selectedCommunity = null }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                        }

                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { showCommunityInfoModal = true }
                                .padding(horizontal = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color(0xFF2563EB)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = currentComm.name.take(1),
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            Column(modifier = Modifier.padding(start = 10.dp)) {
                                Text(
                                    text = currentComm.name,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = Color(0xFF1E293B)
                                )
                                Text(
                                    text = "${currentComm.handle} • ${currentComm.memberCount} members",
                                    fontSize = 11.sp,
                                    color = Color(0xFF64748B)
                                )
                            }
                        }

                        IconButton(onClick = { showCommunityInfoModal = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Community Info")
                        }
                    }
                }

                // Feed
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(samplePosts) { post ->
                        GlassCard {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = post.authorName,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp,
                                    color = Color(0xFF1E293B)
                                )
                                if (post.title != null) {
                                    Text(
                                        text = post.title,
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 13.sp,
                                        color = Color(0xFF0F172A),
                                        modifier = Modifier.padding(top = 4.dp)
                                    )
                                }
                                Text(
                                    text = post.content,
                                    fontSize = 12.sp,
                                    color = Color(0xFF334155),
                                    modifier = Modifier.padding(top = 4.dp, bottom = 8.dp)
                                )
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            Icons.Default.Favorite,
                                            contentDescription = "Like",
                                            tint = Color.Red,
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(text = "${post.likesCount}", fontSize = 11.sp)
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            Icons.Default.Comment,
                                            contentDescription = "Comments",
                                            tint = Color.Gray,
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(text = "${post.commentsCount}", fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Floating Action Button (+) to create thread
            FloatingActionButton(
                onClick = { showCreateThreadModal = true },
                containerColor = Color(0xFF2563EB),
                contentColor = Color.White,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(20.dp)
            ) {
                Icon(Icons.Default.Add, contentDescription = "Create Thread")
            }
        }

        // Community Info Sheet / Modal
        if (showCommunityInfoModal && selectedCommunity != null) {
            val comm = selectedCommunity!!
            AlertDialog(
                onDismissRequest = { showCommunityInfoModal = false },
                title = {
                    Text(
                        text = comm.name,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(text = comm.handle, fontSize = 12.sp, color = Color.Gray)
                        Text(text = comm.description, fontSize = 13.sp)
                        Text(
                            text = "Members: ${comm.memberCount}",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        if (comm.isOwner) {
                            Button(
                                onClick = {
                                    showCommunityInfoModal = false
                                    selectedCommunity = null
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color.Red),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Delete Community")
                            }
                        } else if (comm.isJoined) {
                            Button(
                                onClick = {
                                    showCommunityInfoModal = false
                                    selectedCommunity = null
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFFFEE2E2),
                                    contentColor = Color.Red
                                ),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.ExitToApp, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Leave Community")
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { showCommunityInfoModal = false }) {
                        Text("Close")
                    }
                }
            )
        }

        // Create Thread Modal
        if (showCreateThreadModal && selectedCommunity != null) {
            var newTitle by remember { mutableStateOf("") }
            var newContent by remember { mutableStateOf("") }

            AlertDialog(
                onDismissRequest = { showCreateThreadModal = false },
                title = {
                    Text(
                        text = "Create Thread in #${selectedCommunity!!.name}",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = newTitle,
                            onValueChange = { newTitle = it },
                            label = { Text("Title (optional)") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = newContent,
                            onValueChange = { newContent = it },
                            label = { Text("Content") },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 3
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (newContent.isNotBlank()) {
                                samplePosts.add(
                                    0,
                                    CommunityPostItem(
                                        id = "p_${System.currentTimeMillis()}",
                                        authorName = "You",
                                        title = if (newTitle.isBlank()) null else newTitle,
                                        content = newContent,
                                        likesCount = 0,
                                        commentsCount = 0,
                                        timestamp = "Just now"
                                    )
                                )
                                showCreateThreadModal = false
                            }
                        },
                        enabled = newContent.isNotBlank()
                    ) {
                        Text("Publish")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showCreateThreadModal = false }) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}
