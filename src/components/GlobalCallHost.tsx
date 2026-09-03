/**
 * Phase 4: App-level incoming/active call host.
 * Shows CallOverlay even when user is not inside that chat.
 */
import React, { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { useCallStore } from "../store/callStore";
import { CallOverlay } from "../modules/calls/CallOverlay";
import { profileCache } from "../services/profileCache";
import { supabase } from "../lib/supabase/client";

export const GlobalCallHost: React.FC = () => {
  const { profile, currentUser } = useAuthStore();
  const {
    phase,
    activeCall,
    peerName,
    peerAvatar,
    startGlobalWatch,
    stopGlobalWatch,
    setPeerMeta,
  } = useCallStore();

  const myProfileId = profile?.id || currentUser?.id || "";

  useEffect(() => {
    if (!myProfileId) return;
    startGlobalWatch(myProfileId);
    return () => stopGlobalWatch();
  }, [myProfileId]);

  useEffect(() => {
    if (!activeCall || phase === "idle") return;
    const otherId =
      activeCall.callerId !== myProfileId
        ? activeCall.callerId
        : activeCall.answeredBy || "";
    if (!otherId) return;

    const cached = profileCache.get(otherId);
    if (cached) {
      setPeerMeta(cached.name || cached.username || "Relay user", cached.avatarUrl);
      return;
    }

    supabase
      .from("profiles")
      .select("display_name, full_name, username, avatar_url")
      .or(`id.eq.${otherId},auth_user_id.eq.${otherId}`)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPeerMeta(
            data.display_name || data.full_name || data.username || "Relay user",
            data.avatar_url || undefined
          );
        }
      });
  }, [activeCall?.id, phase, myProfileId]);

  if (phase === "idle" || !myProfileId) return null;

  return (
    <CallOverlay
      peerName={peerName || "Relay user"}
      peerAvatar={peerAvatar}
      myProfileId={myProfileId}
    />
  );
};
