/**
 * Chat conversation helpers
 */
import React from "react";
import { Check, CheckCheck, AlertCircle, Clock, PhoneMissed, PhoneOff, PhoneCall, Video } from "lucide-react";

export function formatDayDivider(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const st = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sm = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((st.getTime() - sm.getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

export function isSameDay(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/**
 * WhatsApp delivery ticks:
 *  - sending  → clock
 *  - sent     → one check
 *  - delivered→ two gray checks (peer's client received it, chat not opened)
 *  - read     → two checks in the COMPLEMENT of the accent color (always contrasts)
 */
let cachedReadColor: { accent: string; complement: string } | null = null;

function accentComplement(): string {
  try {
    const accent = (getComputedStyle(document.documentElement)
      .getPropertyValue("--primary-accent") || "#2563EB").trim();
    if (cachedReadColor?.accent === accent) return cachedReadColor.complement;
    let h = accent.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const inv = (pair: string) => {
      const v = parseInt(pair, 16);
      if (Number.isNaN(v)) return "80";
      return Math.max(0, Math.min(255, 255 - v)).toString(16).padStart(2, "0");
    };
    const complement = `#${inv(h.slice(0, 2))}${inv(h.slice(2, 4))}${inv(h.slice(4, 6))}`;
    cachedReadColor = { accent, complement };
    return complement;
  } catch { return "#F59E0B"; }
}

export function DeliveryTicks({ state }: { state?: string }) {
  if (state === "sending") return <Clock size={12} className="opacity-80" />;
  if (state === "failed") return <AlertCircle size={12} className="text-red-300" />;
  if (state === "delivered") return <CheckCheck size={13} className="opacity-80" />;
  if (state === "read") return (
    <CheckCheck size={13} strokeWidth={2.6} style={{ color: accentComplement() }} />
  );
  return <Check size={13} className="opacity-80" />;
}

// ---------------------------------------------------------------------------
// WhatsApp-style call log pill — system messages ("Missed voice call",
// "Voice call · 1:05", "Cancelled voice call") render as a centered pill,
// NOT as a chat bubble. Missed calls are tappable to call back.
// ---------------------------------------------------------------------------

function fmtCallDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

export function CallSystemPill({ label, onCallBack }: { label: string; onCallBack?: () => void }) {
  const text = String(label || "").trim();
  const isMissed = /^Missed\s+(voice|video)\s+call/i.test(text);
  const isCancelled = /^Cancelled\s+(voice|video)\s+call/i.test(text);
  const isVideo = /video/i.test(text);
  const durationMatch = text.match(/·\s*([\d:.]+)\s*(min|s)?$/i);

  let durationText = "";
  if (durationMatch) {
    const raw = durationMatch[1];
    if (raw.includes(":")) durationText = raw;
    else if (/^min$/i.test(durationMatch[2] || "")) durationText = fmtCallDuration(parseFloat(raw) * 60);
    else durationText = fmtCallDuration(parseFloat(raw));
  }

  const Icon = isMissed ? PhoneMissed : isCancelled ? PhoneOff : (isVideo ? Video : PhoneCall);
  const iconColor = isMissed ? "#f43f5e" : isCancelled ? "#94a3b8" : "var(--primary-accent, #2563EB)";
  const clickable = isMissed && !!onCallBack;

  return (
    <div className="flex justify-center my-1.5">
      <button
        type="button"
        onClick={clickable ? onCallBack : undefined}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/85 dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/10 shadow-xs max-w-[85%] ${clickable ? "cursor-pointer active:scale-95 transition-transform" : "cursor-default"}`}
      >
        <Icon size={14} style={{ color: iconColor }} className="shrink-0" />
        <span className="text-[11.5px] font-semibold text-slate-600 dark:text-slate-300 truncate">
          {durationMatch ? text.replace(/·\s*[\d:.]+\s*(min|s)?$/i, `· ${durationText}`).replace(/\s+·\s+$/, "") : text}
        </span>
        {clickable && (
          <span className="text-[10px] font-bold shrink-0" style={{ color: iconColor }}>
            · Call back
          </span>
        )}
      </button>
    </div>
  );
}
