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

      // --- B. Sea Ice concentration Check (WARNING) ---
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

        if (closestCell && closestCell.sic > alertConfig.warning_ice_concentration) {
          const sicPct = (closestCell.sic * 100).toFixed(0);
          const limitPct = (alertConfig.warning_ice_concentration * 100).toFixed(0);
          const message = `WARNING: Ice concentration in immediate area exceeds limit: ${sicPct}% (Threshold: ${limitPct}%)`;

          if (lastActiveAlertRef.current?.tier !== "WARNING") {
            pushAlert("WARNING", message);
            lastActiveAlertRef.current = { tier: "WARNING" };
          }
          return;
        }
      }

      // --- C. Clear State Check ---
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
