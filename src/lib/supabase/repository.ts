import { supabaseServer, supabaseAdmin } from "./server";
import fs from "fs";
import path from "path";
import { 
  UserProfile, Chat, Message, Community, CommunityPost, PostComment, 
  NotificationItem, DeviceSession, CommunityChannel 
} from "../../types";

const getClient = () => supabaseAdmin || supabaseServer;

const SESSIONS_CACHE_FILE = path.join(process.cwd(), "node_modules", ".cache", "relay_sessions.json");

function loadSessionsCache(): Map<string, any> {
  try {
    if (fs.existsSync(SESSIONS_CACHE_FILE)) {
      const content = fs.readFileSync(SESSIONS_CACHE_FILE, "utf-8");
      const entries: [string, any][] = JSON.parse(content);
      return new Map(entries);
    }
  } catch (e) {
    // ignore cache load errors
  }
  return new Map();
}

function saveSessionsCache(map: Map<string, any>) {
  try {
    const dir = path.dirname(SESSIONS_CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSIONS_CACHE_FILE, JSON.stringify(Array.from(map.entries())), "utf-8");
  } catch (e) {
    // ignore cache write errors
  }
}

const inMemorySessions = loadSessionsCache();

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
    const sessionObj = {
      token,
      user_id: userId,
      device_id: deviceSession.id,
      device_name: deviceSession.device,
      browser: deviceSession.browser,
      ip_address: deviceSession.ip,
      location: deviceSession.location,
      last_active: deviceSession.lastActive,
      created_at: new Date().toISOString()
    };
    
    inMemorySessions.set(token, sessionObj);
    saveSessionsCache(inMemorySessions);

    try {
      const db = getClient();
      await db.from("user_sessions").insert(sessionObj);
    } catch (e) {
      // Ignore Supabase user_sessions schema mismatch errors
    }
  },

  async getSession(token: string) {
    if (!token) return null;
    
    // 1. Check in-memory cache
    if (inMemorySessions.has(token)) {
      return inMemorySessions.get(token);
    }

    // 2. Query DB safely
    try {
      const db = getClient();
      const { data, error } = await db.from("user_sessions").select("*").eq("token", token).maybeSingle();
      if (!error && data) {
        inMemorySessions.set(token, data);
        saveSessionsCache(inMemorySessions);
        return data;
      }
    } catch (e) {
      // Ignore
    }

    return null;
  },

  async deleteSession(token: string) {
    inMemorySessions.delete(token);
    saveSessionsCache(inMemorySessions);

    try {
      const db = getClient();
      await db.from("user_sessions").delete().eq("token", token);
    } catch (e) {
      // Ignore
    }
  },

  async getUserSessions(userId: string): Promise<DeviceSession[]> {
    const cachedSessions: DeviceSession[] = [];
    inMemorySessions.forEach((s) => {
      if (s.user_id === userId) {
        cachedSessions.push({
          id: s.device_id || `sess_${s.token}`,
          device: s.device_name || "Relay Client",
          browser: s.browser || "Relay App",
          location: s.location || "Active Region",
          ip: s.ip_address || "127.0.0.1",
          lastActive: s.last_active || "Just now",
          isCurrent: false,
          token: s.token
        });
      }
    });

    try {
      const db = getClient();
      const { data } = await db.from("user_sessions").select("*").eq("user_id", userId);
      if (data && data.length > 0) {
        data.forEach((s: any) => {
          if (!cachedSessions.some((cs) => cs.token === s.token)) {
            cachedSessions.push({
              id: s.device_id || s.id,
              device: s.device_name || "Relay Client",
              browser: s.browser || "Relay App",
              location: s.location || "Active Region",
              ip: s.ip_address || "127.0.0.1",
              lastActive: s.last_active || "Just now",
              isCurrent: false,
              token: s.token
            });
          }
        });
      }
    } catch (e) {
      // Ignore DB error
    }

    return cachedSessions;
  },

  async deleteUserSession(userId: string, deviceId: string) {
    inMemorySessions.forEach((s, key) => {
      if (s.user_id === userId && (s.device_id === deviceId || key === deviceId)) {
        inMemorySessions.delete(key);
      }
    });
    saveSessionsCache(inMemorySessions);

    try {
      const db = getClient();
      await db.from("user_sessions").delete().eq("user_id", userId).eq("device_id", deviceId);
    } catch (e) {
      // Ignore
    }
  },

  async deleteAllUserSessions(userId: string, currentToken?: string) {
    inMemorySessions.forEach((s, key) => {
      if (s.user_id === userId && key !== currentToken) {
        inMemorySessions.delete(key);
      }
    });
    saveSessionsCache(inMemorySessions);

    try {
      const db = getClient();
      let query = db.from("user_sessions").delete().eq("user_id", userId);
      if (currentToken) {
        query = query.neq("token", currentToken);
      }
      await query;
    } catch (e) {
      // Ignore
    }
  }
};

export const DEMO_PROFILES: UserProfile[] = [];

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
    if (data) {
      return this.formatProfile(data);
    }
    const { data: uData } = await db.from("users").select("*").eq("id", userId).maybeSingle();
    if (uData) {
      return {
        id: uData.id,
        username: uData.username || `user_${uData.id.substring(0, 6)}`,
        name: uData.display_name || uData.full_name || uData.username,
        email: uData.email || `${uData.username}@relay.app`,
        avatarUrl: uData.avatar_url || undefined,
        bio: uData.bio || "Exploring Relay.",
        statusMessage: "Available",
        onlineStatus: "online",
        lastSeen: "Just now",
        country: "United States",
        contacts: [],
        blockedUsers: [],
        sentRequests: [],
        receivedRequests: [],
        settings: { appearance: { themeMode: "light" }, privacy: { whoCanMessage: "everyone" } } as any,
        createdAt: uData.created_at || new Date().toISOString()
      };
    }
    return null;
  },

  async getAllProfiles(): Promise<UserProfile[]> {
    try {
      const db = getClient();
      const { data, error } = await db.from("profiles").select("*");
      if (!error && data && data.length > 0) {
        return data.map((p) => this.formatProfile(p));
      }
    } catch (e) {
      // ignore
    }
    return [];
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
    const cleanQuery = query.trim().toLowerCase().replace(/^@+/, '').trim();
    console.log("[Relay Search Backend] Received query:", query, "cleanQuery:", cleanQuery, "currentUserId:", currentUserId);

    let dbProfiles: UserProfile[] = [];

    try {
      // 1. Query profiles table
      const { data, error } = await db.from("profiles").select("*").limit(50);
      
      if (!error && data && data.length > 0) {
        const filtered = data.filter((p: any) => {
          if (p.id === currentUserId || p.auth_user_id === currentUserId || p.user_id === currentUserId) {
            return false;
          }
          if (!cleanQuery) return true;
          const uname = (p.username || '').toLowerCase();
          const fname = (p.full_name || p.display_name || p.name || '').toLowerCase();
          const email = (p.email || '').toLowerCase();
          const bio = (p.bio || '').toLowerCase();
          return (
            uname.includes(cleanQuery) ||
            fname.includes(cleanQuery) ||
            email.includes(cleanQuery) ||
            bio.includes(cleanQuery)
          );
        });
        dbProfiles = filtered.map((p: any) => this.formatProfile(p));
        console.log("[Relay Search Backend] Profiles matching search:", dbProfiles.length);
      } else if (error) {
        console.warn("[Relay Search Backend] Profiles query notice/error:", error.message);
      }
    } catch (e: any) {
      console.warn("[Relay Search Backend] Profiles table query exception:", e);
    }

    // 2. If profiles returned empty or failed, fallback to users table
    if (dbProfiles.length === 0) {
      try {
        const { data: uData, error: uErr } = await db.from("users").select("*").limit(50);
        if (!uErr && uData && uData.length > 0) {
          const uFiltered = uData.filter((u: any) => {
            if (u.id === currentUserId || u.auth_user_id === currentUserId) return false;
            if (!cleanQuery) return true;
            const uname = (u.username || '').toLowerCase();
            const dname = (u.display_name || u.full_name || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            return uname.includes(cleanQuery) || dname.includes(cleanQuery) || email.includes(cleanQuery);
          });
          dbProfiles = uFiltered.map((u: any) => ({
            id: u.id,
            username: u.username || `user_${u.id.substring(0, 6)}`,
            name: u.display_name || u.full_name || u.username,
            email: u.email || `${u.username}@relay.app`,
            avatarUrl: u.avatar_url || undefined,
            bio: u.bio || "Exploring Relay.",
            statusMessage: "Available",
            onlineStatus: "online",
            lastSeen: "Just now",
            country: "United States",
            contacts: [],
            blockedUsers: [],
            sentRequests: [],
            receivedRequests: [],
            settings: { appearance: { themeMode: "light" }, privacy: { whoCanMessage: "everyone" } } as any,
            createdAt: u.created_at || new Date().toISOString()
          }));
          console.log("[Relay Search Backend] Users table matching search:", dbProfiles.length);
        }
      } catch (e) {
        console.warn("[Relay Search Backend] Users table query exception:", e);
      }
    }

    // Return real Supabase users ONLY (no demo profiles)
    return dbProfiles.slice(0, 25);
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

// --- CHATS & MESSAGES REPOSITORY (CONVERSATION ARCHITECTURE) ---
export const chatRepo = {
  async getChatsForUser(userId: string): Promise<Chat[]> {
    const db = getClient();
    const { data: participations } = await db.from("conversation_members").select("conversation_id, unread_count, is_pinned, role").eq("profile_id", userId);
    if (!participations || participations.length === 0) return [];

    const conversationIds = participations.map((p: any) => p.conversation_id);
    const { data: conversationsData } = await db.from("conversations").select("*").in("id", conversationIds);
    if (!conversationsData) return [];

    const results: Chat[] = [];
    for (const c of conversationsData) {
      const pInfo = participations.find((p: any) => p.conversation_id === c.id);
      const { data: allMembers } = await db.from("conversation_members").select("profile_id, role").eq("conversation_id", c.id);
      
      const memberProfileIds = (allMembers || []).map((m: any) => m.profile_id);
      const memberProfiles: UserProfile[] = [];
      for (const pid of memberProfileIds) {
        const prof = await userRepo.getProfileById(pid);
        if (prof) memberProfiles.push(prof);
      }

      const { data: lastMsgs } = await db.from("messages").select("*").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1);
      const lastMsg = lastMsgs && lastMsgs[0] ? lastMsgs[0] : null;

      const otherProfile = memberProfiles.find((u) => u.id !== userId) || memberProfiles[0];
      const convType = c.conversation_type || c.type || "direct";

      results.push({
        id: c.id,
        type: convType as any,
        name: c.name || (convType === "direct" ? (otherProfile?.name || otherProfile?.username || "Direct Chat") : "Group Chat"),
        description: c.description || undefined,
        avatarUrl: c.avatar_url || (convType === "direct" ? otherProfile?.avatarUrl : undefined),
        participants: memberProfileIds,
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
        disappearingMessages: "off",
        permissions: {}
      } as any);
    }

    return results;
  },

  async createDirectChat(userId: string, targetUserId: string): Promise<Chat> {
    const db = getClient();
    console.log("[Relay Direct Chat] Current auth user:", userId);

    // Step 1: Resolve current profile (profile_id)
    let currentProfile = await userRepo.getProfileById(userId);
    if (!currentProfile) {
      try {
        const { data: pData } = await db.from("profiles").select("*").or(`auth_user_id.eq.${userId},user_id.eq.${userId}`).maybeSingle();
        if (pData) {
          currentProfile = userRepo.formatProfile(pData);
        }
      } catch (e) {
        // ignore
      }
    }

    if (!currentProfile) {
      console.error("[Relay Direct Chat] Current profile not found for user ID:", userId);
      throw new Error("CURRENT_PROFILE_NOT_FOUND");
    }

    const currentProfileId = currentProfile.id;
    console.log("[Relay Direct Chat] Current profile resolved:", currentProfileId);

    // Step 2: Resolve target profile (profile_id)
    let targetProfile = await userRepo.getProfileById(targetUserId);
    if (!targetProfile) {
      try {
        const cleanTarget = targetUserId.trim().toLowerCase().replace(/^@+/, '');
        const { data: tpData } = await db.from("profiles").select("*").or(`auth_user_id.eq.${targetUserId},user_id.eq.${targetUserId},username.ilike.${cleanTarget}`).maybeSingle();
        if (tpData) {
          targetProfile = userRepo.formatProfile(tpData);
        }
      } catch (e) {
        // ignore
      }
    }

    if (!targetProfile) {
      console.error("[Relay Direct Chat] Target profile not found for target ID:", targetUserId);
      throw new Error("TARGET_PROFILE_NOT_FOUND");
    }

    const targetProfileId = targetProfile.id;
    console.log("[Relay Direct Chat] Target profile resolved:", targetProfileId);

    // Step 3: Check self-messaging
    if (currentProfileId === targetProfileId) {
      console.error("[Relay Direct Chat] Attempted self-message:", currentProfileId);
      throw new Error("CANNOT_MESSAGE_SELF");
    }

    // Step 4: Check privacy & blocks
    try {
      const { data: blockCheck } = await db.from("blocked_users").select("*")
        .or(`and(blocker_id.eq.${currentProfileId},blocked_id.eq.${targetProfileId}),and(blocker_id.eq.${targetProfileId},blocked_id.eq.${currentProfileId})`);
      if (blockCheck && blockCheck.length > 0) {
        throw new Error("Cannot start conversation with this user due to privacy settings or blocks");
      }
    } catch (err: any) {
      if (err.message?.includes("privacy settings or blocks")) throw err;
      try {
        const { data: uBlocks } = await db.from("user_blocks").select("*")
          .or(`and(blocker_id.eq.${currentProfileId},blocked_id.eq.${targetProfileId}),and(blocker_id.eq.${targetProfileId},blocked_id.eq.${currentProfileId})`);
        if (uBlocks && uBlocks.length > 0) {
          throw new Error("Cannot start conversation with this user due to privacy settings or blocks");
        }
      } catch (e) {
        // ignore
      }
    }

    // Step 5: Existing conversation lookup
    try {
      console.log("[Relay Direct Chat] Existing conversation lookup");
      const { data: userConvs, error: ucErr } = await db.from("conversation_members").select("conversation_id").eq("profile_id", currentProfileId);
      if (!ucErr && userConvs && userConvs.length > 0) {
        const userConvIds = userConvs.map((p: any) => p.conversation_id);
        const { data: targetMatches, error: tmErr } = await db.from("conversation_members").select("conversation_id").eq("profile_id", targetProfileId).in("conversation_id", userConvIds);
        if (!tmErr && targetMatches && targetMatches.length > 0) {
          const commonIds = targetMatches.map((m: any) => m.conversation_id);
          const { data: directConvs } = await db.from("conversations").select("*").in("id", commonIds).or("conversation_type.eq.direct,conversation_type.is.null");
          if (directConvs && directConvs.length > 0) {
            const existingId = directConvs[0].id;
            console.log("[Relay Direct Chat] Existing conversation lookup: success, reusing conversation ID:", existingId);
            console.log("[Relay Direct Chat] Opening conversation");
            const allChats = await this.getChatsForUser(currentProfileId);
            const found = allChats.find((c) => c.id === existingId);
            if (found) return found;

            return {
              id: existingId,
              type: "direct",
              name: targetProfile.name || targetProfile.username || "Direct Chat",
              avatarUrl: targetProfile.avatarUrl,
              participants: [currentProfileId, targetProfileId],
              unreadCount: 0,
              isPinned: false,
              createdBy: currentProfileId,
              createdAt: directConvs[0].created_at || new Date().toISOString()
            } as Chat;
          }
        }
      }
      console.log("[Relay Direct Chat] Existing conversation lookup: none found");
    } catch (e: any) {
      console.warn("[Relay Direct Chat] Existing conversation lookup exception:", e?.message);
    }

    // Step 6: Create new conversation
    console.log("[Relay Direct Chat] Creating conversation");
    const { data: newConv, error: convErr } = await db.from("conversations").insert({
      conversation_type: "direct",
      created_by: currentProfileId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select().single();

    if (convErr || !newConv) {
      console.error("[Relay Direct Chat] Conversation creation failure:", convErr);
      throw new Error(`Failed to initialize new conversation channel: ${convErr?.message || 'DB Error'}`);
    }

    console.log("[Relay Direct Chat] Conversation created:", newConv.id);

    // Step 7: Create owner member
    console.log("[Relay Direct Chat] Creating owner member");
    const { error: p1Err } = await db.from("conversation_members").insert({
      conversation_id: newConv.id,
      profile_id: currentProfileId,
      role: "owner",
      status: "active",
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (p1Err) {
      console.error("[Relay Direct Chat] Creating owner member failure:", p1Err);
      await db.from("conversations").delete().eq("id", newConv.id);
      throw new Error(`Failed to insert owner member: ${p1Err.message}`);
    }

    // Step 8: Create target member
    console.log("[Relay Direct Chat] Creating target member");
    const { error: p2Err } = await db.from("conversation_members").insert({
      conversation_id: newConv.id,
      profile_id: targetProfileId,
      role: "member",
      status: "active",
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (p2Err) {
      console.error("[Relay Direct Chat] Creating target member failure:", p2Err);
      await db.from("conversation_members").delete().eq("conversation_id", newConv.id);
      await db.from("conversations").delete().eq("id", newConv.id);
      throw new Error(`Failed to insert target member: ${p2Err.message}`);
    }

    console.log("[Relay Direct Chat] Opening conversation");

    const all = await this.getChatsForUser(currentProfileId);
    const result = all.find((c) => c.id === newConv.id);
    if (result) return result;

    return {
      id: newConv.id,
      type: "direct",
      name: targetProfile.name || targetProfile.username || "Direct Chat",
      avatarUrl: targetProfile.avatarUrl,
      participants: [currentProfileId, targetProfileId],
      unreadCount: 0,
      isPinned: false,
      createdBy: currentProfileId,
      createdAt: newConv.created_at || new Date().toISOString()
    } as Chat;
  },

  async createGroupChat(userId: string, name: string, description?: string, participantIds: string[] = [], isPrivate = false, avatarUrl?: string): Promise<Chat> {
    const db = getClient();

    const uniqueParticipants = Array.from(new Set([userId, ...participantIds]));
    for (const pid of uniqueParticipants) {
      const existing = await userRepo.getProfileById(pid);
      if (!existing) {
        await userRepo.createProfile({
          id: pid,
          username: `user_${pid.substring(0, 6)}`,
          name: 'Relay Member',
          email: `${pid}@relay.app`
        });
      }
    }

    const { data: newConv, error: convErr } = await db.from("conversations").insert({
      conversation_type: "group",
      name,
      description: description || null,
      avatar_url: avatarUrl || null,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select().single();

    if (convErr || !newConv) {
      throw new Error(`Failed to create group conversation: ${convErr?.message || 'DB error'}`);
    }

    const memberRows = uniqueParticipants.map((pid) => ({
      conversation_id: newConv.id,
      profile_id: pid,
      role: pid === userId ? "owner" : "member",
      status: "active",
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    await db.from("conversation_members").insert(memberRows);

    const all = await this.getChatsForUser(userId);
    const result = all.find((c) => c.id === newConv.id);
    if (result) return result;

    return {
      id: newConv.id,
      type: "group",
      name,
      description: description || undefined,
      avatarUrl: avatarUrl || undefined,
      participants: uniqueParticipants,
      unreadCount: 0,
      isPinned: false,
      createdBy: userId,
      createdAt: newConv.created_at,
      disappearingMessages: "off"
    } as Chat;
  },

  async getMessages(chatId: string): Promise<Message[]> {
    const db = getClient();
    const { data } = await db.from("messages").select("*, sender:profiles(*)").eq("conversation_id", chatId).order("created_at", { ascending: true });
    return (data || []).map((m: any) => ({
      id: m.id,
      chatId: m.conversation_id,
      senderId: m.sender_id,
      senderName: m.sender?.full_name || m.sender?.display_name || m.sender?.username || "Relay User",
      senderAvatar: m.sender?.avatar_url || undefined,
      type: m.message_type || m.type || "text",
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

    const { data: newMsg, error: msgErr } = await db.from("messages").insert({
      conversation_id: chatId,
      sender_id: senderId,
      content: payload.content || "",
      message_type: payload.type || "text",
      media_url: payload.attachments?.[0]?.url || null,
      file_name: payload.attachments?.[0]?.fileName || null,
      file_size: payload.attachments?.[0]?.fileSize || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select().single();

    if (msgErr || !newMsg) {
      throw new Error(`Failed to send message: ${msgErr?.message || 'DB Error'}`);
    }

    // Update conversation last_message_at
    await db.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_id: newMsg.id,
      updated_at: new Date().toISOString()
    }).eq("id", chatId);

    // Increment unread count for other members
    const { data: members } = await db.from("conversation_members").select("profile_id, unread_count").eq("conversation_id", chatId).neq("profile_id", senderId);
    if (members) {
      for (const m of members) {
        await db.from("conversation_members").update({ unread_count: (m.unread_count || 0) + 1 }).eq("conversation_id", chatId).eq("profile_id", m.profile_id);
      }
    }

    const msgFormatted: Message = {
      id: newMsg.id,
      chatId: newMsg.conversation_id,
      senderId: newMsg.sender_id,
      senderName: sender?.name || "Relay User",
      senderAvatar: sender?.avatarUrl,
      content: newMsg.content || "",
      type: (newMsg.message_type || "text") as any,
      attachments: payload.attachments || [],
      timestamp: newMsg.created_at,
      deliveryState: "delivered",
      replyToId: payload.replyToId || undefined,
      reactions: [],
      isEdited: false,
      isDeleted: false,
      isForwarded: payload.isForwarded || false
    };

    const userChats = await this.getChatsForUser(senderId);
    const chat = userChats.find((c) => c.id === chatId)!;

    return { message: msgFormatted, chat };
  },

  async editMessage(chatId: string, messageId: string, content: string): Promise<Message> {
    const db = getClient();
    const { data: updated, error } = await db.from("messages").update({
      content,
      is_edited: true,
      updated_at: new Date().toISOString()
    }).eq("id", messageId).eq("conversation_id", chatId).select("*, sender:profiles(*)").single();

    if (error || !updated) {
      throw new Error(`Failed to edit message: ${error?.message || 'Not found'}`);
    }

    return {
      id: updated.id,
      chatId: updated.conversation_id,
      senderId: updated.sender_id,
      senderName: updated.sender?.full_name || updated.sender?.username || "Relay User",
      senderAvatar: updated.sender?.avatar_url || undefined,
      content: updated.content || "",
      type: updated.message_type || "text",
      attachments: [],
      timestamp: updated.created_at,
      deliveryState: "delivered",
      reactions: [],
      isEdited: true,
      isDeleted: updated.is_deleted || false
    };
  },

  async deleteMessage(chatId: string, messageId: string) {
    const db = getClient();
    const { data: updated, error } = await db.from("messages").update({
      content: "This message was deleted",
      is_deleted: true,
      updated_at: new Date().toISOString()
    }).eq("id", messageId).eq("conversation_id", chatId).select().single();

    if (error || !updated) {
      throw new Error(`Failed to delete message: ${error?.message || 'Not found'}`);
    }

    return {
      id: updated.id,
      chatId: updated.conversation_id,
      senderId: updated.sender_id,
      senderName: "Relay User",
      content: updated.content,
      type: updated.message_type || "text",
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
    const { data: existing } = await db.from("message_reactions").select("*").eq("message_id", messageId).eq("profile_id", userId).eq("reaction", emoji).maybeSingle();
    if (existing) {
      await db.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await db.from("message_reactions").insert({
        message_id: messageId,
        profile_id: userId,
        reaction: emoji,
        created_at: new Date().toISOString()
      });
    }

    const { data: reactionsData } = await db.from("message_reactions").select("profile_id, reaction").eq("message_id", messageId);
    return (reactionsData || []).map((r: any) => ({ userId: r.profile_id, userName: user?.name || "User", emoji: r.reaction }));
  },

  async togglePinMessage(chatId: string, messageId: string) {
    const db = getClient();
    const { data: member } = await db.from("conversation_members").select("is_pinned").eq("conversation_id", chatId).maybeSingle();
    const newPin = !member?.is_pinned;
    await db.from("conversation_members").update({ is_pinned: newPin }).eq("conversation_id", chatId);
    return newPin ? messageId : undefined;
  },

  async markChatRead(chatId: string, userId: string) {
    const db = getClient();
    await db.from("conversation_members").update({ unread_count: 0 }).eq("conversation_id", chatId).eq("profile_id", userId);
  },

  async setTyping(chatId: string, userId: string, userName: string) {
    const db = getClient();
    await db.from("typing_indicators").upsert({
      conversation_id: chatId,
      user_id: userId,
      is_typing: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "conversation_id, user_id" });
  },

  async getTyping(chatId: string) {
    const db = getClient();
    const tenSecAgo = new Date(Date.now() - 10000).toISOString();
    const { data } = await db.from("typing_indicators").select("user_id").eq("conversation_id", chatId).eq("is_typing", true).gt("updated_at", tenSecAgo);
    
    const results = [];
    for (const t of data || []) {
      const prof = await userRepo.getProfileById(t.user_id);
      results.push({ userId: t.user_id, name: prof?.name || "User" });
    }
    return results;
  },

  async deleteChat(chatId: string) {
    const db = getClient();
    await db.from("messages").delete().eq("conversation_id", chatId);
    await db.from("conversation_members").delete().eq("conversation_id", chatId);
    await db.from("conversations").delete().eq("id", chatId);
  },

  async updateChatInfo(chatId: string, payload: any) {
    const db = getClient();
    const updates: any = { updated_at: new Date().toISOString() };
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.description !== undefined) updates.description = payload.description;

    await db.from("conversations").update(updates).eq("id", chatId);
  },

  async addMembers(chatId: string, memberIds: string[]) {
    const db = getClient();
    const rows = memberIds.map((mId) => ({
      conversation_id: chatId,
      profile_id: mId,
      role: "member",
      created_at: new Date().toISOString()
    }));
    await db.from("conversation_members").upsert(rows, { onConflict: "conversation_id, profile_id" });
  },

  async removeMember(chatId: string, memberId: string) {
    const db = getClient();
    await db.from("conversation_members").delete().eq("conversation_id", chatId).eq("profile_id", memberId);
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

export const supabaseRepository = {
  user: userRepo,
  chat: chatRepo,
  community: communityRepo,
  status: statusRepo,
  createCommunity: communityRepo.createCommunity.bind(communityRepo),
  getCommunities: communityRepo.getCommunities.bind(communityRepo),
  joinCommunity: communityRepo.joinCommunity.bind(communityRepo),
  leaveCommunity: communityRepo.leaveCommunity.bind(communityRepo),
  getCommunityPosts: (id: string): Promise<CommunityPost[]> => Promise.resolve([]),
  createCommunityPost: (authorId: string, communityId: string, payload: any): Promise<CommunityPost> => Promise.resolve({
    id: `post_${Date.now()}`,
    communityId,
    channelId: payload.channelId || 'c_general',
    authorId,
    authorName: 'User',
    content: payload.content || '',
    title: payload.title,
    imageUrl: payload.imageUrl,
    timestamp: new Date().toISOString(),
    likesCount: 0,
    commentsCount: 0,
    likes: [],
    comments: []
  })
};
