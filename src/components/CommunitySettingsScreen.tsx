/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Community settings — a FULL SCREEN (replaces the old popup card):
 * overview, invite link, members with roles, leave, delete (owner).
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Copy, Check, Users, Link2, LogOut, Trash2, Crown, Shield,
  AlertTriangle, Search,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useCommunityStore } from "../store/communityStore";
import { getLetterAvatar } from "../lib/avatar";
import { AmbientLiquidBackground, LiquidPanel } from "./GlassUI";
import { listCommunityMembers, getMyRole, type CommunityMemberRow } from "../services/communityChannels";

type Props = {
  communityId: string;
  onBack: () => void;
  onLeftCommunity: () => void;
};

export const CommunitySettingsScreen: React.FC<Props> = ({ communityId, onBack, onLeftCommunity }) => {
  const { profile, currentUser } = useAuthStore();
  const myProfileId = (profile as any)?.id || (currentUser as any)?.id || "";
  const { communities, leaveCommunity } = useCommunityStore();
  const community = communities.find((c) => c.id === communityId);

  const [members, setMembers] = useState<CommunityMemberRow[]>([]);
  const [myRole, setMyRole] = useState<"owner" | "moderator" | "member" | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");

  useEffect(() => {
    void (async () => {
      try { setMembers(await listCommunityMembers(communityId)); } catch { /* handled below */ }
      try { setMyRole(await getMyRole(communityId, myProfileId)); } catch { /* noop */ }
    })();
  }, [communityId, myProfileId]);

  const inviteLink = useMemo(() => {
    if (!community?.inviteLink) return `https://relayid.vercel.app/c/${community?.handle || communityId}`;
    return community.inviteLink;
  }, [community]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.displayName.toLowerCase().includes(q) || (m.username || "").toLowerCase().includes(q));
  }, [members, memberQuery]);

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard optional */ }
  };

  const handleLeave = async () => {
    setLeaving(true); setActionError(null);
    try {
      // exit channel conversations alongside the community itself (best effort)
      try {
        const { leaveChannelConversationsSafe } = await import("../services/communityChannels");
        await leaveChannelConversationsSafe(communityId);
      } catch { /* non-fatal */ }
      await leaveCommunity(communityId);
      onLeftCommunity();
    } catch (e: any) {
      setActionError(e?.message || "Failed to leave community");
    } finally { setLeaving(false); }
  };

  const isOwner = myRole === "owner" || (community && community.ownerId === myProfileId);

  return (
    <div className="w-full app-h flex flex-col relative overflow-hidden bg-slate-50 dark:bg-black">
      <AmbientLiquidBackground />
      <div className="shrink-0 z-20 border-b border-slate-200/60 dark:border-white/10 px-2 py-2.5 flex items-center gap-2 bg-white/70 dark:bg-black/60 backdrop-blur-xl">
        <button type="button" onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold text-slate-900 dark:text-white">Community settings</h1>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 pb-28 space-y-4" style={{ overscrollBehavior: "contain" }}>
        {/* overview */}
        <LiquidPanel className="p-4 rounded-3xl bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <img src={community?.avatarUrl || getLetterAvatar(community?.name || "C")} alt="" className="w-14 h-14 rounded-2xl object-cover" />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-black text-slate-900 dark:text-white truncate">{community?.name || "Community"}</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">@{community?.handle}</p>
              <span className={`inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${community?.isPrivate ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"}`}>
                {community?.isPrivate ? "Private (invite only)" : "Public (searchable)"}
              </span>
            </div>
          </div>
          {community?.description && <p className="mt-3 text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">{community.description}</p>}
          <div className="mt-3 flex items-center gap-4 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><Users size={12} /> {members.length} members</span>
            {myRole && <span className="flex items-center gap-1">{myRole === "owner" ? <Crown size={12} className="text-amber-500" /> : myRole === "moderator" ? <Shield size={12} className="text-blue-500" /> : null} You are {myRole}</span>}
          </div>
        </LiquidPanel>

        {/* invite */}
        <LiquidPanel className="p-4 rounded-3xl bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><Link2 size={11} /> Invite link</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 text-[11px] font-mono text-slate-700 dark:text-slate-200 truncate">{inviteLink}</div>
            <button type="button" onClick={copyInvite} style={{ backgroundColor: "var(--primary-accent, #2563EB)" }} className="px-3.5 py-2.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 shrink-0">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </LiquidPanel>

        {/* members */}
        <LiquidPanel className="p-4 rounded-3xl bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><Users size={11} /> Members ({members.length})</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/10 mb-2">
            <Search size={13} className="text-slate-400" />
            <input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Search members" className="flex-1 bg-transparent text-xs focus:outline-none text-slate-900 dark:text-white" />
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {filteredMembers.map((m) => (
              <div key={m.profileId} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5">
                <img src={m.avatarUrl || getLetterAvatar(m.displayName)} alt="" className="w-8 h-8 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 truncate">{m.displayName}{m.profileId === myProfileId ? " (you)" : ""}</p>
                  {m.username && <p className="text-[10px] text-slate-400 truncate">@{m.username}</p>}
                </div>
                {m.isOwner ? <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600 dark:text-amber-400 shrink-0"><Crown size={10} /> owner</span>
                  : m.isModerator ? <span className="flex items-center gap-1 text-[9px] font-bold text-blue-600 dark:text-blue-400 shrink-0"><Shield size={10} /> mod</span> : null}
              </div>
            ))}
            {filteredMembers.length === 0 && <p className="text-xs text-slate-400 py-2">No members found</p>}
          </div>
        </LiquidPanel>

        {/* danger zone */}
        <LiquidPanel className="p-4 rounded-3xl bg-white/80 dark:bg-white/5 border border-red-200/60 dark:border-red-500/20">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-2 flex items-center gap-1.5"><AlertTriangle size={11} /> Danger zone</p>
          {!confirmLeave ? (
            <button type="button" onClick={() => setConfirmLeave(true)}
              className="w-full py-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 text-xs font-bold flex items-center justify-center gap-2">
              <LogOut size={14} /> Leave community
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">You'll lose access to all channels. Continue?</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmLeave(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold">Cancel</button>
                <button type="button" disabled={leaving} onClick={handleLeave} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-60 flex items-center justify-center gap-1.5">
                  {leaving ? "Leaving…" : <><LogOut size={13} /> Leave</>}
                </button>
              </div>
            </div>
          )}
          {isOwner && (
            <button type="button" disabled className="mt-2 w-full py-2.5 rounded-xl text-[11px] font-semibold text-slate-400 flex items-center justify-center gap-2 opacity-60 cursor-not-allowed">
              <Trash2 size={13} /> Delete community (coming soon)
            </button>
          )}
          {actionError && <p className="mt-2 text-[11px] text-red-500">{actionError}</p>}
        </LiquidPanel>
      </div>
    </div>
  );
};
