/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  UserProfile, Chat, Message, Community, CommunityPost, 
  NotificationItem, UserSettings 
} from "../types";

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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || "An API error occurred");
  }

  return data as T;
}

export const apiService = {
  // --- Auth ---
  checkUsername: (username: string) => 
    apiRequest<{ valid: boolean; message: string }>("/api/auth/check-username", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),

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

  signup: (payload: {
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
  }) =>
    apiRequest<{ token: string; user: UserProfile }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  login: (username: string, password: string, rememberDevice?: boolean) =>
    apiRequest<{ token: string; user: UserProfile }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, rememberDevice }),
    }),

  loginGoogle: () =>
    apiRequest<{ token: string; user: UserProfile }>("/api/auth/google", {
      method: "POST",
    }),

  forgotPassword: (email: string, newPassword: string) =>
    apiRequest<{ success: boolean; message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email, newPassword }),
    }),

  getCurrentUser: () =>
    apiRequest<{ user: UserProfile }>("/api/auth/me"),

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

  searchUsers: (q: string) =>
    apiRequest<{ users: UserProfile[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),

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

  createCommunity: (payload: { name: string; handle: string; description?: string; category?: string; bannerUrl?: string; avatarUrl?: string; isPrivate?: boolean }) =>
    apiRequest<{ community: Community }>("/api/communities", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateCommunityInfo: (id: string, payload: { description?: string; isPrivate?: boolean; permissions?: any; category?: string }) =>
    apiRequest<{ community: Community }>(`/api/communities/${id}/info`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),

  deleteCommunity: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/communities/${id}`, {
      method: "DELETE"
    }),

  joinCommunity: (id: string) =>
    apiRequest<{ success: boolean; community: Community }>(`/api/communities/${id}/join`, { method: "POST" }),

  leaveCommunity: (id: string) =>
    apiRequest<{ success: boolean; community: Community }>(`/api/communities/${id}/leave`, { method: "POST" }),

  getCommunityPosts: (id: string) =>
    apiRequest<{ posts: CommunityPost[] }>(`/api/communities/${id}/posts`),

  createCommunityPost: (id: string, payload: { channelId?: string; title?: string; content: string; imageUrl?: string }) =>
    apiRequest<{ post: CommunityPost }>(`/api/communities/${id}/posts`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

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
