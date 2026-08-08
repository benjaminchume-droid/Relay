import { supabaseServer, supabaseAdmin } from "./server";
import { 
  UserProfile, Chat, Message, Community, CommunityPost, PostComment, 
  NotificationItem, DeviceSession, CommunityChannel 
} from "../../types";

const getClient = () => supabaseAdmin || supabaseServer;

// --- OTP REPOSITORY ---
export const otpRepo = {
  async saveOtp(email: string, code: string, purpose: string, expiresAt: number) {
    const db = getClient();
    await db.from("otp_codes").upsert({
      email: email.toLowerCase(),
      code,
      purpose,
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    }, { onConflict: "email" });
  },

  async getOtp(email: string) {
    const db = getClient();
    const { data } = await db.from("otp_codes").select("*").eq("email", email.toLowerCase()).maybeSingle();
    return data;
  },

  async deleteOtp(email: string) {
    const db = getClient();
    await db.from("otp_codes").delete().eq("email", email.toLowerCase());
  }
};

// --- SESSION REPOSITORY ---
export const sessionRepo = {
  async createSession(userId: string, token: string, deviceSession: DeviceSession) {
    const db = getClient();
    await db.from("user_sessions").insert({
      token,
      user_id: userId,
      device_id: deviceSession.id,
      device_name: deviceSession.device,
      browser: deviceSession.browser,
      ip_address: deviceSession.ip,
      location: deviceSession.location,
      last_active: deviceSession.lastActive,
      created_at: new Date().toISOString()
    });
  },

  async getSession(token: string) {
    const db = getClient();
    const { data } = await db.from("user_sessions").select("*, profile:profiles(*)").eq("token", token).maybeSingle();
    return data;
  },

  async deleteSession(token: string) {
    const db = getClient();
    await db.from("user_sessions").delete().eq("token", token);
  },

  async getUserSessions(userId: string): Promise<DeviceSession[]> {
    const db = getClient();
    const { data } = await db.from("user_sessions").select("*").eq("user_id", userId);
    return (data || []).map((s: any) => ({
      id: s.device_id,
      device: s.device_name,
      browser: s.browser || "Relay App",
      location: s.location || "Active Region",
      ip: s.ip_address || "127.0.0.1",
      lastActive: s.last_active || "Just now",
      isCurrent: false,
      token: s.token
    }));
  },

  async deleteUserSession(userId: string, deviceId: string) {
    const db = getClient();
    await db.from("user_sessions").delete().eq("user_id", userId).eq("device_id", deviceId);
  },

  async deleteAllUserSessions(userId: string, currentToken?: string) {
    const db = getClient();
    let query = db.from("user_sessions").delete().eq("user_id", userId);
    if (currentToken) {
      query = query.neq("token", currentToken);
    }
    await query;
  }
};

export const DEMO_PROFILES: UserProfile[] = [
  {
    id: 'user_alex_vance',
    username: 'alex_vance',
    name: 'Alex Vance',
    email: 'alex@relay.app',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    bio: 'Product Designer & Glassmorphic UI enthusiast. Building the future of messaging.',
    statusMessage: 'Designing Relay v2.0 🎨',
    onlineStatus: 'online',
    lastSeen: 'Just now',
    country: 'United States',
    contacts: [],
    blockedUsers: [],
    sentRequests: [],
    receivedRequests: [],
    settings: { appearance: { themeMode: 'light' }, privacy: { whoCanMessage: 'everyone' } } as any,
    createdAt: new Date().toISOString()
  },
  {
    id: 'user_sarah_chen',
    username: 'sarah_chen',
    name: 'Sarah Chen',
    email: 'sarah@relay.app',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
    bio: 'Fullstack Systems Architect | Rust & TypeScript developer',
    statusMessage: 'In a meeting 💻',
    onlineStatus: 'online',
    lastSeen: '5m ago',
    country: 'Canada',
    contacts: [],
    blockedUsers: [],
    sentRequests: [],
    receivedRequests: [],
    settings: { appearance: { themeMode: 'light' }, privacy: { whoCanMessage: 'everyone' } } as any,
    createdAt: new Date().toISOString()
  },
  {
    id: 'user_marcus_thorne',
    username: 'marcus_t',
    name: 'Marcus Thorne',
    email: 'marcus@relay.app',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    bio: 'Mobile Engineer & Android Jetpack Compose fan',
    statusMessage: 'Building Relay Android 📱',
    onlineStatus: 'away',
    lastSeen: '15m ago',
    country: 'United Kingdom',
    contacts: [],
    blockedUsers: [],
    sentRequests: [],
    receivedRequests: [],
    settings: { appearance: { themeMode: 'light' }, privacy: { whoCanMessage: 'everyone' } } as any,
    createdAt: new Date().toISOString()
  },
  {
    id: 'user_elena_rostova',
    username: 'elena_r',
    name: 'Elena Rostova',
    email: 'elena@relay.app',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    bio: 'UX Research & Community Lead @ Relay',
    statusMessage: 'Listening to feedback 🎧',
    onlineStatus: 'online',
    lastSeen: 'Just now',
    country: 'Germany',
    contacts: [],
    blockedUsers: [],
    sentRequests: [],
    receivedRequests: [],
    settings: { appearance: { themeMode: 'light' }, privacy: { whoCanMessage: 'everyone' } } as any,
    createdAt: new Date().toISOString()
  },
  {
    id: 'user_liam_oconnor',
    username: 'liam_oc',
    name: 'Liam O\'Connor',
    email: 'liam@relay.app',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
    bio: 'Security Researcher & Encryption Engineer',
    statusMessage: 'Auditing protocols 🛡️',
    onlineStatus: 'offline',
    lastSeen: '1h ago',
    country: 'Ireland',
    contacts: [],
    blockedUsers: [],
    sentRequests: [],
    receivedRequests: [],
    settings: { appearance: { themeMode: 'light' }, privacy: { whoCanMessage: 'everyone' } } as any,
    createdAt: new Date().toISOString()
  },
  {
    id: 'user_sophia_martinez',
    username: 'sophia_m',
    name: 'Sophia Martinez',
    email: 'sophia@relay.app',
    avatarUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&auto=format&fit=crop&q=80',
    bio: 'Digital artist & Motion graphics designer',
    statusMessage: 'Rendering animations ✨',
    onlineStatus: 'online',
    lastSeen: 'Just now',
    country: 'Spain',
    contacts: [],
    blockedUsers: [],
    sentRequests: [],
    receivedRequests: [],
    settings: { appearance: { themeMode: 'light' }, privacy: { whoCanMessage: 'everyone' } } as any,
    createdAt: new Date().toISOString()
  },
  {
    id: 'user_david_kim',
    username: 'david_k',
    name: 'David Kim',
    email: 'david@relay.app',
    avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=200&auto=format&fit=crop&q=80',
    bio: 'Backend & Cloud Infrastructure Lead',
    statusMessage: 'Scaling servers ⚡',
    onlineStatus: 'online',
    lastSeen: '2m ago',
    country: 'South Korea',
    contacts: [],
    blockedUsers: [],
    sentRequests: [],
    receivedRequests: [],
    settings: { appearance: { themeMode: 'light' }, privacy: { whoCanMessage: 'everyone' } } as any,
    createdAt: new Date().toISOString()
  },
  {
    id: 'user_relay_official',
    username: 'relay_official',
    name: 'Relay Official Support',
    email: 'support@relay.app',
    avatarUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80',
    bio: 'Official Relay Support & Updates Channel',
    statusMessage: 'Here to help 24/7 🚀',
    onlineStatus: 'online',
    lastSeen: 'Always active',
    country: 'Global',
    contacts: [],
    blockedUsers: [],
    sentRequests: [],
    receivedRequests: [],
    settings: { appearance: { themeMode: 'light' }, privacy: { whoCanMessage: 'everyone' } } as any,
    createdAt: new Date().toISOString()
  }
];

// --- USER & PROFILE REPOSITORY ---
export const userRepo = {
  formatProfile(p: any): UserProfile {
    return {
      id: p.id,
      username: p.username,
      name: p.full_name || p.display_name || p.username,
      email: p.email,
      avatarUrl: p.avatar_url || undefined,
      bannerUrl: p.banner_url || undefined,
      bio: p.bio || "Exploring Relay.",
      statusMessage: p.status_message || "Available",
      onlineStatus: (p.online_status || p.status || "online") as any,
      lastSeen: p.last_seen || "Just now",
      dob: p.date_of_birth || undefined,
      country: p.country || "United States",
      socialLinks: p.social_links || {},
      contacts: p.contacts || [],
      blockedUsers: p.blocked_users || [],
      sentRequests: p.sent_requests || [],
      receivedRequests: p.received_requests || [],
      settings: p.settings || {
        appearance: { themeMode: "light", accentColor: "liquid-azure", cornerRadius: 18 },
        privacy: { whoCanMessage: "everyone", readReceipts: true },
        security: { twoFactorEnabled: false, activeSessions: [] },
        notifications: { enabled: true, directMessages: true }
      },
      createdAt: p.created_at || new Date().toISOString()
    };
  },

  async getProfileById(userId: string): Promise<UserProfile | null> {
    const db = getClient();
    const { data } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!data) {
      // Check fallback DEMO_PROFILES
      const demo = DEMO_PROFILES.find((p) => p.id === userId);
      return demo || null;
    }
    return this.formatProfile(data);
  },

  async checkUsernameAvailable(username: string): Promise<boolean> {
    const db = getClient();
    const lower = username.trim().toLowerCase().replace(/^@+/, '');
    const { data: pData } = await db.from("profiles").select("id").ilike("username", lower).limit(1);
    if (pData && pData.length > 0) return false;
    const { data: uData } = await db.from("users").select("id").ilike("username", lower).limit(1);
    if (uData && uData.length > 0) return false;
    return true;
  },

  async createProfile(data: {
    id: string;
    username: string;
    name: string;
    email: string;
    avatarUrl?: string;
    bannerUrl?: string;
    bio?: string;
    statusMessage?: string;
    country?: string;
    settings?: any;
  }) {
    const db = getClient();
    const cleanUsername = data.username.trim().toLowerCase().replace(/^@+/, '');
    await db.from("profiles").upsert({
      id: data.id,
      username: cleanUsername,
      full_name: data.name,
      email: data.email,
      avatar_url: data.avatarUrl || null,
      banner_url: data.bannerUrl || null,
      bio: data.bio || "Exploring Relay.",
      status_message: data.statusMessage || "Available",
      country: data.country || "United States",
      settings: data.settings || undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });

    try {
      await db.from("users").upsert({
        id: data.id,
        username: cleanUsername,
        display_name: data.name,
        email: data.email,
        avatar_url: data.avatarUrl || null,
        bio: data.bio || "Exploring Relay.",
        created_at: new Date().toISOString()
      }, { onConflict: "id" });
    } catch (e) {
      // Ignore fallback schema differences
    }
  },

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
    const db = getClient();
    const fields: any = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) fields.full_name = updates.name;
    if (updates.username !== undefined) fields.username = updates.username.trim().toLowerCase().replace(/^@+/, '');
    if (updates.avatarUrl !== undefined) fields.avatar_url = updates.avatarUrl;
    if (updates.bannerUrl !== undefined) fields.banner_url = updates.bannerUrl;
    if (updates.bio !== undefined) fields.bio = updates.bio;
    if (updates.statusMessage !== undefined) fields.status_message = updates.statusMessage;
    if (updates.country !== undefined) fields.country = updates.country;
    if (updates.dob !== undefined) fields.date_of_birth = updates.dob;
    if (updates.socialLinks !== undefined) fields.social_links = updates.socialLinks;

    await db.from("profiles").update(fields).eq("id", userId);
    return this.getProfileById(userId);
  },

  async updateSettings(userId: string, settings: any) {
    const db = getClient();
    await db.from("profiles").update({ settings }).eq("id", userId);
  },

  async searchProfiles(query: string, currentUserId: string): Promise<UserProfile[]> {
    const db = getClient();
    // Strip leading @ character and trim
    const cleanQuery = query.trim().toLowerCase().replace(/^@+/, '');
    let dbProfiles: UserProfile[] = [];

    try {
      let q = db.from("profiles").select("*").neq("id", currentUserId);
      if (cleanQuery) {
        q = q.or(`username.ilike.%${cleanQuery}%,full_name.ilike.%${cleanQuery}%`);
      }
      const { data, error } = await q.limit(25);
      if (!error && data) {
        dbProfiles = data.map((p: any) => this.formatProfile(p));
      }
    } catch (e) {
      console.warn("Notice: Database search warning:", e);
    }

    // Match DEMO_PROFILES to ensure search always works even on empty database
    const matchingDemoProfiles = DEMO_PROFILES.filter((p) => {
      if (p.id === currentUserId) return false;
      if (!cleanQuery) return true;
      return (
        p.username.toLowerCase().includes(cleanQuery) ||
        p.name.toLowerCase().includes(cleanQuery) ||
        (p.bio && p.bio.toLowerCase().includes(cleanQuery))
      );
    });

    const existingIds = new Set(dbProfiles.map((p) => p.id));
    const existingUsernames = new Set(dbProfiles.map((p) => p.username.toLowerCase()));

    const combined = [...dbProfiles];
    for (const demoUser of matchingDemoProfiles) {
      if (!existingIds.has(demoUser.id) && !existingUsernames.has(demoUser.username.toLowerCase())) {
        combined.push(demoUser);
      }
    }

    return combined.slice(0, 25);
  },

  async blockUser(userId: string, targetUserId: string): Promise<string[]> {
    const db = getClient();
    const { data: existing } = await db.from("user_blocks").select("*").eq("blocker_id", userId).eq("blocked_id", targetUserId).maybeSingle();
    if (existing) {
      await db.from("user_blocks").delete().eq("blocker_id", userId).eq("blocked_id", targetUserId);
    } else {
      await db.from("user_blocks").insert({ blocker_id: userId, blocked_id: targetUserId });
    }
    const { data: allBlocks } = await db.from("user_blocks").select("blocked_id").eq("blocker_id", userId);
    return (allBlocks || []).map((b: any) => b.blocked_id);
  },

  async createReport(reporterId: string, targetUserId: string | undefined, reason: string, details?: string) {
    const db = getClient();
    await db.from("user_reports").insert({
      reporter_id: reporterId,
      target_user_id: targetUserId || null,
      reason,
      details: details || null,
      created_at: new Date().toISOString()
    });
  }
};

// --- CHATS & MESSAGES REPOSITORY ---
export const chatRepo = {
  async getChatsForUser(userId: string): Promise<Chat[]> {
    const db = getClient();
    const { data: participations } = await db.from("chat_participants").select("chat_id, unread_count, is_pinned, role").eq("user_id", userId);
    if (!participations || participations.length === 0) return [];

    const chatIds = participations.map((p: any) => p.chat_id);
    const { data: chatsData } = await db.from("chats").select("*").in("id", chatIds);
    if (!chatsData) return [];

    const results: Chat[] = [];
    for (const c of chatsData) {
      const pInfo = participations.find((p: any) => p.chat_id === c.id);
      const { data: allParts } = await db.from("chat_participants").select("user_id, profile:profiles(*)").eq("chat_id", c.id);
      
      const participantProfiles = (allParts || []).map((p: any) => userRepo.formatProfile(p.profile || { id: p.user_id, username: "user", full_name: "User", email: "user@relay.app" }));
      const participantIds = participantProfiles.map(p => p.id);
      
      const { data: lastMsgs } = await db.from("messages").select("*").eq("chat_id", c.id).order("created_at", { ascending: false }).limit(1);
      const lastMsg = lastMsgs && lastMsgs[0] ? lastMsgs[0] : null;

      results.push({
        id: c.id,
        type: c.type,
        name: c.name || (c.type === "direct" ? participantProfiles.find((u) => u.id !== userId)?.name || "Direct Chat" : "Group Chat"),
        description: c.description || undefined,
        avatarUrl: c.avatar_url || (c.type === "direct" ? participantProfiles.find((u) => u.id !== userId)?.avatarUrl : undefined),
        participants: participantIds,
        lastMessage: lastMsg ? {
          text: lastMsg.content || "Media attachment",
          timestamp: lastMsg.created_at,
          senderId: lastMsg.sender_id,
          deliveryState: "delivered"
        } : undefined,
        unreadCount: pInfo?.unread_count || 0,
        isPinned: pInfo?.is_pinned || false,
        createdBy: c.created_by || undefined,
        createdAt: c.created_at,
        disappearingMessages: c.disappearing_messages || "off",
        inviteLink: c.invite_link || undefined,
        permissions: c.permissions || {}
      } as any);
    }

    return results;
  },

  async createDirectChat(userId: string, targetUserId: string): Promise<Chat> {
    const db = getClient();

    // Ensure target user profile exists in database if it's a seed demo profile
    let targetProfile = await userRepo.getProfileById(targetUserId);
    if (!targetProfile) {
      const demo = DEMO_PROFILES.find((p) => p.id === targetUserId);
      if (demo) {
        await userRepo.createProfile({
          id: demo.id,
          username: demo.username,
          name: demo.name,
          email: demo.email || `${demo.username}@relay.app`,
          avatarUrl: demo.avatarUrl,
          bio: demo.bio,
          statusMessage: demo.statusMessage,
          country: demo.country
        });
        targetProfile = await userRepo.getProfileById(targetUserId);
      }
    } else {
      // Upsert to ensure table row is present
      const demo = DEMO_PROFILES.find((p) => p.id === targetUserId);
      if (demo) {
        await userRepo.createProfile({
          id: demo.id,
          username: demo.username,
          name: demo.name,
          email: demo.email || `${demo.username}@relay.app`,
          avatarUrl: demo.avatarUrl,
          bio: demo.bio,
          statusMessage: demo.statusMessage,
          country: demo.country
        });
      }
    }

    // Ensure current user profile exists in database
    const currentUserProfile = await userRepo.getProfileById(userId);
    if (!currentUserProfile) {
      await userRepo.createProfile({
        id: userId,
        username: `user_${userId.substring(0, 6)}`,
        name: 'Relay Member',
        email: `${userId}@relay.app`
      });
    }

    const { data: userChats } = await db.from("chat_participants").select("chat_id").eq("user_id", userId);
    if (userChats) {
      for (const uc of userChats) {
        const { data: match } = await db.from("chat_participants").select("user_id").eq("chat_id", uc.chat_id).eq("user_id", targetUserId);
        if (match && match.length > 0) {
          const { data: cData } = await db.from("chats").select("*").eq("id", uc.chat_id).maybeSingle();
          if (cData && cData.type === "direct") {
            const allChats = await this.getChatsForUser(userId);
            const found = allChats.find((c) => c.id === cData.id);
            if (found) return found;
          }
        }
      }
    }

    const { data: newChat } = await db.from("chats").insert({
      type: "direct",
      created_by: userId,
      created_at: new Date().toISOString()
    }).select().single();

    if (!newChat) {
      throw new Error("Failed to initialize new conversation channel");
    }

    await db.from("chat_participants").insert([
      { chat_id: newChat.id, user_id: userId, role: "creator" },
      { chat_id: newChat.id, user_id: targetUserId, role: "member" }
    ]);

    const all = await this.getChatsForUser(userId);
    const result = all.find((c) => c.id === newChat.id);
    if (result) return result;

    return {
      id: newChat.id,
      type: "direct",
      name: targetProfile?.name || "Direct Chat",
      avatarUrl: targetProfile?.avatarUrl,
      participants: [userId, targetUserId],
      unreadCount: 0,
      isPinned: false,
      createdBy: userId,
      createdAt: newChat.created_at,
      disappearingMessages: "off"
    } as Chat;
  },

  async createGroupChat(userId: string, name: string, description?: string, participantIds: string[] = [], isPrivate = false, avatarUrl?: string): Promise<Chat> {
    const db = getClient();
    const { data: newChat } = await db.from("chats").insert({
      type: "group",
      name,
      description: description || null,
      avatar_url: avatarUrl || null,
      created_by: userId,
      is_private: isPrivate,
      created_at: new Date().toISOString()
    }).select().single();

    const uniqueParticipants = Array.from(new Set([userId, ...participantIds]));
    const participantRows = uniqueParticipants.map((pid) => ({
      chat_id: newChat.id,
      user_id: pid,
      role: pid === userId ? "creator" : "member"
    }));

    await db.from("chat_participants").insert(participantRows);

    const all = await this.getChatsForUser(userId);
    return all.find((c) => c.id === newChat.id)!;
  },

  async getMessages(chatId: string): Promise<Message[]> {
    const db = getClient();
    const { data } = await db.from("messages").select("*, sender:profiles(*)").eq("chat_id", chatId).order("created_at", { ascending: true });
    return (data || []).map((m: any) => ({
      id: m.id,
      chatId: m.chat_id,
      senderId: m.sender_id,
      senderName: m.sender?.full_name || m.sender?.username || "Relay User",
      senderAvatar: m.sender?.avatar_url || undefined,
      type: m.type || "text",
      content: m.content || "",
      attachments: m.attachments || [],
      timestamp: m.created_at,
      deliveryState: "delivered",
      replyToId: m.reply_to_id || undefined,
      reactions: m.reactions || [],
      isEdited: m.is_edited || false,
      isDeleted: m.is_deleted || false,
      isForwarded: m.is_forwarded || false
    }));
  },

  async sendMessage(chatId: string, senderId: string, payload: { content?: string; type?: Message["type"]; attachments?: Message["attachments"]; replyToId?: string; isForwarded?: boolean }) {
    const db = getClient();
    const sender = await userRepo.getProfileById(senderId);

    const { data: newMsg } = await db.from("messages").insert({
      chat_id: chatId,
      sender_id: senderId,
      content: payload.content || "",
      type: payload.type || "text",
      attachments: payload.attachments || [],
      reply_to_id: payload.replyToId || null,
      is_forwarded: payload.isForwarded || false,
      created_at: new Date().toISOString()
    }).select().single();

    // Increment unread count for other members
    const { data: parts } = await db.from("chat_participants").select("user_id, unread_count").eq("chat_id", chatId).neq("user_id", senderId);
    if (parts) {
      for (const p of parts) {
        await db.from("chat_participants").update({ unread_count: (p.unread_count || 0) + 1 }).eq("chat_id", chatId).eq("user_id", p.user_id);
      }
    }

    const msgFormatted: Message = {
      id: newMsg.id,
      chatId: newMsg.chat_id,
      senderId: newMsg.sender_id,
      senderName: sender?.name || "Relay User",
      senderAvatar: sender?.avatarUrl,
      content: newMsg.content || "",
      type: newMsg.type || "text",
      attachments: newMsg.attachments || [],
      timestamp: newMsg.created_at,
      deliveryState: "delivered",
      replyToId: newMsg.reply_to_id || undefined,
      reactions: [],
      isEdited: false,
      isDeleted: false,
      isForwarded: newMsg.is_forwarded || false
    };

    const userChats = await this.getChatsForUser(senderId);
    const chat = userChats.find((c) => c.id === chatId)!;

    return { message: msgFormatted, chat };
  },

  async editMessage(chatId: string, messageId: string, content: string): Promise<Message> {
    const db = getClient();
    const { data: updated } = await db.from("messages").update({
      content,
      is_edited: true,
      updated_at: new Date().toISOString()
    }).eq("id", messageId).eq("chat_id", chatId).select("*, sender:profiles(*)").single();

    return {
      id: updated.id,
      chatId: updated.chat_id,
      senderId: updated.sender_id,
      senderName: updated.sender?.full_name || "Relay User",
      senderAvatar: updated.sender?.avatar_url || undefined,
      content: updated.content || "",
      type: updated.type || "text",
      attachments: updated.attachments || [],
      timestamp: updated.created_at,
      deliveryState: "delivered",
      replyToId: updated.reply_to_id || undefined,
      reactions: updated.reactions || [],
      isEdited: true,
      isDeleted: updated.is_deleted || false,
      isForwarded: updated.is_forwarded || false
    };
  },

  async deleteMessage(chatId: string, messageId: string) {
    const db = getClient();
    const { data: updated } = await db.from("messages").update({
      content: "This message was deleted",
      is_deleted: true,
      attachments: []
    }).eq("id", messageId).eq("chat_id", chatId).select().single();

    return {
      id: updated.id,
      chatId: updated.chat_id,
      senderId: updated.sender_id,
      senderName: "Relay User",
      content: updated.content,
      type: updated.type,
      attachments: [],
      timestamp: updated.created_at,
      deliveryState: "delivered",
      isEdited: updated.is_edited,
      isDeleted: true
    };
  },

  async reactToMessage(chatId: string, messageId: string, userId: string, emoji: string) {
    const db = getClient();
    const user = await userRepo.getProfileById(userId);
    const { data: msg } = await db.from("messages").select("reactions").eq("id", messageId).maybeSingle();
    let reactions = msg?.reactions || [];

    const existingIdx = reactions.findIndex((r: any) => r.userId === userId && r.emoji === emoji);
    if (existingIdx > -1) {
      reactions.splice(existingIdx, 1);
    } else {
      reactions.push({ userId, userName: user?.name || "User", emoji });
    }

    await db.from("messages").update({ reactions }).eq("id", messageId);
    return reactions;
  },

  async togglePinMessage(chatId: string, messageId: string) {
    const db = getClient();
    const { data: chat } = await db.from("chats").select("pinned_message_id").eq("id", chatId).maybeSingle();
    const newPin = chat?.pinned_message_id === messageId ? null : messageId;
    await db.from("chats").update({ pinned_message_id: newPin }).eq("id", chatId);
    return newPin;
  },

  async markChatRead(chatId: string, userId: string) {
    const db = getClient();
    await db.from("chat_participants").update({ unread_count: 0 }).eq("chat_id", chatId).eq("user_id", userId);
  },

  async setTyping(chatId: string, userId: string, userName: string) {
    const db = getClient();
    await db.from("typing_states").upsert({
      chat_id: chatId,
      user_id: userId,
      user_name: userName,
      expires_at: Date.now() + 5000
    }, { onConflict: "chat_id, user_id" });
  },

  async getTyping(chatId: string) {
    const db = getClient();
    const now = Date.now();
    const { data } = await db.from("typing_states").select("user_id, user_name").eq("chat_id", chatId).gt("expires_at", now);
    return (data || []).map((t: any) => ({ userId: t.user_id, name: t.user_name }));
  },

  async deleteChat(chatId: string) {
    const db = getClient();
    await db.from("chats").delete().eq("id", chatId);
  },

  async updateChatInfo(chatId: string, payload: any) {
    const db = getClient();
    const updates: any = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.disappearingMessages !== undefined) updates.disappearing_messages = payload.disappearingMessages;
    if (payload.permissions !== undefined) updates.permissions = payload.permissions;
    if (payload.inviteLink !== undefined) updates.invite_link = payload.inviteLink;

    await db.from("chats").update(updates).eq("id", chatId);
  },

  async addMembers(chatId: string, memberIds: string[]) {
    const db = getClient();
    const rows = memberIds.map((mId) => ({ chat_id: chatId, user_id: mId, role: "member" }));
    await db.from("chat_participants").upsert(rows, { onConflict: "chat_id, user_id" });
  },

  async removeMember(chatId: string, memberId: string) {
    const db = getClient();
    await db.from("chat_participants").delete().eq("chat_id", chatId).eq("user_id", memberId);
  }
};

// --- COMMUNITIES REPOSITORY ---
export const communityRepo = {
  defaultChannels: [
    { id: "c_general", name: "general", type: "text", description: "General chatter and announcements" },
    { id: "c_media", name: "media-and-showcase", type: "media", description: "Share images and builds" }
  ] as CommunityChannel[],

  async getCommunities(): Promise<Community[]> {
    const db = getClient();
    const { data } = await db.from("communities").select("*").order("created_at", { ascending: false });
    return (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      handle: c.handle,
      description: c.description || "",
      category: c.category || "General",
      bannerUrl: c.banner_url || "",
      avatarUrl: c.avatar_url || "",
      ownerId: c.owner_id,
      isPrivate: c.is_private || false,
      memberCount: c.member_count || 1,
      channels: this.defaultChannels,
      permissions: c.permissions || {}
    }));
  },

  async createCommunity(ownerId: string, payload: { name: string; handle: string; description?: string; category?: string; bannerUrl?: string; avatarUrl?: string; isPrivate?: boolean }): Promise<Community> {
    const db = getClient();
    const { data: newComm } = await db.from("communities").insert({
      name: payload.name,
      handle: payload.handle.startsWith("@") ? payload.handle.toLowerCase() : `@${payload.handle.toLowerCase()}`,
      description: payload.description || null,
      category: payload.category || "General",
      banner_url: payload.bannerUrl || null,
      avatar_url: payload.avatarUrl || null,
      owner_id: ownerId,
      is_private: payload.isPrivate || false,
      member_count: 1,
      created_at: new Date().toISOString()
    }).select().single();

    await db.from("community_members").insert({
      community_id: newComm.id,
      user_id: ownerId,
      role: "owner"
    });

    return {
      id: newComm.id,
      name: newComm.name,
      handle: newComm.handle,
      description: newComm.description || "",
      category: newComm.category || "General",
      bannerUrl: newComm.banner_url || "",
      avatarUrl: newComm.avatar_url || "",
      ownerId: newComm.owner_id,
      isPrivate: newComm.is_private || false,
      memberCount: 1,
      channels: this.defaultChannels
    };
  },

  async joinCommunity(communityId: string, userId: string) {
    const db = getClient();
    await db.from("community_members").upsert({ community_id: communityId, user_id: userId, role: "member" }, { onConflict: "community_id, user_id" });
    const { data: count } = await db.from("community_members").select("user_id").eq("community_id", communityId);
    const memberCount = count?.length || 1;
    await db.from("communities").update({ member_count: memberCount }).eq("id", communityId);
  },

  async leaveCommunity(communityId: string, userId: string) {
    const db = getClient();
    await db.from("community_members").delete().eq("community_id", communityId).eq("user_id", userId);
    const { data: count } = await db.from("community_members").select("user_id").eq("community_id", communityId);
    const memberCount = count?.length || 0;
    await db.from("communities").update({ member_count: memberCount }).eq("id", communityId);
  },

  async getPosts(communityId: string): Promise<CommunityPost[]> {
    const db = getClient();
    const { data: posts } = await db.from("community_posts").select("*, author:profiles(*)").eq("community_id", communityId).order("created_at", { ascending: false });
    
    const results: CommunityPost[] = [];
    for (const p of posts || []) {
      const { data: comments } = await db.from("community_post_comments").select("*").eq("post_id", p.id).order("created_at", { ascending: true });
      const { data: likes } = await db.from("community_post_likes").select("user_id").eq("post_id", p.id);

      results.push({
        id: p.id,
        communityId: p.community_id,
        channelId: p.channel_id || "c_general",
        authorId: p.author_id,
        authorName: p.author?.full_name || p.author?.username || "Community Member",
        authorAvatar: p.author?.avatar_url || undefined,
        title: p.title || undefined,
        content: p.content,
        imageUrl: p.image_url || undefined,
        likesCount: likes?.length || 0,
        commentsCount: comments?.length || 0,
        timestamp: p.created_at,
        likedByUsers: (likes || []).map((l: any) => l.user_id),
        comments: (comments || []).map((c: any) => ({
          id: c.id,
          postId: c.post_id,
          authorId: c.author_id,
          authorName: c.author_name,
          authorAvatar: c.author_avatar || undefined,
          content: c.content,
          timestamp: c.created_at
        }))
      });
    }

    return results;
  },

  async createPost(communityId: string, authorId: string, payload: { title?: string; content: string; imageUrl?: string }): Promise<CommunityPost> {
    const db = getClient();
    const { data: newPost } = await db.from("community_posts").insert({
      community_id: communityId,
      author_id: authorId,
      channel_id: "c_general",
      title: payload.title || null,
      content: payload.content,
      image_url: payload.imageUrl || null,
      created_at: new Date().toISOString()
    }).select().single();

    const author = await userRepo.getProfileById(authorId);

    return {
      id: newPost.id,
      communityId: newPost.community_id,
      channelId: "c_general",
      authorId: newPost.author_id,
      authorName: author?.name || "Member",
      authorAvatar: author?.avatarUrl,
      title: newPost.title || undefined,
      content: newPost.content,
      imageUrl: newPost.image_url || undefined,
      likesCount: 0,
      commentsCount: 0,
      timestamp: newPost.created_at,
      likedByUsers: [],
      comments: []
    };
  },

  async likePost(postId: string, userId: string) {
    const db = getClient();
    const { data: existing } = await db.from("community_post_likes").select("*").eq("post_id", postId).eq("user_id", userId).maybeSingle();
    let isLiked = false;
    if (existing) {
      await db.from("community_post_likes").delete().eq("post_id", postId).eq("user_id", userId);
    } else {
      await db.from("community_post_likes").insert({ post_id: postId, user_id: userId });
      isLiked = true;
    }

    const { data: likes } = await db.from("community_post_likes").select("user_id").eq("post_id", postId);
    const count = likes?.length || 0;
    await db.from("community_posts").update({ likes_count: count }).eq("id", postId);

    return { likesCount: count, isLiked };
  },

  async addComment(postId: string, authorId: string, content: string) {
    const db = getClient();
    const author = await userRepo.getProfileById(authorId);
    const { data: comment } = await db.from("community_post_comments").insert({
      post_id: postId,
      author_id: authorId,
      author_name: author?.name || "Member",
      author_avatar: author?.avatarUrl || null,
      content,
      created_at: new Date().toISOString()
    }).select().single();

    const { data: comments } = await db.from("community_post_comments").select("id").eq("post_id", postId);
    const count = comments?.length || 0;
    await db.from("community_posts").update({ comments_count: count }).eq("id", postId);

    return {
      comment: {
        id: comment.id,
        postId: comment.post_id,
        authorId: comment.author_id,
        authorName: comment.author_name,
        authorAvatar: comment.author_avatar || undefined,
        content: comment.content,
        timestamp: comment.created_at
      } as PostComment,
      commentsCount: count
    };
  },

  async updateCommunityInfo(communityId: string, updates: any) {
    const db = getClient();
    const fields: any = {};
    if (updates.description !== undefined) fields.description = updates.description;
    if (updates.isPrivate !== undefined) fields.is_private = updates.isPrivate;
    if (updates.permissions !== undefined) fields.permissions = updates.permissions;
    if (updates.category !== undefined) fields.category = updates.category;

    await db.from("communities").update(fields).eq("id", communityId);
  },

  async deleteCommunity(communityId: string) {
    const db = getClient();
    await db.from("communities").delete().eq("id", communityId);
  }
};

// --- STATUSES / STORIES REPOSITORY ---
export const statusRepo = {
  async getStatuses(currentUserId: string) {
    const db = getClient();
    const now = new Date().toISOString();
    const { data } = await db.from("statuses").select("*").gt("expires_at", now).order("created_at", { ascending: false });

    const contactStatuses: any[] = [];
    const discoveryStatuses: any[] = [];

    for (const s of data || []) {
      const { data: views } = await db.from("status_views").select("*").eq("status_id", s.id);
      const { data: likes } = await db.from("status_likes").select("user_id").eq("status_id", s.id);

      const formatted = {
        id: s.id,
        userId: s.user_id,
        userName: s.user_name,
        userAvatar: s.user_avatar || undefined,
        type: s.type || "text",
        content: s.content || "",
        mediaUrl: s.media_url || undefined,
        backgroundGradient: s.background_gradient || undefined,
        privacy: s.privacy || "everyone",
        expiresAt: s.expires_at,
        createdAt: s.created_at,
        viewers: (views || []).map((v: any) => ({
          userId: v.user_id,
          userName: v.user_name,
          userAvatar: v.user_avatar || undefined,
          viewedAt: v.viewed_at
        })),
        likes: (likes || []).map((l: any) => l.user_id),
        pollOptions: s.poll_options || undefined
      };

      if (s.user_id === currentUserId) {
        contactStatuses.push(formatted);
      } else {
        discoveryStatuses.push(formatted);
      }
    }

    return { contacts: contactStatuses, discovery: discoveryStatuses };
  },

  async createStatus(userId: string, payload: any) {
    const db = getClient();
    const author = await userRepo.getProfileById(userId);
    const durationHours = payload.durationHours || 24;
    const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();

    const { data: newStatus } = await db.from("statuses").insert({
      user_id: userId,
      user_name: author?.name || "User",
      user_avatar: author?.avatarUrl || null,
      type: payload.type || "text",
      content: payload.content || null,
      media_url: payload.mediaUrl || null,
      background_gradient: payload.backgroundGradient || null,
      privacy: payload.privacy || "everyone",
      poll_options: payload.pollOptions || [],
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    }).select().single();

    return {
      id: newStatus.id,
      userId: newStatus.user_id,
      userName: newStatus.user_name,
      userAvatar: newStatus.user_avatar || undefined,
      type: newStatus.type,
      content: newStatus.content || "",
      mediaUrl: newStatus.media_url || undefined,
      backgroundGradient: newStatus.background_gradient || undefined,
      privacy: newStatus.privacy,
      expiresAt: newStatus.expires_at,
      createdAt: newStatus.created_at,
      viewers: [],
      likes: [],
      pollOptions: newStatus.poll_options
    };
  },

  async recordView(statusId: string, userId: string) {
    const db = getClient();
    const user = await userRepo.getProfileById(userId);
    await db.from("status_views").upsert({
      status_id: statusId,
      user_id: userId,
      user_name: user?.name || "User",
      user_avatar: user?.avatarUrl || null,
      viewed_at: new Date().toISOString()
    }, { onConflict: "status_id, user_id" });
  },

  async likeStatus(statusId: string, userId: string) {
    const db = getClient();
    const { data: existing } = await db.from("status_likes").select("*").eq("status_id", statusId).eq("user_id", userId).maybeSingle();
    if (existing) {
      await db.from("status_likes").delete().eq("status_id", statusId).eq("user_id", userId);
    } else {
      await db.from("status_likes").insert({ status_id: statusId, user_id: userId });
    }

    const { data: likes } = await db.from("status_likes").select("user_id").eq("status_id", statusId);
    return (likes || []).map((l: any) => l.user_id);
  },

  async deleteStatus(statusId: string, userId: string) {
    const db = getClient();
    await db.from("statuses").delete().eq("id", statusId).eq("user_id", userId);
  }
};

// --- NOTIFICATIONS REPOSITORY ---
export const notificationRepo = {
  async getNotifications(userId: string): Promise<NotificationItem[]> {
    const db = getClient();
    const { data } = await db.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    return (data || []).map((n: any) => ({
      id: n.id,
      userId: n.user_id,
      type: n.type as any,
      title: n.title,
      body: n.body,
      timestamp: n.created_at,
      read: n.read || false,
      chatId: n.metadata?.chatId || undefined,
      senderId: n.metadata?.senderId || undefined
    }));
  },

  async createNotification(userId: string, title: string, body: string, type: string, metadata: any = {}) {
    const db = getClient();
    await db.from("notifications").insert({
      user_id: userId,
      title,
      body,
      type,
      read: false,
      metadata,
      created_at: new Date().toISOString()
    });
  },

  async markRead(userId: string) {
    const db = getClient();
    await db.from("notifications").update({ read: true }).eq("user_id", userId);
  }
};
