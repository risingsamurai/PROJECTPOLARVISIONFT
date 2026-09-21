"use client";

import { ExportPdfButton } from "@/components/HUD/ExportPdfButton";
import { selectLockedRoute, usePolarisStore } from "@/lib/store";

export function RouteInfoPanel() {
  const route = usePolarisStore(selectLockedRoute);
  const recalculate = usePolarisStore((s) => s.recalculateRoute);
  const version = usePolarisStore((s) => s.routeVersion);
  const lockedRouteId = usePolarisStore((s) => s.lockedRouteId);
  const lockRoute = usePolarisStore((s) => s.lockRoute);

  if (!route) return null;

  const profileColor =
    route.id === "safest"
      ? "text-emerald-400"
      : route.id === "balanced"
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <section className="hud-panel p-3.5 w-72 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-white shadow-xl">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="hud-header text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
          Navigation Plan
        </h2>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
          Rev {version}
        </span>
      </div>

      {/* Profile Selection Tabs */}
      <div className="grid grid-cols-3 gap-1.5 mb-3 bg-black/40 p-1 rounded-lg border border-white/5">
        {(["safest", "balanced", "fastest"] as const).map((pid) => {
          const isSelected = lockedRouteId === pid;
          const label = pid.charAt(0).toUpperCase() + pid.slice(1);
          const activeStyle =
            pid === "safest"
              ? "bg-emerald-500/25 text-emerald-300 border-emerald-400/60 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
              : pid === "balanced"
              ? "bg-amber-500/25 text-amber-300 border-amber-400/60 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
              : "bg-rose-500/25 text-rose-300 border-rose-400/60 shadow-[0_0_8px_rgba(244,63,94,0.3)]";

          return (
            <button
              key={pid}
              type="button"
              onClick={() => lockRoute(pid)}
              className={`py-1 px-1.5 text-[10px] font-bold tracking-wider rounded border transition-all ${
                isSelected
                  ? `${activeStyle} font-extrabold`
                  : "border-transparent text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs mb-3.5">
        <dt className="text-white/45 text-[11px]">Selected Profile</dt>
        <dd className={`font-semibold capitalize ${profileColor}`}>{route.name}</dd>
        <dt className="text-white/45 text-[11px]">Route Distance</dt>
        <dd className="tabular-nums font-mono text-white/90 font-semibold">
          {route.distanceNm.toFixed(1)} NM
        </dd>
        <dt className="text-white/45 text-[11px]">Estimated ETA</dt>
        <dd className="tabular-nums font-mono text-white/90">
          {route.etaHours.toFixed(1)} hrs
        </dd>
        <dt className="text-white/45 text-[11px]">Est. Fuel Burn</dt>
        <dd className="tabular-nums font-mono text-white/90">
          {route.fuelMt.toFixed(1)} MT
        </dd>
        <dt className="text-white/45 text-[11px]">Risk Factor</dt>
        <dd className="tabular-nums font-mono text-emerald-400 font-semibold">
          {(route.riskScore * 100).toFixed(0)}%
        </dd>
      </dl>

      <div className="space-y-2">
        <button
          type="button"
          onClick={recalculate}
          className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 transition-all text-white px-3 py-2 text-xs font-bold uppercase tracking-wider shadow-md shadow-cyan-600/30"
        >
          Recalculate Route
        </button>
        <ExportPdfButton />
      </div>
    </section>
  );
}

