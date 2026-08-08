/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelManager } from './ChannelManager';
import { BroadcastPayload } from './types';
import { logger } from './RealtimeLogger';

export type BroadcastCallback = (payload: BroadcastPayload) => void;

export class BroadcastManager {
  private channelManager: ChannelManager;
  private listeners: Map<string, Set<BroadcastCallback>> = new Map(); // channelName:event -> callbacks
  private currentUserId: string = '';
  private currentUserName: string = '';

  constructor(channelManager: ChannelManager) {
    this.channelManager = channelManager;
  }

  public setUser(userId: string, userName: string): void {
    this.currentUserId = userId;
    this.currentUserName = userName;
  }

  public async sendBroadcast(channelName: string, event: string, data: any, targetId?: string): Promise<boolean> {
    const channel = this.channelManager.getChannel(channelName);
    if (!channel) {
      logger.warn('Routing', `Cannot send broadcast event '${event}': channel '${channelName}' not active`);
      return false;
    }

    const payload: BroadcastPayload = {
      channelName,
      event,
      senderId: this.currentUserId,
      senderName: this.currentUserName,
      targetId,
      data,
      timestamp: Date.now(),
    };

    try {
      await channel.send({
        type: 'broadcast',
        event,
        payload,
      });
      logger.info('Routing', `Sent broadcast '${event}' on channel '${channelName}'`);
      return true;
    } catch (err) {
      logger.error('Routing', `Failed to send broadcast '${event}' on channel '${channelName}'`, err);
      return false;
    }
  }

  // Helper broadcasts for Relay features
  public async sendTypingSignal(chatId: string, isTyping: boolean): Promise<boolean> {
    return this.sendBroadcast(`chat:${chatId}`, 'typing_status', { isTyping }, chatId);
  }

  public async sendVoiceRecordingSignal(chatId: string, isRecording: boolean): Promise<boolean> {
    return this.sendBroadcast(`chat:${chatId}`, 'voice_recording', { isRecording }, chatId);
  }

  public async sendUploadProgress(assetId: string, progress: number, status: 'uploading' | 'processing' | 'completed' | 'failed'): Promise<boolean> {
    return this.sendBroadcast(`media:${assetId}`, 'upload_progress', { progress, status }, assetId);
  }

  public async sendReadReceipt(chatId: string, messageId: string): Promise<boolean> {
    return this.sendBroadcast(`chat:${chatId}`, 'read_receipt', { messageId }, chatId);
  }

  public subscribeBroadcast(
    channelName: string,
    event: string,
    callback: BroadcastCallback
  ): () => void {
    const key = `${channelName}:${event}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    return () => {
      const set = this.listeners.get(key);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  public handleIncomingBroadcast(channelName: string, broadcastPayload: any): void {
    const event = broadcastPayload?.event || broadcastPayload?.payload?.event;
    const data = broadcastPayload?.payload || broadcastPayload;

    if (!event) return;

    const key = `${channelName}:${event}`;
    const keyAll = `${channelName}:*`;

    const listenersToNotify = [
      ...(this.listeners.get(key) || []),
      ...(this.listeners.get(keyAll) || []),
    ];

    listenersToNotify.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        logger.error('Routing', `Error handling broadcast '${event}' on '${channelName}'`, err);
      }
    });
  }
}
