/**
 * Full-screen call UI: ringing, active, video tiles, controls.
 */
import React, { useEffect, useRef } from "react";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  X,
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
    acceptIncoming,
    declineIncoming,
    hangup,
    toggleMute,
    toggleCamera,
  } = useCallStore();

  if (phase === "idle") return null;

  const isVideo = callType === "video";
  const avatar = peerAvatar || getLetterAvatar(peerName);
  const statusLabel =
    phase === "outgoing_ringing"
      ? "Calling…"
      : phase === "incoming_ringing"
        ? "Incoming call"
        : phase === "connecting"
          ? "Connecting…"
          : phase === "active"
            ? connectionState === "connected"
              ? "Connected"
              : "Connecting…"
            : phase === "ended"
              ? "Call ended"
              : "";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex flex-col bg-slate-950 text-white"
      >
        <div className="relative flex-1 flex items-center justify-center overflow-hidden">
          {isVideo && remoteStream ? (
            <StreamVideo
              stream={remoteStream}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 z-10">
              <img
                src={avatar}
                alt={peerName}
                className="w-28 h-28 rounded-full object-cover ring-4 ring-white/20 shadow-2xl"
              />
              <div className="text-center">
                <h2 className="text-xl font-bold tracking-tight">{peerName}</h2>
                <p className="text-sm text-white/70 mt-1">{statusLabel}</p>
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
              <p className="text-xs text-white/80 drop-shadow">{statusLabel}</p>
            </div>
          )}
        </div>

        <div className="pb-10 pt-6 px-6 flex items-center justify-center gap-5 bg-gradient-to-t from-black/80 to-transparent">
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
          ) : phase === "ended" ? (
            <button
              type="button"
              onClick={() => hangup()}
              className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center"
            >
              <X size={24} />
            </button>
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
