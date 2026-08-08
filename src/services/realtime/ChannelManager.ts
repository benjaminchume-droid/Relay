/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';
import { logger } from './RealtimeLogger';
import { EventType, RealtimeEventPayload, FeatureKey } from './types';

export interface ChannelConfig {
  channelName: string;
  featureKey: string;
  feature: FeatureKey;
  tables?: string[];
  enablePresence?: boolean;
  enableBroadcast?: boolean;
  params?: Record<string, any>;
}

export type ChannelEventCallback = (payload: RealtimeEventPayload) => void;

export class ChannelManager {
  private channels: Map<string, RealtimeChannel> = new Map();
  private configs: Map<string, ChannelConfig> = new Map();
  private callbacks: Map<string, Set<ChannelEventCallback>> = new Map();
  private pausedChannels: Set<string> = new Set();

  public isAvailable(): boolean {
    return isSupabaseConfigured && !!supabase;
  }

  /**
   * Registers and subscribes to a Supabase Realtime channel with Postgres changes, Presence, and Broadcast handlers.
   */
  public async registerChannel(
    config: ChannelConfig,
    onEvent: ChannelEventCallback
  ): Promise<RealtimeChannel | null> {
    const { channelName, featureKey, feature, tables, enablePresence, enableBroadcast } = config;

    // Store config
    this.configs.set(channelName, config);

    // Register callback
    if (!this.callbacks.has(channelName)) {
      this.callbacks.set(channelName, new Set());
    }
    this.callbacks.get(channelName)!.add(onEvent);

    // Check if channel already created in Supabase
    if (this.channels.has(channelName)) {
      logger.info('Subscription', `Reusing active Supabase channel '${channelName}'`);
      return this.channels.get(channelName)!;
    }

    if (!this.isAvailable()) {
      logger.warn('Subscription', `Supabase client not available for channel '${channelName}'`);
      return null;
    }

    try {
      logger.info('Subscription', `Creating new Supabase channel '${channelName}'`);
      
      const channelOptions: any = {};
      if (enablePresence) {
        channelOptions.presence = { key: channelName };
      }
      if (enableBroadcast) {
        channelOptions.config = { broadcast: { ack: true, self: true } };
      }

      let channel = supabase.channel(channelName, channelOptions);

      // Listen to database changes on requested tables
      if (tables && tables.length > 0) {
        for (const table of tables) {
          channel = channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table },
            (payload) => {
              this.handlePostgresChange(channelName, feature, table, payload);
            }
          );
        }
      }

      // Listen to Presence events
      if (enablePresence) {
        channel = channel
          .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            this.handlePresenceEvent(channelName, feature, 'PRESENCE_SYNC', state);
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            this.handlePresenceEvent(channelName, feature, 'PRESENCE_JOIN', { key, newPresences });
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            this.handlePresenceEvent(channelName, feature, 'PRESENCE_LEAVE', { key, leftPresences });
          });
      }

      // Listen to Broadcast events
      if (enableBroadcast) {
        channel = channel.on('broadcast', { event: '*' }, (payload) => {
          this.handleBroadcastEvent(channelName, feature, payload);
        });
      }

      // Subscribe to channel
      channel.subscribe((status, err) => {
        logger.info('Subscription', `Channel '${channelName}' status: ${status}`);
        if (err) {
          logger.error('Subscription', `Channel '${channelName}' error:`, err);
        }
      });

      this.channels.set(channelName, channel);
      return channel;
    } catch (err) {
      logger.error('Subscription', `Failed to register channel '${channelName}'`, err);
      return null;
    }
  }

  private handlePostgresChange(
    channelName: string,
    feature: FeatureKey,
    table: string,
    payload: any
  ): void {
    if (this.pausedChannels.has(channelName)) {
      logger.debug('DroppedEvents', `Skipping event for paused channel '${channelName}'`);
      return;
    }

    const eventType: EventType = (payload.eventType as EventType) || 'UPDATE';
    const realtimePayload: RealtimeEventPayload = {
      eventType,
      feature,
      table,
      payload: payload.new || payload.old || payload,
      timestamp: Date.now(),
      source: 'database',
    };

    this.dispatchToCallbacks(channelName, realtimePayload);
  }

  private handlePresenceEvent(
    channelName: string,
    feature: FeatureKey,
    eventType: EventType,
    presenceData: any
  ): void {
    if (this.pausedChannels.has(channelName)) return;

    const realtimePayload: RealtimeEventPayload = {
      eventType,
      feature,
      payload: presenceData,
      timestamp: Date.now(),
      source: 'presence',
    };

    this.dispatchToCallbacks(channelName, realtimePayload);
  }

  private handleBroadcastEvent(
    channelName: string,
    feature: FeatureKey,
    payload: any
  ): void {
    if (this.pausedChannels.has(channelName)) return;

    const realtimePayload: RealtimeEventPayload = {
      eventType: 'BROADCAST',
      feature,
      payload,
      timestamp: Date.now(),
      source: 'broadcast',
    };

    this.dispatchToCallbacks(channelName, realtimePayload);
  }

  private dispatchToCallbacks(channelName: string, payload: RealtimeEventPayload): void {
    const channelCallbacks = this.callbacks.get(channelName);
    if (channelCallbacks) {
      channelCallbacks.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          logger.error('Routing', `Error in channel callback for '${channelName}'`, err);
        }
      });
    }
  }

  public async removeChannel(channelName: string): Promise<void> {
    const channel = this.channels.get(channelName);
    if (channel && this.isAvailable()) {
      try {
        await supabase.removeChannel(channel);
        logger.info('Subscription', `Removed Supabase channel '${channelName}'`);
      } catch (err) {
        logger.error('Subscription', `Error removing channel '${channelName}'`, err);
      }
    }

    this.channels.delete(channelName);
    this.configs.delete(channelName);
    this.callbacks.delete(channelName);
    this.pausedChannels.delete(channelName);
  }

  public pauseChannel(channelName: string): void {
    this.pausedChannels.add(channelName);
    logger.info('Subscription', `Paused events for channel '${channelName}'`);
  }

  public resumeChannel(channelName: string): void {
    this.pausedChannels.delete(channelName);
    logger.info('Subscription', `Resumed events for channel '${channelName}'`);
  }

  public async reconnectChannel(channelName: string): Promise<void> {
    const config = this.configs.get(channelName);
    const existingCallbacks = this.callbacks.get(channelName);

    if (config && existingCallbacks) {
      const callbacksArray = Array.from(existingCallbacks);
      await this.removeChannel(channelName);

      for (const cb of callbacksArray) {
        await this.registerChannel(config, cb);
      }
      logger.info('Reconnect', `Successfully reconnected channel '${channelName}'`);
    }
  }

  public async reconnectAll(): Promise<void> {
    logger.info('Reconnect', `Reconnecting all ${this.configs.size} channels...`);
    const channelNames = Array.from(this.configs.keys());
    for (const name of channelNames) {
      await this.reconnectChannel(name);
    }
  }

  public async pauseNonEssential(essentialChannelNames: Set<string>): Promise<void> {
    for (const [channelName] of this.channels) {
      if (!essentialChannelNames.has(channelName)) {
        this.pauseChannel(channelName);
      }
    }
  }

  public resumeAll(): void {
    this.pausedChannels.clear();
    logger.info('Subscription', 'Resumed all channels');
  }

  public getChannel(channelName: string): RealtimeChannel | undefined {
    return this.channels.get(channelName);
  }

  public async shutdown(): Promise<void> {
    if (this.isAvailable()) {
      try {
        await supabase.removeAllChannels();
      } catch (err) {
        logger.error('Subscription', 'Error removing all channels', err);
      }
    }

    this.channels.clear();
    this.configs.clear();
    this.callbacks.clear();
    this.pausedChannels.clear();
    logger.info('Subscription', 'ChannelManager shutdown complete');
  }
}
