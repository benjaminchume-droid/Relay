/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PermissionType = 
  | 'camera' 
  | 'microphone' 
  | 'photos_videos' 
  | 'audio' 
  | 'notifications' 
  | 'contacts' 
  | 'location'
  | 'device_info_consent';

export type PermissionStatus = 'granted' | 'denied' | 'permanently_denied' | 'not_requested';

export interface DeviceInfo {
  manufacturer: string;
  model: string;
  brand: string;
  osVersion: string;
  sdkVersion: number;
  screenWidth: number;
  screenHeight: number;
  densityPixelRatio: number;
  refreshRate: number;
  language: string;
  region: string;
  timeZone: string;
  themeMode: string;
  cpuCores: number;
  deviceMemoryGB?: number;
  appVersion: string;
  buildNumber: string;
  networkType: string;
  onlineStatus: boolean;
  batteryLevel?: number;
  isCharging?: boolean;
}

const STORAGE_KEY_PERMISSIONS = 'relay_permissions_state_v1';
const STORAGE_KEY_DEVICE_CONSENT = 'relay_device_info_consent_v1';

class PermissionManager {
  private permissionStates: Record<PermissionType, PermissionStatus> = {
    camera: 'not_requested',
    microphone: 'not_requested',
    photos_videos: 'not_requested',
    audio: 'not_requested',
    notifications: 'not_requested',
    contacts: 'not_requested',
    location: 'not_requested',
    device_info_consent: 'not_requested',
  };

  private listeners: Array<() => void> = [];

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PERMISSIONS);
      if (stored) {
        this.permissionStates = { ...this.permissionStates, ...JSON.parse(stored) };
      }
    } catch {
      // Use defaults
    }
  }

  private saveState() {
    try {
      localStorage.setItem(STORAGE_KEY_PERMISSIONS, JSON.stringify(this.permissionStates));
      this.listeners.forEach((cb) => cb());
    } catch {
      // Ignore
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getStatus(type: PermissionType): PermissionStatus {
    return this.permissionStates[type] || 'not_requested';
  }

  public async checkPermission(type: PermissionType): Promise<PermissionStatus> {
    if (type === 'device_info_consent') {
      return this.permissionStates.device_info_consent;
    }

    if (type === 'camera' || type === 'microphone') {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const name = type === 'camera' ? ('camera' as any) : ('microphone' as any);
          const res = await navigator.permissions.query({ name });
          if (res.state === 'granted') this.permissionStates[type] = 'granted';
          else if (res.state === 'denied') this.permissionStates[type] = 'denied';
          this.saveState();
          return this.permissionStates[type];
        }
      } catch {
        // Fallback to saved
      }
    } else if (type === 'notifications') {
      if ('Notification' in window) {
        if (Notification.permission === 'granted') this.permissionStates.notifications = 'granted';
        else if (Notification.permission === 'denied') this.permissionStates.notifications = 'denied';
        this.saveState();
        return this.permissionStates.notifications;
      }
    }

    return this.permissionStates[type];
  }

  public async requestPermission(type: PermissionType): Promise<PermissionStatus> {
    if (type === 'camera') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((track) => track.stop());
        this.permissionStates.camera = 'granted';
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          this.permissionStates.camera = 'permanently_denied';
        } else {
          this.permissionStates.camera = 'denied';
        }
      }
    } else if (type === 'microphone') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        this.permissionStates.microphone = 'granted';
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          this.permissionStates.microphone = 'permanently_denied';
        } else {
          this.permissionStates.microphone = 'denied';
        }
      }
    } else if (type === 'notifications') {
      if ('Notification' in window) {
        const res = await Notification.requestPermission();
        if (res === 'granted') this.permissionStates.notifications = 'granted';
        else if (res === 'denied') this.permissionStates.notifications = 'permanently_denied';
      } else {
        this.permissionStates.notifications = 'denied';
      }
    } else if (type === 'device_info_consent') {
      this.permissionStates.device_info_consent = 'granted';
    } else {
      // Photos, Contacts, Audio, Location
      this.permissionStates[type] = 'granted';
    }

    this.saveState();
    return this.permissionStates[type];
  }

  public setDeviceInfoConsent(granted: boolean) {
    this.permissionStates.device_info_consent = granted ? 'granted' : 'denied';
    this.saveState();
  }

  public async getDeviceInfo(): Promise<DeviceInfo | null> {
    if (this.permissionStates.device_info_consent !== 'granted') {
      return null;
    }

    const ua = navigator.userAgent;
    let brand = 'Generic Device';
    let model = 'Web Client';
    let osVersion = 'Android 14 (API 34)';

    if (ua.includes('Android')) {
      const match = ua.match(/Android\s([0-9\.]+)/);
      if (match) osVersion = `Android ${match[1]}`;
      if (ua.includes('Samsung')) brand = 'Samsung';
      else if (ua.includes('Pixel')) brand = 'Google Pixel';
      else if (ua.includes('Xiaomi')) brand = 'Xiaomi';
    } else if (ua.includes('iPhone') || ua.includes('iPad')) {
      brand = 'Apple';
      model = ua.includes('iPhone') ? 'iPhone' : 'iPad';
    }

    let batteryLevel: number | undefined = undefined;
    let isCharging: boolean | undefined = undefined;

    try {
      if ('getBattery' in navigator) {
        const battery: any = await (navigator as any).getBattery();
        batteryLevel = Math.round(battery.level * 100);
        isCharging = battery.charging;
      }
    } catch {
      // Ignore
    }

    const nav = navigator as any;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

    return {
      manufacturer: brand,
      model,
      brand,
      osVersion,
      sdkVersion: 34,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      densityPixelRatio: window.devicePixelRatio || 1,
      refreshRate: 60,
      language: navigator.language || 'en-US',
      region: (navigator.language || 'en-US').split('-')[1] || 'US',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      themeMode: document.body.getAttribute('data-theme-mode') || 'light',
      cpuCores: navigator.hardwareConcurrency || 8,
      deviceMemoryGB: nav.deviceMemory || 8,
      appVersion: '3.4.0',
      buildNumber: '34012',
      networkType: connection?.effectiveType || (navigator.onLine ? 'wifi / 4g' : 'offline'),
      onlineStatus: navigator.onLine,
      batteryLevel,
      isCharging
    };
  }
}

export const permissionManager = new PermissionManager();
