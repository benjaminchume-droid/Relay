/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QueuedOperation } from './types';
import { logger } from './RealtimeLogger';

export class OfflineQueue {
  private queue: QueuedOperation[] = [];
  private maxQueueSize = 100;
  private maxAgeMs = 300000; // 5 minutes max age for queued items

  public enqueue(
    type: QueuedOperation['type'],
    channelName: string,
    payload: any,
    event?: string
  ): void {
    // Clean stale items before enqueueing
    this.cleanStale();

    if (this.queue.length >= this.maxQueueSize) {
      const dropped = this.queue.shift();
      logger.warn('DroppedEvents', `Offline queue full (${this.maxQueueSize}). Dropped oldest operation`, dropped);
    }

    const op: QueuedOperation = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      channelName,
      event,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
    };

    // Deduplicate: if presence or broadcast for same event/channel, replace
    if (type === 'presence') {
      this.queue = this.queue.filter((item) => !(item.type === 'presence' && item.channelName === channelName));
    } else if (type === 'broadcast' && event) {
      this.queue = this.queue.filter(
        (item) => !(item.type === 'broadcast' && item.channelName === channelName && item.event === event)
      );
    }

    this.queue.push(op);
    logger.info('Connection', `Enqueued ${type} operation for '${channelName}' while offline (queue length: ${this.queue.length})`);
  }

  public async flush(
    executor: (op: QueuedOperation) => Promise<boolean>
  ): Promise<{ succeeded: number; failed: number }> {
    this.cleanStale();

    if (this.queue.length === 0) {
      return { succeeded: 0, failed: 0 };
    }

    logger.info('Connection', `Flushing ${this.queue.length} queued offline operations`);
    const opsToProcess = [...this.queue];
    this.queue = [];

    let succeeded = 0;
    let failed = 0;

    for (const op of opsToProcess) {
      try {
        const success = await executor(op);
        if (success) {
          succeeded += 1;
        } else {
          op.retryCount += 1;
          if (op.retryCount < 3) {
            this.queue.push(op); // Re-enqueue for next attempt
          } else {
            logger.error('SyncError', `Operation ${op.id} failed after 3 retries, dropping`, op);
          }
          failed += 1;
        }
      } catch (err) {
        logger.error('SyncError', `Error processing queued operation ${op.id}`, err);
        failed += 1;
      }
    }

    logger.info('Connection', `Offline queue flushed: ${succeeded} succeeded, ${failed} failed, ${this.queue.length} remaining`);
    return { succeeded, failed };
  }

  private cleanStale(): void {
    const now = Date.now();
    const initialCount = this.queue.length;
    this.queue = this.queue.filter((item) => now - item.timestamp < this.maxAgeMs);
    const removedCount = initialCount - this.queue.length;
    if (removedCount > 0) {
      logger.info('DroppedEvents', `Removed ${removedCount} expired items from offline queue`);
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public clear(): void {
    this.queue = [];
    logger.info('Connection', 'Cleared offline queue');
  }
}
