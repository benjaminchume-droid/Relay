/**
 * Chat conversation helpers
 */
import React from "react";
import { Check, CheckCheck, AlertCircle, Clock } from "lucide-react";

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
