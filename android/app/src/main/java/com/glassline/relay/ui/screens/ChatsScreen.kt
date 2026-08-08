package com.glassline.relay.ui.screens

import androidx.activity.compose.BackHandler
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

data class ChatItem(
    val id: String,
    val name: String,
    val handle: String,
    val lastMessage: String,
    val time: String,
    val unreadCount: Int = 0,
    val isOnline: Boolean = false,
    val isGroup: Boolean = false
)

data class MessageItem(
    val id: String,
    val senderName: String,
    val content: String,
    val timestamp: String,
    val isMe: Boolean
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatsScreen(
    onNavigateToGroupProfile: (String) -> Unit = {}
) {
    var selectedChat by remember { mutableStateOf<ChatItem?>(null) }
    var searchQuery by remember { mutableStateOf("") }

    // System Back Button Handling
    BackHandler(enabled = selectedChat != null) {
        selectedChat = null
    }

    val chatsList = remember {
        listOf(
            ChatItem("1", "Alice Vance", "@alice_vance", "Hey! Did you check out the new Glassline features?", "10:42 AM", 2, true),
            ChatItem("2", "Tech Community Lead", "@tech_lead", "Next meetup scheduled for Friday 5 PM.", "09:15 AM", 0, false, true),
            ChatItem("3", "David Kim", "@dkim_dev", "Sounds great! Let's talk tomorrow.", "Yesterday", 0, true),
            ChatItem("4", "Elena Rostova", "@elena_r", "Thanks for sending over the documentation.", "Yesterday", 1, false)
        )
    }

    if (selectedChat != null) {
        ChatDetailScreen(
            chat = selectedChat!!,
            onBack = { selectedChat = null },
            onViewGroupInfo = {
                if (selectedChat!!.isGroup) {
                    onNavigateToGroupProfile(selectedChat!!.id)
                }
            }
        )
    } else {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color(0xFFE2E8F0),
                            Color(0xFFF1F5F9),
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
                // Top Header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Chats",
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            text = "Encrypted messaging relay",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                    }

                    Surface(
                        shape = CircleShape,
                        color = Color(0xFF0284C7),
                        modifier = Modifier.size(40.dp)
                    ) {
                        IconButton(onClick = { /* New Chat */ }) {
                            Icon(
                                imageVector = Icons.Default.Edit,
                                contentDescription = "New Chat",
                                tint = Color.White
                            )
                        }
                    }
                }

                // Search Bar
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Search conversations...", fontSize = 13.sp) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Color.Gray) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color.White.copy(alpha = 0.8f),
                        unfocusedContainerColor = Color.White.copy(alpha = 0.6f),
                        focusedBorderColor = Color(0xFF0284C7),
                        unfocusedBorderColor = Color.White
                    )
                )

                // Conversation List
                val filteredChats = chatsList.filter {
                    it.name.contains(searchQuery, ignoreCase = true) || it.handle.contains(searchQuery, ignoreCase = true)
                }

                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(filteredChats) { chat ->
                        GlassCard(
                            onClick = { selectedChat = chat },
                            cornerRadius = 16.dp,
                            backgroundColor = Color.White.copy(alpha = 0.7f),
                            borderColor = Color.White
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Avatar with Status Indicator
                                Box {
                                    Surface(
                                        shape = CircleShape,
                                        color = if (chat.isGroup) Color(0xFF0284C7) else Color(0xFF3B82F6),
                                        modifier = Modifier.size(46.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Text(
                                                text = chat.name.take(1).uppercase(),
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 18.sp
                                            )
                                        }
                                    }
                                    if (chat.isOnline) {
                                        Box(
                                            modifier = Modifier
                                                .size(12.dp)
                                                .clip(CircleShape)
                                                .background(Color(0xFF22C55E))
                                                .align(Alignment.BottomEnd)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.width(12.dp))

                                // Text details
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = chat.name,
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 15.sp,
                                            color = Color(0xFF0F172A)
                                        )
                                        Text(
                                            text = chat.time,
                                            fontSize = 11.sp,
                                            color = Color(0xFF94A3B8)
                                        )
                                    }

                                    Spacer(modifier = Modifier.height(2.dp))

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = chat.lastMessage,
                                            fontSize = 13.sp,
                                            color = Color(0xFF64748B),
                                            maxLines = 1
                                        )
                                        if (chat.unreadCount > 0) {
                                            Box(
                                                modifier = Modifier
                                                    .clip(CircleShape)
                                                    .background(Color(0xFF0284C7))
                                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                                            ) {
                                                Text(
                                                    text = chat.unreadCount.toString(),
                                                    color = Color.White,
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatDetailScreen(
    chat: ChatItem,
    onBack: () -> Unit,
    onViewGroupInfo: () -> Unit
) {
    var messageText by remember { mutableStateOf("") }
    val messages = remember {
        mutableStateListOf(
            MessageItem("m1", chat.name, "Hey! How is everything going with the new release?", "10:38 AM", false),
            MessageItem("m2", "Me", "Everything is working smoothly! IP location and group permissions are synced.", "10:40 AM", true),
            MessageItem("m3", chat.name, chat.lastMessage, "10:42 AM", false)
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Header
            Surface(
                color = Color.White,
                shadowElevation = 2.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 8.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }

                    Spacer(modifier = Modifier.width(4.dp))

                    Surface(
                        shape = CircleShape,
                        color = Color(0xFF0284C7),
                        modifier = Modifier.size(38.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = chat.name.take(1).uppercase(),
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(10.dp))

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { if (chat.isGroup) onViewGroupInfo() }
                    ) {
                        Text(
                            text = chat.name,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            text = if (chat.isOnline) "Online" else if (chat.isGroup) "Tap for group details" else "Offline",
                            fontSize = 11.sp,
                            color = if (chat.isOnline) Color(0xFF16A34A) else Color(0xFF64748B)
                        )
                    }

                    if (chat.isGroup) {
                        IconButton(onClick = onViewGroupInfo) {
                            Icon(Icons.Default.Info, contentDescription = "Group Info", tint = Color(0xFF0284C7))
                        }
                    }
                }
            }

            // Message List
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(messages) { msg ->
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = if (msg.isMe) Alignment.End else Alignment.Start
                    ) {
                        Surface(
                            shape = RoundedCornerShape(
                                topStart = 16.dp,
                                topEnd = 16.dp,
                                bottomStart = if (msg.isMe) 16.dp else 4.dp,
                                bottomEnd = if (msg.isMe) 4.dp else 16.dp
                            ),
                            color = if (msg.isMe) Color(0xFF0284C7) else Color.White,
                            shadowElevation = 1.dp
                        ) {
                            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                                Text(
                                    text = msg.content,
                                    fontSize = 14.sp,
                                    color = if (msg.isMe) Color.White else Color(0xFF0F172A)
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = msg.timestamp,
                                    fontSize = 10.sp,
                                    color = if (msg.isMe) Color.White.copy(alpha = 0.7f) else Color(0xFF94A3B8),
                                    modifier = Modifier.align(Alignment.End)
                                )
                            }
                        }
                    }
                }
            }

            // Input Bar
            Surface(
                color = Color.White,
                shadowElevation = 4.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { /* Attach */ }) {
                        Icon(Icons.Default.AddCircle, contentDescription = "Attach", tint = Color(0xFF64748B))
                    }

                    OutlinedTextField(
                        value = messageText,
                        onValueChange = { messageText = it },
                        placeholder = { Text("Type a message...", fontSize = 13.sp) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(20.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = Color(0xFFF1F5F9),
                            unfocusedContainerColor = Color(0xFFF1F5F9),
                            focusedBorderColor = Color.Transparent,
                            unfocusedBorderColor = Color.Transparent
                        )
                    )

                    Spacer(modifier = Modifier.width(6.dp))

                    IconButton(
                        onClick = {
                            if (messageText.isNotBlank()) {
                                messages.add(
                                    MessageItem(
                                        id = System.currentTimeMillis().toString(),
                                        senderName = "Me",
                                        content = messageText,
                                        timestamp = "Just now",
                                        isMe = true
                                    )
                                )
                                messageText = ""
                            }
                        },
                        enabled = messageText.isNotBlank()
                    ) {
                        Icon(
                            Icons.Default.Send,
                            contentDescription = "Send",
                            tint = if (messageText.isNotBlank()) Color(0xFF0284C7) else Color.Gray
                        )
                    }
                }
            }
        }
    }
}
