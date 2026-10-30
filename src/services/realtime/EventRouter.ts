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

      // HARD RULE: raw ciphertext may never enter the store. Both INSERT and
      // UPDATE go through chatStore, which decrypts (INSERT) and merges only
      // delivery fields (UPDATE). Writing formatMessageRecord(row) here used to
      // leak R1/R2 envelopes into the UI and — worse — a read-receipt UPDATE
      // overwrote already-decrypted plaintext with the raw wire envelope.
      if (eventType === 'INSERT') {
        void useChatStore.getState().receiveIncomingMessage(row);
      } else if (eventType === 'UPDATE') {
        useChatStore.getState().applyMessageDeliveryUpdate(row);
      } else if (eventType === 'DELETE') {
        const id = oldData?.id || data?.id;
        if (id) useChatStore.getState().removeMessageLocally(String(id));
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
