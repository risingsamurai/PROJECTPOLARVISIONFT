import { useEffect, useRef } from "react";
import { usePolarisStore } from "./store";
import { alertConfig } from "./alertConfig";
import { haversineNm } from "./geo";

export function useAlertEngine() {
  const vessel = usePolarisStore((s) => s.vessel);
  const icebergs = usePolarisStore((s) => s.icebergs);
  const iceGrid = usePolarisStore((s) => s.iceGrid);
  const pushAlert = usePolarisStore((s) => s.pushAlert);
  const alerts = usePolarisStore((s) => s.alerts);
  const routes = usePolarisStore((s) => s.routes);

  const lastActiveAlertRef = useRef<{ tier: string; detailId?: string } | null>(null);
  const prevRoutesLenRef = useRef(routes.length);

  // 1. Initialize ref from store alerts history on mount
  useEffect(() => {
    if (lastActiveAlertRef.current === null && alerts.length > 0) {
      const latest = alerts[alerts.length - 1];
      if (latest.tier === "CRITICAL" || latest.tier === "WARNING" || latest.tier === "CLEAR") {
        lastActiveAlertRef.current = { tier: latest.tier };
      }
    }
  }, [alerts]);

  // 2. Track Route recalculation / predicted path changes
  useEffect(() => {
    if (routes.length > 0 && routes.length !== prevRoutesLenRef.current) {
      pushAlert("INFO", `Route profiles updated. ${routes.length} navigation options recomputed.`);
      prevRoutesLenRef.current = routes.length;
    }
  }, [routes, pushAlert]);

  // 3. Periodic evaluation loop
  useEffect(() => {
    const intervalSeconds = alertConfig.clear_check_interval_seconds || 10;
    
    const evaluate = () => {
      const { lat, lon } = vessel;

      // --- A. Proximity Check (CRITICAL) ---
      // Filter for real icebergs in database (ID starting with 'IBG-')
      const realIcebergs = icebergs.filter((ib) => ib.id.startsWith("IBG-"));
      let closestBerg = null;
      let minDistance = 999999;

      for (const ib of realIcebergs) {
        const d = haversineNm(vessel, ib);
        if (d < minDistance) {
          minDistance = d;
          closestBerg = ib;
        }
      }

      if (closestBerg && minDistance < alertConfig.critical_iceberg_distance_nm) {
        const detailId = closestBerg.id;
        const message = `CRITICAL: Vessel within ${minDistance.toFixed(2)} NM of real iceberg ${closestBerg.name} (${closestBerg.id})`;
        
        if (
          lastActiveAlertRef.current?.tier !== "CRITICAL" ||
          lastActiveAlertRef.current?.detailId !== detailId
        ) {
          pushAlert("CRITICAL", message);
          lastActiveAlertRef.current = { tier: "CRITICAL", detailId };
        }
        return;
      }

      // --- B. Sea Ice Concentration Multi-tier Checks (>90% CRITICAL, >70% WARNING, >40% INFO) ---
      let localSic = 0.0;
      if (iceGrid && iceGrid.length > 0) {
        let closestCell = null;
        let minCellDist = 999999;
        for (const cell of iceGrid) {
          const dlat = cell.lat - lat;
          const dlon = cell.lon - lon;
          const d = dlat * dlat + dlon * dlon;
          if (d < minCellDist) {
            minCellDist = d;
            closestCell = cell;
          }
        }
        if (closestCell) {
          localSic = closestCell.sic;
        }
      } else {
        // Fallback continuous model
        localSic = Math.min(0.95, Math.max(0.05, 0.15 + 0.65 / (1 + Math.exp((lat + 64.0) / 2.0))));
      }

      const sicPct = Math.round(localSic * 100);

      if (sicPct > 90) {
        const msg = `CRITICAL: Extreme pack ice density: ${sicPct}% (>90%). High structural resistance — advise rerouting or switching to Safest.`;
        if (lastActiveAlertRef.current?.tier !== "CRITICAL_ICE") {
          pushAlert("CRITICAL", msg);
          lastActiveAlertRef.current = { tier: "CRITICAL_ICE" };
        }
        return;
      } else if (sicPct > 70) {
        const msg = `WARNING: Ice concentration exceeds safe operating threshold: ${sicPct}% (Limit: 70%)`;
        if (lastActiveAlertRef.current?.tier !== "WARNING_ICE") {
          pushAlert("WARNING", msg);
          lastActiveAlertRef.current = { tier: "WARNING_ICE" };
        }
        return;
      } else if (sicPct > 40) {
        const msg = `INFO: Vessel operating in marginal ice zone: ${sicPct}% concentration (>40% threshold).`;
        if (lastActiveAlertRef.current?.tier !== "INFO_ICE") {
          pushAlert("INFO", msg);
          lastActiveAlertRef.current = { tier: "INFO_ICE" };
        }
        return;
      }

      // --- C. Look-Ahead Alert: Route crosses >70% within 50 NM ---
      const activeRoute = routes.find((r) => r.id === usePolarisStore.getState().lockedRouteId) || routes[0];
      if (activeRoute && activeRoute.points && activeRoute.points.length > 1) {
        let cumDist = 0;
        let lookaheadPackDist: number | null = null;
        let lookaheadPackSic = 0;

        for (let i = 0; i < activeRoute.points.length - 1; i++) {
          const p1 = activeRoute.points[i];
          const p2 = activeRoute.points[i + 1];
          const segDist = haversineNm(p1, p2);
          const pLat = p2.lat;
          const pSic = Math.round((0.15 + 0.65 / (1 + Math.exp((pLat + 64.0) / 2.0))) * 100);

          if (cumDist + segDist <= 50 && pSic > 70) {
            lookaheadPackDist = Math.round(cumDist + segDist);
            lookaheadPackSic = pSic;
            break;
          }
          cumDist += segDist;
        }

        if (lookaheadPackDist !== null) {
          const msg = `WARNING: Look-ahead hazard — Active route penetrates heavy ice pack (${lookaheadPackSic}%) in ${lookaheadPackDist} NM.`;
          if (lastActiveAlertRef.current?.tier !== "LOOKAHEAD_ICE") {
            pushAlert("WARNING", msg);
            lastActiveAlertRef.current = { tier: "LOOKAHEAD_ICE" };
          }
          return;
        }
      }

      // --- D. Clear State Check ---
      if (lastActiveAlertRef.current === null || lastActiveAlertRef.current.tier !== "CLEAR") {
        pushAlert("CLEAR", "All hazards outside safe radius");
        lastActiveAlertRef.current = { tier: "CLEAR" };
      }
    };

    evaluate(); // run immediately
    const timer = setInterval(evaluate, intervalSeconds * 1000);

    return () => clearInterval(timer);
  }, [vessel, icebergs, iceGrid, pushAlert]);
}
