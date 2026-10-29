/**
 * Phase 2/4 call state — incoming/outgoing overlay + WebRTC + global watch.
 */
import { create } from "zustand";
import {
  startCall,
  answerCall,
  rejectCall,
  endCall,
  subscribeConversationCalls,
  subscribeGlobalIncomingCalls,
  type CallType,
  type RelayCall,
} from "../services/callService";
import { WebRtcManager } from "../modules/calls/webrtcManager";
import { supabase } from "../lib/supabase/client";

async function postCallSystemMessage(call: RelayCall) {
  try {
    const label =
      call.status === "declined" || call.status === "missed"
        ? `Missed ${call.callType} call`
        : call.durationSeconds
          ? `${call.callType === "video" ? "Video" : "Voice"} call · ${Math.max(1, Math.round(call.durationSeconds / 60))} min`
          : `${call.callType === "video" ? "Video" : "Voice"} call`;
    await supabase.rpc("send_conversation_message", {
      p_conversation_id: call.conversationId,
      p_recipient_profile_id: null,
      p_content: label,
      p_message_type: "system",
      p_reply_to_message_id: null,
      p_media_url: null,
      p_file_name: null,
      p_is_forwarded: false,
    });
  } catch (e) {
    console.warn("[call system message]", e);
  }
}

type CallPhase =
  | "idle"
  | "outgoing_ringing"
  | "incoming_ringing"
  | "connecting"
  | "active"
  | "ended";

interface CallState {
  phase: CallPhase;
  activeCall: RelayCall | null;
  callType: CallType;
  error: string | null;
  muted: boolean;
  cameraOn: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState | null;
  peerName: string;
  peerAvatar?: string;
  _manager: WebRtcManager | null;
  _unsubConv: (() => void) | null;
  _unsubGlobal: (() => void) | null;

  watchConversation: (conversationId: string, myProfileId: string) => void;
  stopWatching: () => void;
  placeCall: (conversationId: string, callType: CallType, myProfileId: string) => Promise<void>;
  acceptIncoming: (myProfileId: string) => Promise<void>;
  declineIncoming: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  startGlobalWatch: (myProfileId: string) => void;
  stopGlobalWatch: () => void;
  setPeerMeta: (name: string, avatar?: string) => void;
  clearError: () => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  phase: "idle",
  activeCall: null,
  callType: "voice",
  error: null,
  muted: false,
  cameraOn: true,
  localStream: null,
  remoteStream: null,
  connectionState: null,
  peerName: "",
  peerAvatar: undefined,
  _manager: null,
  _unsubConv: null,
  _unsubGlobal: null,

  watchConversation: (conversationId, myProfileId) => {
    get()._unsubConv?.();
    const unsub = subscribeConversationCalls(conversationId, (call) => {
      const state = get();
      if (
        call.status === "ringing" &&
        call.callerId !== myProfileId &&
        state.phase === "idle"
      ) {
        set({
          phase: "incoming_ringing",
          activeCall: call,
          callType: call.callType,
        });
      }
      if (
        state.activeCall?.id === call.id &&
        ["ended", "declined", "missed", "cancelled"].includes(call.status)
      ) {
        get()._manager?.hangup();
        set({
          phase: "ended",
          activeCall: call,
          localStream: null,
          remoteStream: null,
          connectionState: null,
          _manager: null,
        });
        setTimeout(() => {
          if (get().phase === "ended") {
            set({ phase: "idle", activeCall: null });
          }
        }, 1500);
      }
      if (state.activeCall?.id === call.id && call.status === "active") {
        set({ activeCall: call, phase: "active" });
      }
    });
    set({ _unsubConv: unsub });
  },

  stopWatching: () => {
    get()._unsubConv?.();
    set({ _unsubConv: null });
  },

  placeCall: async (conversationId, callType, myProfileId) => {
    if (get().phase !== "idle") return;
    set({ phase: "outgoing_ringing", callType, error: null });
    try {
      const call = await startCall(conversationId, callType);
      const manager = new WebRtcManager({
        onLocalStream: (s) => set({ localStream: s }),
        onRemoteStream: (s) => set({ remoteStream: s }),
        onConnectionState: (st) => {
          set({ connectionState: st });
          if (st === "connected") set({ phase: "active" });
          if (st === "failed" || st === "disconnected") {
            set({ error: "Connection lost" });
          }
        },
        onError: (e) => set({ error: e.message }),
      });
      await manager.startLocalMedia(callType);
      await manager.attachToCall({
        callId: call.id,
        myProfileId,
        isCaller: true,
        callType,
      });
      set({
        activeCall: call,
        _manager: manager,
        localStream: manager.getLocalStream(),
        phase: "outgoing_ringing",
      });
    } catch (e: any) {
      set({
        phase: "idle",
        error: e.message || "Failed to start call",
        activeCall: null,
      });
    }
  },

  acceptIncoming: async (myProfileId) => {
    const call = get().activeCall;
    if (!call) return;
    set({ phase: "connecting", error: null });
    try {
      const updated = await answerCall(call.id);
      const manager = new WebRtcManager({
        onLocalStream: (s) => set({ localStream: s }),
        onRemoteStream: (s) => set({ remoteStream: s }),
        onConnectionState: (st) => {
          set({ connectionState: st });
          if (st === "connected") set({ phase: "active" });
        },
        onError: (e) => set({ error: e.message }),
      });
      await manager.startLocalMedia(call.callType);
      await manager.attachToCall({
        callId: call.id,
        myProfileId,
        isCaller: false,
        callType: call.callType,
      });
      set({
        activeCall: updated,
        _manager: manager,
        localStream: manager.getLocalStream(),
        phase: "connecting",
        cameraOn: call.callType === "video",
      });
    } catch (e: any) {
      set({ error: e.message || "Failed to answer", phase: "incoming_ringing" });
    }
  },

  declineIncoming: async () => {
    const call = get().activeCall;
    if (!call) return;
    try {
      await rejectCall(call.id);
    } catch {
      /* ignore */
    }
    await get()._manager?.hangup();
    set({
      phase: "idle",
      activeCall: null,
      localStream: null,
      remoteStream: null,
      _manager: null,
    });
  },

  hangup: async () => {
    const call = get().activeCall;
    try {
      if (call && !["ended", "declined", "missed", "cancelled"].includes(call.status)) {
        const ended = await endCall(call.id);
        await postCallSystemMessage(ended || call);
      }
    } catch {
      /* ignore */
    }
    await get()._manager?.hangup();
    set({
      phase: "idle",
      activeCall: null,
      localStream: null,
      remoteStream: null,
      connectionState: null,
      _manager: null,
      muted: false,
      cameraOn: true,
    });
  },

  toggleMute: () => {
    const next = !get().muted;
    get()._manager?.setMuted(next);
    set({ muted: next });
  },

  toggleCamera: () => {
    const next = !get().cameraOn;
    get()._manager?.setCameraEnabled(next);
    set({ cameraOn: next });
  },

  startGlobalWatch: (myProfileId: string) => {
    get()._unsubGlobal?.();
    const unsub = subscribeGlobalIncomingCalls(
      myProfileId,
      (call) => {
        const state = get();
        if (state.phase !== "idle") return;
        set({
          phase: "incoming_ringing",
          activeCall: call,
          callType: call.callType,
          peerName: state.peerName || "Incoming call",
        });
      },
      (call) => {
        const state = get();
        if (state.activeCall?.id !== call.id) return;
        if (["ended", "declined", "missed", "cancelled"].includes(call.status)) {
          get()._manager?.hangup();
          set({
            phase: "ended",
            activeCall: call,
            localStream: null,
            remoteStream: null,
            connectionState: null,
            _manager: null,
          });
          setTimeout(() => {
            if (get().phase === "ended") set({ phase: "idle", activeCall: null });
          }, 1500);
        } else if (call.status === "active") {
          set({ activeCall: call, phase: state.phase === "connecting" ? "connecting" : "active" });
        }
      }
    );
    set({ _unsubGlobal: unsub });
  },

  stopGlobalWatch: () => {
    get()._unsubGlobal?.();
    set({ _unsubGlobal: null });
  },

  setPeerMeta: (name: string, avatar?: string) => set({ peerName: name, peerAvatar: avatar }),

  clearError: () => set({ error: null }),
}));
