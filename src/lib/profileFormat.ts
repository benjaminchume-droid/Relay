/**
 * Profile formatting helpers — shared by authStore, apiService, messagingCore, profileCache.
 */
import type { UserProfile } from '../types';

export function createDefaultSettings(): UserProfile['settings'] {
  return {
    appearance: {
      themeMode: 'light',
      designLanguage: 'liquid-glass',
      accentColor: 'liquid-azure',
      blurIntensity: 24,
      transparency: 40,
      cornerRadius: 18,
      shadowDepth: 30,
      glassDepth: 40,
      refraction: 30,
      edgeGlow: 25,
      animationSpeed: 'smooth',
      uiDensity: 'comfortable',
      chatWallpaper: 'glass-gradient',
      storiesLayout: 'horizontal',
      bubbleStyle: 'edge-glow',
      bubbleSpacing: 10,
      fontSize: 'sm',
      appIcon: 'liquid-blue',
      soundEnabled: true,
      hapticsEnabled: true,
      reducedMotion: false,
      perChatThemes: {}
    },
    privacy: {
      whoCanMessage: 'everyone',
      whoCanAddGroups: 'everyone',
      hideOnline: false,
      hideLastSeen: false,
      readReceipts: true,
      offlineMode: false,
      profilePhotoVisibility: 'everyone',
      bioVisibility: 'everyone',
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
      sound: 'gentle_chime',
      vibration: true
    }
  };
}

export function formatProfileRecord(p: any, sbUser?: any): UserProfile {
  const settings = p.settings || createDefaultSettings();
  const email = p.email || sbUser?.email || '';
  const fallbackUsername = email ? email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') : `user_${(p.id || sbUser?.id)?.substring(0, 6)}`;

  return {
    id: p.id || sbUser?.id,
    username: p.username || fallbackUsername,
    name: p.full_name || p.display_name || sbUser?.user_metadata?.full_name || sbUser?.user_metadata?.name || p.username || fallbackUsername,
    email,
    avatarUrl: p.avatar_url || sbUser?.user_metadata?.avatar_url || undefined,
    bannerUrl: p.banner_url || undefined,
    bio: p.bio || 'Exploring Relay.',
    statusMessage: p.status_message || 'Available',
    onlineStatus: (p.online_status || 'online') as any,
    lastSeen: p.last_seen || 'Just now',
    dob: p.date_of_birth || undefined,
    country: p.country || sbUser?.user_metadata?.country || 'United States',
    socialLinks: p.social_links || {},
    contacts: p.contacts || [],
    blockedUsers: p.blocked_users || [],
    sentRequests: p.sent_requests || [],
    receivedRequests: p.received_requests || [],
    settings,
    createdAt: p.created_at || new Date().toISOString()
  };
}
