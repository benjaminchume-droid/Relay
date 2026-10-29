/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  RealtimeEventPayload,
  ClassifiedEvent,
  EventCategory,
  FeatureKey,
  EventType,
} from './types';
import { logger } from './RealtimeLogger';
import { useChatStore } from '../../store/chatStore';
import { useCommunityStore } from '../../store/communityStore';
import { useAuthStore } from '../../store/authStore';
import { formatMessageRecord } from '../messagingCore';
import { chatCache } from '../chatCache';

/**
 * Classifies a raw realtime payload into a feature category.
 */
export function classifyEvent(payload: RealtimeEventPayload): ClassifiedEvent {
  const table = payload.table || '';
  let category: EventCategory = 'Unknown';
  let feature: FeatureKey = payload.feature || 'conversation';

  if (table === 'messages' || table === 'conversation_members' || table === 'conversations') {
    category = table === 'messages' ? 'Message' : 'Conversation';
    feature = table === 'messages' ? 'messages' : 'conversation';
  } else if (
    table === 'community_posts' ||
    table === 'community_threads' ||
    table === 'community_members' ||
    table === 'communities'
  ) {
    category = 'Community';
    feature = 'communities';
  } else if (table === 'stories' || table === 'status_posts') {
    category = 'Post';
    feature = 'posts';
  } else if (table === 'calls' || table === 'call_signals') {
    category = 'System';
    feature = 'deviceUpdates';
  } else if (table === 'profiles') {
    category = 'Profile';
    feature = 'profile';
  } else if (table === 'notifications') {
    category = 'Notification';
    feature = 'notifications';
  }

  const data = (payload as any).payload ?? (payload as any).new ?? (payload as any).data ?? payload;

  return {
    category,
    feature,
    eventType: (payload.eventType as EventType) || 'UNKNOWN',
    table,
    data,
    timestamp: payload.timestamp || Date.now(),
  };
}

/**
 * Routes classified events into the appropriate stores / caches.
 */
export function routeClassifiedEvent(event: ClassifiedEvent): void {
  try {
    const data = event.data;
    const table = event.table;
    const eventType = event.eventType;
    const oldData = data?.old || data?.old_record;

    if (table === 'messages' && data) {
      const row = data.new || data.record || data;
      const formattedData = formatMessageRecord(row);
      const chatId = formattedData.chatId;
      if (!chatId) return;

      const store = useChatStore.getState();
      const existing = store.messages[chatId] || [];
      if (eventType === 'INSERT') {
        if (!existing.some((m) => m.id === formattedData.id)) {
          const next = [...existing, formattedData];
          useChatStore.setState({ messages: { ...store.messages, [chatId]: next } });
          chatCache.setMessages({ ...store.messages, [chatId]: next });
        }
      } else if (eventType === 'UPDATE') {
        const next = existing.map((m) => (m.id === formattedData.id ? { ...m, ...formattedData } : m));
        useChatStore.setState({ messages: { ...store.messages, [chatId]: next } });
      } else if (eventType === 'DELETE' && (oldData?.id || data?.id)) {
        const id = oldData?.id || data.id;
        const next = existing.filter((m) => m.id !== id);
        useChatStore.setState({ messages: { ...store.messages, [chatId]: next } });
      }
      return;
    }

    if (table === 'conversations' || table === 'conversation_members') {
      useChatStore.getState().fetchChats?.();
      return;
    }

    if (table === 'communities' || table === 'community_members' || table === 'community_posts' || table === 'community_threads') {
      useCommunityStore.getState().fetchCommunities?.();
      return;
    }

    if (table === 'profiles' && data) {
      const row = data.new || data;
      const auth = useAuthStore.getState();
      if (auth.profile?.id === row.id || auth.currentUser?.id === row.id) {
        // soft refresh handled by auth store listeners
      }
    }
  } catch (err) {
    logger.warn('Routing', `Failed to route event: ${String(err)}`);
  }
}

/** Class-based router used by FeatureSubscriptionManager / RelayRealtimeService */
export class EventRouter {
  routeEvent(payload: RealtimeEventPayload): void {
    const classified = classifyEvent(payload);
    routeClassifiedEvent(classified);
  }
}

/** Functional alias */
export function routeEvent(payload: RealtimeEventPayload | ClassifiedEvent): void {
  if ('category' in payload && 'data' in payload) {
    routeClassifiedEvent(payload as ClassifiedEvent);
  } else {
    routeClassifiedEvent(classifyEvent(payload as RealtimeEventPayload));
  }
}
