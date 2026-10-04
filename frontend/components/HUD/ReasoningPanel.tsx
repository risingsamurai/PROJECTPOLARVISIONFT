"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePolarisStore, selectLockedRoute } from "@/lib/store";
import { haversineNm } from "@/lib/geo";
import { BrainCircuit, Compass, ShieldAlert, Navigation } from "lucide-react";

interface LogEntry {
  id: string;
  time: string;
  text: string;
  category: "route" | "iceberg" | "risk";
}

function getBearingString(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const dLat = lat2 - lat1;
  const meanLatRad = (((lat1 + lat2) / 2) * Math.PI) / 180;
  const dLon = (lon2 - lon1) * Math.cos(meanLatRad);
  const angle = (Math.atan2(dLon, dLat) * 180) / Math.PI;
  const normalized = (angle + 360) % 360;
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(normalized / 45) % 8;
  return directions[index];
}

export function ReasoningPanel() {
  const routes = usePolarisStore((s) => s.routes);
  const lockedRouteId = usePolarisStore((s) => s.lockedRouteId);
  const routeVersion = usePolarisStore((s) => s.routeVersion);
  const vessel = usePolarisStore((s) => s.vessel);
  const destination = usePolarisStore((s) => s.destination);
  const icebergs = usePolarisStore((s) => s.icebergs);
  const activeRoute = usePolarisStore(selectLockedRoute);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Helper to push a log line
  const addLog = (text: string, category: LogEntry["category"]) => {
    const time = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogs((prev) => [
      ...prev.slice(-25),
      {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        time,
        text,
        category,
      },
    ]);
  };

  // Find nearest iceberg
  const nearestIceberg = useMemo(() => {
    if (!icebergs || icebergs.length === 0) return null;
    let closest = icebergs[0];
    let minDist = 999999;
    for (const ib of icebergs) {
      const d = haversineNm(vessel, ib);
      if (d < minDist) {
        minDist = d;
        closest = ib;
      }
    }
    return { ib: closest, distNm: minDist };
  }, [icebergs, vessel.lat, vessel.lon]);

  // Distance from nearest iceberg to destination
  const bergToDestNm = useMemo(() => {
    if (!nearestIceberg || !destination) return 0;
    return haversineNm(nearestIceberg.ib, destination);
  }, [nearestIceberg, destination.lat, destination.lon]);

  // Distance vessel to destination
  const vesselToDestNm = useMemo(() => {
    return haversineNm(vessel, destination);
  }, [vessel.lat, vessel.lon, destination.lat, destination.lon]);

  // 1. Log route changes and evaluations
  const prevRouteVerRef = useRef<number>(-1);
  const prevLockedRouteRef = useRef<string>("");

  useEffect(() => {
    if (!activeRoute) return;

    if (routeVersion !== prevRouteVerRef.current) {
      prevRouteVerRef.current = routeVersion;
      prevLockedRouteRef.current = activeRoute.id;

      const safest = routes.find((r) => r.id === "safest");
      const fastest = routes.find((r) => r.id === "fastest");
      const highRiskCount = icebergs.filter((i) => i.highRisk).length;

      const routeLine = `Route recalculated: ${activeRoute.name} profile selected — ${activeRoute.distanceNm.toFixed(1)} NM, risk factor ${(activeRoute.riskScore * 100).toFixed(0)}%`;
      addLog(routeLine, "route");

      if (safest && fastest && safest !== fastest) {
        const addedNm = (safest.distanceNm - fastest.distanceNm).toFixed(1);
        const astarLine = `A* evaluated route around ${highRiskCount} high-risk zones — Safest adds ${addedNm}nm vs Fastest to avoid hazards`;
        addLog(astarLine, "risk");

        const maxIce = (fastest as any).maxSicPct || 80;
        const safestIce = (safest as any).maxSicPct || 70;
        const iceReasonLine = `Ice Analysis: Safest routes through ${safestIce}% concentration band; Fastest penetrates pack ice (MAX SIC ${maxIce}%)`;
        addLog(iceReasonLine, "risk");
      }
    } else if (activeRoute.id !== prevLockedRouteRef.current) {
      prevLockedRouteRef.current = activeRoute.id;
      const profileLine = `Profile switched to ${activeRoute.name}: ${activeRoute.distanceNm.toFixed(1)} NM, ETA ${activeRoute.etaHours.toFixed(1)}h, Fuel ${activeRoute.fuelMt.toFixed(1)} MT (MAX SIC ${(activeRoute as any).maxSicPct ?? 75}%)`;
      addLog(profileLine, "route");
    }
  }, [routeVersion, activeRoute, routes, icebergs]);

  // 2. Track iceberg entering detection threshold (e.g., 15 NM)
  const trackedRangeBergs = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!nearestIceberg) return;
    const { ib, distNm } = nearestIceberg;

    if (distNm <= 15) {
      if (!trackedRangeBergs.current.has(ib.id)) {
        trackedRangeBergs.current.add(ib.id);
        const p72 = ib.predictedPath?.[ib.predictedPath.length - 1];
        let driftText = "";
        if (p72) {
          const driftKm = (haversineNm(ib, p72) * 1.852).toFixed(1);
          const bearing = getBearingString(ib.lat, ib.lon, p72.lat, p72.lon);
          driftText = ` — LSTM predicts ${driftKm}km drift over 72h, bearing ${bearing}`;
        }
        addLog(
          `Iceberg ${ib.name} (${ib.id}) entering ${distNm.toFixed(1)}nm detection range${driftText}`,
          "iceberg"
        );
      }
    } else if (distNm > 17) {
      trackedRangeBergs.current.delete(ib.id);
    }
  }, [nearestIceberg]);

  // Auto-scroll log to bottom on new entry
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Iceberg color badge in mini diagram
  const bergColor = nearestIceberg?.ib.highRisk
    ? "text-rose-400 border-rose-500/50 bg-rose-500/15"
    : (nearestIceberg?.distNm ?? 99) < 8
    ? "text-amber-400 border-amber-500/50 bg-amber-500/15"
    : "text-emerald-400 border-emerald-500/50 bg-emerald-500/15";

  return (
    <section className="hud-panel p-3 w-72 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-white shadow-xl pointer-events-auto">
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <BrainCircuit className="h-3.5 w-3.5 text-cyan-400" />
          <h2 className="hud-header text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
            Tactical Reasoning
          </h2>
        </div>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
          LIVE AI
        </span>
      </div>

      {/* Top Part: Compact Node-Based Mini-Diagram (Ship -> Nearest Iceberg -> Destination) */}
      <div className="mb-2.5 p-2 rounded-lg bg-black/40 border border-white/5">
        <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
          {/* Node 1: Vessel */}
          <div className="flex flex-col items-center shrink-0 w-16">
            <div className="h-6 w-6 rounded-full border border-cyan-400/60 bg-cyan-500/20 flex items-center justify-center text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.4)]">
              <Navigation className="h-3 w-3" />
            </div>
            <span className="text-[9px] text-white/80 font-bold mt-1">Ship</span>
            <span className="text-[8px] text-white/40">{vessel.sogKnots.toFixed(0)} kn</span>
          </div>

          {/* Connector 1 */}
          <div className="flex-1 flex flex-col items-center">
            <span className="text-[8px] text-cyan-300 font-bold tabular-nums">
              {nearestIceberg ? `${nearestIceberg.distNm.toFixed(1)} nm` : "--"}
            </span>
            <div className="w-full h-0.5 bg-gradient-to-r from-cyan-500/40 via-white/30 to-amber-500/40 my-0.5 relative">
              <div className="absolute right-0 top-[-2px] w-1 h-1 rounded-full bg-white/70" />
            </div>
            <span className="text-[7px] text-white/30">Prox</span>
          </div>

          {/* Node 2: Nearest Iceberg */}
          <div className="flex flex-col items-center shrink-0 w-20">
            <div
              className={`h-6 px-1.5 rounded-full border flex items-center justify-center gap-1 font-bold ${bergColor}`}
            >
              <ShieldAlert className="h-3 w-3 shrink-0" />
              <span className="text-[8.5px] truncate max-w-[42px]">
                {nearestIceberg ? nearestIceberg.ib.name : "None"}
              </span>
            </div>
            <span className="text-[8px] text-white/60 mt-1">
              {nearestIceberg?.ib.highRisk ? "High Risk" : "Tracked"}
            </span>
          </div>

          {/* Connector 2 */}
          <div className="flex-1 flex flex-col items-center">
            <span className="text-[8px] text-emerald-300 font-bold tabular-nums">
              {bergToDestNm > 0 ? `${bergToDestNm.toFixed(1)} nm` : "--"}
            </span>
            <div className="w-full h-0.5 bg-gradient-to-r from-amber-500/40 via-white/30 to-emerald-500/40 my-0.5 relative">
              <div className="absolute right-0 top-[-2px] w-1 h-1 rounded-full bg-white/70" />
            </div>
            <span className="text-[7px] text-white/30">To Dest</span>
          </div>

          {/* Node 3: Destination */}
          <div className="flex flex-col items-center shrink-0 w-16">
            <div className="h-6 w-6 rounded-full border border-emerald-400/60 bg-emerald-500/20 flex items-center justify-center text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.3)]">
              <Compass className="h-3 w-3" />
            </div>
            <span className="text-[9px] text-white/80 font-bold mt-1">Dest</span>
            <span className="text-[8px] text-white/40">{vesselToDestNm.toFixed(0)} nm</span>
          </div>
        </div>
      </div>

      {/* Bottom/Main Part: Scrolling Real Event Log Feed */}
      <div>
        <div className="flex items-center justify-between mb-1.5 text-[9px] font-bold text-white/50 uppercase tracking-wider">
          <span>Autonomous Event Feed</span>
          <span className="text-[8px] font-mono text-cyan-400">{logs.length} logged</span>
        </div>

        <div
          ref={logContainerRef}
          className="h-28 overflow-y-auto space-y-1.5 pr-1 font-mono text-[10px] scrollbar-thin scrollbar-thumb-white/10"
        >
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/30 italic text-[10px]">
              Initializing tactical engine...
            </div>
          ) : (
            logs.slice(-8).map((log) => {
              const borderStyle =
                log.category === "risk"
                  ? "border-rose-500/30 text-rose-200 bg-rose-500/10"
                  : log.category === "route"
                  ? "border-cyan-500/30 text-cyan-200 bg-cyan-500/10"
                  : "border-amber-500/30 text-amber-200 bg-amber-500/10";

              return (
                <div
                  key={log.id}
                  className={`p-1.5 rounded border leading-snug transition-all ${borderStyle}`}
                >
                  <div className="flex items-center justify-between text-[8px] text-white/40 mb-0.5">
                    <span className="uppercase tracking-wide">{log.category}</span>
                    <span>{log.time}</span>
                  </div>
                  <p className="font-sans text-[10px] text-slate-100">{log.text}</p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
