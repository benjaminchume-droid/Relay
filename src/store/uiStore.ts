/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Global UI chrome state — immersive overlays hide the bottom nav bar.
 */
import { create } from "zustand";

type UiState = {
  /** Full-screen overlays (story viewer, composers, sheets) set this — bottom nav hides. */
  immersive: number;
  enterImmersive: () => void;
  exitImmersive: () => void;
  /** Hard reset to 0 — called when the route/tab changes, because any overlay
   *  that was holding the counter open has then unmounted with the screen. */
  resetImmersive: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  immersive: 0,
  enterImmersive: () => set((s) => ({ immersive: s.immersive + 1 })),
  exitImmersive: () => set((s) => ({ immersive: Math.max(0, s.immersive - 1) })),
  resetImmersive: () => set({ immersive: 0 }),
}));
