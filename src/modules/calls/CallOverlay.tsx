/**
 * Full-screen call UI — WhatsApp-style: big avatar + name + live status
 * (Calling… / Ringing… / Connecting… / live timer), mute/camera/hangup while
 * active, minimize-to-banner while in a chat. Sounds come from the call store
 * (ringtone.ts).
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useCallStore } from "../../store/callStore";
import { getLetterAvatar } from "../../lib/avatar";

type Props = {
  peerName: string;
  peerAvatar?: string;
  myProfileId: string;
};

function StreamVideo({
  stream,
  muted,
  mirror,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  if (!stream) return null;
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`${className || ""} ${mirror ? "scale-x-[-1]" : ""}`}
    />
  );
}

function useElapsed(activeSince: number | null, running: boolean): string {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [running]);
  if (!activeSince) return "0:00";
  const s = Math.max(0, Math.floor((Date.now() - activeSince) / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export const CallOverlay: React.FC<Props> = ({
  peerName,
  peerAvatar,
  myProfileId,
}) => {
  const {
    phase,
    callType,
    muted,
    cameraOn,
    localStream,
    remoteStream,
    connectionState,
    error,
    activeSince,
    acceptIncoming,
    declineIncoming,
    hangup,
    toggleMute,
    toggleCamera,
    setMinimized,
  } = useCallStore();

  const isVideo = callType === "video";
  const avatar = peerAvatar || getLetterAvatar(peerName);
  const live = phase === "active" && connectionState === "connected" && !!activeSince;
  const elapsed = useElapsed(activeSince, live);

  if (phase === "idle" || phase === "ended") {
    return phase === "ended" ? (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 backdrop-blur-sm pointer-events-none">
        <p className="text-sm font-semibold text-white/90 bg-white/10 px-4 py-2 rounded-full">Call ended</p>
      </div>
    ) : null;
  }

  const statusLabel =
    phase === "outgoing_ringing"
      ? "Ringing…"
      : phase === "incoming_ringing"
        ? isVideo ? "Incoming video call" : "Incoming voice call"
        : phase === "connecting"
          ? "Connecting…"
          : phase === "active"
            ? live ? elapsed : "Connecting…"
            : "";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex flex-col bg-slate-950 text-white"
      >
        {/* subtle glow backdrop */}
        <div
          className="absolute inset-0 opacity-60 pointer-events-none"
          style={{ background: "radial-gradient(80% 60% at 50% 20%, color-mix(in srgb, var(--primary-accent, #2563EB) 22%, transparent) 0%, transparent 65%), radial-gradient(70% 50% at 50% 100%, rgba(15,23,42,0.9) 0%, transparent 70%)" }}
        />

        <div className="relative flex-1 flex items-center justify-center overflow-hidden">
          {isVideo && remoteStream ? (
            <StreamVideo
              stream={remoteStream}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 z-10">
              <div className="relative">
                {phase !== "active" && (
                  <span className="absolute inset-0 rounded-full animate-ping bg-white/10" style={{ animationDuration: "1.8s" }} />
                )}
                <img
                  src={avatar}
                  alt={peerName}
                  className="relative w-28 h-28 rounded-full object-cover ring-4 ring-white/20 shadow-2xl"
                />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold tracking-tight">{peerName}</h2>
                <p className={`text-sm mt-1 ${live ? "font-mono tabular-nums text-white/90" : "text-white/70"}`}>{statusLabel}</p>
                {error && (
                  <p className="text-xs text-rose-400 mt-2 max-w-xs px-4">{error}</p>
                )}
              </div>
            </div>
          )}

          {isVideo && localStream && phase !== "incoming_ringing" && (
            <div className="absolute top-4 right-4 w-28 h-40 rounded-2xl overflow-hidden border border-white/30 shadow-xl bg-slate-900">
              <StreamVideo
                stream={localStream}
                muted
                mirror
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {isVideo && remoteStream && (
            <div className="absolute top-6 left-0 right-0 text-center z-10 pointer-events-none">
              <p className="text-sm font-semibold drop-shadow-lg">{peerName}</p>
              <p className={`text-xs text-white/80 drop-shadow ${live ? "font-mono tabular-nums" : ""}`}>{statusLabel}</p>
            </div>
          )}
        </div>

        {/* minimize — WhatsApp-style: keep the call alive in a banner */}
        {phase !== "incoming_ringing" && (
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="absolute top-4 left-4 z-10 p-2.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition"
            aria-label="Minimize call"
            title="Back to chat"
          >
            <ChevronDown size={20} />
          </button>
        )}

        <div className="relative pb-10 pt-6 px-6 flex items-center justify-center gap-5 bg-gradient-to-t from-black/80 to-transparent">
          {phase === "incoming_ringing" ? (
            <>
              <button
                type="button"
                onClick={() => declineIncoming()}
                className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center shadow-lg active:scale-95 transition"
                title="Decline"
              >
                <PhoneOff size={28} />
              </button>
              <button
                type="button"
                onClick={() => acceptIncoming(myProfileId)}
                className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg active:scale-95 transition"
                title="Accept"
              >
                {isVideo ? <Video size={28} /> : <Phone size={28} />}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-md active:scale-95 transition ${
                  muted ? "bg-white text-slate-900" : "bg-white/15 text-white"
                }`}
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>

              {isVideo && (
                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`w-14 h-14 rounded-full flex items-center justify-center shadow-md active:scale-95 transition ${
                    !cameraOn ? "bg-white text-slate-900" : "bg-white/15 text-white"
                  }`}
                  title={cameraOn ? "Camera off" : "Camera on"}
                >
                  {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
                </button>
              )}

              <button
                type="button"
                onClick={() => hangup()}
                className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center shadow-lg active:scale-95 transition"
                title="Hang up"
              >
                <PhoneOff size={28} />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
