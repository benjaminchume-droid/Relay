/**
 * Lightweight WebRTC peer for 1:1 voice/video.
 * Signaling is delegated to callService (Supabase RPCs + realtime).
 */
import { postSignal, subscribeCallSignals, type CallType } from "../../services/callService";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type WebRtcHandlers = {
  onRemoteStream?: (stream: MediaStream) => void;
  onLocalStream?: (stream: MediaStream) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  onError?: (err: Error) => void;
};

export class WebRtcManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private unsubSignals: (() => void) | null = null;
  private callId: string | null = null;
  private myProfileId: string | null = null;
  private isCaller = false;
  private handlers: WebRtcHandlers = {};
  private pendingIce: RTCIceCandidateInit[] = [];

  constructor(handlers: WebRtcHandlers = {}) {
    this.handlers = handlers;
  }

  async startLocalMedia(callType: CallType): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        callType === "video"
          ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
          : false,
    };
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    this.handlers.onLocalStream?.(this.localStream);
    return this.localStream;
  }

  private ensurePeer(): RTCPeerConnection {
    if (this.pc) return this.pc;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.callId) {
        postSignal(this.callId, "ice", ev.candidate.toJSON()).catch((e) =>
          this.handlers.onError?.(e)
        );
      }
    };

    pc.ontrack = (ev) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      ev.streams[0]?.getTracks().forEach((t) => this.remoteStream!.addTrack(t));
      if (!ev.streams[0] && ev.track) {
        this.remoteStream.addTrack(ev.track);
      }
      this.handlers.onRemoteStream?.(this.remoteStream);
    };

    pc.onconnectionstatechange = () => {
      this.handlers.onConnectionState?.(pc.connectionState);
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    return pc;
  }

  async attachToCall(opts: {
    callId: string;
    myProfileId: string;
    isCaller: boolean;
    callType: CallType;
  }) {
    this.callId = opts.callId;
    this.myProfileId = opts.myProfileId;
    this.isCaller = opts.isCaller;

    if (!this.localStream) {
      await this.startLocalMedia(opts.callType);
    }

    const pc = this.ensurePeer();

    this.unsubSignals = subscribeCallSignals(opts.callId, opts.myProfileId, async (signal) => {
      try {
        if (signal.signalType === "offer" && !this.isCaller) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
          for (const c of this.pendingIce) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          this.pendingIce = [];
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await postSignal(opts.callId, "answer", answer);
        } else if (signal.signalType === "answer" && this.isCaller) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
          for (const c of this.pendingIce) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          this.pendingIce = [];
        } else if (signal.signalType === "ice") {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
          } else {
            this.pendingIce.push(signal.payload);
          }
        }
      } catch (e: any) {
        this.handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    });

    if (this.isCaller) {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: opts.callType === "video",
      });
      await pc.setLocalDescription(offer);
      await postSignal(opts.callId, "offer", offer);
    }
  }

  setMuted(muted: boolean) {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  setCameraEnabled(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }

  async hangup() {
    this.unsubSignals?.();
    this.unsubSignals = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.remoteStream = null;
    this.pc?.close();
    this.pc = null;
    this.callId = null;
    this.pendingIce = [];
  }
}
