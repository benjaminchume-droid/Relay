/**
 * App-level call host: subscribes to global incoming calls for the signed-in
 * user and mounts the full-screen CallOverlay — or, when the call is
 * minimized, a small floating pill (tap → back to the full-screen call).
 * Renders nothing when idle.
 */
import React, { useEffect, useRef } from "react";
import { Phone, PhoneOff, Mic, MicOff, ChevronUp } from "lucide-react";
import { useCallStore } from "../store/callStore";
import { useAuthStore } from "../store/authStore";
import { CallOverlay } from "../modules/calls/CallOverlay";
import { supabase } from "../lib/supabase/client";

export const GlobalCallHost: React.FC = () => {
  const { profile, currentUser } = useAuthStore();
  const {
    phase, activeCall, peerName, peerAvatar, minimized,
    muted, toggleMute, hangup, setMinimized,
    startGlobalWatch, stopGlobalWatch, setPeerMeta,
  } = useCallStore();
  const myProfileId = profile?.id || currentUser?.id || "";
  const metaForCall = useRef<string | null>(null);

  useEffect(() => {
    if (!myProfileId) return;
    startGlobalWatch(myProfileId);
    return () => stopGlobalWatch();
  }, [myProfileId]);

  // resolve caller identity for incoming calls (once per call id)
  useEffect(() => {
    if (phase !== "incoming_ringing" || !activeCall) return;
    if (metaForCall.current === activeCall.id) return;
    metaForCall.current = activeCall.id;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, full_name, username, avatar_url")
        .eq("id", activeCall.callerId)
        .maybeSingle();
      if (data) {
        const nm = data.display_name || data.full_name || (data.username ? `@${data.username}` : "Incoming call");
        setPeerMeta(nm, data.avatar_url || undefined);
      }
    })();
  }, [phase, activeCall?.id]);

  if (!myProfileId) return null;

  const showOverlay = phase !== "idle" && !minimized;
  const showPill = phase !== "idle" && phase !== "incoming_ringing" && minimized;

  return (
    <>
      {showOverlay && (
        <CallOverlay peerName={peerName || "Calling…"} peerAvatar={peerAvatar} myProfileId={myProfileId} />
      )}
      {showPill && (
        <div className="fixed z-[190] bottom-24 right-3 sm:bottom-6">
          <div className="flex items-center gap-1.5 rounded-full bg-slate-900/95 dark:bg-black/95 text-white pl-1.5 pr-1.5 py-1.5 shadow-2xl border border-white/10 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMinimized(false)}
              className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full hover:bg-white/10 active:scale-95 transition"
              title="Back to call"
            >
              <span className="relative flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse absolute -top-0.5 -right-0.5" />
                <Phone size={15} />
              </span>
              <span className="text-[12px] font-bold max-w-[110px] truncate">{peerName || "Call"}</span>
              <ChevronUp size={14} className="opacity-70" />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className={`p-2.5 rounded-full active:scale-95 transition ${muted ? "bg-white text-slate-900" : "bg-white/10"}`}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              type="button"
              onClick={() => void hangup()}
              className="p-2.5 rounded-full bg-rose-500 active:scale-95 transition"
              title="End call"
            >
              <PhoneOff size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
