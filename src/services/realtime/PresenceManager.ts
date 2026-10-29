/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserPresenceState, UserActivity } from './types';
import { ChannelManager } from './ChannelManager';
import { logger } from './RealtimeLogger';

export type PresenceListener = (presences: Map<string, UserPresenceState>) => void;

export class PresenceManager {
  private currentUserId: string | null = null;
  private currentUserName: string = 'Anonymous';
  private currentAvatarUrl?: string;
  private currentStatus: 'online' | 'offline' | 'idle' | 'away' = 'online';
  private currentActivity: UserActivity = 'online';
  private currentTargetId?: string;

  private presenceChannelName = 'relay_global_presence';
  private activePresences: Map<string, UserPresenceState> = new Map();
  private listeners: Set<PresenceListener> = new Set();

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimeoutMs = 120000; // 2 minutes to idle
  private channelManager: ChannelManager;

  constructor(channelManager: ChannelManager) {
    this.channelManager = channelManager;
    this.setupWindowListeners();
  }

  public setUser(userId: string, name: string, avatarUrl?: string): void {
    this.currentUserId = userId;
    this.currentUserName = name;
    this.currentAvatarUrl = avatarUrl;
  }

  public async startPresence(): Promise<void> {
    if (!this.currentUserId) return;

    await this.channelManager.registerChannel(
      {
        channelName: this.presenceChannelName,
        featureKey: 'presence',
        feature: 'presence',
        enablePresence: true,
      },
      (event) => {
        if (event.eventType === 'PRESENCE_SYNC') {
          this.handlePresenceSync(event.payload);
        } else if (event.eventType === 'PRESENCE_JOIN') {
          this.handlePresenceJoin(event.payload);
        } else if (event.eventType === 'PRESENCE_LEAVE') {
          this.handlePresenceLeave(event.payload);
        }
      }
    );

    await this.syncSelfPresence();
    this.resetIdleTimer();
  }

  public async updateActivity(activity: UserActivity, targetId?: string): Promise<void> {
    this.currentActivity = activity;
    this.currentTargetId = targetId;
    if (activity === 'offline') {
      this.currentStatus = 'offline';
    } else if (activity === 'idle' || activity === 'away') {
      this.currentStatus = activity;
    } else {
      this.currentStatus = 'online';
    }

    await this.syncSelfPresence();
    this.resetIdleTimer();
  }

  public async setTyping(chatId?: string, isTyping: boolean = true): Promise<void> {
    if (isTyping) {
      await this.updateActivity('typing', chatId);
    } else {
      await this.updateActivity('online', chatId);
    }
  }

  public async setRecordingVoice(chatId?: string, isRecording: boolean = true): Promise<void> {
    if (isRecording) {
      await this.updateActivity('recording_voice', chatId);
    } else {
      await this.updateActivity('online', chatId);
    }
  }

  public async setUploadingMedia(chatId?: string, isUploading: boolean = true): Promise<void> {
    if (isUploading) {
      await this.updateActivity('uploading_media', chatId);
    } else {
      await this.updateActivity('online', chatId);
    }
  }

  public async setViewingMedia(mediaId?: string): Promise<void> {
    await this.updateActivity('viewing_media', mediaId);
  }

  public async setReadingConversation(chatId?: string): Promise<void> {
    await this.updateActivity('reading_conversation', chatId);
  }

  private async syncSelfPresence(): Promise<void> {
    if (!this.currentUserId) return;

    const presenceData: UserPresenceState = {
      userId: this.currentUserId,
      userName: this.currentUserName,
      avatarUrl: this.currentAvatarUrl,
      status: this.currentStatus,
      activity: this.currentActivity,
      targetId: this.currentTargetId,
      lastActive: new Date().toISOString(),
      clientVersion: '2.0.0',
    };

    const channel = this.channelManager.getChannel(this.presenceChannelName);
    if (channel) {
      try {
        await channel.track(presenceData);
        logger.info('Presence', `Self presence updated: ${this.currentStatus} (${this.currentActivity})`);
      } catch (err) {
        logger.error('Presence', 'Error tracking presence', err);
      }
    }
  }

  private handlePresenceSync(presenceStateObj: any): void {
    const newPresences = new Map<string, UserPresenceState>();

    if (presenceStateObj && typeof presenceStateObj === 'object') {
      Object.keys(presenceStateObj).forEach((key) => {
        const presencesArr = presenceStateObj[key];
        if (Array.isArray(presencesArr) && presencesArr.length > 0) {
          const latest = presencesArr[presencesArr.length - 1] as UserPresenceState;
          if (latest && latest.userId) {
            newPresences.set(latest.userId, latest);
          }
        }
      });
    }

    this.activePresences = newPresences;
    this.notifyListeners();
  }

  private handlePresenceJoin(data: any): void {
    if (data && data.newPresences && Array.isArray(data.newPresences)) {
      data.newPresences.forEach((p: UserPresenceState) => {
        if (p && p.userId) {
          this.activePresences.set(p.userId, p);
          logger.info('Presence', `User joined presence: ${p.userName} (${p.userId})`);
        }
      });
      this.notifyListeners();
    }
  }

  private handlePresenceLeave(data: any): void {
    if (data && data.leftPresences && Array.isArray(data.leftPresences)) {
      data.leftPresences.forEach((p: UserPresenceState) => {
        if (p && p.userId) {
          this.activePresences.delete(p.userId);
          logger.info('Presence', `User left presence: ${p.userName} (${p.userId})`);
        }
      });
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(new Map(this.activePresences));
      } catch (err) {
        logger.error('Presence', 'Error in presence listener', err);
      }
    });
  }

  public subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    listener(new Map(this.activePresences));
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getActivePresences(): Map<string, UserPresenceState> {
    return new Map(this.activePresences);
  }

  public getUserPresence(userId: string): UserPresenceState | undefined {
    return this.activePresences.get(userId);
  }

  private setupWindowListeners(): void {
    if (typeof window === 'undefined') return;

    const resetIdle = () => {
      if (this.currentStatus === 'idle') {
        this.updateActivity('online');
      }
      this.resetIdleTimer();
    };

    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    window.addEventListener('touchstart', resetIdle);

    window.addEventListener('blur', () => {
      if (this.currentStatus === 'online') {
        this.updateActivity('away');
      }
    });

    window.addEventListener('focus', () => {
      if (this.currentStatus === 'away' || this.currentStatus === 'idle') {
        this.updateActivity('online');
      }
    });
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.currentStatus === 'online') {
        this.updateActivity('idle');
      }
    }, this.idleTimeoutMs);
  }

  public async stopPresence(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    const channel = this.channelManager.getChannel(this.presenceChannelName);
    if (channel) {
      try {
        await channel.untrack();
      } catch (e) {
        // ignore
      }
    }
    this.activePresences.clear();
    this.notifyListeners();
  }
}
