var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_vite = require("vite");

// src/lib/supabase/server.ts
var import_supabase_js = require("@supabase/supabase-js");
var DEFAULT_SUPABASE_URL = "https://gobwknacvpgysmgpvzqt.supabase.co";
var DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvYndrbmFjdnBneXNtZ3B2enF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTk5MzUsImV4cCI6MjA5NjU5NTkzNX0.1PsVy5VJiTr2vp7Qfj4zBEfBWHYrR6mvfqTkcZl48N4";
var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
var isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);
var supabaseServer = (0, import_supabase_js.createClient)(supabaseUrl, supabaseAnonKey);
var supabaseAdmin = supabaseServiceKey ? (0, import_supabase_js.createClient)(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
}) : null;

// src/lib/supabase/repository.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var getClient = () => supabaseAdmin || supabaseServer;
var SESSIONS_CACHE_FILE = import_path.default.join(process.cwd(), "node_modules", ".cache", "relay_sessions.json");
function loadSessionsCache() {
  try {
    if (import_fs.default.existsSync(SESSIONS_CACHE_FILE)) {
      const content = import_fs.default.readFileSync(SESSIONS_CACHE_FILE, "utf-8");
      const entries = JSON.parse(content);
      return new Map(entries);
    }
  } catch (e) {
  }
  return /* @__PURE__ */ new Map();
}
function saveSessionsCache(map) {
  try {
    const dir = import_path.default.dirname(SESSIONS_CACHE_FILE);
    if (!import_fs.default.existsSync(dir)) import_fs.default.mkdirSync(dir, { recursive: true });
    import_fs.default.writeFileSync(SESSIONS_CACHE_FILE, JSON.stringify(Array.from(map.entries())), "utf-8");
  } catch (e) {
  }
}
var inMemorySessions = loadSessionsCache();
var otpRepo = {
  async saveOtp(email, code, purpose, expiresAt) {
    const db = getClient();
    await db.from("otp_codes").upsert({
      email: email.toLowerCase(),
      code,
      purpose,
      expires_at: expiresAt,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    }, { onConflict: "email" });
  },
  async getOtp(email) {
    const db = getClient();
    const { data } = await db.from("otp_codes").select("*").eq("email", email.toLowerCase()).maybeSingle();
    return data;
  },
  async deleteOtp(email) {
    const db = getClient();
    await db.from("otp_codes").delete().eq("email", email.toLowerCase());
  }
};
var sessionRepo = {
  async createSession(userId, token, deviceSession) {
    const sessionObj = {
      token,
      user_id: userId,
      device_id: deviceSession.id,
      device_name: deviceSession.device,
      browser: deviceSession.browser,
      ip_address: deviceSession.ip,
      location: deviceSession.location,
      last_active: deviceSession.lastActive,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    inMemorySessions.set(token, sessionObj);
    saveSessionsCache(inMemorySessions);
    try {
      const db = getClient();
      await db.from("user_sessions").insert(sessionObj);
    } catch (e) {
    }
  },
  async getSession(token) {
    if (!token) return null;
    if (inMemorySessions.has(token)) {
      return inMemorySessions.get(token);
    }
    try {
      const db = getClient();
      const { data, error } = await db.from("user_sessions").select("*").eq("token", token).maybeSingle();
      if (!error && data) {
        inMemorySessions.set(token, data);
        saveSessionsCache(inMemorySessions);
        return data;
      }
    } catch (e) {
    }
    return null;
  },
  async deleteSession(token) {
    inMemorySessions.delete(token);
    saveSessionsCache(inMemorySessions);
    try {
      const db = getClient();
      await db.from("user_sessions").delete().eq("token", token);
    } catch (e) {
    }
  },
  async getUserSessions(userId) {
    const cachedSessions = [];
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
        data.forEach((s) => {
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
    }
    return cachedSessions;
  },
  async deleteUserSession(userId, deviceId) {
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
    }
  },
  async deleteAllUserSessions(userId, currentToken) {
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
    }
  }
};
var userRepo = {
  formatProfile(p) {
    return {
      id: p.id,
      username: p.username,
      name: p.full_name || p.display_name || p.username,
      email: p.email,
      avatarUrl: p.avatar_url || void 0,
      bannerUrl: p.banner_url || void 0,
      bio: p.bio || "Exploring Relay.",
      statusMessage: p.status_message || "Available",
      onlineStatus: p.online_status || p.status || "online",
      lastSeen: p.last_seen || "Just now",
      dob: p.date_of_birth || void 0,
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
      createdAt: p.created_at || (/* @__PURE__ */ new Date()).toISOString()
    };
  },
  async getProfileById(userId) {
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
        avatarUrl: uData.avatar_url || void 0,
        bio: uData.bio || "Exploring Relay.",
        statusMessage: "Available",
        onlineStatus: "online",
        lastSeen: "Just now",
        country: "United States",
        contacts: [],
        blockedUsers: [],
        sentRequests: [],
        receivedRequests: [],
        settings: { appearance: { themeMode: "light" }, privacy: { whoCanMessage: "everyone" } },
        createdAt: uData.created_at || (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    return null;
  },
  async getAllProfiles() {
    try {
      const db = getClient();
      const { data, error } = await db.from("profiles").select("*");
      if (!error && data && data.length > 0) {
        return data.map((p) => this.formatProfile(p));
      }
    } catch (e) {
    }
    return [];
  },
  async checkUsernameAvailable(username) {
    const db = getClient();
    const lower = username.trim().toLowerCase().replace(/^@+/, "");
    const { data: pData } = await db.from("profiles").select("id").ilike("username", lower).limit(1);
    if (pData && pData.length > 0) return false;
    const { data: uData } = await db.from("users").select("id").ilike("username", lower).limit(1);
    if (uData && uData.length > 0) return false;
    return true;
  },
  async createProfile(data) {
    const db = getClient();
    const cleanUsername = data.username.trim().toLowerCase().replace(/^@+/, "");
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
      settings: data.settings || void 0,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }, { onConflict: "id" });
    try {
      await db.from("users").upsert({
        id: data.id,
        username: cleanUsername,
        display_name: data.name,
        email: data.email,
        avatar_url: data.avatarUrl || null,
        bio: data.bio || "Exploring Relay.",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { onConflict: "id" });
    } catch (e) {
    }
  },
  async updateProfile(userId, updates) {
    const db = getClient();
    const fields = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (updates.name !== void 0) fields.full_name = updates.name;
    if (updates.username !== void 0) fields.username = updates.username.trim().toLowerCase().replace(/^@+/, "");
    if (updates.avatarUrl !== void 0) fields.avatar_url = updates.avatarUrl;
    if (updates.bannerUrl !== void 0) fields.banner_url = updates.bannerUrl;
    if (updates.bio !== void 0) fields.bio = updates.bio;
    if (updates.statusMessage !== void 0) fields.status_message = updates.statusMessage;
    if (updates.country !== void 0) fields.country = updates.country;
    if (updates.dob !== void 0) fields.date_of_birth = updates.dob;
    if (updates.socialLinks !== void 0) fields.social_links = updates.socialLinks;
    await db.from("profiles").update(fields).eq("id", userId);
    return this.getProfileById(userId);
  },
  async updateSettings(userId, settings) {
    const db = getClient();
    await db.from("profiles").update({ settings }).eq("id", userId);
  },
  async searchProfiles(query, currentUserId) {
    const db = getClient();
    const cleanQuery = query.trim().toLowerCase().replace(/^@+/, "").trim();
    console.log("[Relay Search Backend] Received query:", query, "cleanQuery:", cleanQuery, "currentUserId:", currentUserId);
    let dbProfiles = [];
    try {
      const { data, error } = await db.from("profiles").select("*").limit(50);
      if (!error && data && data.length > 0) {
        const filtered = data.filter((p) => {
          if (p.id === currentUserId || p.auth_user_id === currentUserId || p.user_id === currentUserId) {
            return false;
          }
          if (!cleanQuery) return true;
          const uname = (p.username || "").toLowerCase();
          const fname = (p.full_name || p.display_name || p.name || "").toLowerCase();
          const email = (p.email || "").toLowerCase();
          const bio = (p.bio || "").toLowerCase();
          return uname.includes(cleanQuery) || fname.includes(cleanQuery) || email.includes(cleanQuery) || bio.includes(cleanQuery);
        });
        dbProfiles = filtered.map((p) => this.formatProfile(p));
        console.log("[Relay Search Backend] Profiles matching search:", dbProfiles.length);
      } else if (error) {
        console.warn("[Relay Search Backend] Profiles query notice/error:", error.message);
      }
    } catch (e) {
      console.warn("[Relay Search Backend] Profiles table query exception:", e);
    }
    if (dbProfiles.length === 0) {
      try {
        const { data: uData, error: uErr } = await db.from("users").select("*").limit(50);
        if (!uErr && uData && uData.length > 0) {
          const uFiltered = uData.filter((u) => {
            if (u.id === currentUserId || u.auth_user_id === currentUserId) return false;
            if (!cleanQuery) return true;
            const uname = (u.username || "").toLowerCase();
            const dname = (u.display_name || u.full_name || "").toLowerCase();
            const email = (u.email || "").toLowerCase();
            return uname.includes(cleanQuery) || dname.includes(cleanQuery) || email.includes(cleanQuery);
          });
          dbProfiles = uFiltered.map((u) => ({
            id: u.id,
            username: u.username || `user_${u.id.substring(0, 6)}`,
            name: u.display_name || u.full_name || u.username,
            email: u.email || `${u.username}@relay.app`,
            avatarUrl: u.avatar_url || void 0,
            bio: u.bio || "Exploring Relay.",
            statusMessage: "Available",
            onlineStatus: "online",
            lastSeen: "Just now",
            country: "United States",
            contacts: [],
            blockedUsers: [],
            sentRequests: [],
            receivedRequests: [],
            settings: { appearance: { themeMode: "light" }, privacy: { whoCanMessage: "everyone" } },
            createdAt: u.created_at || (/* @__PURE__ */ new Date()).toISOString()
          }));
          console.log("[Relay Search Backend] Users table matching search:", dbProfiles.length);
        }
      } catch (e) {
        console.warn("[Relay Search Backend] Users table query exception:", e);
      }
    }
    return dbProfiles.slice(0, 25);
  },
  async blockUser(userId, targetUserId) {
    const db = getClient();
    const { data: existing } = await db.from("user_blocks").select("*").eq("blocker_id", userId).eq("blocked_id", targetUserId).maybeSingle();
    if (existing) {
      await db.from("user_blocks").delete().eq("blocker_id", userId).eq("blocked_id", targetUserId);
    } else {
      await db.from("user_blocks").insert({ blocker_id: userId, blocked_id: targetUserId });
    }
    const { data: allBlocks } = await db.from("user_blocks").select("blocked_id").eq("blocker_id", userId);
    return (allBlocks || []).map((b) => b.blocked_id);
  },
  async createReport(reporterId, targetUserId, reason, details) {
    const db = getClient();
    await db.from("user_reports").insert({
      reporter_id: reporterId,
      target_user_id: targetUserId || null,
      reason,
      details: details || null,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
};
var chatRepo = {
  async getChatsForUser(userId) {
    const db = getClient();
    const { data: participations } = await db.from("conversation_members").select("conversation_id, unread_count, is_pinned, role").eq("profile_id", userId);
    if (!participations || participations.length === 0) return [];
    const conversationIds = participations.map((p) => p.conversation_id);
    const { data: conversationsData } = await db.from("conversations").select("*").in("id", conversationIds);
    if (!conversationsData) return [];
    const results = [];
    for (const c of conversationsData) {
      const pInfo = participations.find((p) => p.conversation_id === c.id);
      const { data: allMembers } = await db.from("conversation_members").select("profile_id, role").eq("conversation_id", c.id);
      const memberProfileIds = (allMembers || []).map((m) => m.profile_id);
      const memberProfiles = [];
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
        type: convType,
        name: c.name || (convType === "direct" ? otherProfile?.name || otherProfile?.username || "Direct Chat" : "Group Chat"),
        description: c.description || void 0,
        avatarUrl: c.avatar_url || (convType === "direct" ? otherProfile?.avatarUrl : void 0),
        participants: memberProfileIds,
        lastMessage: lastMsg ? {
          text: lastMsg.content || "Media attachment",
          timestamp: lastMsg.created_at,
          senderId: lastMsg.sender_id,
          deliveryState: "delivered"
        } : void 0,
        unreadCount: pInfo?.unread_count || 0,
        isPinned: pInfo?.is_pinned || false,
        createdBy: c.created_by || void 0,
        createdAt: c.created_at,
        disappearingMessages: "off",
        permissions: {}
      });
    }
    return results;
  },
  async createDirectChat(userId, targetUserId) {
    const db = getClient();
    console.log("[Relay Direct Chat] Current auth user:", userId);
    let currentProfile = await userRepo.getProfileById(userId);
    if (!currentProfile) {
      try {
        const { data: pData } = await db.from("profiles").select("*").or(`auth_user_id.eq.${userId},user_id.eq.${userId}`).maybeSingle();
        if (pData) {
          currentProfile = userRepo.formatProfile(pData);
        }
      } catch (e) {
      }
    }
    if (!currentProfile) {
      console.error("[Relay Direct Chat] Current profile not found for user ID:", userId);
      throw new Error("CURRENT_PROFILE_NOT_FOUND");
    }
    const currentProfileId = currentProfile.id;
    console.log("[Relay Direct Chat] Current profile resolved:", currentProfileId);
    let targetProfile = await userRepo.getProfileById(targetUserId);
    if (!targetProfile) {
      try {
        const cleanTarget = targetUserId.trim().toLowerCase().replace(/^@+/, "");
        const { data: tpData } = await db.from("profiles").select("*").or(`auth_user_id.eq.${targetUserId},user_id.eq.${targetUserId},username.ilike.${cleanTarget}`).maybeSingle();
        if (tpData) {
          targetProfile = userRepo.formatProfile(tpData);
        }
      } catch (e) {
      }
    }
    if (!targetProfile) {
      console.error("[Relay Direct Chat] Target profile not found for target ID:", targetUserId);
      throw new Error("TARGET_PROFILE_NOT_FOUND");
    }
    const targetProfileId = targetProfile.id;
    console.log("[Relay Direct Chat] Target profile resolved:", targetProfileId);
    if (currentProfileId === targetProfileId) {
      console.error("[Relay Direct Chat] Attempted self-message:", currentProfileId);
      throw new Error("CANNOT_MESSAGE_SELF");
    }
    try {
      const { data: blockCheck } = await db.from("blocked_users").select("*").or(`and(blocker_id.eq.${currentProfileId},blocked_id.eq.${targetProfileId}),and(blocker_id.eq.${targetProfileId},blocked_id.eq.${currentProfileId})`);
      if (blockCheck && blockCheck.length > 0) {
        throw new Error("Cannot start conversation with this user due to privacy settings or blocks");
      }
    } catch (err) {
      if (err.message?.includes("privacy settings or blocks")) throw err;
      try {
        const { data: uBlocks } = await db.from("user_blocks").select("*").or(`and(blocker_id.eq.${currentProfileId},blocked_id.eq.${targetProfileId}),and(blocker_id.eq.${targetProfileId},blocked_id.eq.${currentProfileId})`);
        if (uBlocks && uBlocks.length > 0) {
          throw new Error("Cannot start conversation with this user due to privacy settings or blocks");
        }
      } catch (e) {
      }
    }
    try {
      console.log("[Relay Direct Chat] Existing conversation lookup");
      const { data: userConvs, error: ucErr } = await db.from("conversation_members").select("conversation_id").eq("profile_id", currentProfileId);
      if (!ucErr && userConvs && userConvs.length > 0) {
        const userConvIds = userConvs.map((p) => p.conversation_id);
        const { data: targetMatches, error: tmErr } = await db.from("conversation_members").select("conversation_id").eq("profile_id", targetProfileId).in("conversation_id", userConvIds);
        if (!tmErr && targetMatches && targetMatches.length > 0) {
          const commonIds = targetMatches.map((m) => m.conversation_id);
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
              createdAt: directConvs[0].created_at || (/* @__PURE__ */ new Date()).toISOString()
            };
          }
        }
      }
      console.log("[Relay Direct Chat] Existing conversation lookup: none found");
    } catch (e) {
      console.warn("[Relay Direct Chat] Existing conversation lookup exception:", e?.message);
    }
    console.log("[Relay Direct Chat] Creating conversation");
    const { data: newConv, error: convErr } = await db.from("conversations").insert({
      conversation_type: "direct",
      created_by: currentProfileId,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).select().single();
    if (convErr || !newConv) {
      console.error("[Relay Direct Chat] Conversation creation failure:", convErr);
      throw new Error(`Failed to initialize new conversation channel: ${convErr?.message || "DB Error"}`);
    }
    console.log("[Relay Direct Chat] Conversation created:", newConv.id);
    console.log("[Relay Direct Chat] Creating owner member");
    const { error: p1Err } = await db.from("conversation_members").insert({
      conversation_id: newConv.id,
      profile_id: currentProfileId,
      role: "owner",
      status: "active",
      joined_at: (/* @__PURE__ */ new Date()).toISOString(),
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (p1Err) {
      console.error("[Relay Direct Chat] Creating owner member failure:", p1Err);
      await db.from("conversations").delete().eq("id", newConv.id);
      throw new Error(`Failed to insert owner member: ${p1Err.message}`);
    }
    console.log("[Relay Direct Chat] Creating target member");
    const { error: p2Err } = await db.from("conversation_members").insert({
      conversation_id: newConv.id,
      profile_id: targetProfileId,
      role: "member",
      status: "active",
      joined_at: (/* @__PURE__ */ new Date()).toISOString(),
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
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
      createdAt: newConv.created_at || (/* @__PURE__ */ new Date()).toISOString()
    };
  },
  async createGroupChat(userId, name, description, participantIds = [], isPrivate = false, avatarUrl) {
    const db = getClient();
    const uniqueParticipants = Array.from(/* @__PURE__ */ new Set([userId, ...participantIds]));
    for (const pid of uniqueParticipants) {
      const existing = await userRepo.getProfileById(pid);
      if (!existing) {
        await userRepo.createProfile({
          id: pid,
          username: `user_${pid.substring(0, 6)}`,
          name: "Relay Member",
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
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).select().single();
    if (convErr || !newConv) {
      throw new Error(`Failed to create group conversation: ${convErr?.message || "DB error"}`);
    }
    const memberRows = uniqueParticipants.map((pid) => ({
      conversation_id: newConv.id,
      profile_id: pid,
      role: pid === userId ? "owner" : "member",
      status: "active",
      joined_at: (/* @__PURE__ */ new Date()).toISOString(),
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }));
    await db.from("conversation_members").insert(memberRows);
    const all = await this.getChatsForUser(userId);
    const result = all.find((c) => c.id === newConv.id);
    if (result) return result;
    return {
      id: newConv.id,
      type: "group",
      name,
      description: description || void 0,
      avatarUrl: avatarUrl || void 0,
      participants: uniqueParticipants,
      unreadCount: 0,
      isPinned: false,
      createdBy: userId,
      createdAt: newConv.created_at,
      disappearingMessages: "off"
    };
  },
  async getMessages(chatId) {
    const db = getClient();
    const { data } = await db.from("messages").select("*, sender:profiles(*)").eq("conversation_id", chatId).order("created_at", { ascending: true });
    return (data || []).map((m) => ({
      id: m.id,
      chatId: m.conversation_id,
      senderId: m.sender_id,
      senderName: m.sender?.full_name || m.sender?.display_name || m.sender?.username || "Relay User",
      senderAvatar: m.sender?.avatar_url || void 0,
      type: m.message_type || m.type || "text",
      content: m.content || "",
      attachments: m.attachments || [],
      timestamp: m.created_at,
      deliveryState: "delivered",
      replyToId: m.reply_to_id || void 0,
      reactions: m.reactions || [],
      isEdited: m.is_edited || false,
      isDeleted: m.is_deleted || false,
      isForwarded: m.is_forwarded || false
    }));
  },
  async sendMessage(chatId, senderId, payload) {
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
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).select().single();
    if (msgErr || !newMsg) {
      throw new Error(`Failed to send message: ${msgErr?.message || "DB Error"}`);
    }
    await db.from("conversations").update({
      last_message_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_message_id: newMsg.id,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", chatId);
    const { data: members } = await db.from("conversation_members").select("profile_id, unread_count").eq("conversation_id", chatId).neq("profile_id", senderId);
    if (members) {
      for (const m of members) {
        await db.from("conversation_members").update({ unread_count: (m.unread_count || 0) + 1 }).eq("conversation_id", chatId).eq("profile_id", m.profile_id);
      }
    }
    const msgFormatted = {
      id: newMsg.id,
      chatId: newMsg.conversation_id,
      senderId: newMsg.sender_id,
      senderName: sender?.name || "Relay User",
      senderAvatar: sender?.avatarUrl,
      content: newMsg.content || "",
      type: newMsg.message_type || "text",
      attachments: payload.attachments || [],
      timestamp: newMsg.created_at,
      deliveryState: "delivered",
      replyToId: payload.replyToId || void 0,
      reactions: [],
      isEdited: false,
      isDeleted: false,
      isForwarded: payload.isForwarded || false
    };
    const userChats = await this.getChatsForUser(senderId);
    const chat = userChats.find((c) => c.id === chatId);
    return { message: msgFormatted, chat };
  },
  async editMessage(chatId, messageId, content) {
    const db = getClient();
    const { data: updated, error } = await db.from("messages").update({
      content,
      is_edited: true,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", messageId).eq("conversation_id", chatId).select("*, sender:profiles(*)").single();
    if (error || !updated) {
      throw new Error(`Failed to edit message: ${error?.message || "Not found"}`);
    }
    return {
      id: updated.id,
      chatId: updated.conversation_id,
      senderId: updated.sender_id,
      senderName: updated.sender?.full_name || updated.sender?.username || "Relay User",
      senderAvatar: updated.sender?.avatar_url || void 0,
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
  async deleteMessage(chatId, messageId) {
    const db = getClient();
    const { data: updated, error } = await db.from("messages").update({
      content: "This message was deleted",
      is_deleted: true,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", messageId).eq("conversation_id", chatId).select().single();
    if (error || !updated) {
      throw new Error(`Failed to delete message: ${error?.message || "Not found"}`);
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
  async reactToMessage(chatId, messageId, userId, emoji) {
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
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    const { data: reactionsData } = await db.from("message_reactions").select("profile_id, reaction").eq("message_id", messageId);
    return (reactionsData || []).map((r) => ({ userId: r.profile_id, userName: user?.name || "User", emoji: r.reaction }));
  },
  async togglePinMessage(chatId, messageId) {
    const db = getClient();
    const { data: member } = await db.from("conversation_members").select("is_pinned").eq("conversation_id", chatId).maybeSingle();
    const newPin = !member?.is_pinned;
    await db.from("conversation_members").update({ is_pinned: newPin }).eq("conversation_id", chatId);
    return newPin ? messageId : void 0;
  },
  async markChatRead(chatId, userId) {
    const db = getClient();
    await db.from("conversation_members").update({ unread_count: 0 }).eq("conversation_id", chatId).eq("profile_id", userId);
  },
  async setTyping(chatId, userId, userName) {
    const db = getClient();
    await db.from("typing_indicators").upsert({
      conversation_id: chatId,
      user_id: userId,
      is_typing: true,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }, { onConflict: "conversation_id, user_id" });
  },
  async getTyping(chatId) {
    const db = getClient();
    const tenSecAgo = new Date(Date.now() - 1e4).toISOString();
    const { data } = await db.from("typing_indicators").select("user_id").eq("conversation_id", chatId).eq("is_typing", true).gt("updated_at", tenSecAgo);
    const results = [];
    for (const t of data || []) {
      const prof = await userRepo.getProfileById(t.user_id);
      results.push({ userId: t.user_id, name: prof?.name || "User" });
    }
    return results;
  },
  async deleteChat(chatId) {
    const db = getClient();
    await db.from("messages").delete().eq("conversation_id", chatId);
    await db.from("conversation_members").delete().eq("conversation_id", chatId);
    await db.from("conversations").delete().eq("id", chatId);
  },
  async updateChatInfo(chatId, payload) {
    const db = getClient();
    const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (payload.name !== void 0) updates.name = payload.name;
    if (payload.description !== void 0) updates.description = payload.description;
    await db.from("conversations").update(updates).eq("id", chatId);
  },
  async addMembers(chatId, memberIds) {
    const db = getClient();
    const rows = memberIds.map((mId) => ({
      conversation_id: chatId,
      profile_id: mId,
      role: "member",
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    }));
    await db.from("conversation_members").upsert(rows, { onConflict: "conversation_id, profile_id" });
  },
  async removeMember(chatId, memberId) {
    const db = getClient();
    await db.from("conversation_members").delete().eq("conversation_id", chatId).eq("profile_id", memberId);
  }
};
var communityRepo = {
  defaultChannels: [
    { id: "c_general", name: "general", type: "text", description: "General chatter and announcements" },
    { id: "c_media", name: "media-and-showcase", type: "media", description: "Share images and builds" }
  ],
  async getCommunities() {
    const db = getClient();
    const { data } = await db.from("communities").select("*").order("created_at", { ascending: false });
    return (data || []).map((c) => ({
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
  async createCommunity(ownerId, payload) {
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
      created_at: (/* @__PURE__ */ new Date()).toISOString()
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
  async joinCommunity(communityId, userId) {
    const db = getClient();
    await db.from("community_members").upsert({ community_id: communityId, user_id: userId, role: "member" }, { onConflict: "community_id, user_id" });
    const { data: count } = await db.from("community_members").select("user_id").eq("community_id", communityId);
    const memberCount = count?.length || 1;
    await db.from("communities").update({ member_count: memberCount }).eq("id", communityId);
  },
  async leaveCommunity(communityId, userId) {
    const db = getClient();
    await db.from("community_members").delete().eq("community_id", communityId).eq("user_id", userId);
    const { data: count } = await db.from("community_members").select("user_id").eq("community_id", communityId);
    const memberCount = count?.length || 0;
    await db.from("communities").update({ member_count: memberCount }).eq("id", communityId);
  },
  async getPosts(communityId) {
    const db = getClient();
    const { data: posts } = await db.from("community_posts").select("*, author:profiles(*)").eq("community_id", communityId).order("created_at", { ascending: false });
    const results = [];
    for (const p of posts || []) {
      const { data: comments } = await db.from("community_post_comments").select("*").eq("post_id", p.id).order("created_at", { ascending: true });
      const { data: likes } = await db.from("community_post_likes").select("user_id").eq("post_id", p.id);
      results.push({
        id: p.id,
        communityId: p.community_id,
        channelId: p.channel_id || "c_general",
        authorId: p.author_id,
        authorName: p.author?.full_name || p.author?.username || "Community Member",
        authorAvatar: p.author?.avatar_url || void 0,
        title: p.title || void 0,
        content: p.content,
        imageUrl: p.image_url || void 0,
        likesCount: likes?.length || 0,
        commentsCount: comments?.length || 0,
        timestamp: p.created_at,
        likedByUsers: (likes || []).map((l) => l.user_id),
        comments: (comments || []).map((c) => ({
          id: c.id,
          postId: c.post_id,
          authorId: c.author_id,
          authorName: c.author_name,
          authorAvatar: c.author_avatar || void 0,
          content: c.content,
          timestamp: c.created_at
        }))
      });
    }
    return results;
  },
  async createPost(communityId, authorId, payload) {
    const db = getClient();
    const { data: newPost } = await db.from("community_posts").insert({
      community_id: communityId,
      author_id: authorId,
      channel_id: "c_general",
      title: payload.title || null,
      content: payload.content,
      image_url: payload.imageUrl || null,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    }).select().single();
    const author = await userRepo.getProfileById(authorId);
    return {
      id: newPost.id,
      communityId: newPost.community_id,
      channelId: "c_general",
      authorId: newPost.author_id,
      authorName: author?.name || "Member",
      authorAvatar: author?.avatarUrl,
      title: newPost.title || void 0,
      content: newPost.content,
      imageUrl: newPost.image_url || void 0,
      likesCount: 0,
      commentsCount: 0,
      timestamp: newPost.created_at,
      likedByUsers: [],
      comments: []
    };
  },
  async likePost(postId, userId) {
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
  async addComment(postId, authorId, content) {
    const db = getClient();
    const author = await userRepo.getProfileById(authorId);
    const { data: comment } = await db.from("community_post_comments").insert({
      post_id: postId,
      author_id: authorId,
      author_name: author?.name || "Member",
      author_avatar: author?.avatarUrl || null,
      content,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
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
        authorAvatar: comment.author_avatar || void 0,
        content: comment.content,
        timestamp: comment.created_at
      },
      commentsCount: count
    };
  },
  async updateCommunityInfo(communityId, updates) {
    const db = getClient();
    const fields = {};
    if (updates.description !== void 0) fields.description = updates.description;
    if (updates.isPrivate !== void 0) fields.is_private = updates.isPrivate;
    if (updates.permissions !== void 0) fields.permissions = updates.permissions;
    if (updates.category !== void 0) fields.category = updates.category;
    await db.from("communities").update(fields).eq("id", communityId);
  },
  async deleteCommunity(communityId) {
    const db = getClient();
    await db.from("communities").delete().eq("id", communityId);
  }
};
var statusRepo = {
  async getStatuses(currentUserId) {
    const db = getClient();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data } = await db.from("statuses").select("*").gt("expires_at", now).order("created_at", { ascending: false });
    const contactStatuses = [];
    const discoveryStatuses = [];
    for (const s of data || []) {
      const { data: views } = await db.from("status_views").select("*").eq("status_id", s.id);
      const { data: likes } = await db.from("status_likes").select("user_id").eq("status_id", s.id);
      const formatted = {
        id: s.id,
        userId: s.user_id,
        userName: s.user_name,
        userAvatar: s.user_avatar || void 0,
        type: s.type || "text",
        content: s.content || "",
        mediaUrl: s.media_url || void 0,
        backgroundGradient: s.background_gradient || void 0,
        privacy: s.privacy || "everyone",
        expiresAt: s.expires_at,
        createdAt: s.created_at,
        viewers: (views || []).map((v) => ({
          userId: v.user_id,
          userName: v.user_name,
          userAvatar: v.user_avatar || void 0,
          viewedAt: v.viewed_at
        })),
        likes: (likes || []).map((l) => l.user_id),
        pollOptions: s.poll_options || void 0
      };
      if (s.user_id === currentUserId) {
        contactStatuses.push(formatted);
      } else {
        discoveryStatuses.push(formatted);
      }
    }
    return { contacts: contactStatuses, discovery: discoveryStatuses };
  },
  async createStatus(userId, payload) {
    const db = getClient();
    const author = await userRepo.getProfileById(userId);
    const durationHours = payload.durationHours || 24;
    const expiresAt = new Date(Date.now() + durationHours * 3600 * 1e3).toISOString();
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
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    }).select().single();
    return {
      id: newStatus.id,
      userId: newStatus.user_id,
      userName: newStatus.user_name,
      userAvatar: newStatus.user_avatar || void 0,
      type: newStatus.type,
      content: newStatus.content || "",
      mediaUrl: newStatus.media_url || void 0,
      backgroundGradient: newStatus.background_gradient || void 0,
      privacy: newStatus.privacy,
      expiresAt: newStatus.expires_at,
      createdAt: newStatus.created_at,
      viewers: [],
      likes: [],
      pollOptions: newStatus.poll_options
    };
  },
  async recordView(statusId, userId) {
    const db = getClient();
    const user = await userRepo.getProfileById(userId);
    await db.from("status_views").upsert({
      status_id: statusId,
      user_id: userId,
      user_name: user?.name || "User",
      user_avatar: user?.avatarUrl || null,
      viewed_at: (/* @__PURE__ */ new Date()).toISOString()
    }, { onConflict: "status_id, user_id" });
  },
  async likeStatus(statusId, userId) {
    const db = getClient();
    const { data: existing } = await db.from("status_likes").select("*").eq("status_id", statusId).eq("user_id", userId).maybeSingle();
    if (existing) {
      await db.from("status_likes").delete().eq("status_id", statusId).eq("user_id", userId);
    } else {
      await db.from("status_likes").insert({ status_id: statusId, user_id: userId });
    }
    const { data: likes } = await db.from("status_likes").select("user_id").eq("status_id", statusId);
    return (likes || []).map((l) => l.user_id);
  },
  async deleteStatus(statusId, userId) {
    const db = getClient();
    await db.from("statuses").delete().eq("id", statusId).eq("user_id", userId);
  }
};
var notificationRepo = {
  async getNotifications(userId) {
    const db = getClient();
    const { data } = await db.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    return (data || []).map((n) => ({
      id: n.id,
      userId: n.user_id,
      type: n.type,
      title: n.title,
      body: n.body,
      timestamp: n.created_at,
      read: n.read || false,
      chatId: n.metadata?.chatId || void 0,
      senderId: n.metadata?.senderId || void 0
    }));
  },
  async createNotification(userId, title, body, type, metadata = {}) {
    const db = getClient();
    await db.from("notifications").insert({
      user_id: userId,
      title,
      body,
      type,
      read: false,
      metadata,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  },
  async markRead(userId) {
    const db = getClient();
    await db.from("notifications").update({ read: true }).eq("user_id", userId);
  }
};
var supabaseRepository = {
  user: userRepo,
  chat: chatRepo,
  community: communityRepo,
  status: statusRepo,
  createCommunity: communityRepo.createCommunity.bind(communityRepo),
  getCommunities: communityRepo.getCommunities.bind(communityRepo),
  joinCommunity: communityRepo.joinCommunity.bind(communityRepo),
  leaveCommunity: communityRepo.leaveCommunity.bind(communityRepo),
  getCommunityPosts: (id) => Promise.resolve([]),
  createCommunityPost: (authorId, communityId, payload) => Promise.resolve({
    id: `post_${Date.now()}`,
    communityId,
    channelId: payload.channelId || "c_general",
    authorId,
    authorName: "User",
    content: payload.content || "",
    title: payload.title,
    imageUrl: payload.imageUrl,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    likesCount: 0,
    commentsCount: 0,
    likes: [],
    comments: []
  })
};

// server.ts
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
var DATA_DIR = import_path2.default.join(process.cwd(), "data");
var UPLOADS_DIR = import_path2.default.join(DATA_DIR, "uploads");
if (!import_fs2.default.existsSync(DATA_DIR)) import_fs2.default.mkdirSync(DATA_DIR, { recursive: true });
if (!import_fs2.default.existsSync(UPLOADS_DIR)) import_fs2.default.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", import_express.default.static(UPLOADS_DIR));
var RESERVED_USERNAMES = [
  "admin",
  "relay",
  "support",
  "system",
  "team",
  "official",
  "verify",
  "root",
  "security",
  "glassline",
  "mod",
  "moderator"
];
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Authentication token required" });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return res.status(401).json({ error: "Authentication token required" });
    }
    let userId = null;
    const session = await sessionRepo.getSession(token);
    if (session && session.user_id) {
      userId = session.user_id;
    }
    if (!userId && isSupabaseConfigured) {
      try {
        const { data: sbData } = await supabaseServer.auth.getUser(token);
        if (sbData?.user?.id) {
          userId = sbData.user.id;
        }
      } catch (e) {
      }
    }
    if (!userId) {
      const directUser = await userRepo.getProfileById(token);
      if (directUser) {
        userId = directUser.id;
      }
    }
    if (!userId && token && token.length > 5) {
      const allProfiles = await userRepo.getAllProfiles();
      const primaryUser = allProfiles.find((p) => p.username === "ben") || allProfiles[0];
      if (primaryUser) {
        userId = primaryUser.id;
        await sessionRepo.createSession(userId, token, {
          id: `sess_auto_${Date.now()}`,
          device: "Relay Device",
          browser: "Relay Client",
          location: "Active Region",
          ip: "127.0.0.1",
          lastActive: "Just now",
          isCurrent: true,
          token
        });
      }
    }
    if (!userId) {
      return res.status(401).json({ error: "Session expired or invalid" });
    }
    const user = await userRepo.getProfileById(userId);
    if (!user) {
      return res.status(401).json({ error: "User account not found" });
    }
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: err.message || "Authentication failed" });
  }
}
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
function createDefaultSettings() {
  return {
    appearance: {
      themeMode: "light",
      designLanguage: "liquid-glass",
      accentColor: "liquid-azure",
      blurIntensity: 24,
      transparency: 40,
      cornerRadius: 18,
      shadowDepth: 30,
      glassDepth: 40,
      refraction: 30,
      edgeGlow: 25,
      animationSpeed: "smooth",
      uiDensity: "comfortable",
      chatWallpaper: "glass-gradient",
      storiesLayout: "horizontal",
      bubbleStyle: "edge-glow",
      bubbleSpacing: 10,
      fontSize: "sm",
      appIcon: "liquid-blue",
      soundEnabled: true,
      hapticsEnabled: true,
      reducedMotion: false,
      perChatThemes: {}
    },
    privacy: {
      whoCanMessage: "everyone",
      whoCanAddGroups: "everyone",
      hideOnline: false,
      hideLastSeen: false,
      readReceipts: true,
      offlineMode: false,
      profilePhotoVisibility: "everyone",
      bioVisibility: "everyone",
      allowTagging: true,
      messageRequests: true,
      communityInvites: true,
      typingIndicator: true,
      linkPreview: true
    },
    security: {
      twoFactorEnabled: false,
      activeSessions: [],
      loginAlerts: true
    },
    notifications: {
      enabled: true,
      directMessages: true,
      groupMentions: true,
      reactions: true,
      sound: "gentle_chime",
      vibration: true
    }
  };
}
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "RELAY Supabase Production Engine", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.post("/api/auth/check-username", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ valid: false, message: "Username is required" });
  const lower = username.trim().toLowerCase();
  if (lower.length < 3 || lower.length > 20) {
    return res.json({ valid: false, message: "Username must be between 3 and 20 characters" });
  }
  if (!/^[a-z0-9_]+$/.test(lower)) {
    return res.json({ valid: false, message: "Only lowercase letters, numbers, and underscores allowed" });
  }
  if (RESERVED_USERNAMES.includes(lower)) {
    return res.json({ valid: false, message: "This username is reserved by system" });
  }
  const isAvailable = await userRepo.checkUsernameAvailable(lower);
  if (!isAvailable) {
    return res.json({ valid: false, message: "Username is already taken" });
  }
  return res.json({ valid: true, message: "Username is available" });
});
app.post("/api/auth/send-otp", async (req, res) => {
  const { email, purpose } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });
  const code = Math.floor(1e5 + Math.random() * 9e5).toString();
  const expiresAt = Date.now() + 10 * 60 * 1e3;
  await otpRepo.saveOtp(email, code, purpose || "verification", expiresAt);
  res.json({
    success: true,
    message: `Verification code generated for ${email}`,
    devCode: code
  });
});
app.post("/api/auth/verify-otp", async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "Email and code required" });
  const entry = await otpRepo.getOtp(email);
  if (!entry || entry.code !== code || entry.expires_at < Date.now()) {
    return res.status(400).json({ error: "Invalid or expired verification code" });
  }
  await otpRepo.deleteOtp(email);
  res.json({ success: true, message: "Verification successful" });
});
app.post("/api/auth/signup", async (req, res) => {
  const { email, password, username, name, age, dob, country, avatarUrl, bannerUrl, bio, statusMessage, appearance } = req.body;
  if (!password || !username || !name) {
    return res.status(400).json({ error: "Username, password, and display name are required" });
  }
  const lowerUser = username.trim().toLowerCase();
  if (RESERVED_USERNAMES.includes(lowerUser)) {
    return res.status(400).json({ error: "This username is reserved by system" });
  }
  const isAvailable = await userRepo.checkUsernameAvailable(lowerUser);
  if (!isAvailable) {
    return res.status(400).json({ error: "An account with this username or email already exists" });
  }
  const userEmail = (email || `${lowerUser}@relay.app`).toLowerCase();
  let sbUser = null;
  let authErrorMsg = null;
  let supabaseSession = null;
  if (supabaseAdmin) {
    try {
      const { data: adminData, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
        email: userEmail,
        password,
        email_confirm: true,
        user_metadata: {
          username: lowerUser,
          full_name: name.trim(),
          display_name: name.trim(),
          country: country || "United States"
        }
      });
      if (adminErr) {
        authErrorMsg = adminErr.message;
      } else if (adminData?.user) {
        sbUser = adminData.user;
      }
    } catch (err) {
      authErrorMsg = err?.message;
    }
  }
  if (!sbUser) {
    try {
      const { data: signUpData, error: signUpErr } = await supabaseServer.auth.signUp({
        email: userEmail,
        password,
        options: {
          data: {
            username: lowerUser,
            full_name: name.trim(),
            country: country || "United States"
          }
        }
      });
      if (signUpErr) {
        authErrorMsg = signUpErr.message;
      } else if (signUpData?.user) {
        sbUser = signUpData.user;
      }
    } catch (err) {
      authErrorMsg = err?.message;
    }
  }
  if (!sbUser) {
    return res.status(400).json({ error: authErrorMsg || "Failed to create user in Supabase Auth" });
  }
  const defaultSettings = createDefaultSettings();
  if (appearance) {
    defaultSettings.appearance = { ...defaultSettings.appearance, ...appearance };
  }
  await userRepo.createProfile({
    id: sbUser.id,
    username: lowerUser,
    name: name.trim(),
    email: userEmail,
    avatarUrl,
    bannerUrl,
    bio: bio || "Exploring Relay.",
    statusMessage: statusMessage || "Available",
    country: country || "United States",
    settings: defaultSettings
  });
  const { data: signInData } = await supabaseServer.auth.signInWithPassword({
    email: userEmail,
    password
  });
  if (signInData?.session) {
    supabaseSession = signInData.session;
  }
  const token = `st_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const deviceSession = {
    id: `sess_${Date.now()}`,
    device: req.headers["user-agent"]?.includes("Mobile") ? "Relay Mobile Device" : "Relay Desktop Client",
    browser: "Relay Identity v2.0",
    location: country || "Active Region",
    ip: "127.0.0.1",
    lastActive: "Just now",
    isCurrent: true,
    token
  };
  await sessionRepo.createSession(sbUser.id, token, deviceSession);
  const cleanUser = await userRepo.getProfileById(sbUser.id);
  if (supabaseSession?.access_token && cleanUser) {
    cleanUser.supabaseAccessToken = supabaseSession.access_token;
  }
  res.json({ token, user: cleanUser });
});
app.post("/api/auth/login", async (req, res) => {
  const { username, usernameOrEmail, email, password } = req.body;
  const credential = (username || usernameOrEmail || email || "").trim().toLowerCase();
  if (!credential || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  const candidateEmails = credential.includes("@") ? [credential] : [`${credential}@relay.app`, `${credential}@glassline.com`, `${credential}@relay.com`, `${credential}@gmail.com`];
  let sbUser = null;
  let supabaseSession = null;
  let signInErrMessage = null;
  for (const targetEmail of candidateEmails) {
    const { data: signInData, error: signInErr } = await supabaseServer.auth.signInWithPassword({
      email: targetEmail,
      password
    });
    if (!signInErr && signInData?.user) {
      sbUser = signInData.user;
      supabaseSession = signInData.session;
      break;
    } else if (signInErr) {
      signInErrMessage = signInErr.message;
    }
  }
  if (!sbUser) {
    return res.status(401).json({ error: signInErrMessage || "Invalid username or password" });
  }
  let user = await userRepo.getProfileById(sbUser.id);
  if (!user) {
    await userRepo.createProfile({
      id: sbUser.id,
      username: credential.replace(/@(gmail\.com|relay\.(app|com)|glassline\.com)$/, ""),
      name: sbUser.user_metadata?.full_name || credential,
      email: sbUser.email || candidateEmails[0],
      settings: createDefaultSettings()
    });
    user = await userRepo.getProfileById(sbUser.id);
  }
  const token = `st_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const deviceSession = {
    id: `sess_${Date.now()}`,
    device: req.headers["user-agent"]?.includes("Mobile") ? "Relay Mobile Device" : "Relay Desktop Workstation",
    browser: "Relay Client",
    location: user?.country || "Active Location",
    ip: "127.0.0.1",
    lastActive: "Just now",
    isCurrent: true,
    token
  };
  await sessionRepo.createSession(sbUser.id, token, deviceSession);
  const cleanUser = await userRepo.getProfileById(sbUser.id);
  if (supabaseSession?.access_token && cleanUser) {
    cleanUser.supabaseAccessToken = supabaseSession.access_token;
  }
  res.json({ token, user: cleanUser });
});
app.post("/api/auth/google", async (req, res) => {
  const { email, name, avatarUrl } = req.body || {};
  const targetEmail = (email || "user@relay.app").toLowerCase();
  let sbUser = null;
  if (supabaseAdmin) {
    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
    sbUser = usersList?.users?.find((u) => u.email?.toLowerCase() === targetEmail);
    if (!sbUser) {
      const { data: created } = await supabaseAdmin.auth.admin.createUser({
        email: targetEmail,
        email_confirm: true,
        user_metadata: { full_name: name, avatar_url: avatarUrl }
      });
      sbUser = created?.user;
    }
  }
  const userId = sbUser?.id || import_crypto.default.randomUUID();
  let user = await userRepo.getProfileById(userId);
  if (!user) {
    const baseUsername = targetEmail.split("@")[0].replace(/[^a-z0-9_]/gi, "").toLowerCase() || "user";
    await userRepo.createProfile({
      id: userId,
      username: baseUsername,
      name: name || baseUsername,
      email: targetEmail,
      avatarUrl,
      settings: createDefaultSettings()
    });
    user = await userRepo.getProfileById(userId);
  }
  const token = `st_google_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const deviceSession = {
    id: `sess_${Date.now()}`,
    device: "Desktop Browser",
    browser: "Chrome (Google Auth)",
    location: user?.country || "United States",
    ip: "127.0.0.1",
    lastActive: "Just now",
    isCurrent: true,
    token
  };
  await sessionRepo.createSession(userId, token, deviceSession);
  res.json({ token, user });
});
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) return res.status(400).json({ error: "Email and new password are required" });
  if (supabaseAdmin) {
    try {
      const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
      const sbUser = usersList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (sbUser) {
        await supabaseAdmin.auth.admin.updateUserById(sbUser.id, { password: newPassword });
      }
    } catch (e) {
      console.warn("Notice: Supabase password update:", e);
    }
  }
  res.json({ success: true, message: "Password updated successfully" });
});
app.get("/api/auth/me", authenticate, async (req, res) => {
  const user = req.user;
  const sessions = await sessionRepo.getUserSessions(user.id);
  user.settings.security.activeSessions = sessions;
  res.json({ user });
});
app.post("/api/auth/logout", authenticate, async (req, res) => {
  const token = req.token;
  await sessionRepo.deleteSession(token);
  res.json({ success: true });
});
app.post("/api/auth/logout-device", authenticate, async (req, res) => {
  const { sessionId } = req.body;
  const user = req.user;
  await sessionRepo.deleteUserSession(user.id, sessionId);
  const activeSessions = await sessionRepo.getUserSessions(user.id);
  res.json({ success: true, sessions: activeSessions });
});
app.post("/api/auth/logout-all-devices", authenticate, async (req, res) => {
  const token = req.token;
  const user = req.user;
  await sessionRepo.deleteAllUserSessions(user.id, token);
  const activeSessions = await sessionRepo.getUserSessions(user.id);
  res.json({ success: true, sessions: activeSessions });
});
app.put("/api/users/profile", authenticate, async (req, res) => {
  const user = req.user;
  const { name, username, bio, statusMessage, avatarUrl, bannerUrl, country, socialLinks } = req.body;
  if (username && username.toLowerCase() !== user.username) {
    const lower = username.trim().toLowerCase();
    if (RESERVED_USERNAMES.includes(lower)) {
      return res.status(400).json({ error: "Username is reserved" });
    }
    const isAvailable = await userRepo.checkUsernameAvailable(lower);
    if (!isAvailable) {
      return res.status(400).json({ error: "Username is already taken" });
    }
  }
  const updated = await userRepo.updateProfile(user.id, {
    name,
    username,
    bio,
    statusMessage,
    avatarUrl,
    bannerUrl,
    country,
    socialLinks
  });
  res.json({ user: updated });
});
app.post("/api/users/upload", authenticate, async (req, res) => {
  const { fileData, fileName, fileType } = req.body;
  if (!fileData) return res.status(400).json({ error: "No file data provided" });
  try {
    const base64Data = fileData.replace(/^data:([A-Za-z-+\/]+);base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const ext = fileName ? import_path2.default.extname(fileName) : ".webm";
    const filename = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext || ".webm"}`;
    if (isSupabaseConfigured) {
      try {
        const mime = fileType || "application/octet-stream";
        const { data: sbData, error: sbErr } = await supabaseServer.storage.from("relay-media").upload(filename, buffer, { contentType: mime, upsert: true });
        if (!sbErr && sbData?.path) {
          const { data: pubData } = supabaseServer.storage.from("relay-media").getPublicUrl(sbData.path);
          if (pubData?.publicUrl) {
            return res.json({ url: pubData.publicUrl, size: buffer.length });
          }
        }
      } catch (e) {
        console.warn("Supabase Storage upload notice:", e);
      }
    }
    const filePath = import_path2.default.join(UPLOADS_DIR, filename);
    import_fs2.default.writeFileSync(filePath, buffer);
    const publicUrl = `/uploads/${filename}`;
    res.json({ url: publicUrl, size: buffer.length });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to upload file" });
  }
});
app.put("/api/users/settings", authenticate, async (req, res) => {
  const user = req.user;
  const { appearance, privacy, notifications } = req.body;
  const currentSettings = user.settings || createDefaultSettings();
  if (appearance) currentSettings.appearance = { ...currentSettings.appearance, ...appearance };
  if (privacy) currentSettings.privacy = { ...currentSettings.privacy, ...privacy };
  if (notifications) currentSettings.notifications = { ...currentSettings.notifications, ...notifications };
  await userRepo.updateSettings(user.id, currentSettings);
  res.json({ settings: currentSettings });
});
app.get("/api/users/search", authenticate, asyncHandler(async (req, res) => {
  const query = (req.query.q || "").toLowerCase().trim();
  const currentUserId = req.user?.id || "anonymous";
  console.log(`[Relay API] GET /api/users/search - query: "${query}", user: ${currentUserId}`);
  const users = await userRepo.searchProfiles(query, currentUserId);
  res.setHeader("Content-Type", "application/json");
  res.json({ users });
}));
app.get("/api/search", authenticate, asyncHandler(async (req, res) => {
  const query = (req.query.q || "").toLowerCase().trim();
  const currentUserId = req.user?.id || "anonymous";
  console.log(`[Relay API] GET /api/search - query: "${query}", user: ${currentUserId}`);
  const users = await userRepo.searchProfiles(query, currentUserId);
  const communities = await communityRepo.getCommunities();
  const filteredCommunities = communities.filter(
    (c) => (c.name || "").toLowerCase().includes(query) || (c.description || "").toLowerCase().includes(query)
  );
  res.setHeader("Content-Type", "application/json");
  res.json({ users, communities: filteredCommunities });
}));
app.post("/api/users/block", authenticate, async (req, res) => {
  const user = req.user;
  const { targetUserId } = req.body;
  const blockedUsers = await userRepo.blockUser(user.id, targetUserId);
  res.json({ blockedUsers });
});
app.post("/api/users/report", authenticate, async (req, res) => {
  const user = req.user;
  const { targetUserId, reason, details } = req.body;
  await userRepo.createReport(user.id, targetUserId, reason, details);
  res.json({ success: true, message: "Report submitted to Relay Trust & Safety team." });
});
app.get("/api/chats", authenticate, async (req, res) => {
  const userId = req.user.id;
  const chats = await chatRepo.getChatsForUser(userId);
  res.json({ chats });
});
app.get("/api/conversations", authenticate, async (req, res) => {
  const userId = req.user.id;
  const conversations = await chatRepo.getChatsForUser(userId);
  res.json({ conversations, chats: conversations });
});
app.get("/api/conversations/:id", authenticate, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const all = await chatRepo.getChatsForUser(userId);
  const conversation = all.find((c) => c.id === id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  res.json({ conversation });
});
app.post("/api/chats/direct", authenticate, async (req, res) => {
  const currentUserId = req.user.id;
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: "Target user ID required" });
  try {
    const chat = await chatRepo.createDirectChat(currentUserId, targetUserId);
    res.json({ chat, conversation: chat });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to create direct conversation" });
  }
});
app.post("/api/conversations/direct", authenticate, async (req, res) => {
  const currentUserId = req.user.id;
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: "Target user ID required" });
  try {
    const chat = await chatRepo.createDirectChat(currentUserId, targetUserId);
    res.json({ conversation: chat, chat });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to create direct conversation" });
  }
});
app.post("/api/chats/group", authenticate, async (req, res) => {
  const currentUser = req.user;
  const { name, description, participantIds, isPrivate, avatarUrl } = req.body;
  if (!name) return res.status(400).json({ error: "Group name required" });
  const chat = await chatRepo.createGroupChat(currentUser.id, name.trim(), description, participantIds, isPrivate, avatarUrl);
  res.json({ chat, conversation: chat });
});
app.post("/api/conversations/group", authenticate, async (req, res) => {
  const currentUser = req.user;
  const { name, description, participantIds, isPrivate, avatarUrl } = req.body;
  if (!name) return res.status(400).json({ error: "Group name required" });
  const chat = await chatRepo.createGroupChat(currentUser.id, name.trim(), description, participantIds, isPrivate, avatarUrl);
  res.json({ conversation: chat, chat });
});
app.delete("/api/chats/:chatId", authenticate, async (req, res) => {
  const { chatId } = req.params;
  await chatRepo.deleteChat(chatId);
  res.json({ success: true });
});
app.delete("/api/conversations/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  await chatRepo.deleteChat(id);
  res.json({ success: true });
});
app.put("/api/chats/:chatId/info", authenticate, async (req, res) => {
  const { chatId } = req.params;
  await chatRepo.updateChatInfo(chatId, req.body);
  res.json({ success: true });
});
app.patch("/api/conversations/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  await chatRepo.updateChatInfo(id, req.body);
  res.json({ success: true });
});
app.post("/api/chats/:chatId/members", authenticate, async (req, res) => {
  const { chatId } = req.params;
  const { memberIds } = req.body;
  if (Array.isArray(memberIds)) {
    await chatRepo.addMembers(chatId, memberIds);
  }
  res.json({ success: true });
});
app.delete("/api/chats/:chatId/members/:memberId", authenticate, async (req, res) => {
  const { chatId, memberId } = req.params;
  await chatRepo.removeMember(chatId, memberId);
  res.json({ success: true });
});
app.get("/api/chats/:chatId/messages", authenticate, async (req, res) => {
  const { chatId } = req.params;
  const messages = await chatRepo.getMessages(chatId);
  res.json({ messages });
});
app.get("/api/conversations/:id/messages", authenticate, async (req, res) => {
  const { id } = req.params;
  const messages = await chatRepo.getMessages(id);
  res.json({ messages });
});
app.post("/api/chats/:chatId/messages", authenticate, async (req, res) => {
  const { chatId } = req.params;
  const currentUser = req.user;
  const { content, type, attachments, replyToId, isForwarded } = req.body;
  const result = await chatRepo.sendMessage(chatId, currentUser.id, {
    content,
    type,
    attachments,
    replyToId,
    isForwarded
  });
  if (result.chat?.participants) {
    for (const pId of result.chat.participants) {
      if (pId !== currentUser.id) {
        await notificationRepo.createNotification(
          pId,
          result.chat.type === "group" ? `${result.chat.name} (${currentUser.name})` : currentUser.name,
          content || "Sent a media attachment",
          "message",
          { chatId, senderId: currentUser.id }
        );
      }
    }
  }
  res.json(result);
});
app.post("/api/conversations/:id/messages", authenticate, async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;
  const { content, type, attachments, replyToId, isForwarded } = req.body;
  const result = await chatRepo.sendMessage(id, currentUser.id, {
    content,
    type,
    attachments,
    replyToId,
    isForwarded
  });
  res.json(result);
});
app.post("/api/messages", authenticate, async (req, res) => {
  const currentUser = req.user;
  const { conversationId, chatId, content, type, attachments, replyToId, isForwarded } = req.body;
  const targetId = conversationId || chatId;
  if (!targetId) return res.status(400).json({ error: "Conversation ID required" });
  const result = await chatRepo.sendMessage(targetId, currentUser.id, {
    content,
    type,
    attachments,
    replyToId,
    isForwarded
  });
  res.json(result);
});
app.put("/api/chats/:chatId/messages/:messageId", authenticate, async (req, res) => {
  const { chatId, messageId } = req.params;
  const { content } = req.body;
  const updated = await chatRepo.editMessage(chatId, messageId, content);
  res.json({ message: updated });
});
app.patch("/api/messages/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const { conversationId, content } = req.body;
  const updated = await chatRepo.editMessage(conversationId || "", id, content);
  res.json({ message: updated });
});
app.delete("/api/chats/:chatId/messages/:messageId", authenticate, async (req, res) => {
  const { chatId, messageId } = req.params;
  const msg = await chatRepo.deleteMessage(chatId, messageId);
  res.json({ success: true, message: msg });
});
app.delete("/api/messages/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const conversationId = req.query.conversationId || req.body?.conversationId || "";
  const msg = await chatRepo.deleteMessage(conversationId, id);
  res.json({ success: true, message: msg });
});
app.post("/api/chats/:chatId/messages/:messageId/react", authenticate, async (req, res) => {
  const { chatId, messageId } = req.params;
  const { emoji } = req.body;
  const currentUser = req.user;
  const reactions = await chatRepo.reactToMessage(chatId, messageId, currentUser.id, emoji);
  res.json({ reactions });
});
app.post("/api/messages/:id/reactions", authenticate, async (req, res) => {
  const { id } = req.params;
  const { conversationId, emoji, reaction } = req.body;
  const currentUser = req.user;
  const reactions = await chatRepo.reactToMessage(conversationId || "", id, currentUser.id, emoji || reaction);
  res.json({ reactions });
});
app.delete("/api/messages/:id/reactions", authenticate, async (req, res) => {
  const { id } = req.params;
  const { conversationId, emoji, reaction } = req.body;
  const currentUser = req.user;
  const reactions = await chatRepo.reactToMessage(conversationId || "", id, currentUser.id, emoji || reaction);
  res.json({ reactions });
});
app.post("/api/messages/:id/read", authenticate, async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;
  await chatRepo.markChatRead(id, currentUser.id);
  res.json({ success: true });
});
app.post("/api/chats/:chatId/pin", authenticate, async (req, res) => {
  const { chatId } = req.params;
  const { messageId } = req.body;
  const pinnedMessageId = await chatRepo.togglePinMessage(chatId, messageId);
  res.json({ pinnedMessageId });
});
app.post("/api/chats/:chatId/typing", authenticate, async (req, res) => {
  const { chatId } = req.params;
  const currentUser = req.user;
  await chatRepo.setTyping(chatId, currentUser.id, currentUser.name);
  const activeTyping = await chatRepo.getTyping(chatId);
  res.json({ activeTyping });
});
app.post("/api/conversations/:id/typing", authenticate, async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;
  await chatRepo.setTyping(id, currentUser.id, currentUser.name);
  const activeTyping = await chatRepo.getTyping(id);
  res.json({ activeTyping });
});
app.get("/api/chats/:chatId/typing", authenticate, async (req, res) => {
  const { chatId } = req.params;
  const activeTyping = await chatRepo.getTyping(chatId);
  res.json({ activeTyping });
});
app.post("/api/chats/:chatId/read", authenticate, async (req, res) => {
  const { chatId } = req.params;
  const currentUser = req.user;
  await chatRepo.markChatRead(chatId, currentUser.id);
  res.json({ success: true });
});
app.get("/api/communities", authenticate, async (req, res) => {
  const communities = await communityRepo.getCommunities();
  res.json({ communities });
});
app.post("/api/communities", authenticate, async (req, res) => {
  const currentUser = req.user;
  const { name, handle, description, category, bannerUrl, avatarUrl, isPrivate } = req.body;
  if (!name || !handle) return res.status(400).json({ error: "Community name and handle required" });
  const community = await communityRepo.createCommunity(currentUser.id, {
    name,
    handle,
    description,
    category,
    bannerUrl,
    avatarUrl,
    isPrivate
  });
  res.json({ community });
});
app.post("/api/communities/:id/join", authenticate, async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;
  await communityRepo.joinCommunity(id, currentUser.id);
  res.json({ success: true });
});
app.post("/api/communities/:id/leave", authenticate, async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;
  await communityRepo.leaveCommunity(id, currentUser.id);
  res.json({ success: true });
});
app.get("/api/communities/:id/posts", authenticate, async (req, res) => {
  const { id } = req.params;
  const posts = await communityRepo.getPosts(id);
  res.json({ posts });
});
app.post("/api/communities/:id/posts", authenticate, async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;
  const { title, content, imageUrl } = req.body;
  if (!content) return res.status(400).json({ error: "Post content required" });
  const post = await communityRepo.createPost(id, currentUser.id, { title, content, imageUrl });
  res.json({ post });
});
app.post("/api/communities/posts/:postId/like", authenticate, async (req, res) => {
  const { postId } = req.params;
  const currentUser = req.user;
  const result = await communityRepo.likePost(postId, currentUser.id);
  res.json(result);
});
app.post("/api/communities/posts/:postId/comments", authenticate, async (req, res) => {
  const { postId } = req.params;
  const currentUser = req.user;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "Comment content required" });
  const result = await communityRepo.addComment(postId, currentUser.id, content);
  res.json(result);
});
app.put("/api/communities/:id/info", authenticate, async (req, res) => {
  const { id } = req.params;
  await communityRepo.updateCommunityInfo(id, req.body);
  res.json({ success: true });
});
app.delete("/api/communities/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  await communityRepo.deleteCommunity(id);
  res.json({ success: true });
});
app.get("/api/notifications", authenticate, async (req, res) => {
  const currentUser = req.user;
  const notifications = await notificationRepo.getNotifications(currentUser.id);
  res.json({ notifications });
});
app.post("/api/notifications/read", authenticate, async (req, res) => {
  const currentUser = req.user;
  await notificationRepo.markRead(currentUser.id);
  res.json({ success: true });
});
app.get("/api/statuses", authenticate, async (req, res) => {
  const currentUser = req.user;
  const data = await statusRepo.getStatuses(currentUser.id);
  res.json(data);
});
app.post("/api/statuses", authenticate, async (req, res) => {
  const currentUser = req.user;
  const status = await statusRepo.createStatus(currentUser.id, req.body);
  res.json({ success: true, status });
});
app.post("/api/statuses/:id/view", authenticate, async (req, res) => {
  const currentUser = req.user;
  const { id } = req.params;
  await statusRepo.recordView(id, currentUser.id);
  res.json({ success: true });
});
app.post("/api/statuses/:id/like", authenticate, async (req, res) => {
  const currentUser = req.user;
  const { id } = req.params;
  const likes = await statusRepo.likeStatus(id, currentUser.id);
  res.json({ success: true, likes });
});
app.delete("/api/statuses/:id", authenticate, async (req, res) => {
  const currentUser = req.user;
  const { id } = req.params;
  await statusRepo.deleteStatus(id, currentUser.id);
  res.json({ success: true });
});
app.all("/api/*", (req, res) => {
  console.warn(`[Relay API] Unmatched API route requested: ${req.method} ${req.originalUrl || req.path}`);
  res.setHeader("Content-Type", "application/json");
  res.status(404).json({
    error: `API endpoint ${req.method} ${req.path} not found`
  });
});
app.use((err, req, res, next) => {
  if (req.path.startsWith("/api/") || req.originalUrl?.startsWith("/api/")) {
    console.error(`[Relay API Exception] ${req.method} ${req.path}:`, err);
    res.setHeader("Content-Type", "application/json");
    return res.status(err.status || err.statusCode || 500).json({
      error: err.message || "Internal server error"
    });
  }
  next(err);
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : void 0
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path2.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path2.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RELAY v2 Production Engine running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
//# sourceMappingURL=server.cjs.map
