/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  RealtimeEventPayload,
  ClassifiedEvent,
  EventCategory,
  FeatureKey,
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
  let category: EventCategory = 'unknown';
  let feature: FeatureKey = 'unknown';

  if (table === 'messages' || table === 'conversation_members' || table === 'conversations') {
    category = 'chat';
    feature = 'messaging';
  } else if (table === 'community_posts' || table === 'community_members' || table === 'communities') {
    category = 'community';
    feature = 'communities';
  } else if (table === 'stories' || table === 'status_posts') {
    category = 'stories';
    feature = 'stories';
  } else if (table === 'calls' || table === 'call_signals') {
    category = 'calls';
    feature = 'calls';
  } else if (table === 'profiles') {
    category = 'profile';
    feature = 'profile';
  }

  return { ...payload, category, feature };
}

/**
 * Routes classified events into the appropriate stores / caches.
 */
export function routeEvent(event: ClassifiedEvent): void {
  try {
    const { table, eventType, new: data, old: oldData } = event as any;

    if (table === 'messages' && data) {
      const formattedData = formatMessageRecord(data);
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
      } else if (eventType === 'DELETE' && oldData?.id) {
        const next = existing.filter((m) => m.id !== oldData.id);
        useChatStore.setState({ messages: { ...store.messages, [chatId]: next } });
      }
      return;
    }

    if (table === 'conversations' || table === 'conversation_members') {
      useChatStore.getState().fetchChats?.();
      return;
    }

    if (table === 'communities' || table === 'community_members' || table === 'community_posts') {
      useCommunityStore.getState().fetchCommunities?.();
      return;
    }

    if (table === 'profiles' && data) {
      const auth = useAuthStore.getState();
      if (auth.profile?.id === data.id || auth.currentUser?.id === data.id) {
        // soft refresh handled by auth store listeners
      }
    }
  } catch (err) {
    logger.warn('EventRouter', `Failed to route event: ${String(err)}`);
  }
}
