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
import { formatMessageRecord } from '../apiService';
import { chatCache } from '../chatCache';

export type EventCategoryHandler = (event: ClassifiedEvent) => void;

export class EventRouter {
  private categoryHandlers: Map<EventCategory, Set<EventCategoryHandler>> = new Map();
  private globalHandlers: Set<EventCategoryHandler> = new Set();

  constructor() {
    this.registerDefaultStoreDispatchers();
  }

  /**
   * Classifies an incoming raw realtime event payload into a high-level EventCategory.
   */
  public classifyEvent(payload: RealtimeEventPayload): ClassifiedEvent {
    const { feature, table, payload: data, eventType, timestamp } = payload;
    let category: EventCategory = 'Unknown';

    if (feature === 'messages') {
      category = 'Message';
    } else if (feature === 'conversation') {
      category = 'Conversation';
    } else if (feature === 'communities' || feature === 'community' || feature === 'communityMembers') {
      category = 'Community';
    } else if (feature === 'communityThreads' || feature === 'thread') {
      category = 'Thread';
    } else if (feature === 'posts' || feature === 'exploreFeed' || feature === 'publicPosts' || feature === 'privatePosts') {
      category = 'Post';
    } else if (feature === 'notifications') {
      category = 'Notification';
    } else if (feature === 'presence') {
      category = 'Presence';
    } else if (feature === 'typing') {
      category = 'Typing';
    } else if (feature === 'mediaUploads') {
      category = 'Media';
    } else if (feature === 'profile') {
      category = 'Profile';
    } else if (feature === 'deviceUpdates') {
      category = 'Update';
    } else if (feature === 'bugReports') {
      category = 'BugReport';
    } else if (table === 'messages') {
      category = 'Message';
    } else if (table === 'chats' || table === 'conversation_members') {
      category = 'Conversation';
    } else if (table === 'communities' || table === 'community_members') {
      category = 'Community';
    } else if (table === 'posts') {
      category = 'Post';
    } else if (table === 'comments') {
      category = 'Comment';
    } else if (table === 'notifications') {
      category = 'Notification';
    } else if (table === 'profiles') {
      category = 'Profile';
    }

    return {
      category,
      eventType,
      feature,
      table,
      data,
      timestamp,
    };
  }

  /**
   * Routes a raw event payload through classification and dispatches to registered handlers.
   */
  public routeEvent(payload: RealtimeEventPayload): void {
    const classified = this.classifyEvent(payload);
    logger.info(
      'Routing',
      `Routed event [${classified.category}] -> Feature '${classified.feature}' (${classified.eventType})`
    );

    // Global handlers
    this.globalHandlers.forEach((handler) => {
      try {
        handler(classified);
      } catch (err) {
        logger.error('Routing', 'Error in global event handler', err);
      }
    });

    // Category-specific handlers
    const handlers = this.categoryHandlers.get(classified.category);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(classified);
        } catch (err) {
          logger.error('Routing', `Error in handler for category '${classified.category}'`, err);
        }
      });
    }
  }

  public registerHandler(category: EventCategory, handler: EventCategoryHandler): () => void {
    if (!this.categoryHandlers.has(category)) {
      this.categoryHandlers.set(category, new Set());
    }
    this.categoryHandlers.get(category)!.add(handler);

    return () => {
      const set = this.categoryHandlers.get(category);
      if (set) {
        set.delete(handler);
      }
    };
  }

  public registerGlobalHandler(handler: EventCategoryHandler): () => void {
    this.globalHandlers.add(handler);
    return () => {
      this.globalHandlers.delete(handler);
    };
  }

  /**
   * Registers automatic dispatchers that synchronize events directly with Relay's Zustand stores.
   */
  private registerDefaultStoreDispatchers(): void {
    // 1. Message Events
    this.registerHandler('Message', (event) => {
      const { eventType, data } = event;
      if (!data) return;

      console.log(`[MESSAGE] realtime event:`, { eventType, id: data.id, content: data.content, chatId: data.chatId || data.conversation_id });

      const chatId = data.chatId || data.conversation_id || data.chat_id;
      if (!chatId) return;

      const chatStore = useChatStore.getState();

      if (eventType === 'INSERT') {
        const formattedData = formatMessageRecord(data);
        const msgId = formattedData.id || data.id;

        useChatStore.setState((state) => {
          const currentMsgs = state.messages[chatId] || [];
          
          // 1. Check if message already exists by real ID
          if (currentMsgs.some((m) => m.id === msgId)) {
            return state;
          }

          // 2. Check if there is an optimistic temp message matching this server message
          const tempIdx = currentMsgs.findIndex(
            (m) =>
              m.id.startsWith('temp_') &&
              (m.content === formattedData.content || (m as any).clientMessageId === (data as any).clientMessageId)
          );

          let updatedMsgs: typeof currentMsgs;
          if (tempIdx !== -1) {
            // Replace temp message with server confirmed message
            updatedMsgs = [...currentMsgs];
            updatedMsgs[tempIdx] = { ...formattedData, deliveryState: 'sent' };
          } else {
            // Append new incoming message
            updatedMsgs = [...currentMsgs, { ...formattedData, deliveryState: 'sent' }];
          }

          // Update chat list preview immediately
          const updatedChats = state.chats.map((c) => {
            if (c.id === chatId) {
              return {
                ...c,
                lastMessage: {
                  text: formattedData.content || (formattedData.type === 'image' ? '📷 Photo' : formattedData.type === 'voice' ? '🎤 Voice Note' : 'Attachment'),
                  timestamp: formattedData.timestamp || new Date().toISOString(),
                  senderId: formattedData.senderId
                }
              };
            }
            return c;
          });

          const newMessagesMap = {
            ...state.messages,
            [chatId]: updatedMsgs,
          };
          chatCache.setMessages(newMessagesMap);

          return {
            messages: newMessagesMap,
            chats: updatedChats
          };
        });

        // Trigger background fetchChats to keep counts accurate
        chatStore.fetchChats();
      } else if (eventType === 'UPDATE') {
        useChatStore.setState((state) => ({
          messages: {
            ...state.messages,
            [chatId]: (state.messages[chatId] || []).map((m) => (m.id === data.id ? { ...m, ...data } : m)),
          },
        }));
      } else if (eventType === 'DELETE') {
        useChatStore.setState((state) => ({
          messages: {
            ...state.messages,
            [chatId]: (state.messages[chatId] || []).filter((m) => m.id !== data.id),
          },
        }));
      }
    });

    // 2. Conversation Events
    this.registerHandler('Conversation', (event) => {
      const chatStore = useChatStore.getState();
      chatStore.fetchChats();
    });

    // 3. Community Events
    this.registerHandler('Community', (event) => {
      const communityStore = useCommunityStore.getState();
      communityStore.fetchCommunities();
    });

    // 4. Post Events
    this.registerHandler('Post', (event) => {
      const { eventType, data } = event;
      if (!data) return;

      const communityStore = useCommunityStore.getState();
      const communityId = data.communityId;

      if (communityId) {
        if (eventType === 'INSERT') {
          const currentPosts = communityStore.posts[communityId] || [];
          if (!currentPosts.some((p) => p.id === data.id)) {
            useCommunityStore.setState((state) => ({
              posts: {
                ...state.posts,
                [communityId]: [data, ...currentPosts],
              },
            }));
          }
        } else if (eventType === 'UPDATE') {
          useCommunityStore.setState((state) => ({
            posts: {
              ...state.posts,
              [communityId]: (state.posts[communityId] || []).map((p) => (p.id === data.id ? { ...p, ...data } : p)),
            },
          }));
        } else if (eventType === 'DELETE') {
          useCommunityStore.setState((state) => ({
            posts: {
              ...state.posts,
              [communityId]: (state.posts[communityId] || []).filter((p) => p.id !== data.id),
            },
          }));
        }
      }
    });

    // 5. Notification Events
    this.registerHandler('Notification', (event) => {
      // Refresh current user session / notifications
      const authStore = useAuthStore.getState();
      if (authStore.currentUser) {
        authStore.initializeSession();
      }
    });

    // 6. Profile Events
    this.registerHandler('Profile', (event) => {
      const { data } = event;
      const authStore = useAuthStore.getState();
      if (authStore.currentUser && data && data.id === authStore.currentUser.id) {
        useAuthStore.setState({
          currentUser: {
            ...authStore.currentUser,
            ...data,
          },
        });
      }
    });
  }
}
