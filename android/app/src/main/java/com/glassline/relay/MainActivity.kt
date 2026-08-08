package com.glassline.relay

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.glassline.relay.ui.screens.*
import com.glassline.relay.ui.theme.RelayTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            RelayTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    RelayAppNavigation()
                }
            }
        }
    }
}

sealed class BottomNavItem(val route: String, val title: String, val icon: ImageVector) {
    object Chats : BottomNavItem("chats", "Chats", Icons.Default.Send)
    object Explore : BottomNavItem("explore", "Explore", Icons.Default.Search)
    object Communities : BottomNavItem("communities", "Communities", Icons.Default.Share)
    object Status : BottomNavItem("status", "Status", Icons.Default.Star)
    object Profile : BottomNavItem("profile", "Profile", Icons.Default.Person)
}

@Composable
fun RelayAppNavigation() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val bottomNavItems = listOf(
        BottomNavItem.Chats,
        BottomNavItem.Explore,
        BottomNavItem.Communities,
        BottomNavItem.Status,
        BottomNavItem.Profile
    )

    val showBottomBar = bottomNavItems.any { it.route == currentRoute }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Surface(
                        shape = RoundedCornerShape(32.dp),
                        color = Color.White.copy(alpha = 0.85f),
                        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.95f)),
                        shadowElevation = 12.dp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(62.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(horizontal = 6.dp),
                            horizontalArrangement = Arrangement.SpaceEvenly,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            bottomNavItems.forEach { item ->
                                val selected = currentRoute == item.route
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(20.dp))
                                        .background(if (selected) Color(0xFFE0F2FE) else Color.Transparent)
                                        .clickable {
                                            if (currentRoute != item.route) {
                                                navController.navigate(item.route) {
                                                    popUpTo(navController.graph.findStartDestination().id) {
                                                        saveState = true
                                                    }
                                                    launchSingleTop = true
                                                    restoreState = true
                                                }
                                            }
                                        }
                                        .padding(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Icon(
                                        imageVector = item.icon,
                                        contentDescription = item.title,
                                        tint = if (selected) Color(0xFF0284C7) else Color(0xFF64748B),
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = item.title,
                                        fontSize = 10.sp,
                                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                        color = if (selected) Color(0xFF0284C7) else Color(0xFF64748B)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = BottomNavItem.Chats.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(BottomNavItem.Chats.route) {
                ChatsScreen(
                    onNavigateToGroupProfile = { groupId ->
                        navController.navigate("group_profile")
                    }
                )
            }
            composable(BottomNavItem.Explore.route) {
                ExploreScreen()
            }
            composable(BottomNavItem.Communities.route) {
                CommunitiesScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            composable(BottomNavItem.Status.route) {
                StatusScreen()
            }
            composable(BottomNavItem.Profile.route) {
                ProfileScreen(
                    onNavigateToPermissions = {
                        navController.navigate("permissions")
                    }
                )
            }
            composable("group_profile") {
                GroupProfileScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            composable("permissions") {
                PermissionsScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }
        }
    }
}

