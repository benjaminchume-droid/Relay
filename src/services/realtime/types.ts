/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ConnectionState =
  | 'Connecting'
  | 'Connected'
  | 'Disconnected'
  | 'Offline'
  | 'Paused'
  | 'Reconnecting'
  | 'Destroyed';

export type EventType =
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'PRESENCE_SYNC'
  | 'PRESENCE_JOIN'
  | 'PRESENCE_LEAVE'
  | 'BROADCAST'
  | 'SYSTEM'
  | 'UNKNOWN';

export type FeatureKey =
  | 'conversation'
  | 'messages'
  | 'communities'
  | 'community'
  | 'communityThreads'
  | 'thread'
  | 'exploreFeed'
  | 'posts'
  | 'publicPosts'
  | 'privatePosts'
  | 'notifications'
  | 'presence'
  | 'typing'
  | 'readReceipts'
  | 'mediaUploads'
  | 'bugReports'
  | 'deviceUpdates'
  | 'profile'
  | 'communityMembers';

export type SubscriptionState = 'SUBSCRIBED' | 'SUBSCRIBING' | 'UNSUBSCRIBED' | 'ERROR' | 'PAUSED';

export interface SubscriptionRecord {
  featureKey: string;
  feature: FeatureKey;
  channelName: string;
  subscribedTables: string[];
  subscriptionState: SubscriptionState;
  reconnectCount: number;
  lastEventTime: number | null;
  listenerCount: number;
  params?: Record<string, any>;
  isEssential?: boolean; // Keep active when backgrounded (e.g. messages, notifications)
}

export type UserActivity =
  | 'online'
  | 'offline'
  | 'idle'
  | 'away'
  | 'typing'
  | 'recording_voice'
  | 'uploading_media'
  | 'viewing_media'
  | 'reading_conversation';

export interface UserPresenceState {
  userId: string;
  userName: string;
  avatarUrl?: string;
  status: 'online' | 'offline' | 'idle' | 'away';
  activity: UserActivity;
  targetId?: string; // e.g., chatId or communityId
  lastActive: string;
  clientVersion?: string;
}

export interface BroadcastPayload {
  channelName: string;
  event: string;
  senderId: string;
  senderName?: string;
  targetId?: string;
  data: any;
  timestamp: number;
}

export interface RealtimeEventPayload {
  eventType: EventType;
  feature: FeatureKey;
  table?: string;
  payload: any;
  timestamp: number;
  source: 'database' | 'presence' | 'broadcast' | 'system';
}

export type EventCategory =
  | 'Message'
  | 'Conversation'
  | 'Community'
  | 'Thread'
  | 'Comment'
  | 'Post'
  | 'Notification'
  | 'Presence'
  | 'Typing'
  | 'Media'
  | 'Profile'
  | 'Update'
  | 'BugReport'
  | 'System'
  | 'Unknown';

export interface ClassifiedEvent {
  category: EventCategory;
  eventType: EventType;
  feature: FeatureKey;
  table?: string;
  data: any;
  timestamp: number;
}

export interface QueuedOperation {
  id: string;
  type: 'broadcast' | 'presence' | 'subscription';
  channelName: string;
  event?: string;
  payload: any;
  timestamp: number;
  retryCount: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  tag: 'Connection' | 'Subscription' | 'Reconnect' | 'Auth' | 'Latency' | 'DroppedEvents' | 'Routing' | 'SyncError' | 'Presence';
  message: string;
  details?: any;
}
