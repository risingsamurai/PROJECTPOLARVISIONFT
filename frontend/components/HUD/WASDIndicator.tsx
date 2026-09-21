"use client";

import { usePolarisStore } from "@/lib/store";

export function WASDIndicator() {
  const keys = usePolarisStore((s) => s.keys);
  const sog = usePolarisStore((s) => s.vessel.sogKnots);

  const wActive = keys.w || keys.up;
  const aActive = keys.a || keys.left;
  const sActive = keys.s || keys.down;
  const dActive = keys.d || keys.right;

  let stateLabel = "IDLE";
  if (sog > 0.1) stateLabel = "FORWARD";
  else if (sog < -0.1) stateLabel = "REVERSE";

  return (
    <section className="hud-panel p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-white shadow-xl pointer-events-auto select-none">
      <div className="flex flex-col items-center gap-2">
        {/* Keyboard Layout */}
        <div className="flex flex-col items-center gap-1.5">
          {/* Row 1: empty, W, empty */}
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-8" />
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs border transition-all duration-150 ${
                wActive
                  ? "bg-cyan-500 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.6)] scale-95"
                  : "bg-white/10 border-white/15 text-white/80"
              }`}
            >
              W
            </div>
            <div className="w-8 h-8" />
          </div>

          {/* Row 2: A, S, D */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs border transition-all duration-150 ${
                aActive
                  ? "bg-cyan-500 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.6)] scale-95"
                  : "bg-white/10 border-white/15 text-white/80"
              }`}
            >
              A
            </div>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs border transition-all duration-150 ${
                sActive
                  ? "bg-cyan-500 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.6)] scale-95"
                  : "bg-white/10 border-white/15 text-white/80"
              }`}
            >
              S
            </div>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs border transition-all duration-150 ${
                dActive
                  ? "bg-cyan-500 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.6)] scale-95"
                  : "bg-white/10 border-white/15 text-white/80"
              }`}
            >
              D
            </div>
          </div>
        </div>

        {/* Speed and State Readouts */}
        <div className="text-center pt-1 border-t border-white/10 w-full min-w-[110px]">
          <div className="text-[11px] font-mono font-bold text-cyan-300 tracking-wider">
            SPEED {Math.abs(sog).toFixed(1)} kn
          </div>
          <div className="text-[9px] font-mono tracking-widest text-white/50 uppercase mt-0.5">
            {stateLabel}
          </div>
        </div>
      </div>
    </section>
  );
}
