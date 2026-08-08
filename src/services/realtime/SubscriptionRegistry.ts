/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeatureKey, SubscriptionRecord, SubscriptionState } from './types';
import { logger } from './RealtimeLogger';

export class SubscriptionRegistry {
  private registry: Map<string, SubscriptionRecord> = new Map();

  /**
   * Constructs a unique registry key based on feature and parameters
   */
  public buildKey(feature: FeatureKey, params?: Record<string, any>): string {
    if (!params || Object.keys(params).length === 0) {
      return feature;
    }
    const sortedKeys = Object.keys(params).sort();
    const paramStr = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');
    return `${feature}:${paramStr}`;
  }

  /**
   * Registers a feature subscription.
   * If a subscription already exists, reuses it and increments the listener count.
   */
  public register(
    feature: FeatureKey,
    channelName: string,
    tables: string[],
    params?: Record<string, any>,
    isEssential: boolean = false
  ): { record: SubscriptionRecord; isNew: boolean } {
    const key = this.buildKey(feature, params);
    const existing = this.registry.get(key);

    if (existing) {
      existing.listenerCount += 1;
      if (isEssential) existing.isEssential = true;
      logger.info(
        'Subscription',
        `Reusing existing subscription for '${key}' (listener count: ${existing.listenerCount})`
      );
      return { record: existing, isNew: false };
    }

    const record: SubscriptionRecord = {
      featureKey: key,
      feature,
      channelName,
      subscribedTables: tables,
      subscriptionState: 'SUBSCRIBING',
      reconnectCount: 0,
      lastEventTime: null,
      listenerCount: 1,
      params,
      isEssential,
    };

    this.registry.set(key, record);
    logger.info('Subscription', `Registered new subscription for '${key}' on channel '${channelName}'`);
    return { record, isNew: true };
  }

  /**
   * Unregisters a feature subscription.
   * Decrements listener count. Returns true if the subscription was completely removed (listeners reached 0).
   */
  public unregister(feature: FeatureKey, params?: Record<string, any>): { record: SubscriptionRecord | null; shouldDispose: boolean } {
    const key = this.buildKey(feature, params);
    const existing = this.registry.get(key);

    if (!existing) {
      logger.warn('Subscription', `Attempted to unregister unknown subscription '${key}'`);
      return { record: null, shouldDispose: false };
    }

    existing.listenerCount -= 1;
    logger.info('Subscription', `Decremented listener count for '${key}' (remaining: ${existing.listenerCount})`);

    if (existing.listenerCount <= 0) {
      this.registry.delete(key);
      logger.info('Subscription', `Removed subscription '${key}' from registry`);
      return { record: existing, shouldDispose: true };
    }

    return { record: existing, shouldDispose: false };
  }

  public get(featureKey: string): SubscriptionRecord | undefined {
    return this.registry.get(featureKey);
  }

  public getByFeature(feature: FeatureKey, params?: Record<string, any>): SubscriptionRecord | undefined {
    const key = this.buildKey(feature, params);
    return this.registry.get(key);
  }

  public getAll(): SubscriptionRecord[] {
    return Array.from(this.registry.values());
  }

  public updateState(featureKey: string, state: SubscriptionState): void {
    const record = this.registry.get(featureKey);
    if (record) {
      record.subscriptionState = state;
    }
  }

  public recordEventTime(featureKey: string): void {
    const record = this.registry.get(featureKey);
    if (record) {
      record.lastEventTime = Date.now();
    }
  }

  public incrementReconnect(featureKey: string): number {
    const record = this.registry.get(featureKey);
    if (record) {
      record.reconnectCount += 1;
      return record.reconnectCount;
    }
    return 0;
  }

  public resetReconnect(featureKey: string): void {
    const record = this.registry.get(featureKey);
    if (record) {
      record.reconnectCount = 0;
    }
  }

  public clearAll(): SubscriptionRecord[] {
    const all = this.getAll();
    this.registry.clear();
    logger.info('Subscription', 'Cleared all subscriptions from registry');
    return all;
  }
}
