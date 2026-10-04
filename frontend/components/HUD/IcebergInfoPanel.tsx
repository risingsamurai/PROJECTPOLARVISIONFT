"use client";

import { usePolarisStore } from "@/lib/store";
import { useMemo } from "react";
import { haversineNm } from "@/lib/geo";

export function IcebergInfoPanel() {
  const id = usePolarisStore((s) => s.selectedIcebergId);
  const icebergs = usePolarisStore((s) => s.icebergs);
  const vessel = usePolarisStore((s) => s.vessel);
  const select = usePolarisStore((s) => s.selectIceberg);
  const iceberg = icebergs.find((i) => i.id === id);

  // Calculate distance from vessel to selected iceberg
  const distance = useMemo(() => {
    if (!iceberg || !vessel) return null;
    const distanceNm = haversineNm(vessel, iceberg);
    return distanceNm.toFixed(2);
  }, [iceberg, vessel]);

  return (
    <section className="hud-panel p-3.5 w-72 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-white shadow-xl pointer-events-auto">
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <h2 className="hud-header text-[10px] font-bold uppercase tracking-[0.18em] text-white/50 shrink-0">
          Iceberg Telemetry
        </h2>
        {icebergs.length > 0 && (
          <select
            value={id ?? ""}
            onChange={(e) => {
              select(e.target.value || null);
            }}
            className="bg-black/60 text-cyan-300 text-[10px] font-mono border border-cyan-500/30 rounded px-1.5 py-0.5 outline-none cursor-pointer truncate max-w-[140px]"
          >
            <option value="">Select Target...</option>
            {icebergs.map((ib) => (
              <option key={ib.id} value={ib.id}>
                {ib.name} ({ib.id})
              </option>
            ))}
          </select>
        )}
      </div>

      {!iceberg ? (
        <div className="py-4 text-center">
          <p className="text-xs text-white/40">Select an iceberg target above or in 3D scene</p>
          <p className="text-[10px] text-white/25 mt-0.5">38 NIC/BYU Icebergs Tracked</p>
        </div>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-white/45 text-[11px]">ID</dt>
          <dd className="font-semibold font-mono text-cyan-300 tabular-nums">
            {iceberg.id}
          </dd>
          <dt className="text-white/45 text-[11px]">Designation</dt>
          <dd className="font-semibold text-white/90">{iceberg.name}</dd>
          <dt className="text-white/45 text-[11px]">Distance</dt>
          <dd className="tabular-nums font-mono text-white/90">
            {distance} NM
          </dd>
          <dt className="text-white/45 text-[11px]">Diameter</dt>
          <dd className="tabular-nums font-mono text-white/90">
            {iceberg.diameterNm.toFixed(1)} NM
          </dd>
          <dt className="text-white/45 text-[11px]">Size Class</dt>
          <dd className="uppercase text-[11px] font-semibold text-sky-200">
            {iceberg.sizeClass.replace("_", " ")}
          </dd>
          <dt className="text-white/45 text-[11px]">Coordinates</dt>
          <dd className="tabular-nums font-mono text-[11px] text-white/80">
            {iceberg.lat.toFixed(3)}° S, {Math.abs(iceberg.lon).toFixed(3)}° W
          </dd>
          <dt className="text-white/45 text-[11px]">Drift Heading</dt>
          <dd className="tabular-nums font-mono text-[11px] text-white/80">
            {iceberg.headingDeg.toFixed(0)}°
          </dd>
          <dt className="text-white/45 text-[11px]">Status</dt>
          <dd className="uppercase text-[11px] font-semibold text-white/90">
            {iceberg.status}
          </dd>
          {iceberg.predictedPath && iceberg.predictedPath.length > 1 && (
            <>
              <dt className="text-cyan-400/80 text-[10px] col-span-2 pt-1.5 mt-1 border-t border-white/10 font-bold uppercase tracking-wider">
                Hybrid LSTM Predictions
              </dt>
              {iceberg.predictedPath.slice(1).map((pt) => (
                <dd key={pt.hour} className="col-span-2 flex justify-between text-[10px] font-mono text-cyan-200/90 pl-1">
                  <span>+{pt.hour}h: {pt.lat.toFixed(3)}°, {pt.lon.toFixed(3)}°</span>
                  <span className="text-cyan-400/70">±{(4.5 * Math.sqrt(pt.hour / 24)).toFixed(1)} NM</span>
                </dd>
              ))}
            </>
          )}
          <div className="col-span-2 pt-2 mt-2 border-t border-white/10">
            {vessel && (() => {
              const d = haversineNm(vessel, iceberg);
              const dangerR = iceberg.dangerRadiusNm || 7.0;
              const standoff = (dangerR + 0.5).toFixed(1);
              return (
                <div className="mb-2 text-[10px] text-cyan-300/80 font-mono bg-cyan-950/40 p-1.5 rounded border border-cyan-500/20">
                  Approach point: {standoff} NM standoff from {iceberg.name} (dist {d.toFixed(1)} NM)
                </div>
              );
            })()}
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
              className="w-full py-1.5 px-3 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-[11px] font-bold font-sans transition-all flex items-center justify-center gap-1.5 shadow-lg border border-emerald-400/40"
            >
              <span>Route to Target Iceberg &rarr;</span>
            </button>
          </div>
        </dl>
      )}
    </section>
  );
}
