/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Chat, Message, UserProfile, Community, CommunityPost, NotificationItem } from '../types';

export interface CacheCategorySize {
  category: 'messages' | 'media' | 'profiles' | 'communities' | 'search';
  label: string;
  bytes: number;
  formattedSize: string;
  itemCount: number;
}

export interface OfflineQueueItem {
  id: string;
  type: 'send_message' | 'react_message' | 'edit_message' | 'delete_message' | 'update_profile' | 'post_community';
  payload: any;
  timestamp: number;
  retryCount: number;
}

const STORAGE_KEY_PREFIX = 'relay_cache_v2_';
const QUEUE_STORAGE_KEY = 'relay_offline_queue_v2';
const DRAFT_STORAGE_KEY = 'relay_chat_drafts_v2';

class MemoryCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private maxItems: number;

  constructor(maxItems = 100) {
    this.maxItems = maxItems;
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  set(key: string, value: T, ttlMs = 300000): void {
    if (this.cache.size >= this.maxItems) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

class RelayCacheManager {
  // In-Memory RAM Caches
  private messageMemoryCache = new MemoryCache<Message[]>(50);
  private profileMemoryCache = new MemoryCache<UserProfile>(100);
  private chatMemoryCache = new MemoryCache<Chat[]>(10);
  private searchMemoryCache = new MemoryCache<any>(30);

  private offlineQueue: OfflineQueueItem[] = [];
  private isOnlineStatus: boolean = navigator.onLine;
  private syncListeners: Array<(isOnline: boolean) => void> = [];

  constructor() {
    this.loadOfflineQueue();
    this.initNetworkListeners();
  }

  private initNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnlineStatus = true;
        this.notifySyncListeners(true);
        this.processOfflineQueue();
      });

      window.addEventListener('offline', () => {
        this.isOnlineStatus = false;
        this.notifySyncListeners(false);
      });
    }
  }

  public subscribeNetworkStatus(cb: (isOnline: boolean) => void) {
    this.syncListeners.push(cb);
    cb(this.isOnlineStatus);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== cb);
    };
  }

  private notifySyncListeners(isOnline: boolean) {
    this.syncListeners.forEach((cb) => cb(isOnline));
  }

  public isOnline(): boolean {
    return this.isOnlineStatus;
  }

  // --- MEMORY CACHE OPERATIONS ---
  public getMemoryMessages(chatId: string): Message[] | null {
    return this.messageMemoryCache.get(`msg_${chatId}`);
  }

  public setMemoryMessages(chatId: string, messages: Message[]): void {
    this.messageMemoryCache.set(`msg_${chatId}`, messages, 600000); // 10 mins
    this.persistToLocalStorage(`messages_${chatId}`, messages);
  }

  public getMemoryProfile(userId: string): UserProfile | null {
    return this.profileMemoryCache.get(`user_${userId}`);
  }

  public setMemoryProfile(userId: string, profile: UserProfile): void {
    this.profileMemoryCache.set(`user_${userId}`, profile, 900000); // 15 mins
    this.persistToLocalStorage(`profile_${userId}`, profile);
  }

  public getMemoryChats(): Chat[] | null {
    return this.chatMemoryCache.get('chats_list');
  }

  public setMemoryChats(chats: Chat[]): void {
    this.chatMemoryCache.set('chats_list', chats, 300000);
    this.persistToLocalStorage('chats_list', chats);
  }

  // --- DISK & LOCALSTORAGE PERSISTENCE ---
  private persistToLocalStorage(key: string, data: any) {
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${key}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Cache quota exceeded or storage error:', e);
    }
  }

  public getFromLocalStorage<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.data as T;
    } catch {
      return null;
    }
  }

  // --- DRAFT MESSAGES CACHE ---
  public getDraft(chatId: string): string {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return '';
      const drafts = JSON.parse(raw);
      return drafts[chatId] || '';
    } catch {
      return '';
    }
  }

  public setDraft(chatId: string, text: string): void {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      const drafts = raw ? JSON.parse(raw) : {};
      if (text.trim()) {
        drafts[chatId] = text;
      } else {
        delete drafts[chatId];
      }
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    } catch (e) {
      console.warn('Draft save failed:', e);
    }
  }

  // --- OFFLINE QUEUE MANAGER ---
  private loadOfflineQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (raw) {
        this.offlineQueue = JSON.parse(raw);
      }
    } catch {
      this.offlineQueue = [];
    }
  }

  private saveOfflineQueue() {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.offlineQueue));
    } catch (e) {
      console.warn('Failed to save offline queue:', e);
    }
  }

  public enqueueOfflineAction(action: Omit<OfflineQueueItem, 'id' | 'timestamp' | 'retryCount'>): OfflineQueueItem {
    const item: OfflineQueueItem = {
      ...action,
      id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      retryCount: 0
    };
    this.offlineQueue.push(item);
    this.saveOfflineQueue();

    if (this.isOnlineStatus) {
      this.processOfflineQueue();
    }
    return item;
  }

  public getPendingQueueCount(): number {
    return this.offlineQueue.length;
  }

  public async processOfflineQueue() {
    if (!this.isOnlineStatus || this.offlineQueue.length === 0) return;

    const itemsToProcess = [...this.offlineQueue];
    for (const item of itemsToProcess) {
      try {
        // Attempt sync request based on action type
        const success = await this.executeAction(item);
        if (success) {
          this.offlineQueue = this.offlineQueue.filter((q) => q.id !== item.id);
          this.saveOfflineQueue();
        } else {
          item.retryCount += 1;
          if (item.retryCount > 5) {
            // Drop un-processable action after 5 retries
            this.offlineQueue = this.offlineQueue.filter((q) => q.id !== item.id);
            this.saveOfflineQueue();
          }
        }
      } catch (err) {
        console.warn(`Error processing queued action ${item.type}:`, err);
        break; // Stop queue processing on network failure
      }
    }
  }

  private async executeAction(item: OfflineQueueItem): Promise<boolean> {
    try {
      const token = localStorage.getItem("relay_v2_auth_token");
      if (!token) return false;

      let url = "";
      let method = "POST";
      let body: any = item.payload;

      if (item.type === "send_message") {
        url = `/api/chats/${item.payload.chatId}/messages`;
      } else if (item.type === "react_message") {
        url = `/api/chats/${item.payload.chatId}/messages/${item.payload.messageId}/react`;
      } else if (item.type === "edit_message") {
        url = `/api/chats/${item.payload.chatId}/messages/${item.payload.messageId}`;
        method = "PUT";
      } else if (item.type === "delete_message") {
        url = `/api/chats/${item.payload.chatId}/messages/${item.payload.messageId}`;
        method = "DELETE";
      } else if (item.type === "update_profile") {
        url = `/api/users/profile`;
        method = "PUT";
      }

      if (!url) return true;

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: method !== "DELETE" ? JSON.stringify(body) : undefined
      });

      return res.ok;
    } catch {
      return false;
    }
  }

  // --- STORAGE METRICS & BREAKDOWN ---
  public getStorageBreakdown(): CacheCategorySize[] {
    let messageBytes = 0;
    let messageCount = 0;

    let mediaBytes = 0;
    let mediaCount = 0;

    let profileBytes = 0;
    let profileCount = 0;

    let communityBytes = 0;
    let communityCount = 0;

    let searchBytes = 0;
    let searchCount = 0;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        const value = localStorage.getItem(key) || '';
        const byteLen = key.length + value.length;

        if (key.includes('message')) {
          messageBytes += byteLen;
          messageCount += 1;
        } else if (key.includes('media') || key.includes('avatar') || key.includes('upload') || key.includes('wallpaper')) {
          mediaBytes += byteLen;
          mediaCount += 1;
        } else if (key.includes('profile') || key.includes('user') || key.includes('auth')) {
          profileBytes += byteLen;
          profileCount += 1;
        } else if (key.includes('community') || key.includes('post')) {
          communityBytes += byteLen;
          communityCount += 1;
        } else if (key.includes('search') || key.includes('draft')) {
          searchBytes += byteLen;
          searchCount += 1;
        }
      }
    } catch (e) {
      console.warn('Error computing cache metrics:', e);
    }

    const formatSize = (b: number) => {
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      return `${(b / (1024 * 1024)).toFixed(2)} MB`;
    };

    return [
      { category: 'messages', label: 'Conversations & Messages', bytes: messageBytes, formattedSize: formatSize(messageBytes), itemCount: messageCount },
      { category: 'media', label: 'Cached Media & Avatars', bytes: mediaBytes, formattedSize: formatSize(mediaBytes), itemCount: mediaCount },
      { category: 'profiles', label: 'User Profiles & Settings', bytes: profileBytes, formattedSize: formatSize(profileBytes), itemCount: profileCount },
      { category: 'communities', label: 'Community Feed & Posts', bytes: communityBytes, formattedSize: formatSize(communityBytes), itemCount: communityCount },
      { category: 'search', label: 'Drafts & Search Index', bytes: searchBytes, formattedSize: formatSize(searchBytes), itemCount: searchCount },
    ];
  }

  public clearCategory(category: 'messages' | 'media' | 'profiles' | 'communities' | 'search' | 'all'): void {
    if (category === 'all') {
      this.messageMemoryCache.clear();
      this.profileMemoryCache.clear();
      this.chatMemoryCache.clear();
      this.searchMemoryCache.clear();

      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(STORAGE_KEY_PREFIX) || key === DRAFT_STORAGE_KEY)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      return;
    }

    if (category === 'messages') {
      this.messageMemoryCache.clear();
      this.chatMemoryCache.clear();
    } else if (category === 'profiles') {
      this.profileMemoryCache.clear();
    } else if (category === 'search') {
      this.searchMemoryCache.clear();
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.startsWith(STORAGE_KEY_PREFIX) && key.includes(category)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
}

export const relayCacheManager = new RelayCacheManager();
