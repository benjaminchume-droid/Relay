/**
 * Phase 3: Discord-inspired horizontal hub rail for Communities (Relay glass).
 */
import React from "react";
import { Plus } from "lucide-react";
import { getLetterAvatar } from "../lib/avatar";
import type { Community } from "../types";

export const CommunitiesHubRail: React.FC<{
  communities: Community[];
  onSelect: (id: string) => void;
  onCreate: () => void;
}> = ({ communities, onSelect, onCreate }) => {
  if (!communities.length) return null;
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
      {communities.slice(0, 16).map((comm) => (
        <button
          key={`rail-${comm.id}`}
          type="button"
          onClick={() => onSelect(comm.id)}
          className="flex flex-col items-center gap-1.5 min-w-[64px] max-w-[72px] group cursor-pointer"
        >
          <div className="relative">
            <img
              src={comm.avatarUrl || getLetterAvatar(comm.name)}
              alt={comm.name}
              className="w-12 h-12 rounded-2xl object-cover border-2 border-white shadow-md group-hover:scale-105 transition-transform group-hover:ring-2 group-hover:ring-blue-400/50"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>
          <span className="text-[9px] font-bold text-slate-600 truncate w-full text-center">{comm.name}</span>
        </button>
      ))}
      <button type="button" onClick={onCreate} className="flex flex-col items-center gap-1.5 min-w-[64px] cursor-pointer">
        <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors bg-white/60">
          <Plus size={18} />
        </div>
        <span className="text-[9px] font-bold text-slate-400">Add</span>
      </button>
    </div>
  );
};
