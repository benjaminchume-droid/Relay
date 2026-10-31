/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chat attachments UI kit — shared by BOTH chat styles (Classic + Retro):
 *
 *  · AttachmentTray — WhatsApp-style popup anchored at the paperclip:
 *    Photos / Camera / Document. The three hidden inputs live here and stay
 *    MOUNTED even while the popup is closed (a file input that unmounts while
 *    its native picker is open silently loses the change event), and every
 *    input routes into the SAME onFilePick handler the composer already had.
 *    Camera uses capture="environment" so Android WebView / mobile browsers
 *    open the device camera in-app.
 *
 *  · ImageViewerOverlay — full-screen in-app image viewer (black backdrop,
 *    tap to dismiss, X, download, Esc, swipe-down-to-close).
 *
 *  · FileBubble — compact WhatsApp-style document/file row (icon, name,
 *    size, download action) for non-image/audio/video attachments.
 */
import React, { useEffect, useRef } from "react";
import {
  Camera, Download, File as FileIcon, FileArchive, FileAudio, FileSpreadsheet,
  FileText, FileVideo, Image as ImageIcon, X,
} from "lucide-react";

/** Plain rect snapshot of the anchor button (safe to keep in state). */
export interface AnchorRect { left: number; top: number; right: number; bottom: number; width: number; height: number; }

export function rectOf(el: HTMLElement | null): AnchorRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

export function formatBytes(n?: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (!v || !Number.isFinite(v) || v <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x >= 10 || i === 0 ? Math.round(x) : x.toFixed(1)} ${units[i]}`;
}

function fileMeta(mime?: string, name?: string): { Icon: React.FC<{ size?: number | string }> } {
  const m = (mime || "").toLowerCase();
  const ext = (name || "").split(".").pop()?.toLowerCase() || "";
  if (m.startsWith("video/") || ["mp4", "mov", "webm", "avi", "mkv", "3gp"].includes(ext)) return { Icon: FileVideo };
  if (m.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "aac", "opus"].includes(ext)) return { Icon: FileAudio };
  if (m === "application/pdf" || ext === "pdf") return { Icon: FileText };
  if (/(zip|rar|7z|tar|gzip)/.test(m) || ["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { Icon: FileArchive };
  if (/(spreadsheet|excel|csv)/.test(m) || ["csv", "xlsx", "xls"].includes(ext)) return { Icon: FileSpreadsheet };
  if (/(word|document|presentation|powerpoint|text|json)/.test(m) || ["doc", "docx", "txt", "pptx", "ppt", "rtf", "md"].includes(ext)) return { Icon: FileText };
  return { Icon: FileIcon };
}

// ================= attachment tray (popup at the paperclip) =================

const TRAY_W = 212;
const TRAY_EST_H = 152;

export const AttachmentTray: React.FC<{
  open: boolean;
  anchor: AnchorRect | null;
  onClose: () => void;
  onFilePick: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ open, anchor, onClose, onFilePick }) => {
  const photosRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docsRef = useRef<HTMLInputElement>(null);
  const openedAtRef = useRef(Date.now());

  // Outside tap / Esc / scroll / resize dismiss the popup. The hidden inputs
  // above are NOT part of the popup, so closing it never orphans a native
  // file picker. Taps on the paperclip itself are ignored so the button can
  // toggle the tray closed.
  useEffect(() => {
    if (!open) return;
    openedAtRef.current = Date.now();
    const guardClose = (e?: { target?: any }) => {
      if ((e?.target as HTMLElement | undefined)?.closest?.("[data-attach-trigger]")) return;
      if (Date.now() - openedAtRef.current < 250) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", guardClose);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", guardClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", guardClose);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", guardClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { onClose(); onFilePick(e); };

  const items: Array<{ key: string; label: string; icon: React.FC<{ size?: number | string }>; input: React.RefObject<HTMLInputElement | null> }> = [
    { key: "photos", label: "Photos", icon: ImageIcon, input: photosRef },
    { key: "camera", label: "Camera", icon: Camera, input: cameraRef },
    { key: "document", label: "Document", icon: FileText, input: docsRef },
  ];

  return (
    <>
      <input ref={photosRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={docsRef} type="file" accept=".pdf,.doc,.docx,.txt,.zip,.csv,.xlsx,.pptx" className="hidden" onChange={pick} />

      {open && anchor && (
        <div
          className="fixed inset-0 z-50"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement)?.closest?.("[data-attach-trigger]")) return;
            if (Date.now() - openedAtRef.current >= 250) onClose();
          }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          {(() => {
            const vw = typeof window !== "undefined" ? window.innerWidth : 400;
            const vh = typeof window !== "undefined" ? window.innerHeight : 700;
            const left = Math.min(Math.max(8, anchor.left), vw - TRAY_W - 8);
            const openUp = anchor.bottom > vh * 0.4; // composer sits near the bottom → open above
            const top = openUp
              ? Math.max(8, anchor.top - TRAY_EST_H - 10)
              : Math.min(anchor.bottom + 10, Math.max(8, vh - TRAY_EST_H - 8));
            return (
              <div
                className="absolute liquid-popover rounded-2xl overflow-hidden shadow-2xl"
                style={{ left, top, width: TRAY_W, animation: "contextPop 140ms cubic-bezier(0.2, 0.9, 0.3, 1.2)" }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {items.map(({ key, label, icon: Icon, input }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { onClose(); input.current?.click(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-semibold text-left text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-white/10 active:bg-slate-200/70 dark:active:bg-white/15"
                  >
                    <Icon size={17} />
                    {label}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
};

// ================= full-screen in-app image viewer =================

export const ImageViewerOverlay: React.FC<{
  url: string;
  name?: string;
  onClose: () => void;
}> = ({ url, name, onClose }) => {
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center select-none"
      onClick={onClose}
      onTouchStart={(e) => { touchStartY.current = e.touches[0]?.clientY ?? null; }}
      onTouchMove={(e) => {
        const y0 = touchStartY.current;
        if (y0 == null) return;
        if ((e.touches[0]?.clientY ?? y0) - y0 > 90) { touchStartY.current = null; onClose(); }
      }}
      role="dialog"
      aria-label="Image viewer"
    >
      <img
        src={url}
        alt={name || ""}
        className="max-w-full max-h-full object-contain pointer-events-none"
        draggable={false}
      />
      <a
        href={url}
        download={name || true}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-3 right-14 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all"
        aria-label="Download image"
      >
        <Download size={19} />
      </a>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-3 right-3 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all"
        aria-label="Close viewer"
      >
        <X size={20} />
      </button>
    </div>
  );
};

// ================= compact file/document bubble =================

export const FileBubble: React.FC<{
  name: string;
  size?: number | string;
  mime?: string;
  url?: string;
  isMine?: boolean;
}> = ({ name, size, mime, url, isMine }) => {
  const { Icon } = fileMeta(mime, name);
  const onAccent = !!isMine;
  const sizeLabel = formatBytes(size) || (mime ? mime.replace("application/", "").replace("image/", "") : "") || "File";
  return (
    <div className={`flex items-center gap-2.5 min-w-[190px] max-w-[260px] rounded-xl px-2.5 py-2 ${onAccent ? "bg-white/15" : "bg-white/70 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/10"}`}>
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${onAccent ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300"}`}>
        <Icon size={17} />
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[12.5px] font-semibold truncate leading-tight ${onAccent ? "text-white" : "text-slate-800 dark:text-slate-100"}`}>{name}</span>
        <span className={`block text-[10px] truncate ${onAccent ? "text-white/70" : "text-slate-400 dark:text-slate-500"}`}>{sizeLabel}</span>
      </span>
      {url && (
        <a
          href={url}
          download={name || true}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`p-1.5 rounded-full shrink-0 active:scale-95 transition-transform ${onAccent ? "text-white/85 hover:bg-white/15" : "text-slate-500 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/10"}`}
          aria-label="Download file"
        >
          <Download size={15} />
        </a>
      )}
    </div>
  );
};
