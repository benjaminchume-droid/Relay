/**
 * Chat conversation helpers
 */
import React from "react";
import { Check, CheckCheck, AlertCircle } from "lucide-react";

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

export function DeliveryTicks({ state }: { state?: string }) {
  if (state === "read") return <CheckCheck size={12} style={{ color: "var(--primary-accent, #2563EB)" }} />;
  if (state === "delivered") return <CheckCheck size={12} className="text-slate-400" />;
  if (state === "failed") return <AlertCircle size={12} className="text-red-400" />;
  return <Check size={12} className="text-slate-400" />;
}
