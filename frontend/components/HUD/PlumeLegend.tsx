"use client";

import { usePolarisStore } from "@/lib/store";

export function PlumeLegend() {
  const isPlumeVisible = usePolarisStore((s) => s.layers.freshwaterPlume);
  const forecastDay = usePolarisStore((s) => s.forecastDay);
  const setForecastDay = usePolarisStore((s) => s.setForecastDay);

  if (!isPlumeVisible) return null;

  return (
    <aside className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-white shadow-2xl p-3 w-64 text-[10px] space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Ocean Flow &amp; Freshwater</h3>
        <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-mono font-bold">
          ERA5 7-DAY
        </span>
      </div>

      {/* 7-day forecast slider */}
      <div className="space-y-1 bg-white/5 p-2 rounded-lg border border-white/5">
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-slate-400 font-semibold">Forecast Advection</span>
          <span className="text-cyan-300 font-bold tabular-nums">Day {forecastDay} of 7</span>
        </div>
        <input
          type="range"
          min={1}
          max={7}
          step={1}
          value={forecastDay}
          onChange={(e) => setForecastDay(Number(e.target.value))}
          className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-white/20 rounded-lg appearance-none"
        />
        <div className="flex justify-between text-[8.5px] text-slate-500 font-mono">
          <span>T+00h</span>
          <span>T+72h</span>
          <span>T+168h</span>
        </div>
      </div>

      {/* Freshwater Salinity Anomaly Scale */}
      <div>
        <div className="flex justify-between text-[9px] text-slate-400 mb-1 font-medium">
          <span>0.0 PSU (Ambient)</span>
          <span>-2.0 PSU (Melt)</span>
        </div>
        <div
          className="h-2 w-full rounded-full border border-white/20"
          style={{
            background:
              "linear-gradient(to right, rgba(14, 165, 233, 0.45), rgba(56, 189, 248, 0.8), rgba(186, 230, 253, 0.98))",
          }}
        />
      </div>

      {/* Flow vector / particle indicator */}
      <div className="flex items-center justify-between pt-1.5 border-t border-white/10 text-[9px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3.5 h-1 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/80 animate-pulse" />
          <span>Streamline Particles</span>
        </div>
        <span className="text-cyan-300 font-bold tabular-nums">0.3–1.8 kn</span>
      </div>
    </aside>
  );
}
