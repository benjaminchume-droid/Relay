/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogEntry } from './types';

class RealtimeLogger {
  private static instance: RealtimeLogger;
  private logs: LogEntry[] = [];
  private maxLogs = 500;
  private listeners: ((log: LogEntry) => void)[] = [];

  private constructor() {}

  public static getInstance(): RealtimeLogger {
    if (!RealtimeLogger.instance) {
      RealtimeLogger.instance = new RealtimeLogger();
    }
    return RealtimeLogger.instance;
  }

  public log(
    level: 'info' | 'warn' | 'error' | 'debug',
    tag: LogEntry['tag'],
    message: string,
    details?: any
  ): void {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      level,
      tag,
      message,
      details,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    const logPrefix = `[RelayRealtime:${tag}]`;
    if (level === 'error') {
      console.error(logPrefix, message, details !== undefined ? details : '');
    } else if (level === 'warn') {
      console.warn(logPrefix, message, details !== undefined ? details : '');
    } else if (level === 'debug') {
      console.debug(logPrefix, message, details !== undefined ? details : '');
    } else {
      console.log(logPrefix, message, details !== undefined ? details : '');
    }

    this.listeners.forEach((listener) => listener(entry));
  }

  public info(tag: LogEntry['tag'], message: string, details?: any): void {
    this.log('info', tag, message, details);
  }

  public warn(tag: LogEntry['tag'], message: string, details?: any): void {
    this.log('warn', tag, message, details);
  }

  public error(tag: LogEntry['tag'], message: string, details?: any): void {
    this.log('error', tag, message, details);
  }

  public debug(tag: LogEntry['tag'], message: string, details?: any): void {
    this.log('debug', tag, message, details);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }

  public subscribe(listener: (log: LogEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

export const logger = RealtimeLogger.getInstance();
