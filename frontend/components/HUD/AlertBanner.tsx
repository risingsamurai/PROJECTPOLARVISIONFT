"use client";

import { useEffect, useState } from "react";
import { usePolarisStore } from "@/lib/store";
import { useAlertEngine } from "@/lib/alertEngine";
import { ShieldAlert, AlertTriangle, Info, CheckCircle2, Volume2, VolumeX } from "lucide-react";

const COLOR: Record<string, string> = {
  CRITICAL: "bg-red-600/30 border-red-500/40 text-red-200",
  WARNING: "bg-amber-500/25 border-amber-500/35 text-amber-200",
  INFO: "bg-blue-500/20 border-blue-500/30 text-blue-200",
  CLEAR: "bg-emerald-600/25 border-emerald-500/35 text-emerald-200",
};

const ICONS: Record<string, any> = {
  CRITICAL: ShieldAlert,
  WARNING: AlertTriangle,
  INFO: Info,
  CLEAR: CheckCircle2,
};

const SYMBOLS: Record<string, string> = {
  CRITICAL: "🔴",
  WARNING: "🟡",
  INFO: "🔵",
  CLEAR: "🟢",
};

function beep() {
  if (typeof window === "undefined") return;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (err) {
    console.error("Audio playback error:", err);
  }
}

export function AlertBanner() {
  // Execute the alert engine continuous check loop
  useAlertEngine();

  const alerts = usePolarisStore((s) => s.alerts);
  const soundOn = usePolarisStore((s) => s.soundOn);
  const setSoundOn = usePolarisStore((s) => s.setSoundOn);
  const latest = alerts[alerts.length - 1];

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!latest) {
      setVisible(false);
      return;
    }

    if (latest.tier === "CRITICAL" || latest.tier === "WARNING") {
      setVisible(true);
    } else {
      // CLEAR or INFO: auto-dismiss after 5 seconds
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [latest]);

  // Audio Cue Trigger on Escalation
  useEffect(() => {
    if (!latest || !soundOn || !visible) return;
    if (latest.tier === "WARNING") {
      beep();
    }
  }, [latest, soundOn, visible]);

  if (!latest || !visible) return (
    <div className="pointer-events-auto flex items-center gap-2">
      <button
        type="button"
        className={`hud-panel px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 ${
          soundOn ? "border-blue-500/30 text-blue-300 bg-blue-500/10" : "border-white/10 text-slate-400 bg-white/5 hover:bg-white/10"
        }`}
        onClick={() => setSoundOn(!soundOn)}
      >
        {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        Audio {soundOn ? "ON" : "OFF"}
      </button>
    </div>
  );

  const IconComp = ICONS[latest.tier] || Info;
  const symbol = SYMBOLS[latest.tier] || "🔵";

  return (
    <div className="pointer-events-auto flex items-center gap-2.5 max-w-full">
      <div
        className={`flex items-center gap-2.5 rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-2xl backdrop-blur-md transition-all ${
          COLOR[latest.tier] || "bg-black/50 border-white/10"
        }`}
      >
        <span className="text-sm leading-none">{symbol}</span>
        <IconComp className="h-4 w-4 shrink-0 animate-pulse" />
        <span className="normal-case font-medium text-slate-100">{latest.message}</span>
      </div>
      <button
        type="button"
        className={`hud-panel px-3 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
          soundOn ? "border-blue-500/30 text-blue-300 bg-blue-500/10" : "border-white/10 text-slate-400 bg-white/5 hover:bg-white/10"
        }`}
        onClick={() => setSoundOn(!soundOn)}
      >
        {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        Audio {soundOn ? "ON" : "OFF"}
      </button>
    </div>
  );
}
