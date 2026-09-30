"use client";

import { usePolarisStore } from "@/lib/store";
import type { RiskTier, WildlifeColony } from "@/lib/mockData";

const RISK_STYLES: Record<RiskTier, { badge: string; text: string }> = {
  Critical: {
    badge: "bg-red-500/20 text-red-400 border-red-500/40",
    text: "text-red-400",
  },
  High: {
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    text: "text-amber-400",
  },
  Moderate: {
    badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    text: "text-yellow-300",
  },
  Low: {
    badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    text: "text-emerald-400",
  },
};

function MiniSparkline({ data, riskTier }: { data: number[]; riskTier: RiskTier }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 160;
  const height = 32;
  const padding = 4;

  const points = data
    .map((val, idx) => {
      const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const strokeColor =
    riskTier === "Critical"
      ? "#ef4444"
      : riskTier === "High"
      ? "#f59e0b"
      : riskTier === "Moderate"
      ? "#eab308"
      : "#10b981";

  return (
    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
      <div className="text-[9px] text-slate-500 uppercase font-semibold">7-Day Census Trend</div>
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        {data.map((val, idx) => {
          const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
          const y = height - padding - ((val - min) / range) * (height - padding * 2);
          return (
            <circle
              key={idx}
              cx={x}
              cy={y}
              r={idx === data.length - 1 ? 2.5 : 1.5}
              fill={strokeColor}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function WildlifeInfoCard() {
  const colonies = usePolarisStore((s) => s.colonies);
  const selectedId = usePolarisStore((s) => s.selectedColonyId);
  const selectColony = usePolarisStore((s) => s.selectColony);
  const isLayerVisible = usePolarisStore((s) => s.layers.wildlife);

  if (!isLayerVisible) return null;

  const colony: WildlifeColony | undefined = colonies.find((c) => c.id === selectedId);

  if (!colony) return null;

  const risk = RISK_STYLES[colony.riskTier] || RISK_STYLES.Moderate;

  return (
    <aside className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-white shadow-2xl p-3.5 w-80 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-start justify-between gap-2 mb-2 pb-1.5 border-b border-white/10">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Antarctic Wildlife Habitat</p>
          <h3 className="text-sm font-bold text-teal-300 flex items-center gap-1.5 mt-0.5">
            <span className="inline-block w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            {colony.name}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => selectColony(null)}
          className="text-white/40 hover:text-white text-xs px-1.5 py-0.5 rounded border border-white/10 hover:border-white/30 transition-colors"
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1.5 mb-2.5">
        <div className="flex justify-between items-baseline text-[11px]">
          <span className="text-slate-400">Species</span>
          <span className="font-semibold text-slate-100 text-right">{colony.species}</span>
        </div>
        <div className="flex justify-between items-baseline text-[11px]">
          <span className="text-slate-400">Colony Type</span>
          <span className="text-slate-300">{colony.colonyType}</span>
        </div>
        <div className="flex justify-between items-baseline text-[11px]">
          <span className="text-slate-400">Population</span>
          <span className="font-bold text-slate-100 tabular-nums">{colony.population}</span>
        </div>
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-slate-400">Eco-Risk Status</span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${risk.badge}`}
          >
            {colony.riskTier} Risk
          </span>
        </div>
      </div>

      <div className="bg-white/5 rounded-lg p-2 mb-2 text-[10.5px] text-slate-300 leading-snug border border-white/5">
        <span className="text-white/40 font-semibold block text-[9px] uppercase tracking-wider mb-0.5">
          Advisory / Reason
        </span>
        {colony.reason}
      </div>

      <MiniSparkline data={colony.sparkline} riskTier={colony.riskTier} />
    </aside>
  );
}
