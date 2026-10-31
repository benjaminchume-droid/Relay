/**
 * Call state — incoming/outgoing overlay + WebRTC + global watch.
 * WhatsApp-grade behavior: ringtone + vibration on incoming, ringback while
 * calling, missed/cancel timeouts, live duration, minimizable call, honest
 * call-log labels, ended feedback.
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
import { startIncomingRing, startOutgoingRing, stopRing, playEndBlip } from "../modules/calls/ringtone";

const RING_TIMEOUT_MS = 35000; // caller: unanswered after 35s → cancel (missed)
const INCOMING_TIMEOUT_MS = 45000; // callee: no response after 45s → decline

function labelForCall(call: RelayCall, wasActive: boolean): string {
  const kind = call.callType === "video" ? "Video" : "Voice";
  const secs = call.durationSeconds ?? 0;
  if (call.status === "declined" || call.status === "missed") return `Missed ${kind.toLowerCase()} call`;
  if (call.status === "cancelled") return `Cancelled ${kind.toLowerCase()} call`;
  if (secs >= 1) {
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${kind} call · ${m}:${s < 10 ? "0" : ""}${s}`;
  }
  if (wasActive) return `${kind} call`;
  return `Cancelled ${kind.toLowerCase()} call`;
}

async function postCallSystemMessage(call: RelayCall, wasActive: boolean) {
  try {
    await supabase.rpc("send_conversation_message", {
      p_conversation_id: call.conversationId,
      p_recipient_profile_id: null,
      p_content: labelForCall(call, wasActive),
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
  minimized: boolean;
  activeSince: number | null; // ms timestamp used for the live duration ticker
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState | null;
  peerName: string;
  peerAvatar?: string;
  _manager: WebRtcManager | null;
  _unsubConv: (() => void) | null;
  _unsubGlobal: (() => void) | null;
  _ringTimeout: ReturnType<typeof setTimeout> | null;
  _wasActive: boolean;

  watchConversation: (conversationId: string, myProfileId: string) => void;
  stopWatching: () => void;
  placeCall: (conversationId: string, callType: CallType, myProfileId: string) => Promise<void>;
  acceptIncoming: (myProfileId: string) => Promise<void>;
  declineIncoming: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  setMinimized: (v: boolean) => void;
  startGlobalWatch: (myProfileId: string) => void;
  stopGlobalWatch: () => void;
  setPeerMeta: (name: string, avatar?: string) => void;
  clearError: () => void;
}

function clearRingTimeout(s: CallState) {
  if (s._ringTimeout) {
    clearTimeout(s._ringTimeout);
  }
}

export const useCallStore = create<CallState>((set, get) => ({
  phase: "idle",
  activeCall: null,
  callType: "voice",
  error: null,
  muted: false,
  cameraOn: true,
  minimized: false,
  activeSince: null,
  localStream: null,
  remoteStream: null,
  connectionState: null,
  peerName: "",
  peerAvatar: undefined,
  _manager: null,
  _unsubConv: null,
  _unsubGlobal: null,
  _ringTimeout: null,
  _wasActive: false,

  watchConversation: (conversationId, myProfileId) => {
    get()._unsubConv?.();
    const unsub = subscribeConversationCalls(conversationId, (call) => {
      const state = get();
      if (
        call.status === "ringing" &&
        call.callerId !== myProfileId &&
        state.phase === "idle"
      ) {
        clearRingTimeout(state);
        startIncomingRing();
        const t = setTimeout(() => {
          // never answered → mark missed (matches WhatsApp auto-timeout)
          if (get().phase === "incoming_ringing" && get().activeCall?.id === call.id) {
            void get().declineIncoming();
          }
        }, INCOMING_TIMEOUT_MS);
        set({
          phase: "incoming_ringing",
          activeCall: call,
          callType: call.callType,
          _ringTimeout: t,
        });
      }
      if (
        state.activeCall?.id === call.id &&
        ["ended", "declined", "missed", "cancelled"].includes(call.status)
      ) {
        clearRingTimeout(state);
        void get()._manager?.hangup();
        stopRing();
        playEndBlip();
        set({
          phase: "ended",
          activeCall: call,
          localStream: null,
          remoteStream: null,
          connectionState: null,
          activeSince: null,
          _manager: null,
          _ringTimeout: null,
        });
        setTimeout(() => {
          if (get().phase === "ended") {
            set({ phase: "idle", activeCall: null, minimized: false });
          }
        }, 1400);
      }
      if (state.activeCall?.id === call.id && call.status === "active") {
        clearRingTimeout(state);
        stopRing();
        set({
          activeCall: call,
          phase: "active",
          activeSince: state.activeSince ?? Date.now(),
          _ringTimeout: null,
        });
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
    set({ phase: "outgoing_ringing", callType, error: null, minimized: false, _wasActive: false });
    startOutgoingRing();
    try {
      const call = await startCall(conversationId, callType);
      const manager = new WebRtcManager({
        onLocalStream: (s) => set({ localStream: s }),
        onRemoteStream: (s) => set({ remoteStream: s }),
        onConnectionState: (st) => {
          set({ connectionState: st });
          if (st === "connected") {
            const s = get();
            clearRingTimeout(s);
            stopRing();
            set({ phase: "active", activeSince: s.activeSince ?? Date.now(), _wasActive: true });
          }
          if (st === "failed") {
            set({ error: "Connection failed — call ended" });
            void get().hangup();
          }
        },
        onError: (e) => {
          set({ error: e.message });
        },
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
      // unanswered → auto-cancel and log it
      const t = setTimeout(() => {
        if (get().phase === "outgoing_ringing" && get().activeCall?.id === call.id) {
          void get().hangup();
        }
      }, RING_TIMEOUT_MS);
      set({ _ringTimeout: t });
    } catch (e: any) {
      stopRing();
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
    const s = get();
    clearRingTimeout(s);
    stopRing();
    set({ phase: "connecting", error: null, _ringTimeout: null });
    try {
      const updated = await answerCall(call.id);
      const manager = new WebRtcManager({
        onLocalStream: (st) => set({ localStream: st }),
        onRemoteStream: (st) => set({ remoteStream: st }),
        onConnectionState: (st) => {
          set({ connectionState: st });
          if (st === "connected") {
            const cur = get();
            set({ phase: "active", activeSince: cur.activeSince ?? Date.now(), _wasActive: true });
          }
          if (st === "failed") {
            set({ error: "Connection failed — call ended" });
            void get().hangup();
          }
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
      startIncomingRing();
    }
  },

  declineIncoming: async () => {
    const call = get().activeCall;
    const s = get();
    clearRingTimeout(s);
    stopRing();
    set({ _ringTimeout: null });
    try {
      if (call) await rejectCall(call.id);
    } catch {
      /* ignore */
    }
    await s._manager?.hangup();
    set({
      phase: "idle",
      activeCall: null,
      localStream: null,
      remoteStream: null,
      _manager: null,
      minimized: false,
      activeSince: null,
    });
  },

  hangup: async () => {
    const call = get().activeCall;
    const state = get();
    clearRingTimeout(state);
    stopRing();
    try {
      if (call && !["ended", "declined", "missed", "cancelled"].includes(call.status)) {
        const ended = await endCall(call.id);
        await postCallSystemMessage(ended || call, state._wasActive);
      }
    } catch {
      /* ignore */
    }
    await state._manager?.hangup();
    playEndBlip();
    set({
      phase: call && state._wasActive ? "ended" : "idle",
      activeCall: null,
      localStream: null,
      remoteStream: null,
      connectionState: null,
      _manager: null,
      muted: false,
      cameraOn: true,
      activeSince: null,
      _ringTimeout: null,
    });
    if (call && state._wasActive) {
      setTimeout(() => {
        if (get().phase === "ended") set({ phase: "idle", minimized: false });
      }, 1200);
    }
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

  setMinimized: (v: boolean) => set({ minimized: v }),

  startGlobalWatch: (myProfileId: string) => {
    get()._unsubGlobal?.();
    const unsub = subscribeGlobalIncomingCalls(
      myProfileId,
      (call) => {
        const state = get();
        if (state.phase !== "idle") return;
        startIncomingRing();
        const t = setTimeout(() => {
          if (get().phase === "incoming_ringing" && get().activeCall?.id === call.id) {
            void get().declineIncoming();
          }
        }, INCOMING_TIMEOUT_MS);
        set({
          phase: "incoming_ringing",
          activeCall: call,
          callType: call.callType,
          peerName: state.peerName || "Incoming call",
          _ringTimeout: t,
        });
      },
      (call) => {
        const state = get();
        if (state.activeCall?.id !== call.id) return;
        if (["ended", "declined", "missed", "cancelled"].includes(call.status)) {
          clearRingTimeout(state);
          void state._manager?.hangup();
          stopRing();
          playEndBlip();
          set({
            phase: "ended",
            activeCall: call,
            localStream: null,
            remoteStream: null,
            connectionState: null,
            activeSince: null,
            _manager: null,
            _ringTimeout: null,
          });
          setTimeout(() => {
            if (get().phase === "ended") set({ phase: "idle", activeCall: null, minimized: false });
          }, 1400);
        } else if (call.status === "active") {
          clearRingTimeout(state);
          stopRing();
          set({
            activeCall: call,
            phase: state.phase === "connecting" ? "connecting" : "active",
            activeSince: state.activeSince ?? Date.now(),
            _ringTimeout: null,
          });
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
