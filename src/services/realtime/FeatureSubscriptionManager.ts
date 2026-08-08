/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubscriptionRegistry } from './SubscriptionRegistry';
import { ChannelManager } from './ChannelManager';
import { EventRouter } from './EventRouter';
import { FeatureKey, RealtimeEventPayload } from './types';
import { logger } from './RealtimeLogger';

export class FeatureSubscriptionManager {
  private registry: SubscriptionRegistry;
  private channelManager: ChannelManager;
  private eventRouter: EventRouter;

  constructor(
    registry: SubscriptionRegistry,
    channelManager: ChannelManager,
    eventRouter: EventRouter
  ) {
    this.registry = registry;
    this.channelManager = channelManager;
    this.eventRouter = eventRouter;
  }

  /**
   * Internal helper to subscribe a feature cleanly
   */
  private async subscribeFeature(
    feature: FeatureKey,
    channelName: string,
    tables: string[],
    params?: Record<string, any>,
    isEssential: boolean = false
  ): Promise<string> {
    const { record, isNew } = this.registry.register(
      feature,
      channelName,
      tables,
      params,
      isEssential
    );

    if (isNew) {
      this.registry.updateState(record.featureKey, 'SUBSCRIBING');

      const onChannelEvent = (payload: RealtimeEventPayload) => {
        this.registry.recordEventTime(record.featureKey);
        this.eventRouter.routeEvent(payload);
      };

      const result = await this.channelManager.registerChannel(
        {
          channelName,
          featureKey: record.featureKey,
          feature,
          tables,
          enableBroadcast: true,
          enablePresence: feature === 'presence',
          params,
        },
        onChannelEvent
      );

      if (result) {
        this.registry.updateState(record.featureKey, 'SUBSCRIBED');
        logger.info('Subscription', `Feature '${feature}' successfully subscribed on '${channelName}'`);
      } else {
        this.registry.updateState(record.featureKey, 'ERROR');
      }
    } else {
      logger.info(
        'Subscription',
        `Reused subscription for feature '${feature}' (listeners: ${record.listenerCount})`
      );
    }

    return record.featureKey;
  }

  /**
   * Internal helper to unsubscribe a feature
   */
  private async unsubscribeFeature(
    feature: FeatureKey,
    params?: Record<string, any>
  ): Promise<void> {
    const { record, shouldDispose } = this.registry.unregister(feature, params);

    if (shouldDispose && record) {
      await this.channelManager.removeChannel(record.channelName);
      logger.info('Subscription', `Disposed channel '${record.channelName}' for feature '${feature}'`);
    }
  }

  // --- Feature API Methods ---

  public async subscribeToConversation(conversationId: string): Promise<string> {
    return this.subscribeFeature(
      'conversation',
      `chat:${conversationId}`,
      ['chats', 'messages'],
      { conversationId },
      true // essential
    );
  }

  public async unsubscribeFromConversation(conversationId: string): Promise<void> {
    return this.unsubscribeFeature('conversation', { conversationId });
  }

  public async subscribeToMessages(conversationId: string): Promise<string> {
    return this.subscribeFeature(
      'messages',
      `chat:${conversationId}:messages`,
      ['messages'],
      { conversationId },
      true // essential
    );
  }

  public async subscribeToCommunities(): Promise<string> {
    return this.subscribeFeature('communities', 'global:communities', ['communities'], undefined, false);
  }

  public async subscribeToCommunity(communityId: string): Promise<string> {
    return this.subscribeFeature(
      'community',
      `community:${communityId}`,
      ['communities', 'posts'],
      { communityId },
      false
    );
  }

  public async subscribeToCommunityThreads(communityId: string): Promise<string> {
    return this.subscribeFeature(
      'communityThreads',
      `community:${communityId}:threads`,
      ['posts', 'comments'],
      { communityId },
      false
    );
  }

  public async subscribeToThread(threadId: string): Promise<string> {
    return this.subscribeFeature(
      'thread',
      `thread:${threadId}`,
      ['posts', 'comments'],
      { threadId },
      false
    );
  }

  public async subscribeToExploreFeed(): Promise<string> {
    return this.subscribeFeature('exploreFeed', 'global:explore', ['posts', 'communities'], undefined, false);
  }

  public async subscribeToPosts(): Promise<string> {
    return this.subscribeFeature('posts', 'global:posts', ['posts'], undefined, false);
  }

  public async subscribeToPublicPosts(): Promise<string> {
    return this.subscribeFeature('publicPosts', 'global:public_posts', ['posts'], undefined, false);
  }

  public async subscribeToPrivatePosts(): Promise<string> {
    return this.subscribeFeature('privatePosts', 'global:private_posts', ['posts'], undefined, false);
  }

  public async subscribeToNotifications(): Promise<string> {
    return this.subscribeFeature('notifications', 'user:notifications', ['notifications'], undefined, true);
  }

  public async subscribeToPresence(): Promise<string> {
    return this.subscribeFeature('presence', 'relay_global_presence', [], undefined, true);
  }

  public async subscribeToTyping(chatId: string): Promise<string> {
    return this.subscribeFeature(
      'typing',
      `chat:${chatId}:typing`,
      [],
      { chatId },
      false
    );
  }

  public async subscribeToReadReceipts(chatId: string): Promise<string> {
    return this.subscribeFeature(
      'readReceipts',
      `chat:${chatId}:read_receipts`,
      ['messages'],
      { chatId },
      false
    );
  }

  public async subscribeToMediaUploads(assetId: string): Promise<string> {
    return this.subscribeFeature(
      'mediaUploads',
      `media:${assetId}`,
      [],
      { assetId },
      false
    );
  }

  public async subscribeToBugReports(): Promise<string> {
    return this.subscribeFeature('bugReports', 'admin:bug_reports', [], undefined, false);
  }

  public async subscribeToDeviceUpdates(): Promise<string> {
    return this.subscribeFeature('deviceUpdates', 'system:device_updates', [], undefined, true);
  }

  public async subscribeToProfile(profileId: string): Promise<string> {
    return this.subscribeFeature(
      'profile',
      `profile:${profileId}`,
      ['profiles'],
      { profileId },
      false
    );
  }

  public async subscribeToCommunityMembers(communityId: string): Promise<string> {
    return this.subscribeFeature(
      'communityMembers',
      `community:${communityId}:members`,
      ['community_members'],
      { communityId },
      false
    );
  }

  public async unsubscribeAll(): Promise<void> {
    const allRecords = this.registry.clearAll();
    for (const record of allRecords) {
      await this.channelManager.removeChannel(record.channelName);
    }
    logger.info('Subscription', 'Unsubscribed from all feature subscriptions');
  }
}
