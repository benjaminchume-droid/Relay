/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type OnlineStatus = 'online' | 'away' | 'offline';

export type DesignLanguage = 'liquid-glass' | 'clay' | 'flat' | 'minimal';

export type AccentColor = 
  | 'liquid-azure'   // #3B82F6 / #2563EB
  | 'emerald-frost'  // #10B981 / #059669
  | 'neon-violet'    // #8B5CF6 / #7C3AED
  | 'rose-gold'      // #F43F5E / #E11D48
  | 'midnight'       // #1E293B / #0F172A
  | 'amber-glow';    // #F59E0B / #D97706

export type BubbleStyle = 'classic' | 'edge-glow' | 'gradient' | 'minimal';

export type WallpaperStyle = 
  | 'glass-gradient' 
  | 'dark-aurora' 
  | 'neon-mesh' 
  | 'minimal-grid' 
  | 'warm-clay' 
  | 'pure-slate';

export type UIDensity = 'compact' | 'comfortable' | 'spacious';

export type AppIconVariant = 'liquid-blue' | 'neon-glow' | 'dark-chrome' | 'minimal-white';

export type ThemeMode = 'light' | 'dark' | 'pure-black' | 'glass' | 'minimal' | 'transparent' | 'dynamic' | 'system';

export type GlassPreset = 'apple-glass' | 'bubble' | 'box' | 'squircle' | 'rounded' | 'crystal' | 'minimal' | 'compact' | 'comfort' | 'large-touch';

export type AccentMode = 'single' | 'gradient' | 'dual' | 'rainbow' | 'animated-rainbow' | 'system';

export type StoriesLayout = 'horizontal' | 'vertical' | 'grid';

export interface AppearanceCustomization {
  themeMode: ThemeMode;
  presetName?: GlassPreset;
  designLanguage: DesignLanguage;
  accentColor: AccentColor;
  accentMode?: AccentMode;
  customAccentHex?: string;
  blurIntensity: number; // 0 to 40px
  transparency: number; // 0 to 100%
  cornerRadius: number; // 0 to 32px
  shadowDepth: number; // 0 to 100%
  glassDepth: number; // 0 to 100%
  refraction: number; // 0 to 100%
  edgeGlow: number; // 0 to 100%
  animationSpeed: 'instant' | 'snappy' | 'smooth' | 'cinematic';
  uiDensity: UIDensity;
  chatWallpaper: WallpaperStyle;
  customWallpaperUrl?: string;
  storiesLayout: StoriesLayout;
  bubbleStyle: BubbleStyle;
  bubbleSpacing: number; // 4 to 20px
  fontSize: 'xs' | 'sm' | 'base' | 'lg';
  appIcon: AppIconVariant;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  reducedMotion: boolean;
  perChatThemes: Record<string, { wallpaper: WallpaperStyle; accent: AccentColor }>;
}

export interface UserPrivacySettings {
  whoCanMessage: 'everyone' | 'contacts' | 'nobody';
  whoCanAddGroups: 'everyone' | 'contacts' | 'nobody';
  hideOnline: boolean;
  hideLastSeen: boolean;
  readReceipts: boolean;
  offlineMode: boolean;
  profilePhotoVisibility: 'everyone' | 'contacts' | 'nobody';
  bioVisibility: 'everyone' | 'contacts' | 'nobody';
  allowTagging: boolean;
  messageRequests: boolean;
  communityInvites: boolean;
  typingIndicator: boolean;
  linkPreview: boolean;
}

export interface DeviceSession {
  id: string;
  device: string;
  browser: string;
  location: string;
  ip: string;
  lastActive: string;
  isCurrent: boolean;
  token?: string;
}

export interface UserSecuritySettings {
  twoFactorEnabled: boolean;
  activeSessions: DeviceSession[];
  loginAlerts: boolean;
}

export interface UserSettings {
  appearance: AppearanceCustomization;
  privacy: UserPrivacySettings;
  security: UserSecuritySettings;
  notifications: {
    enabled: boolean;
    directMessages: boolean;
    groupMentions: boolean;
    reactions: boolean;
    sound: string;
    vibration: boolean;
  };
}

export interface UserProfile {
  id: string;
  username: string; // @handle (lowercase, unique)
  name: string;
  email: string;
  avatarUrl?: string;
  bannerUrl?: string;
  bio?: string;
  statusMessage?: string;
  onlineStatus: OnlineStatus;
  lastSeen?: string;
  dob?: string;
  country?: string;
  socialLinks?: {
    website?: string;
    github?: string;
    twitter?: string;
  };
  contacts: string[]; // list of contact user IDs
  blockedUsers: string[]; // list of blocked user IDs
  sentRequests: string[]; // friend requests sent
  receivedRequests: string[]; // friend requests received
  settings: UserSettings;
  createdAt: string;
  supabaseAccessToken?: string;
}

export type MessageType = 'text' | 'voice' | 'image' | 'video' | 'file' | 'location' | 'contact' | 'system';

export interface MessageReaction {
  userId: string;
  userName: string;
  emoji: string;
}

export interface MessageAttachment {
  id: string;
  type: 'image' | 'video' | 'file' | 'voice';
  url: string;
  fileName?: string;
  fileSize?: string;
  duration?: number; // for audio
  thumbnailUrl?: string;
  waveformData?: number[];
}

export interface QuotedMessageSummary {
  id: string;
  senderName: string;
  content: string;
  type?: MessageType;
  attachments?: MessageAttachment[];
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  type: MessageType;
  content: string;
  attachments?: MessageAttachment[];
  timestamp: string;
  deliveryState: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  reactions?: MessageReaction[];
  replyToId?: string;
  replyToMessage?: QuotedMessageSummary;
  isForwarded?: boolean;
  isEdited?: boolean;
  isDeleted?: boolean;
  deletedForUserIds?: string[];
}

export interface GroupPermissions {
  sendMessages: 'everyone' | 'admins';
  editGroupInfo: 'everyone' | 'admins';
  requiresApproval: boolean;
  privacy: 'public' | 'private';
}

export interface Chat {
  id: string;
  name: string;
  type: 'direct' | 'group';
  avatarUrl?: string;
  participants: string[]; // user IDs
  unreadCount?: number;
  lastMessage?: {
    text: string;
    timestamp: string;
    senderId?: string;
    deliveryState?: 'sent' | 'delivered' | 'read';
  };
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  description?: string;
  pinnedMessageId?: string;
  roles?: Record<string, 'creator' | 'admin' | 'member'>;
  disappearingMessages?: 'off' | '24h' | '7d' | '90d';
  permissions?: GroupPermissions;
  inviteLink?: string;
  createdAt?: string;
}

export interface CommunityChannel {
  id: string;
  name: string;
  type: 'text' | 'media' | 'announcements';
  description?: string;
  unread?: boolean;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  timestamp: string;
}

export interface CommunityPost {
  id: string;
  communityId: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  title?: string;
  content: string;
  imageUrl?: string;
  likesCount: number;
  commentsCount: number;
  comments?: PostComment[];
  isLiked?: boolean;
  likedByUsers?: string[];
  timestamp: string;
}

export interface CommunityPermissions {
  postPermission: 'everyone' | 'admins';
  editInfo: 'everyone' | 'admins';
  requiresApproval: boolean;
  privacy: 'public' | 'private';
}

export interface Community {
  id: string;
  name: string;
  handle: string; // e.g. @glassline
  description: string;
  bannerUrl: string;
  avatarUrl: string;
  memberCount: number;
  category: string;
  isPrivate: boolean;
  isJoined?: boolean;
  members?: string[];
  ownerId?: string;
  roles?: Record<string, 'owner' | 'admin' | 'member'>;
  permissions?: CommunityPermissions;
  inviteLink?: string;
  channels: CommunityChannel[];
  posts?: CommunityPost[];
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'message' | 'mention' | 'reaction' | 'community' | 'system';
  title: string;
  body: string;
  chatId?: string;
  senderId?: string;
  read: boolean;
  timestamp: string;
}

export interface ReportPayload {
  targetUserId?: string;
  messageId?: string;
  communityId?: string;
  reason: string;
  details?: string;
}
