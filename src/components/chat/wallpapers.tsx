/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chat viewport wallpaper engine — the profile picker actually renders now.
 *
 * 11 wallpapers, each with a unique style, tuned for light and dark mode:
 * CSS background layers + two live weather canvases (snowfall with pooling on
 * top of the chat bubbles, rainfall with splashes). Rendered behind the
 * floating glass bars, above the theme background; bubbles blur it through
 * their backdrop-filter.
 */
import React, { useEffect, useMemo, useRef } from "react";
import { useThemeStore } from "../../store/themeStore";
import type { WallpaperStyle } from "../../types";

export interface WallpaperDef {
  id: WallpaperStyle;
  name: string;
  /** light-mode background (CSS background shorthand) */
  css: string;
  /** dark-mode background (CSS background shorthand) */
  dark: string;
  /** live weather effect */
  effect?: "snow" | "rain";
  /** small swatch preview (background for the picker chip) */
  swatch: string;
}

export const WALLPAPERS: WallpaperDef[] = [
  {
    id: "glass-gradient",
    name: "Glass Gradient",
    css: "radial-gradient(120% 90% at 15% 0%, #dbeafe 0%, transparent 55%), radial-gradient(100% 80% at 90% 10%, #ede9fe 0%, transparent 50%), linear-gradient(160deg, #f4f7fb 0%, #eef2f7 100%)",
    dark: "radial-gradient(120% 90% at 15% 0%, #16233c 0%, transparent 55%), radial-gradient(100% 80% at 90% 10%, #1d1b33 0%, transparent 50%), linear-gradient(160deg, #0a0f1a 0%, #0d1420 100%)",
    swatch: "linear-gradient(135deg, #dbeafe, #ede9fe)",
  },
  {
    id: "dark-aurora",
    name: "Dark Aurora",
    css: "radial-gradient(90% 70% at 20% 100%, rgba(16,185,129,0.28) 0%, transparent 60%), radial-gradient(80% 60% at 80% 0%, rgba(139,92,246,0.25) 0%, transparent 55%), linear-gradient(180deg, #101724 0%, #0b1220 100%)",
    dark: "radial-gradient(90% 70% at 20% 100%, rgba(16,185,129,0.32) 0%, transparent 60%), radial-gradient(80% 60% at 80% 0%, rgba(139,92,246,0.30) 0%, transparent 55%), linear-gradient(180deg, #0a0f18 0%, #070b12 100%)",
    swatch: "linear-gradient(135deg, #0b1220 30%, #10b981, #8b5cf6)",
  },
  {
    id: "neon-mesh",
    name: "Neon Mesh",
    css: "linear-gradient(rgba(236,72,153,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.10) 1px, transparent 1px), radial-gradient(90% 70% at 50% 0%, rgba(236,72,153,0.14) 0%, transparent 60%), linear-gradient(180deg, #fdf2f8 0%, #ecfeff 100%)",
    dark: "linear-gradient(rgba(236,72,153,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.12) 1px, transparent 1px), radial-gradient(90% 70% at 50% 0%, rgba(236,72,153,0.16) 0%, transparent 60%), linear-gradient(180deg, #12081a 0%, #081118 100%)",
    swatch: "linear-gradient(135deg, #ec4899, #22d3ee)",
  },
  {
    id: "minimal-grid",
    name: "Minimal Grid",
    css: "linear-gradient(rgba(100,116,139,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.10) 1px, transparent 1px), linear-gradient(180deg, #fafafa 0%, #f1f5f9 100%)",
    dark: "linear-gradient(rgba(148,163,184,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.09) 1px, transparent 1px), linear-gradient(180deg, #111418 0%, #0c0f13 100%)",
    swatch: "repeating-linear-gradient(0deg, #e2e8f0 0 2px, #f8fafc 2px 8px)",
  },
  {
    id: "warm-clay",
    name: "Warm Clay",
    css: "radial-gradient(100% 80% at 85% 100%, rgba(180,83,9,0.16) 0%, transparent 55%), radial-gradient(90% 70% at 10% 10%, rgba(251,191,36,0.18) 0%, transparent 50%), linear-gradient(165deg, #fdf6ee 0%, #f7e8d8 100%)",
    dark: "radial-gradient(100% 80% at 85% 100%, rgba(180,83,9,0.22) 0%, transparent 55%), radial-gradient(90% 70% at 10% 10%, rgba(251,191,36,0.12) 0%, transparent 50%), linear-gradient(165deg, #1c1410 0%, #140f0b 100%)",
    swatch: "linear-gradient(135deg, #fbbf24, #b45309)",
  },
  {
    id: "pure-slate",
    name: "Pure Slate",
    css: "linear-gradient(180deg, #f8fafc 0%, #eef1f5 100%)",
    dark: "linear-gradient(180deg, #16181d 0%, #101216 100%)",
    swatch: "linear-gradient(135deg, #64748b, #1e293b)",
  },
  {
    id: "midnight-bloom",
    name: "Midnight Bloom",
    css: "radial-gradient(45% 35% at 25% 30%, rgba(129,140,248,0.22) 0%, transparent 70%), radial-gradient(40% 30% at 75% 65%, rgba(190,24,93,0.16) 0%, transparent 70%), radial-gradient(35% 28% at 60% 15%, rgba(56,189,248,0.12) 0%, transparent 70%), linear-gradient(170deg, #1a1b3a 0%, #0f1126 100%)",
    dark: "radial-gradient(45% 35% at 25% 30%, rgba(129,140,248,0.26) 0%, transparent 70%), radial-gradient(40% 30% at 75% 65%, rgba(190,24,93,0.20) 0%, transparent 70%), radial-gradient(35% 28% at 60% 15%, rgba(56,189,248,0.14) 0%, transparent 70%), linear-gradient(170deg, #12132b 0%, #0a0b1a 100%)",
    swatch: "linear-gradient(135deg, #818cf8, #be185d)",
  },
  {
    id: "ocean-depths",
    name: "Ocean Depths",
    css: "radial-gradient(90% 60% at 50% 0%, rgba(14,165,233,0.30) 0%, transparent 60%), radial-gradient(100% 70% at 50% 110%, rgba(8,47,73,0.55) 0%, transparent 65%), linear-gradient(180deg, #e0f2fe 0%, #bae6fd 60%, #7dd3fc 100%)",
    dark: "radial-gradient(90% 60% at 50% 0%, rgba(14,165,233,0.20) 0%, transparent 60%), radial-gradient(100% 70% at 50% 110%, rgba(8,47,73,0.75) 0%, transparent 65%), linear-gradient(180deg, #06283d 0%, #041a29 60%, #02101a 100%)",
    swatch: "linear-gradient(135deg, #38bdf8, #0c2d48)",
  },
  {
    id: "sunset-dunes",
    name: "Sunset Dunes",
    css: "linear-gradient(180deg, #fde68a 0%, #fdba74 30%, #f472b6 62%, #7c3aed 100%)",
    dark: "linear-gradient(180deg, #7c2d12 0%, #9d174d 45%, #4c1d95 100%)",
    swatch: "linear-gradient(135deg, #fdba74, #f472b6, #7c3aed)",
  },
  {
    id: "snowfall",
    name: "Snowfall",
    css: "radial-gradient(120% 90% at 50% 0%, #ffffff 0%, #e8f1f9 45%, #d7e5f2 100%)",
    dark: "radial-gradient(120% 90% at 50% 0%, #17222f 0%, #101a26 45%, #0b1420 100%)",
    effect: "snow",
    swatch: "linear-gradient(135deg, #ffffff, #cfe0ef)",
  },
  {
    id: "rainfall",
    name: "Rainfall",
    css: "radial-gradient(120% 90% at 50% 0%, #cfd9e4 0%, #b6c4d4 45%, #9fb2c6 100%)",
    dark: "radial-gradient(120% 90% at 50% 0%, #131c28 0%, #0d1520 45%, #080f18 100%)",
    effect: "rain",
    swatch: "linear-gradient(135deg, #94a3b8, #334155)",
  },
];

export function wallpaperById(id: WallpaperStyle | undefined): WallpaperDef {
  return WALLPAPERS.find((w) => w.id === id) || WALLPAPERS[0];
}

// ---------------------------------------------------------------------------
// Weather canvas — snow (falls, pools on top of the chat bubbles) and rain
// (streaks + splashes). One rAF loop, DPR-aware, pauses when hidden.
// ---------------------------------------------------------------------------

interface Flake { x: number; y: number; r: number; vy: number; drift: number; phase: number; }
interface Drop { x: number; y: number; len: number; vy: number; }
interface Splash { x: number; y: number; t: number; }
interface BubbleRect { key: string; top: number; left: number; right: number; bottom: number; pool: number; }

const BUBBLE_SELECTOR = [
  '[id^="msg-"] .wa-bubble-mine',
  '[id^="msg-"] .wa-bubble-other',
  '[id^="msg-"] img',
  '[id^="msg-"] .rounded-2xl',
].join(", ");

function WeatherCanvas({ effect }: { effect: "snow" | "rain" }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const bubblesRef = useRef<Map<string, BubbleRect>>(new Map());
  const rafRef = useRef(0);
  const lastScanRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // the chat scroller is the previous sibling with overflow-y-auto
    scrollerRef.current = wrap.parentElement?.querySelector(".overflow-y-auto") as HTMLElement | null;

    let W = 0;
    let H = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      W = Math.max(1, Math.floor(rect.width));
      H = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ---------- particle fields ----------
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const flakes: Flake[] = [];
    const drops: Drop[] = [];
    const splashes: Splash[] = [];
    const SNOW_N = Math.min(130, Math.floor(W / 4));
    const RAIN_N = Math.min(90, Math.floor(W / 5));
    if (effect === "snow") {
      for (let i = 0; i < SNOW_N; i++) {
        flakes.push({ x: rand(0, W), y: rand(-H, H), r: rand(1.1, 3.1), vy: rand(16, 42), drift: rand(10, 26), phase: rand(0, Math.PI * 2) });
      }
    } else {
      for (let i = 0; i < RAIN_N; i++) {
        drops.push({ x: rand(0, W), y: rand(-H, H), len: rand(9, 20), vy: rand(340, 560) });
      }
    }

    // ---------- bubble rects (for snow pooling / rain splashes) ----------
    const scanBubbles = (now: number) => {
      if (now - lastScanRef.current < 350) return;
      lastScanRef.current = now;
      const sc = scrollerRef.current;
      if (!sc) return;
      const canvasRect = canvas.getBoundingClientRect();
      const els = sc.querySelectorAll(BUBBLE_SELECTOR);
      const seen = new Set<string>();
      let count = 0;
      for (const el of els) {
        if (count >= 90) break;
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 12) continue;
        if (r.bottom < canvasRect.top - 40 || r.top > canvasRect.bottom + 40) continue;
        count++;
        const key = el.closest("[id^='msg-']")?.id ? `${el.closest("[id^='msg-']")!.id}:${seen.size}` : `b:${seen.size}`;
        seen.add(key);
        const prev = bubblesRef.current.get(key);
        const rect: BubbleRect = {
          key,
          top: r.top - canvasRect.top,
          left: r.left - canvasRect.left,
          right: r.right - canvasRect.left,
          bottom: r.bottom - canvasRect.top,
          pool: prev ? prev.pool : 0,
        };
        bubblesRef.current.set(key, rect);
      }
      const staleKeys: string[] = [];
      bubblesRef.current.forEach((_v, k) => {
        if (!seen.has(k)) staleKeys.push(k);
      });
      for (const k of staleKeys) bubblesRef.current.delete(k);
    };

    // ---------- draw helpers ----------
    const drawSnowMound = (b: BubbleRect) => {
      const p = Math.min(8, b.pool);
      if (p < 0.4) return;
      const w = b.right - b.left;
      ctx.beginPath();
      // base mound hugging the bubble top edge
      ctx.moveTo(b.left + 2, b.top + 1);
      ctx.quadraticCurveTo(b.left + w * 0.25, b.top - p * 1.15, b.left + w * 0.5, b.top - p * 0.85);
      ctx.quadraticCurveTo(b.left + w * 0.78, b.top - p * 1.25, b.right - 2, b.top + 1);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.shadowColor = "rgba(148,180,210,0.45)";
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0;
      // sparkle caps
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const bumps = Math.max(2, Math.min(5, Math.floor(w / 42)));
      for (let i = 0; i < bumps; i++) {
        const bx = b.left + (w / (bumps + 1)) * (i + 1);
        const br = 1.4 + (i % 2) * 0.9;
        ctx.beginPath();
        ctx.arc(bx, b.top - p * 0.9, br, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let last = performance.now();
    let running = true;

    const tick = (now: number) => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      scanBubbles(now);

      ctx.clearRect(0, 0, W, H);

      if (effect === "snow") {
        for (const f of flakes) {
          f.phase += dt * 1.6;
          f.y += f.vy * dt;
          f.x += Math.sin(f.phase) * f.drift * dt;

          // land on a bubble top → pool
          let landed = false;
          for (const b of bubblesRef.current.values()) {
            if (f.x >= b.left - 1 && f.x <= b.right + 1 && f.y >= b.top - 2 - b.pool && f.y <= b.top + 3 && f.y < b.bottom) {
              b.pool = Math.min(8, b.pool + f.r * 0.16);
              landed = true;
              break;
            }
          }
          if (landed || f.y > H + 6) {
            f.y = rand(-30, -6);
            f.x = rand(0, W);
            f.r = rand(1.1, 3.1);
            f.vy = rand(16, 42);
          }
        }
        // melt pools very slowly so they don't grow forever
        for (const b of bubblesRef.current.values()) {
          if (b.pool > 0) b.pool = Math.max(0, b.pool - dt * 0.12);
        }
        // pools first (behind flakes)
        for (const b of bubblesRef.current.values()) drawSnowMound(b);
        // flakes
        for (const f of flakes) {
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${0.55 + (f.r / 3.1) * 0.4})`;
          ctx.shadowColor = "rgba(160,190,220,0.6)";
          ctx.shadowBlur = 2;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else {
        // rain
        ctx.strokeStyle = "rgba(148,180,215,0.34)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const d of drops) {
          d.y += d.vy * dt;
          d.x += d.vy * dt * 0.06;
          let hitBubble = false;
          for (const b of bubblesRef.current.values()) {
            if (d.x >= b.left && d.x <= b.right && d.y >= b.top && d.y <= b.top + 4 && d.y < b.bottom) {
              hitBubble = true;
              break;
            }
          }
          if (hitBubble || d.y > H) {
            if (splashes.length < 40 && Math.random() < 0.6) splashes.push({ x: d.x, y: Math.min(H - 2, hitBubble ? d.y : H - 2), t: 0 });
            d.y = rand(-60, -10);
            d.x = rand(-10, W);
            d.len = rand(9, 20);
            d.vy = rand(340, 560);
            continue;
          }
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - d.len * 0.06, d.y - d.len);
        }
        ctx.stroke();
        // splashes
        for (let i = splashes.length - 1; i >= 0; i--) {
          const s = splashes[i];
          s.t += dt;
          if (s.t > 0.28) { splashes.splice(i, 1); continue; }
          const k = s.t / 0.28;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, 2 + k * 5, (2 + k * 5) * 0.4, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(186,214,240,${0.5 * (1 - k)})`;
          ctx.stroke();
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      bubblesRef.current.clear();
    };
  }, [effect]);

  return (
    <div ref={wrapRef} className="absolute inset-0 z-[16] pointer-events-none overflow-hidden" aria-hidden>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The layer mounted inside ChatConversationScreen.
// ---------------------------------------------------------------------------

export const ChatWallpaperLayer: React.FC = () => {
  const chatWallpaper = useThemeStore((s) => s.customization.chatWallpaper);
  const reducedMotion = useThemeStore((s) => s.customization.reducedMotion);
  const themeMode = useThemeStore((s) => s.customization.themeMode);
  const [isDark, setIsDark] = React.useState<boolean>(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false
  );

  // themeStore drives the .dark class on <html> — follow it (covers 'system' too)
  React.useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains("dark"));
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [themeMode]);

  const wp = useMemo(() => wallpaperById(chatWallpaper), [chatWallpaper]);
  const bg = isDark ? wp.dark : wp.css;

  return (
    <>
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: bg, transition: "background 300ms ease" }}
        aria-hidden
      />
      {!reducedMotion && wp.effect && <WeatherCanvas effect={wp.effect} />}
    </>
  );
};
