/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConnectionState } from './types';
import { logger } from './RealtimeLogger';

export type StateChangeListener = (newState: ConnectionState, previousState: ConnectionState) => void;

export class ConnectionManager {
  private state: ConnectionState = 'Disconnected';
  private previousState: ConnectionState = 'Disconnected';
  private listeners: Set<StateChangeListener> = new Set();
  
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 10;
  private initialRetryIntervalMs = 1000; // 1 second
  private maxRetryIntervalMs = 30000; // 30 seconds
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  
  private onReconnectCallback?: () => Promise<void>;

  constructor() {
    this.setupNetworkListeners();
  }

  private setupNetworkListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        logger.info('Connection', 'Network came back online');
        if (this.state === 'Offline' || this.state === 'Disconnected') {
          this.handleNetworkRestored();
        }
      });

      window.addEventListener('offline', () => {
        logger.warn('Connection', 'Network went offline');
        this.setState('Offline');
      });
    }
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === 'Connected';
  }

  public isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  public setState(newState: ConnectionState): void {
    if (this.state === newState) return;

    this.previousState = this.state;
    this.state = newState;
    logger.info('Connection', `State changed: ${this.previousState} -> ${this.state}`);

    this.listeners.forEach((listener) => {
      try {
        listener(this.state, this.previousState);
      } catch (err) {
        logger.error('Connection', 'Error in connection state listener', err);
      }
    });
  }

  public subscribeState(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    // Immediately inform subscriber of current state
    listener(this.state, this.previousState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setOnReconnectHandler(handler: () => Promise<void>): void {
    this.onReconnectCallback = handler;
  }

  public scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (!this.isOnline()) {
      logger.warn('Connection', 'Skipping reconnect schedule because device is offline');
      this.setState('Offline');
      return;
    }

    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      logger.error('Connection', `Max reconnect attempts reached (${this.maxReconnectAttempts}). Connection failed.`);
      this.setState('Disconnected');
      return;
    }

    this.reconnectAttempt += 1;
    this.setState('Reconnecting');

    // Calculate exponential backoff with jitter
    const exponentialDelay = Math.min(
      this.initialRetryIntervalMs * Math.pow(2, this.reconnectAttempt - 1),
      this.maxRetryIntervalMs
    );
    const jitter = Math.random() * 1000;
    const delay = Math.floor(exponentialDelay + jitter);

    logger.info('Reconnect', `Scheduling reconnect attempt #${this.reconnectAttempt} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        logger.info('Reconnect', `Executing reconnect attempt #${this.reconnectAttempt}`);
        if (this.onReconnectCallback) {
          await this.onReconnectCallback();
        }
      } catch (err) {
        logger.error('Reconnect', `Reconnect attempt #${this.reconnectAttempt} failed`, err);
        this.scheduleReconnect();
      }
    }, delay);
  }

  public resetReconnectAttempts(): void {
    this.reconnectAttempt = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleNetworkRestored(): void {
    this.resetReconnectAttempts();
    this.scheduleReconnect();
  }

  public destroy(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.listeners.clear();
    this.setState('Destroyed');
  }
}
