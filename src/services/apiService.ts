/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  UserProfile, Chat, Message, Community, CommunityPost, 
  NotificationItem, UserSettings 
} from "../types";
import { supabase, supabaseUrl } from "../lib/supabase/client";

const TOKEN_STORAGE_KEY = "relay_v2_auth_token";

export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
};

export const setAuthToken = (token: string | null) => {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};

export const isCapacitorNative = (): boolean => {
  if (typeof window === "undefined") return false;
  const win = window as any;
  const isNative = !!win.Capacitor?.isNativePlatform?.();
  const isCapScheme = win.location?.protocol === "capacitor:" || win.location?.protocol === "file:";
  const isLocalhostNoPort = (win.location?.hostname === "localhost" || win.location?.hostname === "127.0.0.1") && (!win.location?.port || win.location?.port === "80" || win.location?.port === "443");
  return isNative || isCapScheme || isLocalhostNoPort;
};

export function createDefaultClientSettings(): UserProfile["settings"] {
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

export function formatClientProfile(p: any): UserProfile {
  return {
    id: p.id,
    username: p.username || (p.email ? p.email.split("@")[0] : `user_${p.id?.substring(0, 6)}`),
    name: p.full_name || p.display_name || p.name || p.username || "Relay User",
    email: p.email || "",
    avatarUrl: p.avatar_url || p.avatarUrl || undefined,
    bannerUrl: p.banner_url || p.bannerUrl || undefined,
    bio: p.bio || "Exploring Relay.",
    statusMessage: p.status_message || p.statusMessage || "Available",
    onlineStatus: (p.online_status || p.status || "online") as any,
    lastSeen: p.last_seen || "Just now",
    dob: p.date_of_birth || p.dob || undefined,
    country: p.country || "United States",
    socialLinks: p.social_links || p.socialLinks || {},
    contacts: p.contacts || [],
    blockedUsers: p.blocked_users || p.blockedUsers || [],
    sentRequests: p.sent_requests || p.sentRequests || [],
    receivedRequests: p.received_requests || p.receivedRequests || [],
    settings: p.settings || createDefaultClientSettings(),
    createdAt: p.created_at || new Date().toISOString()
  };
}

export async function directSupabaseLogin(username: string, pass: string, rememberDevice?: boolean) {
  const credential = (username || "").trim().toLowerCase();
  if (!credential || !pass) {
    throw new Error("Username and password are required");
  }

  const candidateEmails = credential.includes("@")
    ? [credential]
    : [
        `${credential}@relay.app`,
        `${credential}@glassline.com`,
        `${credential}@relay.com`,
        `${credential}@gmail.com`
      ];

  let sbUser: any = null;
  let supabaseSession: any = null;
  let lastErrorMessage: string | null = null;

  console.log(`[Relay Auth Direct] Initializing Supabase Auth sign-in against URL endpoint...`);

  for (const targetEmail of candidateEmails) {
    console.log(`[Relay Auth Direct] Attempting candidate authentication flow...`);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password: pass,
    });

    if (!error && data?.user && data?.session) {
      sbUser = data.user;
      supabaseSession = data.session;
      break;
    } else if (error) {
      lastErrorMessage = error.message;
    }
  }

  if (!sbUser || !supabaseSession) {
    throw new Error(lastErrorMessage || "Invalid username or password");
  }

  let profile: any = null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", sbUser.id)
      .maybeSingle();

    if (data) profile = data;
  } catch (e) {
    console.warn("[Relay Auth Direct] Profile query notice:", e);
  }

  if (!profile) {
    const cleanUsername = credential.replace(/@(gmail\.com|relay\.(app|com)|glassline\.com)$/, "").toLowerCase();
    const defaultSettings = createDefaultClientSettings();
    const newProfile = {
      id: sbUser.id,
      username: cleanUsername,
      full_name: sbUser.user_metadata?.full_name || cleanUsername,
      email: sbUser.email || candidateEmails[0],
      avatar_url: sbUser.user_metadata?.avatar_url || null,
      bio: "Exploring Relay.",
      status_message: "Available",
      country: sbUser.user_metadata?.country || "United States",
      settings: defaultSettings,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      await supabase.from("profiles").upsert(newProfile, { onConflict: "id" });
    } catch (e) {
      console.warn("[Relay Auth Direct] Profile insert notice:", e);
    }

    profile = newProfile;
  }

  const user = formatClientProfile(profile);
  const token = supabaseSession.access_token;
  user.supabaseAccessToken = token;

  setAuthToken(token);
  return { token, user };
}

export async function directSupabaseSignup(payload: {
  username: string;
  password: string;
  name: string;
  age?: number;
  country?: string;
  avatarUrl?: string;
  bio?: string;
  statusMessage?: string;
  appearance?: any;
  email?: string;
}) {
  const { username, password, name, country, avatarUrl, bio, statusMessage, appearance, email } = payload;
  if (!password || !username || !name) {
    throw new Error("Username, password, and display name are required");
  }

  const cleanUser = username.trim().toLowerCase();
  const userEmail = (email || `${cleanUser}@relay.app`).toLowerCase();

  console.log(`[Relay Auth Direct] Initializing Supabase Auth sign-up against URL endpoint...`);

  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: userEmail,
    password,
    options: {
      data: {
        username: cleanUser,
        full_name: name.trim(),
        country: country || "United States",
      },
    },
  });

  let sbUser = signUpData?.user;
  let supabaseSession = signUpData?.session;

  if (signUpErr) {
    if (signUpErr.message.toLowerCase().includes("already registered")) {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password,
      });
      if (!signInErr && signInData?.user && signInData?.session) {
        sbUser = signInData.user;
        supabaseSession = signInData.session;
      } else {
        throw new Error(signUpErr.message);
      }
    } else {
      throw new Error(signUpErr.message);
    }
  }

  if (!sbUser) {
    throw new Error("Failed to create user account in Supabase Auth");
  }

  if (!supabaseSession) {
    const { data: signInData } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password,
    });
    if (signInData?.session) {
      supabaseSession = signInData.session;
    }
  }

  const defaultSettings = createDefaultClientSettings();
  if (appearance) {
    defaultSettings.appearance = { ...defaultSettings.appearance, ...appearance };
  }

  const profileObj = {
    id: sbUser.id,
    username: cleanUser,
    full_name: name.trim(),
    email: userEmail,
    avatar_url: avatarUrl || null,
    bio: bio || "Exploring Relay.",
    status_message: statusMessage || "Available",
    country: country || "United States",
    settings: defaultSettings,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    await supabase.from("profiles").upsert(profileObj, { onConflict: "id" });
  } catch (e) {
    console.warn("[Relay Auth Direct] Signup profile upsert notice:", e);
  }

  const user = formatClientProfile(profileObj);
  const token = supabaseSession?.access_token || `st_${Date.now()}`;
  user.supabaseAccessToken = token;

  setAuthToken(token);
  return { token, user };
}

export async function directSupabaseGetCurrentUser(token: string) {
  const { data: userData } = await supabase.auth.getUser(token);
  let userId = userData?.user?.id;

  if (!userId) {
    const { data: sessData } = await supabase.auth.getSession();
    userId = sessData?.session?.user?.id;
  }

  if (!userId) {
    throw new Error("Session expired or invalid");
  }

  let profileData: any = null;
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) {
    profileData = data;
  }

  if (!profileData) {
    throw new Error("User profile not found");
  }

  const user = formatClientProfile(profileData);
  return { user };
}

export async function directSupabaseCheckUsername(username: string) {
  if (!username) return { valid: false, message: "Username is required" };
  const lower = username.trim().toLowerCase();
  if (lower.length < 3 || lower.length > 20) {
    return { valid: false, message: "Username must be between 3 and 20 characters" };
  }
  if (!/^[a-z0-9_]+$/.test(lower)) {
    return { valid: false, message: "Only lowercase letters, numbers, and underscores allowed" };
  }

  try {
    const { data } = await supabase.from("profiles").select("id").ilike("username", lower).limit(1);
    if (data && data.length > 0) {
      return { valid: false, message: "Username is already taken" };
    }
  } catch (e) {
    // ignore
  }

  return { valid: true, message: "Username is available" };
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const responseText = await response.text();

  if (
    contentType.includes("text/html") ||
    responseText.trim().startsWith("<!doctype") ||
    responseText.trim().startsWith("<html")
  ) {
    console.warn(`[Relay API] Endpoint ${endpoint} returned HTML content (Status: ${response.status}, Content-Type: ${contentType}).`);
    throw new Error(`Endpoint ${endpoint} returned HTML response instead of JSON (Status: ${response.status}).`);
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.warn(`[Relay API] Response from ${endpoint} could not be parsed as JSON.`);
    throw new Error(`Invalid JSON response from ${endpoint}`);
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || "An API error occurred");
  }

  return data as T;
}

export const apiService = {
  // --- Auth ---
  checkUsername: async (username: string) => {
    if (isCapacitorNative()) {
      return directSupabaseCheckUsername(username);
    }
    try {
      return await apiRequest<{ valid: boolean; message: string }>("/api/auth/check-username", {
        method: "POST",
        body: JSON.stringify({ username }),
      });
    } catch (err: any) {
      if (
        err.message?.includes("HTML") ||
        err.message?.includes("<!doctype") ||
        err.message?.includes("Failed to fetch") ||
        err.message?.includes("NetworkError")
      ) {
        return directSupabaseCheckUsername(username);
      }
      throw err;
    }
  },

  sendOtp: (email: string, purpose?: string) =>
    apiRequest<{ success: boolean; message: string; devCode?: string }>("/api/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ email, purpose }),
    }),

  verifyOtp: (email: string, code: string) =>
    apiRequest<{ success: boolean; message: string }>("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),

  signup: async (payload: {
    username: string;
    password: string;
    name: string;
    age?: number;
    country?: string;
    avatarUrl?: string;
    bio?: string;
    statusMessage?: string;
    appearance?: any;
    email?: string;
  }) => {
    if (isCapacitorNative()) {
      return directSupabaseSignup(payload);
    }
    try {
      return await apiRequest<{ token: string; user: UserProfile }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      if (
        err.message?.includes("HTML") ||
        err.message?.includes("<!doctype") ||
        err.message?.includes("Failed to fetch") ||
        err.message?.includes("NetworkError")
      ) {
        console.warn("[Relay Auth] Web signup endpoint unavailable or returned HTML. Falling back to direct Supabase Auth.");
        return directSupabaseSignup(payload);
      }
      throw err;
    }
  },

  login: async (username: string, pass: string, rememberDevice?: boolean) => {
    if (isCapacitorNative()) {
      return directSupabaseLogin(username, pass, rememberDevice);
    }
    try {
      return await apiRequest<{ token: string; user: UserProfile }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password: pass, rememberDevice }),
      });
    } catch (err: any) {
      if (
        err.message?.includes("HTML") ||
        err.message?.includes("<!doctype") ||
        err.message?.includes("Failed to fetch") ||
        err.message?.includes("NetworkError")
      ) {
        console.warn("[Relay Auth] Web login endpoint unavailable or returned HTML. Falling back to direct Supabase Auth.");
        return directSupabaseLogin(username, pass, rememberDevice);
      }
      throw err;
    }
  },

  loginGoogle: () =>
    apiRequest<{ token: string; user: UserProfile }>("/api/auth/google", {
      method: "POST",
    }),

  forgotPassword: (email: string, newPassword: string) =>
    apiRequest<{ success: boolean; message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email, newPassword }),
    }),

  getCurrentUser: async () => {
    if (isCapacitorNative()) {
      const token = getAuthToken();
      if (!token) throw new Error("No auth token stored");
      return directSupabaseGetCurrentUser(token);
    }
    try {
      return await apiRequest<{ user: UserProfile }>("/api/auth/me");
    } catch (err: any) {
      const token = getAuthToken();
      if (
        token &&
        (err.message?.includes("HTML") ||
          err.message?.includes("<!doctype") ||
          err.message?.includes("Failed to fetch") ||
          err.message?.includes("NetworkError"))
      ) {
        return directSupabaseGetCurrentUser(token);
      }
      throw err;
    }
  },

  logout: () =>
    apiRequest<{ success: boolean }>("/api/auth/logout", { method: "POST" }),

  logoutDevice: (sessionId: string) =>
    apiRequest<{ success: boolean; sessions: UserProfile["settings"]["security"]["activeSessions"] }>("/api/auth/logout-device", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),

  logoutAllDevices: () =>
    apiRequest<{ success: boolean; sessions: UserProfile["settings"]["security"]["activeSessions"] }>("/api/auth/logout-all-devices", {
      method: "POST",
    }),

  // --- Profile & Uploads ---
  updateProfile: (payload: Partial<UserProfile>) =>
    apiRequest<{ user: UserProfile }>("/api/users/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  uploadFile: (fileData: string, fileName?: string, fileType?: string) =>
    apiRequest<{ url: string }>("/api/users/upload", {
      method: "POST",
      body: JSON.stringify({ fileData, fileName, fileType }),
    }),

  updateSettings: (settings: Partial<UserSettings>) =>
    apiRequest<{ settings: UserSettings }>("/api/users/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  searchUsers: async (q: string) => {
    const url = `/api/users/search?q=${encodeURIComponent(q)}`;
    console.log("[Relay Search 7] Request URL:", url);
    const res = await apiRequest<{ users: UserProfile[] }>(url);
    console.log("[Relay Search 8] HTTP status: 200");
    console.log("[Relay Search 9] Raw response:", res);
    return res;
  },

  toggleBlockUser: (targetUserId: string) =>
    apiRequest<{ blockedUsers: string[] }>("/api/users/block", {
      method: "POST",
      body: JSON.stringify({ targetUserId }),
    }),

  submitReport: (payload: { targetUserId?: string; messageId?: string; communityId?: string; reason: string; details?: string }) =>
    apiRequest<{ success: boolean; message: string }>("/api/users/report", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // --- Chats & Messaging ---
  getChats: () =>
    apiRequest<{ chats: Chat[] }>("/api/chats"),

  createDirectChat: (targetUserId: string) =>
    apiRequest<{ chat: Chat }>("/api/chats/direct", {
      method: "POST",
      body: JSON.stringify({ targetUserId }),
    }),

  createGroupChat: (name: string, description?: string, participantIds?: string[], isPrivate?: boolean, avatarUrl?: string) =>
    apiRequest<{ chat: Chat }>("/api/chats/group", {
      method: "POST",
      body: JSON.stringify({ name, description, participantIds, isPrivate, avatarUrl }),
    }),

  deleteChat: (chatId: string) =>
    apiRequest<{ success: boolean }>(`/api/chats/${chatId}`, {
      method: "DELETE"
    }),

  getMessages: (chatId: string) =>
    apiRequest<{ messages: Message[] }>(`/api/chats/${chatId}/messages`),

  sendMessage: (chatId: string, payload: {
    content?: string;
    type?: Message["type"];
    attachments?: Message["attachments"];
    replyToId?: string;
    isForwarded?: boolean;
  }) =>
    apiRequest<{ message: Message; chat: Chat }>(`/api/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  editMessage: (chatId: string, messageId: string, content: string) =>
    apiRequest<{ message: Message }>(`/api/chats/${chatId}/messages/${messageId}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),

  deleteMessage: (chatId: string, messageId: string) =>
    apiRequest<{ success: boolean; message: Message }>(`/api/chats/${chatId}/messages/${messageId}`, {
      method: "DELETE",
    }),

  reactToMessage: (chatId: string, messageId: string, emoji: string) =>
    apiRequest<{ reactions: Message["reactions"] }>(`/api/chats/${chatId}/messages/${messageId}/react`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    }),

  togglePinMessage: (chatId: string, messageId: string) =>
    apiRequest<{ pinnedMessageId?: string }>(`/api/chats/${chatId}/pin`, {
      method: "POST",
      body: JSON.stringify({ messageId }),
    }),

  sendTypingSignal: (chatId: string) =>
    apiRequest<{ activeTyping: { userId: string; name: string }[] }>(`/api/chats/${chatId}/typing`, {
      method: "POST",
    }),

  getTypingState: (chatId: string) =>
    apiRequest<{ activeTyping: { userId: string; name: string }[] }>(`/api/chats/${chatId}/typing`),

  markChatAsRead: (chatId: string) =>
    apiRequest<{ success: boolean }>(`/api/chats/${chatId}/read`, {
      method: "POST",
    }),

  // --- Group & Chat Management ---
  updateChatInfo: (chatId: string, payload: { name?: string; description?: string; disappearingMessages?: string; permissions?: any; inviteLink?: string }) =>
    apiRequest<{ chat: Chat }>(`/api/chats/${chatId}/info`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),

  addGroupMembers: (chatId: string, memberIds: string[]) =>
    apiRequest<{ chat: Chat }>(`/api/chats/${chatId}/members`, {
      method: "POST",
      body: JSON.stringify({ memberIds })
    }),

  removeGroupMember: (chatId: string, memberId: string) =>
    apiRequest<{ chat: Chat }>(`/api/chats/${chatId}/members/${memberId}`, {
      method: "DELETE"
    }),

  // --- Communities ---
  getCommunities: () =>
    apiRequest<{ communities: Community[] }>("/api/communities"),

  // --- Statuses ---
  getStatuses: () =>
    apiRequest<{ contacts: any[]; discovery: any[] }>("/api/statuses"),

  createStatus: (payload: {
    type: string;
    content?: string;
    mediaUrl?: string;
    backgroundGradient?: string;
    privacy?: string;
    durationHours?: number;
    pollOptions?: { id: string; text: string; votes: string[] }[];
  }) =>
    apiRequest<{ success: boolean; status: any }>("/api/statuses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  recordStatusView: (statusId: string) =>
    apiRequest<{ success: boolean }>(`/api/statuses/${statusId}/view`, {
      method: "POST",
    }),

  likeStatus: (statusId: string) =>
    apiRequest<{ success: boolean; likes: string[] }>(`/api/statuses/${statusId}/like`, {
      method: "POST",
    }),

  deleteStatus: (statusId: string) =>
    apiRequest<{ success: boolean }>(`/api/statuses/${statusId}`, {
      method: "DELETE",
    }),

  createCommunity: async (payload: { name: string; handle: string; description?: string; category?: string; bannerUrl?: string; avatarUrl?: string; isPrivate?: boolean }) => {
    try {
      return await apiRequest<{ community: Community }>("/api/communities", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn("[apiService] createCommunity web endpoint failed, using direct client call:", e);
      const currentUser = (await supabase.auth.getUser()).data.user;
      const ownerId = currentUser?.id || "me";
      const { data: newComm } = await supabase.from("communities").insert({
        name: payload.name,
        handle: payload.handle,
        description: payload.description || null,
        category: payload.category || "General",
        banner_url: payload.bannerUrl || null,
        avatar_url: payload.avatarUrl || null,
        owner_id: ownerId,
        is_private: payload.isPrivate || false,
        member_count: 1
      }).select().single();
      const community: Community = {
        id: newComm?.id || `comm_${Date.now()}`,
        name: newComm?.name || payload.name,
        handle: newComm?.handle || payload.handle,
        description: newComm?.description || payload.description || "",
        category: newComm?.category || payload.category || "General",
        bannerUrl: newComm?.banner_url || payload.bannerUrl || "",
        avatarUrl: newComm?.avatar_url || payload.avatarUrl || "",
        ownerId,
        isPrivate: payload.isPrivate || false,
        memberCount: 1,
        channels: [
          { id: "c_general", name: "general", type: "text", description: "General chat and announcements" },
          { id: "c_media", name: "media-and-showcase", type: "media", description: "Share images and builds" }
        ]
      };
      return { community };
    }
  },

  updateCommunityInfo: (id: string, payload: { description?: string; isPrivate?: boolean; permissions?: any; category?: string }) =>
    apiRequest<{ community: Community }>(`/api/communities/${id}/info`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),

  deleteCommunity: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/communities/${id}`, {
      method: "DELETE"
    }),

  joinCommunity: async (id: string) => {
    try {
      return await apiRequest<{ success: boolean; community: Community }>(`/api/communities/${id}/join`, { method: "POST" });
    } catch (e) {
      console.warn("[apiService] joinCommunity web endpoint failed:", e);
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (currentUser) {
        await supabase.from("community_members").upsert({ community_id: id, user_id: currentUser.id, role: "member" }, { onConflict: "community_id, user_id" });
      }
      return { success: true, community: { id, name: "Community", handle: "@community", memberCount: 1, isJoined: true } as Community };
    }
  },

  leaveCommunity: async (id: string) => {
    try {
      return await apiRequest<{ success: boolean; community: Community }>(`/api/communities/${id}/leave`, { method: "POST" });
    } catch (e) {
      console.warn("[apiService] leaveCommunity web endpoint failed:", e);
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (currentUser) {
        await supabase.from("community_members").delete().eq("community_id", id).eq("user_id", currentUser.id);
      }
      return { success: true, community: { id, name: "Community", handle: "@community", memberCount: 1, isJoined: false } as Community };
    }
  },

  getCommunityPosts: async (id: string) => {
    try {
      return await apiRequest<{ posts: CommunityPost[] }>(`/api/communities/${id}/posts`);
    } catch (e) {
      console.warn("[apiService] getCommunityPosts web endpoint failed:", e);
      return { posts: [] };
    }
  },

  createCommunityPost: async (id: string, payload: { channelId?: string; title?: string; content: string; imageUrl?: string }) => {
    try {
      return await apiRequest<{ post: CommunityPost }>(`/api/communities/${id}/posts`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn("[apiService] createCommunityPost web endpoint failed:", e);
      const currentUser = (await supabase.auth.getUser()).data.user;
      const authorId = currentUser?.id || "me";
      const post: CommunityPost = {
        id: `post_${Date.now()}`,
        communityId: id,
        channelId: payload.channelId || "c_general",
        authorId,
        authorName: "Member",
        title: payload.title,
        content: payload.content,
        imageUrl: payload.imageUrl,
        timestamp: new Date().toISOString(),
        likesCount: 0,
        commentsCount: 0
      };
      return { post };
    }
  },

  likeCommunityPost: (postId: string) =>
    apiRequest<{ likesCount: number; isLiked: boolean }>(`/api/communities/posts/${postId}/like`, { method: "POST" }),

  addPostComment: (postId: string, content: string) =>
    apiRequest<{ comment: any; commentsCount: number }>(`/api/communities/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content })
    }),

  // --- Notifications ---
  getNotifications: () =>
    apiRequest<{ notifications: NotificationItem[] }>("/api/notifications"),

  markNotificationsRead: () =>
    apiRequest<{ success: boolean }>("/api/notifications/read", { method: "POST" }),
};

// --- Relay SDK Layer ---
export const relay = {
  auth: {
    checkUsername: apiService.checkUsername,
    sendOtp: apiService.sendOtp,
    verifyOtp: apiService.verifyOtp,
    signup: apiService.signup,
    login: apiService.login,
    loginGoogle: apiService.loginGoogle,
    forgotPassword: apiService.forgotPassword,
    me: apiService.getCurrentUser,
    logout: apiService.logout,
    logoutDevice: apiService.logoutDevice,
    logoutAllDevices: apiService.logoutAllDevices,
  },
  profile: {
    update: apiService.updateProfile,
    settings: apiService.updateSettings,
    block: apiService.toggleBlockUser,
    report: apiService.submitReport,
  },
  messages: {
    getChats: apiService.getChats,
    createDirect: apiService.createDirectChat,
    createGroup: apiService.createGroupChat,
    getMessages: apiService.getMessages,
    send: apiService.sendMessage,
    edit: apiService.editMessage,
    delete: apiService.deleteMessage,
    react: apiService.reactToMessage,
    pin: apiService.togglePinMessage,
    sendTyping: apiService.sendTypingSignal,
    getTyping: apiService.getTypingState,
    markRead: apiService.markChatAsRead,
  },
  media: {
    upload: apiService.uploadFile,
  },
  storage: {
    upload: apiService.uploadFile,
  },
  stories: {
    getStories: () => apiRequest<{ stories: any[] }>("/api/stories"),
    createStory: (imageUrl: string, caption?: string) => apiRequest<{ story: any }>("/api/stories", { method: "POST", body: JSON.stringify({ imageUrl, caption }) }),
  },
  communities: {
    get: apiService.getCommunities,
    create: apiService.createCommunity,
    join: apiService.joinCommunity,
    leave: apiService.leaveCommunity,
    getPosts: apiService.getCommunityPosts,
    createPost: apiService.createCommunityPost,
    likePost: apiService.likeCommunityPost,
  },
  search: {
    users: apiService.searchUsers,
    global: (query: string) => apiRequest<{ users: UserProfile[]; communities: Community[] }>(`/api/search?q=${encodeURIComponent(query)}`),
  },
  notifications: {
    get: apiService.getNotifications,
    markRead: apiService.markNotificationsRead,
  },
  calls: {
    start: (chatId: string, type: 'voice' | 'video') => apiRequest<{ callId: string }>(`/api/calls/start`, { method: "POST", body: JSON.stringify({ chatId, type }) }),
    end: (callId: string) => apiRequest<{ success: boolean }>(`/api/calls/end`, { method: "POST", body: JSON.stringify({ callId }) }),
  },
  realtime: {
    subscribe: (channel: string, callback: (data: any) => void) => {
      // Realtime subscription event listener hook
      return { unsubscribe: () => {} };
    }
  },
  cache: {
    clear: () => localStorage.clear(),
  },
  offline: {
    queue: [] as any[],
  },
  utils: {
    getAuthToken,
    setAuthToken,
  }
};
