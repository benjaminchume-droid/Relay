/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Call sounds + haptics — no audio assets needed (WebAudio synthesis):
 *  · incoming ring — gentle two-tone bell loop (WhatsApp-like)
 *  · outgoing ringback — soft beep every 3s while the callee's phone rings
 *  · vibration pulse while an incoming call is ringing (mobile web)
 * All loops stop on demand; AudioContext resumes from any user gesture.
 */

let ctx: AudioContext | null = null;
let timers: ReturnType<typeof setInterval>[] = [];
let vibrateTimer: ReturnType<typeof setInterval> | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function clearLoops() {
  timers.forEach((t) => clearInterval(t));
  timers = [];
  if (vibrateTimer) {
    clearInterval(vibrateTimer);
    vibrateTimer = null;
  }
  try {
    navigator.vibrate?.(0);
  } catch { /* noop */ }
}

/** one short tone */
function tone(freqA: number, freqB: number, startIn: number, durMs: number, gain = 0.06) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + startIn;
  const osc = ac.createOscillator();
  const osc2 = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc2.type = "sine";
  osc.frequency.value = freqA;
  osc2.frequency.value = freqB;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.setValueAtTime(gain, t0 + durMs / 1000 - 0.04);
  g.gain.linearRampToValueAtTime(0, t0 + durMs / 1000);
  osc.connect(g);
  osc2.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc2.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.05);
  osc2.stop(t0 + durMs / 1000 + 0.05);
}

/** WhatsApp-ish incoming bell — plays ~2.2s pattern every 3s. */
export function startIncomingRing() {
  stopRing();
  const playPattern = () => {
    tone(880, 659, 0, 340);
    tone(880, 659, 0.42, 340);
  };
  playPattern();
  timers.push(setInterval(playPattern, 3000));
  // vibration pulse (mobile web)
  try {
    navigator.vibrate?.([220, 140, 220]);
    vibrateTimer = setInterval(() => {
      try { navigator.vibrate?.([220, 140, 220]); } catch { /* noop */ }
    }, 3000);
  } catch { /* noop */ }
}

/** Outgoing ringback — one soft beep every 3s. */
export function startOutgoingRing() {
  stopRing();
  const play = () => tone(440, 480, 0, 900, 0.045);
  play();
  timers.push(setInterval(play, 3000));
}

export function stopRing() {
  clearLoops();
}

/** Tiny end-of-call blip. */
export function playEndBlip() {
  tone(660, 440, 0, 160, 0.05);
}
