/**
 * App-level call host: subscribes to global incoming calls for the signed-in
 * user and mounts the full-screen CallOverlay. Renders nothing when idle.
 */
import React, { useEffect, useRef } from "react";
import { useCallStore } from "../store/callStore";
import { useAuthStore } from "../store/authStore";
import { CallOverlay } from "../modules/calls/CallOverlay";
import { supabase } from "../lib/supabase/client";

export const GlobalCallHost: React.FC = () => {
  const { profile, currentUser } = useAuthStore();
  const { phase, activeCall, peerName, peerAvatar, startGlobalWatch, stopGlobalWatch, setPeerMeta } = useCallStore();
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
  return <CallOverlay peerName={peerName || "Calling…"} peerAvatar={peerAvatar} myProfileId={myProfileId} />;
};
