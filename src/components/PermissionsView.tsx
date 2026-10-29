/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Camera, Mic, Image, Music, Bell, Users, MapPin, Cpu, CheckCircle2, XCircle, AlertCircle, Settings, ChevronRight, Smartphone, Info
} from 'lucide-react';
import { GlassCard, GlassButton } from './GlassUI';
import { permissionManager, PermissionType, PermissionStatus, DeviceInfo } from '../services/permissionManager';

interface PermissionItem {
  id: PermissionType;
  title: string;
  description: string;
  icon: React.FC<{ size?: number; className?: string }>;
  /** Human-friendly category label (never show raw Android permission strings). */
  categoryLabel: string;
}

const PERMISSIONS_LIST: PermissionItem[] = [
  {
    id: 'camera',
    title: 'Camera',
    description: 'Take photos, record video stories, and join video calls.',
    icon: Camera,
    categoryLabel: 'Photos & video',
  },
  {
    id: 'microphone',
    title: 'Microphone',
    description: 'Record voice notes and make crystal-clear audio calls.',
    icon: Mic,
    categoryLabel: 'Microphone',
  },
  {
    id: 'photos_videos',
    title: 'Photos & Videos',
    description: 'Choose and share images, videos, and custom wallpapers.',
    icon: Image,
    categoryLabel: 'Media library',
  },
  {
    id: 'audio',
    title: 'Music & Audio',
    description: 'Attach audio clips and voice documents to chats.',
    icon: Music,
    categoryLabel: 'Media library',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Get alerts for messages, mentions, and calls.',
    icon: Bell,
    categoryLabel: 'Notifications',
  },
  {
    id: 'contacts',
    title: 'Contacts',
    description: 'Find friends already on Relay (only with your permission).',
    icon: Users,
    categoryLabel: 'Contacts',
  },
  {
    id: 'location',
    title: 'Location',
    description: 'Optional: local time, nearby channels, and region features.',
    icon: MapPin,
    categoryLabel: 'Location',
  },
  {
    id: 'device_info_consent',
    title: 'Device info',
    description: 'Help Relay optimize performance across your devices.',
    icon: Cpu,
    categoryLabel: 'Diagnostics',
  },
];

export const PermissionsView: React.FC = () => {
  const [statuses, setStatuses] = useState<Record<PermissionType, PermissionStatus>>({
    camera: 'not_requested',
    microphone: 'not_requested',
    photos_videos: 'not_requested',
    audio: 'not_requested',
    notifications: 'not_requested',
    contacts: 'not_requested',
    location: 'not_requested',
    device_info_consent: 'not_requested',
  });

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [activeRationale, setActiveRationale] = useState<PermissionItem | null>(null);

  const refreshStatuses = async () => {
    const updated: any = {};
    for (const item of PERMISSIONS_LIST) {
      updated[item.id] = await permissionManager.checkPermission(item.id);
    }
    setStatuses(updated);
    const info = await permissionManager.getDeviceInfo();
    setDeviceInfo(info);
  };

  useEffect(() => {
    refreshStatuses();
    const unsubscribe = permissionManager.subscribe(() => refreshStatuses());
    return () => unsubscribe();
  }, []);

  const handleAction = async (item: PermissionItem) => {
    if (item.id === 'device_info_consent') {
      setShowConsentModal(true);
      return;
    }
    const current = statuses[item.id];
    if (current === 'granted') return;
    setActiveRationale(item);
  };

  const confirmRequestPermission = async () => {
    if (!activeRationale) return;
    const target = activeRationale.id;
    setActiveRationale(null);
    await permissionManager.requestPermission(target);
    await refreshStatuses();
  };

  const handleAllowConsent = async () => {
    permissionManager.setDeviceInfoConsent(true);
    setShowConsentModal(false);
    await refreshStatuses();
  };

  const handleDenyConsent = async () => {
    permissionManager.setDeviceInfoConsent(false);
    setShowConsentModal(false);
    await refreshStatuses();
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white">Permissions</h3>
          <p className="text-xs text-slate-500">Relay only asks when a feature needs access.</p>
        </div>
        <GlassButton onClick={refreshStatuses} variant="secondary" className="py-1.5 px-3 text-xs shrink-0">
          Refresh
        </GlassButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PERMISSIONS_LIST.map((item) => {
          const status = statuses[item.id];
          const IconComp = item.icon;
          return (
            <GlassCard key={item.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shrink-0 shadow-xs"
                    style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
                  >
                    <IconComp size={18} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">{item.title}</h4>
                    <span className="text-[10px] text-slate-400 font-medium">{item.categoryLabel}</span>
                  </div>
                </div>

                {status === 'granted' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 shrink-0">
                    <CheckCircle2 size={12} /> On
                  </span>
                )}
                {status === 'denied' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shrink-0">
                    <AlertCircle size={12} /> Off
                  </span>
                )}
                {status === 'permanently_denied' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200 shrink-0">
                    <XCircle size={12} /> Blocked
                  </span>
                )}
                {status === 'not_requested' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 shrink-0">
                    Not set
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{item.description}</p>

              <div className="pt-1 flex items-center justify-end">
                {status === 'granted' ? (
                  <span className="text-[11px] font-semibold text-slate-400">Active</span>
                ) : status === 'permanently_denied' ? (
                  <GlassButton onClick={() => handleAction(item)} variant="secondary" className="py-1 px-3 text-[11px]">
                    <Settings size={12} /> Open Settings
                  </GlassButton>
                ) : (
                  <GlassButton onClick={() => handleAction(item)} variant="primary" className="py-1.5 px-3.5 text-[11px]">
                    Allow
                  </GlassButton>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>

      <GlassCard className="p-5 space-y-4 border-blue-200/60 bg-blue-50/20 dark:bg-blue-950/20">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Smartphone size={18} className="text-blue-600" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-white">Device diagnostics</h4>
          </div>
          {statuses.device_info_consent !== 'granted' && (
            <GlassButton onClick={() => setShowConsentModal(true)} variant="primary" className="py-1.5 px-3 text-xs">
              Configure
            </GlassButton>
          )}
        </div>

        {statuses.device_info_consent === 'granted' && deviceInfo ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 bg-white/80 dark:bg-slate-900/60 rounded-xl border border-white/60 dark:border-white/10">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Brand</span>
              <span className="font-bold text-slate-800 dark:text-white">{deviceInfo.brand}</span>
            </div>
            <div className="p-2.5 bg-white/80 dark:bg-slate-900/60 rounded-xl border border-white/60 dark:border-white/10">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">OS</span>
              <span className="font-bold text-slate-800 dark:text-white">{deviceInfo.osVersion}</span>
            </div>
            <div className="p-2.5 bg-white/80 dark:bg-slate-900/60 rounded-xl border border-white/60 dark:border-white/10">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Display</span>
              <span className="font-bold text-slate-800 dark:text-white">{deviceInfo.screenWidth}×{deviceInfo.screenHeight}</span>
            </div>
            <div className="p-2.5 bg-white/80 dark:bg-slate-900/60 rounded-xl border border-white/60 dark:border-white/10">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">App</span>
              <span className="font-bold text-slate-800 dark:text-white">v{deviceInfo.appVersion}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 leading-relaxed">
            Device diagnostics are off. Relay does not read hardware details without your consent.
          </p>
        )}
      </GlassCard>

      {activeRationale && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <GlassCard heavy className="max-w-md w-full p-6 space-y-4 text-left rounded-t-3xl sm:rounded-3xl">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
              >
                <Info size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">{activeRationale.title}</h3>
                <span className="text-[10px] text-slate-400">{activeRationale.categoryLabel}</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{activeRationale.description}</p>
            {statuses[activeRationale.id] === 'permanently_denied' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                This was blocked earlier. Open system Settings → Apps → Relay → Permissions to turn it on.
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <GlassButton onClick={() => setActiveRationale(null)} variant="secondary" className="py-2 px-4 text-xs">
                Not now
              </GlassButton>
              <GlassButton onClick={confirmRequestPermission} variant="primary" className="py-2 px-4 text-xs">
                {statuses[activeRationale.id] === 'permanently_denied' ? 'Open Settings' : 'Continue'}
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {showConsentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <GlassCard heavy className="max-w-lg w-full p-6 space-y-5 text-left rounded-t-3xl sm:rounded-3xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-3xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                <Cpu size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">Device information</h3>
                <p className="text-xs text-slate-500">Optional — improves performance and troubleshooting.</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Examples: device brand, OS version, screen size, battery state, and network type. Never your messages or media.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <GlassButton onClick={handleDenyConsent} variant="secondary" className="py-2 px-4 text-xs">
                Not now
              </GlassButton>
              <GlassButton onClick={handleAllowConsent} variant="primary" className="py-2 px-4 text-xs">
                Allow
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
