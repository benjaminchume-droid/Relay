/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConnectionManager } from './ConnectionManager';
import { ChannelManager } from './ChannelManager';
import { SubscriptionRegistry } from './SubscriptionRegistry';
import { PresenceManager } from './PresenceManager';
import { BroadcastManager } from './BroadcastManager';
import { EventRouter } from './EventRouter';
import { FeatureSubscriptionManager } from './FeatureSubscriptionManager';
import { OfflineQueue } from './OfflineQueue';
import { logger } from './RealtimeLogger';
import { ConnectionState, FeatureKey } from './types';

export class RelayRealtimeService {
  private static instance: RelayRealtimeService;

  public readonly connectionManager: ConnectionManager;
  public readonly channelManager: ChannelManager;
  public readonly registry: SubscriptionRegistry;
  public readonly presenceManager: PresenceManager;
  public readonly broadcastManager: BroadcastManager;
  public readonly eventRouter: EventRouter;
  public readonly featureSubscriptionManager: FeatureSubscriptionManager;
  public readonly offlineQueue: OfflineQueue;

  private currentUserId: string | null = null;
  private currentUserName: string = 'Anonymous';
  private isAuthenticated = false;
  private isInitialized = false;

  private constructor() {
    this.connectionManager = new ConnectionManager();
    this.channelManager = new ChannelManager();
    this.registry = new SubscriptionRegistry();
    this.offlineQueue = new OfflineQueue();

    this.eventRouter = new EventRouter();
    this.presenceManager = new PresenceManager(this.channelManager);
    this.broadcastManager = new BroadcastManager(this.channelManager);
    this.featureSubscriptionManager = new FeatureSubscriptionManager(
      this.registry,
      this.channelManager,
      this.eventRouter
    );

    this.setupConnectionHandlers();
    this.setupLifecycleHandlers();
  }

  public static getInstance(): RelayRealtimeService {
    if (!RelayRealtimeService.instance) {
      RelayRealtimeService.instance = new RelayRealtimeService();
    }
    return RelayRealtimeService.instance;
  }

  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    logger.info('Connection', 'RelayRealtimeService initialized');
  }

  /**
   * Authenticates user session with Realtime Service
   */
  public async authenticate(userId: string, userName: string, avatarUrl?: string): Promise<void> {
    this.currentUserId = userId;
    this.currentUserName = userName;
    this.isAuthenticated = true;

    this.presenceManager.setUser(userId, userName, avatarUrl);
    this.broadcastManager.setUser(userId, userName);

    logger.info('Auth', `Realtime authenticated for user '${userName}' (${userId})`);

    // Connect & setup core user subscriptions
    await this.connect();
  }

  /**
   * Connects websocket & restores active subscriptions & presence
   */
  public async connect(): Promise<void> {
    if (!this.isAuthenticated && !this.currentUserId) {
      logger.warn('Auth', 'Cannot connect RelayRealtimeService: user not authenticated');
      return;
    }

    this.connectionManager.setState('Connecting');

    try {
      // 1. Subscribe to essential default features (presence, notifications, device updates)
      await this.featureSubscriptionManager.subscribeToPresence();
      await this.featureSubscriptionManager.subscribeToNotifications();
      await this.featureSubscriptionManager.subscribeToDeviceUpdates();

      // 2. Start Presence tracking
      await this.presenceManager.startPresence();

      // 3. Update state
      this.connectionManager.setState('Connected');
      this.connectionManager.resetReconnectAttempts();

      // 4. Flush offline operations
      await this.flushOfflineQueue();

      logger.info('Connection', 'RelayRealtimeService successfully connected');
    } catch (err) {
      logger.error('Connection', 'Failed to connect RelayRealtimeService', err);
      this.connectionManager.setState('Disconnected');
      this.connectionManager.scheduleReconnect();
    }
  }

  /**
   * Setup reconnect callbacks
   */
  private setupConnectionHandlers(): void {
    this.connectionManager.setOnReconnectHandler(async () => {
      logger.info('Reconnect', 'Attempting full Realtime re-synchronization...');
      await this.channelManager.reconnectAll();
      await this.presenceManager.startPresence();
      await this.flushOfflineQueue();
      this.connectionManager.setState('Connected');
    });
  }

  /**
   * Setup window/app lifecycle handlers (background, foreground)
   */
  private setupLifecycleHandlers(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) {
        await this.handleAppBackground();
      } else {
        await this.handleAppForeground();
      }
    });
  }

  public async handleAppBackground(): Promise<void> {
    logger.info('Connection', 'App entering background - pausing non-essential channels');
    this.connectionManager.setState('Paused');

    // Collect essential channels
    const essentialChannels = new Set<string>();
    const allRecords = this.registry.getAll();
    allRecords.forEach((rec) => {
      if (rec.isEssential) {
        essentialChannels.add(rec.channelName);
      }
    });

    // Pause non-essential channels
    await this.channelManager.pauseNonEssential(essentialChannels);

    // Update presence to away
    await this.presenceManager.updateActivity('away');
  }

  public async handleAppForeground(): Promise<void> {
    logger.info('Connection', 'App returning to foreground - restoring active channels');

    this.channelManager.resumeAll();

    if (!this.connectionManager.isConnected()) {
      await this.connect();
    } else {
      await this.presenceManager.updateActivity('online');
    }
  }

  private async flushOfflineQueue(): Promise<void> {
    if (this.offlineQueue.getQueueLength() === 0) return;

    await this.offlineQueue.flush(async (op) => {
      if (op.type === 'broadcast') {
        return this.broadcastManager.sendBroadcast(
          op.channelName,
          op.event || 'general',
          op.payload
        );
      } else if (op.type === 'presence') {
        await this.presenceManager.updateActivity(op.payload.activity, op.payload.targetId);
        return true;
      }
      return false;
    });
  }

  public async disconnect(): Promise<void> {
    logger.info('Connection', 'Disconnecting RelayRealtimeService...');
    await this.presenceManager.stopPresence();
    await this.featureSubscriptionManager.unsubscribeAll();
    this.connectionManager.setState('Disconnected');
  }

  public async logout(): Promise<void> {
    logger.info('Auth', 'User logged out - cleaning up Realtime Service');
    await this.disconnect();
    this.currentUserId = null;
    this.currentUserName = 'Anonymous';
    this.isAuthenticated = false;
    this.offlineQueue.clear();
  }

  public async destroy(): Promise<void> {
    await this.logout();
    await this.channelManager.shutdown();
    this.connectionManager.destroy();
    logger.info('Connection', 'RelayRealtimeService destroyed');
  }
}

export const relayRealtimeService = RelayRealtimeService.getInstance();
