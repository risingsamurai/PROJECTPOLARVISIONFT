"use client";

import { ExportPdfButton } from "@/components/HUD/ExportPdfButton";
import { selectLockedRoute, usePolarisStore } from "@/lib/store";

const PROFILE_CONFIG = {
  safest:   { label: "Safest",   color: "text-emerald-400", active: "bg-emerald-500/25 text-emerald-300 border-emerald-400/60 shadow-[0_0_8px_rgba(16,185,129,0.3)]" },
  balanced: { label: "Balanced", color: "text-amber-400",   active: "bg-amber-500/25 text-amber-300 border-amber-400/60 shadow-[0_0_8px_rgba(245,158,11,0.3)]" },
  eco:      { label: "Eco",      color: "text-cyan-400",    active: "bg-cyan-500/25 text-cyan-300 border-cyan-400/60 shadow-[0_0_8px_rgba(6,182,212,0.3)]" },
  fastest:  { label: "Fastest",  color: "text-rose-400",    active: "bg-rose-500/25 text-rose-300 border-rose-400/60 shadow-[0_0_8px_rgba(244,63,94,0.3)]" },
} as const;

export function RouteInfoPanel() {
  const route = usePolarisStore(selectLockedRoute);
  const routes = usePolarisStore((s) => s.routes);
  const recalculate = usePolarisStore((s) => s.recalculateRoute);
  const version = usePolarisStore((s) => s.routeVersion);
  const lockedRouteId = usePolarisStore((s) => s.lockedRouteId);
  const lockRoute = usePolarisStore((s) => s.lockRoute);

  if (!route) return null;

  const cfg = PROFILE_CONFIG[route.id as keyof typeof PROFILE_CONFIG] ?? PROFILE_CONFIG.balanced;

  // Fuel saved vs Fastest
  const fastestRoute = routes.find((r) => r.id === "fastest");
  const fuelSavedMt = fastestRoute ? fastestRoute.fuelMt - route.fuelMt : null;
  const fuelSavedPct = fastestRoute && fastestRoute.fuelMt > 0
    ? ((fastestRoute.fuelMt - route.fuelMt) / fastestRoute.fuelMt) * 100
    : null;
  const showFuelSaved = fuelSavedMt !== null && fuelSavedMt > 0.5 && route.id !== "fastest";

  const profileIds = Object.keys(PROFILE_CONFIG) as Array<keyof typeof PROFILE_CONFIG>;

  return (
    <section
      id="route-info-panel"
      className="hud-panel p-3.5 w-72 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-white shadow-xl"
    >
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="hud-header text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
          Navigation Plan
        </h2>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
          Rev {version}
        </span>
      </div>

      {/* Profile Selection Tabs */}
      <div className="grid grid-cols-4 gap-1 mb-3 bg-black/40 p-1 rounded-lg border border-white/5">
        {profileIds.map((pid) => {
          // Only show profiles that exist in current route results
          const routeExists = routes.some((r) => r.id === pid);
          if (!routeExists) return null;
          const isSelected = lockedRouteId === pid;
          const c = PROFILE_CONFIG[pid];
          return (
            <button
              key={pid}
              id={`profile-tab-${pid}`}
              type="button"
              onClick={() => lockRoute(pid)}
              className={`py-1 px-1 text-[9px] font-bold tracking-wider rounded border transition-all ${
                isSelected
                  ? `${c.active} font-extrabold`
                  : "border-transparent text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Main Stats */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs mb-3.5">
        <dt className="text-white/45 text-[11px]">Selected Profile</dt>
        <dd className={`font-semibold capitalize ${cfg.color}`}>{route.name}</dd>

        <dt className="text-white/45 text-[11px]">Route Distance</dt>
        <dd className="tabular-nums font-mono text-white/90 font-semibold">
          {route.distanceNm.toFixed(1)} NM
        </dd>

        <dt className="text-white/45 text-[11px]">Estimated ETA</dt>
        <dd className="tabular-nums font-mono text-white/90">
          {route.etaHours.toFixed(1)} hrs
          {route.avgSpeedKts ? (
            <span className="text-white/40 ml-1">@ {route.avgSpeedKts} kt</span>
          ) : null}
        </dd>

        <dt className="text-white/45 text-[11px]">Est. Fuel Burn</dt>
        <dd className="tabular-nums font-mono text-white/90">
          {route.fuelMt.toFixed(1)} MT
        </dd>

        {route.fuelBreakdown && (
          <>
            <dt className="text-white/30 text-[10px] pl-2">↳ Base</dt>
            <dd className="tabular-nums font-mono text-white/55 text-[10px]">
              {route.fuelBreakdown.baseMt.toFixed(1)} MT
            </dd>
            <dt className="text-white/30 text-[10px] pl-2">↳ Ice added</dt>
            <dd className="tabular-nums font-mono text-cyan-400/70 text-[10px]">
              +{route.fuelBreakdown.iceAddedMt.toFixed(1)} MT
            </dd>
            <dt className="text-white/30 text-[10px] pl-2">↳ Weather</dt>
            <dd className="tabular-nums font-mono text-amber-400/70 text-[10px]">
              +{route.fuelBreakdown.weatherAddedMt.toFixed(1)} MT
            </dd>
          </>
        )}

        <dt className="text-white/45 text-[11px]">Risk Factor</dt>
        <dd className="tabular-nums font-mono text-emerald-400 font-semibold">
          {(route.riskScore * 100).toFixed(0)}%
        </dd>
      </dl>

      {/* Fuel saved badge (show for eco/safest/balanced vs fastest) */}
      {showFuelSaved && fuelSavedMt !== null && fuelSavedPct !== null && (
        <div className="mb-3 rounded-lg bg-cyan-500/10 border border-cyan-500/25 px-3 py-2 text-[11px] flex items-center gap-2">
          <span className="text-cyan-400 text-base">⛽</span>
          <div>
            <span className="text-cyan-300 font-bold">{fuelSavedMt.toFixed(1)} MT saved</span>
            <span className="text-white/50 ml-1">({fuelSavedPct.toFixed(0)}%)</span>
            <div className="text-white/35 text-[10px]">vs Fastest profile</div>
          </div>
        </div>
      )}

      {/* Comparison table (all profiles) */}
      {routes.length > 1 && (
        <div className="mb-3 rounded-lg bg-white/5 border border-white/8 overflow-hidden">
          <table className="w-full text-[10px] text-white/70">
            <thead>
              <tr className="bg-white/8 text-white/40 uppercase tracking-wider">
                <th className="px-2 py-1 text-left font-semibold">Profile</th>
                <th className="px-1 py-1 text-right font-semibold">NM</th>
                <th className="px-1 py-1 text-right font-semibold">ETA</th>
                <th className="px-1 py-1 text-right font-semibold">Fuel</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => {
                const rc = PROFILE_CONFIG[r.id as keyof typeof PROFILE_CONFIG];
                const isActive = r.id === lockedRouteId;
                return (
                  <tr
                    key={r.id}
                    onClick={() => lockRoute(r.id)}
                    className={`cursor-pointer transition-colors ${isActive ? "bg-white/10" : "hover:bg-white/5"}`}
                  >
                    <td className={`px-2 py-1 font-semibold ${rc?.color ?? "text-white"}`}>{rc?.label ?? r.name}</td>
                    <td className="px-1 py-1 text-right font-mono tabular-nums">{r.distanceNm.toFixed(0)}</td>
                    <td className="px-1 py-1 text-right font-mono tabular-nums">{r.etaHours.toFixed(0)}h</td>
                    <td className="px-1 py-1 text-right font-mono tabular-nums">{r.fuelMt.toFixed(0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-2">
        <button
          id="recalculate-route-btn"
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
