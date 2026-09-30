"use client";

import { usePolarisStore, type Layers } from "@/lib/store";

const ITEMS: { key: keyof Layers; label: string; color?: string }[] = [
  { key: "seaIce", label: "Sea Ice Concentration" },
  { key: "icebergs", label: "Icebergs (Detection)" },
  { key: "predictions", label: "Iceberg Predictions" },
  { key: "riskZones", label: "Risk Zones" },
  { key: "route", label: "Recommended Route" },
  { key: "vessel", label: "Vessel" },
  { key: "wildlife", label: "Wildlife Impact", color: "teal" },
  { key: "freshwaterPlume", label: "Freshwater / Meltwater", color: "cyan" },
];


export function LayerControlPanel() {
  const layers = usePolarisStore((s) => s.layers);
  const toggle = usePolarisStore((s) => s.toggleLayer);
  const seaIceHeatmap = usePolarisStore((s) => s.seaIceHeatmap);
  const setOpacity = usePolarisStore((s) => s.setSeaIceHeatmapOpacity);

  return (
    <section className="hud-panel p-3.5 w-64 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-white shadow-xl">
      <h2 className="hud-header mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
        Layer Control
      </h2>
      <ul className="space-y-2.5">
        {ITEMS.map((item) => {
          const on = layers[item.key];
          return (
            <li
              key={item.key}
              className="flex flex-col gap-1"
            >
              <span className="text-white/85 font-medium text-[11px]">
                {item.label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggle(item.key)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  on
                    ? item.color === "teal"
                      ? "bg-teal-500 shadow-sm shadow-teal-500/50"
                      : item.color === "cyan"
                      ? "bg-cyan-400 shadow-sm shadow-cyan-400/50"
                      : "bg-cyan-500 shadow-sm shadow-cyan-500/50"
                    : "bg-white/20"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    on ? "translate-x-4" : "translate-x-0"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      on ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Opacity slider for Sea Ice Concentration layer */}
              {item.key === "seaIce" && on && (
                <div className="flex items-center gap-2 pl-1">
                  <span className="text-[9px] text-white/40 w-10 shrink-0">Opacity</span>
                  <input
                    id="sic-opacity-slider-layer"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={seaIceHeatmap.opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                  <span className="text-[9px] text-white/40 w-6 shrink-0 text-right">
                    {Math.round(seaIceHeatmap.opacity * 100)}%
                  </span>
                </div>
              )}

              {/* Data date label under Sea Ice layer */}
              {item.key === "seaIce" && on && seaIceHeatmap.dataDate && (
                <div className="text-[9px] text-white/30 pl-1">
                  Data: {new Date(seaIceHeatmap.dataDate).toLocaleDateString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric",
                  })}
                </div>
              )}

              {/* Error state under Sea Ice layer */}
              {item.key === "seaIce" && on && seaIceHeatmap.error && (
                <div className="text-[9px] text-red-400/80 pl-1">
                  ⚠ Sea ice data unavailable
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
        <span className="text-white/85 font-medium text-[11px]">Graphics Quality</span>
        <button
          type="button"
          onClick={() => {
            const current = usePolarisStore.getState().graphicsQuality;
            usePolarisStore.getState().setGraphicsQuality(current === "high" ? "low" : "high");
          }}
          className="px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider rounded border border-white/20 bg-white/10 hover:bg-white/20 text-cyan-300 transition-colors"
        >
          {usePolarisStore((s) => s.graphicsQuality || "high").toUpperCase()}
        </button>
      </div>
    </section>
  );
}
