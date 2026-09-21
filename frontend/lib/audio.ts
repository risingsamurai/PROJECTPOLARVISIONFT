/**
 * Web Audio API synthesizer for maritime warning and proximity alerts.
 * Generates clean tones with gentle attack/decay envelopes (no clicks).
 */

import { usePolarisStore } from "./store";

let audioCtxInstance: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtxInstance || audioCtxInstance.state === "closed") {
    audioCtxInstance = new AudioCtx();
  }
  if (audioCtxInstance.state === "suspended") {
    audioCtxInstance.resume().catch(() => {});
  }
  return audioCtxInstance;
}

/**
 * Two-tone maritime proximity alert (Tone 1: 587 Hz [D5] -> Tone 2: 880 Hz [A5]).
 * Duration: ~0.42s total. Gated strictly by `soundOn` in Polaris store.
 */
export function playProximityAlertSound() {
  const soundOn = usePolarisStore.getState().soundOn;
  if (!soundOn) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Tone 1: D5 (587.33 Hz) for 160ms
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);

    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.025);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.17);

    // Tone 2: A5 (880.00 Hz) for 220ms with 40ms interval
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.0, now + 0.20);

    gain2.gain.setValueAtTime(0.0001, now + 0.20);
    gain2.gain.exponentialRampToValueAtTime(0.22, now + 0.23);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.20);
    osc2.stop(now + 0.43);
  } catch (err) {
    console.error("Failed to play proximity alert audio:", err);
  }
}
