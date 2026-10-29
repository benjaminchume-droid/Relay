/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { relayRealtimeService } from './RelayRealtimeService';
import { ConnectionState, UserPresenceState, FeatureKey } from './types';
import { useAuthStore } from '../../store/authStore';

export function useRelayRealtime() {
  const { currentUser, isAuthenticated } = useAuthStore();
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    relayRealtimeService.connectionManager.getState()
  );
  const [presences, setPresences] = useState<Map<string, UserPresenceState>>(
    relayRealtimeService.presenceManager.getActivePresences()
  );

  // Initialize and authenticate Realtime Service when user logs in / app loads
  useEffect(() => {
    relayRealtimeService.initialize();

    if (isAuthenticated && currentUser) {
      relayRealtimeService.authenticate(
        currentUser.id,
        currentUser.name || currentUser.username,
        currentUser.avatarUrl
      );
    } else {
      relayRealtimeService.logout();
    }
  }, [isAuthenticated, currentUser?.id, currentUser?.name, currentUser?.avatarUrl]);

  // Subscribe to connection state changes
  useEffect(() => {
    const unsubscribeConnection = relayRealtimeService.connectionManager.subscribeState(
      (newState) => {
        setConnectionState(newState);
      }
    );

    const unsubscribePresence = relayRealtimeService.presenceManager.subscribe(
      (updatedPresences) => {
        setPresences(updatedPresences);
      }
    );

    return () => {
      unsubscribeConnection();
      unsubscribePresence();
    };
  }, []);

  // Helpers for UI
  const setTyping = useCallback((chatId: string, isTyping: boolean = true) => {
    relayRealtimeService.presenceManager.setTyping(chatId, isTyping);
    relayRealtimeService.broadcastManager.sendTypingSignal(chatId, isTyping);
  }, []);

  const setRecordingVoice = useCallback((chatId: string, isRecording: boolean = true) => {
    relayRealtimeService.presenceManager.setRecordingVoice(chatId, isRecording);
    relayRealtimeService.broadcastManager.sendVoiceRecordingSignal(chatId, isRecording);
  }, []);

  const setUploadingMedia = useCallback((assetId: string, isUploading: boolean = true) => {
    relayRealtimeService.presenceManager.setUploadingMedia(assetId, isUploading);
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'Connected',
    presences,
    getUserPresence: (userId: string) => presences.get(userId),
    
    // Core Service
    service: relayRealtimeService,

    // Feature Subscriptions
    subscriptions: relayRealtimeService.featureSubscriptionManager,
    
    // Broadcasts
    broadcast: relayRealtimeService.broadcastManager,

    // Presence
    presence: relayRealtimeService.presenceManager,
    setTyping,
    setRecordingVoice,
    setUploadingMedia,
  };
}
