"use client";

import { latLonToScene } from "@/lib/geo";
import { selectLockedRoute, usePolarisStore } from "@/lib/store";

const SCALE = 2.4;
const ORIGIN = { x: 95, y: 95 };

export function Minimap() {
  const vessel = usePolarisStore((s) => s.vessel);
  const icebergs = usePolarisStore((s) => s.icebergs);
  const selectedIcebergId = usePolarisStore((s) => s.selectedIcebergId);
  const route = usePolarisStore(selectLockedRoute);
  const [vx, , vz] = latLonToScene(vessel.lat, vessel.lon);

  const to = (lat: number, lon: number) => {
    const [x, , z] = latLonToScene(lat, lon);
    return {
      x: ORIGIN.x + (x - vx) * SCALE,
      y: ORIGIN.y + (z - vz) * SCALE,
    };
  };

  const routeD = route.points
    .map((p, i) => {
      const { x, y } = to(p.lat, p.lon);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <section className="hud-panel p-2.5 w-[210px] bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-white shadow-xl">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <h2 className="hud-header text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
          Minimap
        </h2>
        <span className="text-[9px] font-mono text-white/40 tabular-nums">
          10 NM
        </span>
      </div>
      <div className="relative rounded-lg overflow-hidden border border-white/10 bg-slate-950/80">
        <svg viewBox="0 0 190 190" className="w-full h-[180px]">
          {/* Radar Range Rings */}
          <circle
            cx={ORIGIN.x}
            cy={ORIGIN.y}
            r="35"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.08"
            strokeDasharray="2 2"
          />
          <circle
            cx={ORIGIN.x}
            cy={ORIGIN.y}
            r="70"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.08"
          />
          {/* Crosshairs */}
          <line
            x1={ORIGIN.x}
            y1="5"
            x2={ORIGIN.x}
            y2="185"
            stroke="#ffffff"
            strokeOpacity="0.06"
          />
          <line
            x1="5"
            y1={ORIGIN.y}
            x2="185"
            y2={ORIGIN.y}
            stroke="#ffffff"
            strokeOpacity="0.06"
          />

          {/* Route Line */}
          <path
            d={routeD}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.2"
            strokeDasharray="3 2"
          />

          {/* Icebergs & Danger Zones */}
          {icebergs.slice(0, 32).map((ib) => {
            const p = to(ib.lat, ib.lon);
            const isSelected = ib.id === selectedIcebergId;
            if (p.x < -15 || p.x > 205 || p.y < -15 || p.y > 205) return null;
            return (
              <g key={ib.id}>
                {ib.highRisk && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={8}
                    fill="#ef4444"
                    fillOpacity="0.2"
                    stroke="#ef4444"
                    strokeWidth="1"
                    strokeOpacity="0.6"
                  />
                )}
                {isSelected && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={9}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isSelected ? 4 : ib.highRisk ? 3.5 : 2.5}
                  fill={isSelected ? "#38bdf8" : ib.highRisk ? "#ef4444" : "#e0f2fe"}
                />
                {/* Draw 72h LSTM Prediction Drift for Selected Berg */}
                {isSelected && ib.predictedPath && ib.predictedPath.length > 1 && (
                  <g>
                    <polyline
                      points={ib.predictedPath
                        .map((pt) => {
                          const wp = to(pt.lat, pt.lon);
                          return `${wp.x.toFixed(1)},${wp.y.toFixed(1)}`;
                        })
                        .join(" ")}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeDasharray="2 1"
                    />
                    {ib.predictedPath.slice(1).map((pt) => {
                      const wp = to(pt.lat, pt.lon);
                      return (
                        <circle
                          key={pt.hour}
                          cx={wp.x}
                          cy={wp.y}
                          r={2}
                          fill={pt.hour === 24 ? "#10b981" : pt.hour === 48 ? "#f59e0b" : "#c084fc"}
                        />
                      );
                    })}
                  </g>
                )}
              </g>
            );
          })}

          {/* Vessel Arrow (Centered) */}
          <g
            transform={`translate(${ORIGIN.x}, ${ORIGIN.y}) rotate(${vessel.headingDeg})`}
          >
            <circle cx="0" cy="0" r="10" fill="#38bdf8" fillOpacity="0.15" />
            <polygon points="0,-7 5,6 0,3.5 -5,6" fill="#38bdf8" />
          </g>
        </svg>
      </div>
    </section>
  );
}

