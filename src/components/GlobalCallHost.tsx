/**
 * Phase 4: App-level incoming/active call host.
 * DISABLED until WebRTC/signaling is stable — renders nothing.
 * Re-enable by removing the early return once calls work end-to-end.
 */
import React from "react";

const CALLS_ENABLED = false;

export const GlobalCallHost: React.FC = () => {
  if (!CALLS_ENABLED) return null;
  return null;
};
