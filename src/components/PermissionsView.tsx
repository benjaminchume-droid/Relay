/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Camera, Mic, Image, Music, Bell, Users, MapPin, Cpu, CheckCircle2, XCircle, AlertCircle, Settings, ShieldAlert, ChevronRight, Smartphone, Info
} from 'lucide-react';
import { GlassCard, GlassButton } from './GlassUI';
import { permissionManager, PermissionType, PermissionStatus, DeviceInfo } from '../services/permissionManager';

interface PermissionItem {
  id: PermissionType;
  title: string;
  description: string;
  icon: React.FC<{ size?: number; className?: string }>;
  runtimeAndroid: string;
}

const PERMISSIONS_LIST: PermissionItem[] = [
  {
    id: 'camera',
    title: 'Camera Access',
    description: 'Capture photos, video stories, and host video calls in Relay.',
    icon: Camera,
    runtimeAndroid: 'android.permission.CAMERA'
  },
  {
    id: 'microphone',
    title: 'Microphone & Audio Recording',
    description: 'Send voice notes, conduct crystal-clear calls, and group voice spaces.',
    icon: Mic,
    runtimeAndroid: 'android.permission.RECORD_AUDIO'
  },
  {
    id: 'photos_videos',
    title: 'Photos & Videos',
    description: 'Pick and share media files, custom wallpapers, and stories.',
    icon: Image,
    runtimeAndroid: 'android.permission.READ_MEDIA_IMAGES'
  },
  {
    id: 'audio',
    title: 'Audio Files & Voice Documents',
    description: 'Upload audio clips, music tracks, and voice notes.',
    icon: Music,
    runtimeAndroid: 'android.permission.READ_MEDIA_AUDIO'
  },
  {
    id: 'notifications',
    title: 'Push Notifications',
    description: 'Receive immediate alerts for direct messages, mentions, and calls.',
    icon: Bell,
    runtimeAndroid: 'android.permission.POST_NOTIFICATIONS'
  },
  {
    id: 'contacts',
    title: 'Contacts Directory',
    description: 'Discover friends on Relay and import contact lists with consent.',
    icon: Users,
    runtimeAndroid: 'android.permission.READ_CONTACTS'
  },
  {
    id: 'location',
    title: 'Location & IP Sensing',
    description: 'Detect region, local time zone, weather, and near-me channels via IP & GPS.',
    icon: MapPin,
    runtimeAndroid: 'android.permission.ACCESS_FINE_LOCATION'
  },
  {
    id: 'device_info_consent',
    title: 'Device Information Consent',
    description: 'Allow Relay to optimize performance, hardware acceleration, and sync.',
    icon: Cpu,
    runtimeAndroid: 'Consent-based Telemetry & Optimization'
  }
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
    device_info_consent: 'not_requested'
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

    if (current === 'permanently_denied') {
      setActiveRationale(item);
      return;
    }

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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">Permissions & Device Access</h3>
          <p className="text-xs text-slate-500">Manage Android runtime permissions and system access just-in-time.</p>
        </div>
        <GlassButton onClick={refreshStatuses} variant="secondary" className="py-1.5 px-3 text-xs">
          Refresh Status
        </GlassButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {PERMISSIONS_LIST.map((item) => {
          const status = statuses[item.id];
          const IconComp = item.icon;

          return (
            <GlassCard key={item.id} className="p-4 space-y-3 relative overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <IconComp size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{item.title}</h4>
                    <span className="text-[10px] text-slate-400 font-mono block">{item.runtimeAndroid}</span>
                  </div>
                </div>

                {status === 'granted' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 size={12} /> Granted
                  </span>
                )}
                {status === 'denied' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    <AlertCircle size={12} /> Denied
                  </span>
                )}
                {status === 'permanently_denied' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                    <XCircle size={12} /> Blocked
                  </span>
                )}
                {status === 'not_requested' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    Not Requested
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>

              <div className="pt-1 flex items-center justify-end">
                {status === 'granted' ? (
                  <button 
                    disabled
                    className="text-[11px] font-semibold text-slate-400 cursor-not-allowed flex items-center gap-1"
                  >
                    Active
                  </button>
                ) : status === 'permanently_denied' ? (
                  <GlassButton onClick={() => handleAction(item)} variant="secondary" className="py-1 px-3 text-[11px]">
                    <Settings size={12} /> Open Settings
                  </GlassButton>
                ) : (
                  <GlassButton onClick={() => handleAction(item)} variant="primary" className="py-1.5 px-3.5 text-[11px]">
                    Grant Access
                  </GlassButton>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Device Telemetry Card */}
      <GlassCard className="p-5 space-y-4 border-blue-200/60 bg-blue-50/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone size={18} className="text-blue-600" />
            <h4 className="text-xs font-bold text-slate-800">Hardware & Telemetry Data</h4>
          </div>
          {statuses.device_info_consent !== 'granted' && (
            <GlassButton onClick={() => setShowConsentModal(true)} variant="primary" className="py-1.5 px-3 text-xs">
              Configure Consent
            </GlassButton>
          )}
        </div>

        {statuses.device_info_consent === 'granted' && deviceInfo ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 bg-white/80 rounded-xl border border-white">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Device Brand</span>
              <span className="font-bold text-slate-800">{deviceInfo.brand}</span>
            </div>
            <div className="p-2.5 bg-white/80 rounded-xl border border-white">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">OS Version</span>
              <span className="font-bold text-slate-800">{deviceInfo.osVersion}</span>
            </div>
            <div className="p-2.5 bg-white/80 rounded-xl border border-white">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Display Matrix</span>
              <span className="font-bold text-slate-800">{deviceInfo.screenWidth}x{deviceInfo.screenHeight} ({deviceInfo.densityPixelRatio}x)</span>
            </div>
            <div className="p-2.5 bg-white/80 rounded-xl border border-white">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Processor Cores</span>
              <span className="font-bold text-slate-800">{deviceInfo.cpuCores} Cores</span>
            </div>
            <div className="p-2.5 bg-white/80 rounded-xl border border-white">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Network Protocol</span>
              <span className="font-bold text-slate-800 uppercase">{deviceInfo.networkType}</span>
            </div>
            <div className="p-2.5 bg-white/80 rounded-xl border border-white">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Battery Status</span>
              <span className="font-bold text-slate-800">{deviceInfo.batteryLevel !== undefined ? `${deviceInfo.batteryLevel}%` : 'Standard'} {deviceInfo.isCharging ? '(Charging)' : ''}</span>
            </div>
            <div className="p-2.5 bg-white/80 rounded-xl border border-white">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Timezone / Locale</span>
              <span className="font-bold text-slate-800">{deviceInfo.timeZone}</span>
            </div>
            <div className="p-2.5 bg-white/80 rounded-xl border border-white">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Relay Build</span>
              <span className="font-bold text-slate-800">v{deviceInfo.appVersion} ({deviceInfo.buildNumber})</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 leading-relaxed">
            Device Information consent is currently not granted. Relay does not access hardware specs or system metrics without your permission.
          </p>
        )}
      </GlassCard>

      {/* Permission Rationale Modal */}
      {activeRationale && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <GlassCard heavy className="max-w-md w-full p-6 space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Info size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">{activeRationale.title}</h3>
                <span className="text-[10px] font-mono text-slate-400 block">{activeRationale.runtimeAndroid}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {activeRationale.description}
            </p>

            {statuses[activeRationale.id] === 'permanently_denied' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                This permission was previously blocked. Please navigate to Android System Settings &gt; Apps &gt; RELAY &gt; Permissions to enable it manually.
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <GlassButton onClick={() => setActiveRationale(null)} variant="secondary" className="py-2 px-4 text-xs">
                Not Now
              </GlassButton>
              <GlassButton onClick={confirmRequestPermission} variant="primary" className="py-2 px-4 text-xs">
                {statuses[activeRationale.id] === 'permanently_denied' ? 'Open App Settings' : 'Continue'}
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Device Info Consent Modal */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <GlassCard heavy className="max-w-lg w-full p-6 space-y-5 text-left">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-3xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                <Cpu size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Device Information</h3>
                <p className="text-xs text-slate-500">Help Relay optimize your experience across devices.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Relay can collect basic information about your device to improve performance, troubleshoot issues, synchronize your account across devices, and provide the best possible experience.
            </p>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-[11px] text-slate-600">
              <span className="font-bold text-slate-800 block">Examples of telemetry metrics:</span>
              <ul className="list-disc list-inside space-y-0.5 text-slate-500">
                <li>Manufacturer, model, and OS version</li>
                <li>Screen resolution, density ratio, and refresh rate</li>
                <li>Available memory class, CPU core count, and battery state</li>
                <li>Network connection type and region locale</li>
              </ul>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800 font-medium">
              Relay does <strong>not</strong> access your personal photos, messages, contacts, microphone, camera, or location without your separate permission.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <GlassButton onClick={handleDenyConsent} variant="secondary" className="py-2 px-4 text-xs">
                Not Now
              </GlassButton>
              <GlassButton onClick={handleAllowConsent} variant="primary" className="py-2 px-4 text-xs">
                Allow Access
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
