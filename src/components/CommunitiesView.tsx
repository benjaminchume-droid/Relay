/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Communities — Discord-style: server rail, channel sidebar (text + voice),
 * tap the community top bar → full settings screen (NOT a popup), plus icon →
 * create channel sheet. Text channels open the shared E2EE ChatConversationScreen.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Hash, Volume2, Settings, ChevronLeft, Users, Copy, LogOut, Trash2,
  UserPlus, X, Mic, Shield, Crown, Check, Megaphone, Link2, Search, ArrowLeft,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useCommunityStore } from "../store/communityStore";
import { supabase } from "../lib/supabase/client";
import { getLetterAvatar } from "../lib/avatar";
import { AmbientLiquidBackground, GlassButton, LiquidPanel } from "./GlassUI";
import { CommunitySettingsScreen } from "./CommunitySettingsScreen";
import {
  listChannels, ensureChannelConversation, setVoicePresence, fetchVoiceOccupants,
  type CommunityChannel,
} from "../services/communityChannels";

type Props = {
  onOpenCreateCommunityModal: () => void;
  onCommunityChatStateChange: (isOpen: boolean) => void;
  onOpenChannelChat: (conversationId: string, channelName: string) => void;
};

export const CommunitiesView: React.FC<Props> = ({
  onOpenCreateCommunityModal,
  onCommunityChatStateChange,
  onOpenChannelChat,
}) => {
  const { profile, currentUser } = useAuthStore();
  const myProfileId = (profile as any)?.id || (currentUser as any)?.id || "";
  const { communities, fetchCommunities, joinCommunity, isLoading, error } = useCommunityStore();

  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "voice">("text");
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [voiceOccupants, setVoiceOccupants] = useState<Record<string, number>>({});
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const myCommunities = useMemo(() => communities.filter((c) => c.isJoined), [communities]);
  const discover = useMemo(() => {
    const q = discoverQuery.trim().toLowerCase();
    return communities.filter((c) => !c.isJoined && (!q || c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q)));
  }, [communities, discoverQuery]);
  const activeCommunity = communities.find((c) => c.id === activeCommunityId) || null;

  useEffect(() => { void fetchCommunities(); }, []);

  useEffect(() => { onCommunityChatStateChange(showSettings); }, [showSettings]);

  const loadChannels = useCallback(async (communityId: string) => {
    try {
      setChannels(await listChannels(communityId));
    } catch (e: any) {
      setChannelError(e?.message || "Failed to load channels");
    }
  }, []);

  useEffect(() => {
    if (!activeCommunityId) { setChannels([]); return; }
    void loadChannels(activeCommunityId);
  }, [activeCommunityId, loadChannels]);

  // live voice occupancy per channel
  useEffect(() => {
    if (!activeCommunityId) return;
    let alive = true;
    const tick = async () => {
      const counts: Record<string, number> = {};
      for (const ch of channels.filter((c) => c.channelType === "voice")) {
        try { counts[ch.id] = (await fetchVoiceOccupants(activeCommunityId, ch.id)).length; } catch { /* noop */ }
      }
      if (alive) setVoiceOccupants(counts);
    };
    void tick();
    const iv = setInterval(tick, 20000);
    return () => { alive = false; clearInterval(iv); };
  }, [activeCommunityId, channels]);

  const openTextChannel = async (ch: CommunityChannel) => {
    try {
      const convId = await ensureChannelConversation(ch.id);
      onOpenChannelChat(convId, ch.name);
    } catch (e: any) {
      setChannelError(e?.message || "Failed to open channel");
    }
  };

  const joinVoiceChannel = async (ch: CommunityChannel) => {
    try {
      await setVoicePresence(ch.communityId, ch.id);
      // v1 voice room: occupancy is live; actual multi-party audio rides the
      // calling engine — open the room screen via the call host
      const convId = await ensureChannelConversation(ch.id);
      onOpenChannelChat(convId, `${ch.name} (voice)`);
    } catch (e: any) {
      setChannelError(e?.message || "Failed to join voice channel");
    }
  };

  const handleCreateChannel = async () => {
    if (!activeCommunityId || !newChannelName.trim() || creatingChannel) return;
    setCreatingChannel(true); setChannelError(null);
    try {
      const { createChannel } = await import("../services/communityChannels");
      await createChannel(activeCommunityId, newChannelName.trim(), newChannelType);
      setNewChannelName(""); setNewChannelType("text");
      setShowCreateChannel(false);
      await loadChannels(activeCommunityId);
    } catch (e: any) {
      setChannelError(e?.message || "Failed to create channel");
    } finally { setCreatingChannel(false); }
  };

  const handleJoin = async (id: string) => {
    setJoiningId(id);
    try {
      await joinCommunity(id);
      setActiveCommunityId(id);
    } catch { /* store sets error */ }
    finally { setJoiningId(null); }
  };

  if (showSettings && activeCommunityId) {
    return (
      <CommunitySettingsScreen
        communityId={activeCommunityId}
        onBack={() => setShowSettings(false)}
        onLeftCommunity={() => { setShowSettings(false); setActiveCommunityId(null); void fetchCommunities(); }}
      />
    );
  }

  // ---------------- inside a community: channel sidebar ----------------
  if (activeCommunity) {
    const textChannels = channels.filter((c) => c.channelType === "text");
    const voiceChannels = channels.filter((c) => c.channelType === "voice");
    return (
      <div className="w-full app-h flex flex-col relative overflow-hidden bg-slate-50 dark:bg-black">
        <AmbientLiquidBackground />
        {/* top bar — TAP opens the full settings screen */}
        <LiquidPanel as="header" className="w-full shrink-0 z-20 !rounded-none border-b border-slate-200/60 dark:border-white/10 px-2 flex items-center gap-2 bg-white/70 dark:bg-black/60 backdrop-blur-xl" style={{ borderRadius: 0 }}>
          <button type="button" onClick={() => setActiveCommunityId(null)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10"><ChevronLeft size={20} /></button>
          <button type="button" onClick={() => setShowSettings(true)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left py-2">
            <img src={activeCommunity.avatarUrl || getLetterAvatar(activeCommunity.name)} alt="" className="w-8 h-8 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold truncate text-slate-900 dark:text-white">{activeCommunity.name}</h2>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{activeCommunity.memberCount ?? myCommunities.length} members · tap for settings</span>
            </div>
            <Settings size={16} className="text-slate-400 shrink-0" />
          </button>
          <button type="button" onClick={() => setShowCreateChannel(true)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-[var(--primary-accent,#2563EB)]" aria-label="Create channel"><Plus size={20} /></button>
        </LiquidPanel>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3" style={{ overscrollBehavior: "contain" }}>
          {channelError && <div className="mb-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-[11px] text-red-600 dark:text-red-300 font-medium">{channelError}</div>}

          <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5"><Megaphone size={11} /> Text channels</p>
          <div className="space-y-0.5 mb-4">
            {textChannels.map((ch) => (
              <button key={ch.id} type="button" onClick={() => openTextChannel(ch)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group">
                {ch.name === "announcements" ? <Megaphone size={15} className="text-slate-400 shrink-0" /> : <Hash size={15} className="text-slate-400 shrink-0" />}
                <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 flex-1 text-left truncate">{ch.name}</span>
                {ch.isDefault && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-300 font-bold">default</span>}
              </button>
            ))}
            {textChannels.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No text channels yet</p>}
          </div>

          <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5"><Volume2 size={11} /> Voice channels</p>
          <div className="space-y-0.5 mb-4">
            {voiceChannels.map((ch) => (
              <button key={ch.id} type="button" onClick={() => joinVoiceChannel(ch)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                <Volume2 size={15} className="text-slate-400 shrink-0" />
                <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 flex-1 text-left truncate">{ch.name}</span>
                {(voiceOccupants[ch.id] || 0) > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {voiceOccupants[ch.id]}
                  </span>
                )}
              </button>
            ))}
            {voiceChannels.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No voice channels yet — create one with +</p>}
          </div>
        </div>

        {/* create channel sheet */}
        {showCreateChannel && (
          <div className="absolute inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateChannel(false)}>
            <LiquidPanel onClick={(e: any) => e.stopPropagation()} className="w-full sm:max-w-sm m-3 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Create channel</h3>
                <button type="button" onClick={() => setShowCreateChannel(false)} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10"><X size={16} /></button>
              </div>
              <div className="flex gap-2 mb-3">
                {(["text", "voice"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setNewChannelType(t)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${newChannelType === t
                      ? "text-white border-transparent"
                      : "text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5"}`}
                    style={newChannelType === t ? { backgroundColor: "var(--primary-accent, #2563EB)" } : {}}>
                    {t === "text" ? <Hash size={14} /> : <Volume2 size={14} />} {t === "text" ? "Text" : "Voice"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 mb-2">
                {newChannelType === "text" ? <Hash size={14} className="text-slate-400" /> : <Volume2 size={14} className="text-slate-400" />}
                <input value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="new-channel"
                  className="flex-1 bg-transparent text-sm focus:outline-none text-slate-900 dark:text-white" autoFocus />
              </div>
              {channelError && <p className="text-[11px] text-red-500 mb-2">{channelError}</p>}
              <GlassButton type="button" onClick={handleCreateChannel} disabled={creatingChannel || !newChannelName.trim()} className="w-full py-3 text-xs font-bold text-white disabled:opacity-50" style={{ backgroundColor: "var(--primary-accent, #2563EB)" }}>
                {creatingChannel ? "Creating…" : "Create channel"}
              </GlassButton>
            </LiquidPanel>
          </div>
        )}
      </div>
    );
  }

  // ---------------- hub: my communities rail + discover ----------------
  return (
    <div className="w-full app-h flex flex-col relative overflow-hidden bg-slate-50 dark:bg-black">
      <AmbientLiquidBackground />
      <LiquidPanel as="header" className="w-full shrink-0 z-20 !rounded-none border-b border-slate-200/60 dark:border-white/10 px-4 py-3 flex items-center justify-between bg-white/70 dark:bg-black/60 backdrop-blur-xl" style={{ borderRadius: 0 }}>
        <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white">Communities</h1>
        <button type="button" onClick={onOpenCreateCommunityModal} style={{ backgroundColor: "var(--primary-accent, #2563EB)" }} className="p-2 rounded-full text-white shadow-md" aria-label="Create community"><Plus size={18} /></button>
      </LiquidPanel>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 pb-28" style={{ overscrollBehavior: "contain" }}>
        {error && <div className="mb-3 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-[11px] text-red-600 dark:text-red-300 font-medium">{error}</div>}

        <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Your communities</p>
        {myCommunities.length === 0 ? (
          <LiquidPanel className="p-4 rounded-2xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center mb-6">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-3">You haven't joined any communities yet. Create one or discover below.</p>
          </LiquidPanel>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 mb-6">
            {myCommunities.map((c) => (
              <button key={c.id} type="button" onClick={() => setActiveCommunityId(c.id)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-[var(--primary-accent,#2563EB)]/40 transition-all text-left">
                <img src={c.avatarUrl || getLetterAvatar(c.name)} alt="" className="w-11 h-11 rounded-2xl object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{c.name}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{c.description || `@${c.handle}`}</p>
                </div>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">{c.memberCount ?? ""} {(c.memberCount ?? 1) === 1 ? "member" : "members"}</span>
              </button>
            ))}
          </div>
        )}

        <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><Search size={11} /> Discover</p>
        <div className="px-1 mb-3">
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
            <Search size={15} className="text-slate-400" />
            <input value={discoverQuery} onChange={(e) => setDiscoverQuery(e.target.value)} placeholder="Search public communities"
              className="flex-1 bg-transparent text-sm focus:outline-none text-slate-900 dark:text-white placeholder:text-slate-400" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {discover.slice(0, 12).map((c) => (
            <div key={c.id} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <img src={c.avatarUrl || getLetterAvatar(c.name)} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{c.name}</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{c.description || `@${c.handle}`}</p>
              </div>
              <button type="button" onClick={() => handleJoin(c.id)} disabled={joiningId === c.id}
                className="px-3.5 py-1.5 rounded-full text-[11px] font-bold text-white disabled:opacity-50 shrink-0" style={{ backgroundColor: "var(--primary-accent, #2563EB)" }}>
                {joiningId === c.id ? "Joining…" : "Join"}
              </button>
            </div>
          ))}
          {discover.length === 0 && <p className="px-1 py-2 text-xs text-slate-400">{isLoading ? "Loading…" : "Nothing found"}</p>}
        </div>
      </div>
    </div>
  );
};
