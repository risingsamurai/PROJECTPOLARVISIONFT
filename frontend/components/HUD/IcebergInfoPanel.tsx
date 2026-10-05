"use client";

import { usePolarisStore } from "@/lib/store";
import { useMemo, useState } from "react";
import { haversineNm } from "@/lib/geo";

export function IcebergInfoPanel() {
  const id = usePolarisStore((s) => s.selectedIcebergId);
  const icebergs = usePolarisStore((s) => s.icebergs);
  const vessel = usePolarisStore((s) => s.vessel);
  const select = usePolarisStore((s) => s.selectIceberg);
  const iceberg = icebergs.find((i) => i.id === id);

  const [activeTab, setActiveTab] = useState<"all" | 24 | 48 | 72>("all");

  // Distance from vessel to selected iceberg
  const distance = useMemo(() => {
    if (!iceberg || !vessel) return null;
    return haversineNm(vessel, iceberg).toFixed(2);
  }, [iceberg, vessel]);

  // Compute 2D radar coordinates for T=0, +24h, +48h, +72h
  const minimapData = useMemo(() => {
    if (!iceberg) return null;
    const pts = iceberg.predictedPath && iceberg.predictedPath.length > 0
      ? iceberg.predictedPath
      : [
          { hour: 0, lat: iceberg.lat, lon: iceberg.lon },
          { hour: 24, lat: iceberg.lat + 0.08, lon: iceberg.lon + 0.12 },
          { hour: 48, lat: iceberg.lat + 0.15, lon: iceberg.lon + 0.22 },
          { hour: 72, lat: iceberg.lat + 0.21, lon: iceberg.lon + 0.31 },
        ];

    // Origin is T=0 (or first point)
    const p0 = pts[0] || { hour: 0, lat: iceberg.lat, lon: iceberg.lon };
    
    // Calculate total displacement in NM
    const pLast = pts[pts.length - 1];
    const totalDisplacementNm = haversineNm(
      { lat: p0.lat, lon: p0.lon },
      { lat: pLast.lat, lon: pLast.lon }
    );

    // Max delta range for SVG scaling
    const deltas = pts.map((p) => {
      const dLatNm = (p.lat - p0.lat) * 60;
      const dLonNm = (p.lon - p0.lon) * Math.cos((p0.lat * Math.PI) / 180) * 60;
      const distFromOriginNm = Math.hypot(dLatNm, dLonNm);
      return { ...p, dLatNm, dLonNm, distFromOriginNm };
    });

    const maxDelta = Math.max(8, ...deltas.map((d) => Math.max(Math.abs(d.dLatNm), Math.abs(d.dLonNm))));
    const scale = 52 / (maxDelta || 1); // Fit within 140x140 box

    const svgPts = deltas.map((d) => ({
      ...d,
      svgX: 75 + d.dLonNm * scale,
      svgY: 75 - d.dLatNm * scale, // SVG y is inverted
      errRadiusPx: Math.max(5, (4.5 * Math.sqrt(Math.max(1, d.hour) / 24)) * scale),
    }));

    return {
      pts: svgPts,
      totalDisplacementNm,
      maxDelta,
    };
  }, [iceberg]);

  return (
    <section className="hud-panel p-3.5 w-80 bg-slate-950/85 backdrop-blur-md border border-cyan-500/20 rounded-xl text-white shadow-2xl pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5 gap-2 border-b border-white/10 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <h2 className="hud-header text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">
            Iceberg Telemetry
          </h2>
        </div>
        {icebergs.length > 0 && (
          <div className="flex items-center gap-1">
            <select
              value={id ?? ""}
              onChange={(e) => {
                select(e.target.value || null);
              }}
              className="bg-black/70 text-cyan-300 text-[10px] font-mono border border-cyan-500/40 rounded px-1.5 py-0.5 outline-none cursor-pointer truncate max-w-[130px] hover:border-cyan-400"
            >
              <option value="">Select Target...</option>
              {icebergs.map((ib) => (
                <option key={ib.id} value={ib.id}>
                  {ib.name} ({ib.id})
                </option>
              ))}
            </select>
            {id && (
              <button
                type="button"
                onClick={() => select(null)}
                title="Return focus to vessel"
                className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70 text-[10px] font-mono"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {!iceberg ? (
        <div className="py-5 text-center bg-black/20 rounded-lg border border-dashed border-white/10">
          <p className="text-xs font-semibold text-white/60">No Iceberg Selected</p>
          <p className="text-[10px] text-cyan-300/60 mt-1">
            Click any iceberg in 3D to fly camera to it & inspect 72h LSTM predictions
          </p>
          <div className="mt-2 text-[10px] font-mono text-white/30">
            38 BYU/NIC Tracked Icebergs
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Main Attributes */}
          <div className="grid grid-cols-2 gap-1.5 bg-black/40 p-2 rounded-lg border border-white/5 text-xs font-mono">
            <div>
              <span className="text-white/40 text-[10px] block">NAME / ID</span>
              <span className="font-bold text-cyan-300 text-[11px] truncate block">
                {iceberg.name} <span className="text-white/50 text-[10px]">({iceberg.id})</span>
              </span>
            </div>
            <div>
              <span className="text-white/40 text-[10px] block">SHIP DISTANCE</span>
              <span className="font-bold text-emerald-400 text-[11px] block">
                {distance} NM
              </span>
            </div>
            <div>
              <span className="text-white/40 text-[10px] block">SIZE / DIAMETER</span>
              <span className="text-white/90 text-[11px] block">
                {iceberg.diameterNm.toFixed(1)} NM ({iceberg.sizeClass})
              </span>
            </div>
            <div>
              <span className="text-white/40 text-[10px] block">DRIFT / HEADING</span>
              <span className="text-white/90 text-[11px] block">
                {iceberg.headingDeg.toFixed(0)}° @ 0.4 kt
              </span>
            </div>
          </div>

          {/* Dedicated LSTM Drift Trajectory Minimap */}
          {minimapData && (
            <div className="bg-slate-950/90 rounded-lg p-2.5 border border-cyan-500/30 shadow-inner">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                    72h LSTM Drift Minimap
                  </span>
                  <span className="text-[9px] bg-cyan-950 text-cyan-300 px-1 py-0.2 rounded border border-cyan-700/40">
                    Hybrid AI
                  </span>
                </div>
                <span className="text-[9px] font-mono text-white/40">
                  Δ {minimapData.totalDisplacementNm.toFixed(1)} NM
                </span>
              </div>

              {/* Minimap Radar SVG */}
              <div className="relative w-full h-[150px] bg-slate-900/90 rounded border border-cyan-900/50 overflow-hidden flex items-center justify-center">
                <svg viewBox="0 0 150 150" className="w-full h-full">
                  {/* Grid Range Rings */}
                  <circle cx="75" cy="75" r="28" fill="none" stroke="#38bdf8" strokeOpacity="0.12" strokeDasharray="2 2" />
                  <circle cx="75" cy="75" r="54" fill="none" stroke="#38bdf8" strokeOpacity="0.15" />
                  <line x1="75" y1="4" x2="75" y2="146" stroke="#38bdf8" strokeOpacity="0.1" />
                  <line x1="4" y1="75" x2="146" y2="75" stroke="#38bdf8" strokeOpacity="0.1" />

                  {/* Compass Indicators */}
                  <text x="75" y="10" textAnchor="middle" fill="#94a3b8" fontSize="7" fontFamily="monospace">N</text>
                  <text x="142" y="77" textAnchor="end" fill="#94a3b8" fontSize="7" fontFamily="monospace">E</text>

                  {/* Drift Path Polyline */}
                  <polyline
                    points={minimapData.pts.map((p) => `${p.svgX.toFixed(1)},${p.svgY.toFixed(1)}`).join(" ")}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="3 2"
                  />

                  {/* Uncertainty error zones & Waypoint Nodes */}
                  {minimapData.pts.map((p) => {
                    const isOrigin = p.hour === 0;
                    const col = isOrigin ? "#38bdf8" : p.hour === 24 ? "#10b981" : p.hour === 48 ? "#f59e0b" : "#c084fc";
                    const isFocused = activeTab === "all" || activeTab === p.hour;

                    return (
                      <g key={p.hour} opacity={isFocused ? 1 : 0.4}>
                        {/* Uncertainty Error Circle */}
                        {!isOrigin && (
                          <circle
                            cx={p.svgX}
                            cy={p.svgY}
                            r={p.errRadiusPx}
                            fill={col}
                            fillOpacity="0.12"
                            stroke={col}
                            strokeWidth="0.8"
                            strokeDasharray="2 1"
                          />
                        )}

                        {/* Waypoint Point */}
                        <circle
                          cx={p.svgX}
                          cy={p.svgY}
                          r={isOrigin ? 4 : 3}
                          fill={col}
                          stroke="#ffffff"
                          strokeWidth="1"
                        />

                        {/* Hour Label */}
                        <text
                          x={p.svgX + 5}
                          y={p.svgY - 4}
                          fill={col}
                          fontSize="8"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {isOrigin ? "T=0" : `+${p.hour}h`}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Radar Legend Overlay */}
                <div className="absolute bottom-1 right-1 px-1 bg-black/60 rounded text-[8px] font-mono text-white/50">
                  Scale: ±{minimapData.maxDelta.toFixed(0)} NM
                </div>
              </div>

              {/* Prediction Step Tabs / Breakdown */}
              <div className="grid grid-cols-4 gap-1 mt-2">
                {(["all", 24, 48, 72] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`py-0.5 px-1 rounded text-[9px] font-mono font-bold transition-all border ${
                      activeTab === tab
                        ? "bg-cyan-500/30 border-cyan-400 text-cyan-200"
                        : "bg-black/40 border-white/10 text-white/50 hover:bg-white/10"
                    }`}
                  >
                    {tab === "all" ? "ALL" : `+${tab}h`}
                  </button>
                ))}
              </div>

              {/* Coordinates List */}
              <div className="mt-1.5 space-y-1">
                {minimapData.pts.slice(1).map((pt) => {
                  if (activeTab !== "all" && activeTab !== pt.hour) return null;
                  const tagCol = pt.hour === 24 ? "text-emerald-300" : pt.hour === 48 ? "text-amber-300" : "text-purple-300";
                  return (
                    <div
                      key={pt.hour}
                      className="flex items-center justify-between text-[10px] font-mono bg-black/40 px-2 py-0.5 rounded border border-white/5"
                    >
                      <span className={`font-bold ${tagCol}`}>+{pt.hour}h Horizon</span>
                      <span className="text-white/80">
                        {pt.lat.toFixed(3)}° S, {Math.abs(pt.lon).toFixed(3)}° W
                      </span>
                      <span className="text-white/40 text-[9px]">
                        ±{(4.5 * Math.sqrt(pt.hour / 24)).toFixed(1)} NM
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Controls */}
          <div className="space-y-1.5 pt-1 border-t border-white/10">
            {vessel && (() => {
              const d = haversineNm(vessel, iceberg);
              const dangerR = iceberg.dangerRadiusNm || 7.0;
              const standoff = (dangerR + 0.5).toFixed(1);
              return (
                <div className="text-[10px] text-cyan-300/90 font-mono bg-cyan-950/50 p-1.5 rounded border border-cyan-500/30 flex items-center justify-between">
                  <span>Standoff Clearance:</span>
                  <span className="font-bold text-white">{standoff} NM Buffer</span>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  // Re-trigger select to ensure focus
                  select(iceberg.id);
                }}
                className="py-1.5 px-2 rounded-lg bg-cyan-700/80 hover:bg-cyan-600 text-white text-[10px] font-bold transition-all flex items-center justify-center gap-1 shadow border border-cyan-400/40"
              >
                <span>🎯 Camera on Berg</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  select(null);
                }}
                className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold transition-all flex items-center justify-center gap-1 shadow border border-white/10"
              >
                <span>🚢 Focus Vessel</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!iceberg || !vessel) return;
                const d = haversineNm(vessel, iceberg);
                const dangerR = iceberg.dangerRadiusNm || 7.0;
                const standoffD = dangerR + 0.5;
                const approachT = d > standoffD ? (d - standoffD) / d : 0.0;
                const destLat = vessel.lat + (iceberg.lat - vessel.lat) * approachT;
                const destLon = vessel.lon + (iceberg.lon - vessel.lon) * approachT;
                const dest = { lat: Number(destLat.toFixed(4)), lon: Number(destLon.toFixed(4)) };
                usePolarisStore.getState().setDestination(dest);
                usePolarisStore
                  .getState()
                  .fetchRoutesIfNeeded([vessel.lat, vessel.lon], [dest.lat, dest.lon], true);
              }}
              className="w-full py-1.5 px-3 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg border border-emerald-400/40"
            >
              <span>Route to Safe Standoff &rarr;</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
