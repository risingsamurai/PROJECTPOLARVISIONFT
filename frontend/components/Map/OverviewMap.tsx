"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, useCallback } from "react";
import { fetchForecast, fetchIcebergs, fetchRoutes, fetchSeaIceGrid, type SeaIceGridCell } from "@/lib/api";
import { usePolarisStore } from "@/lib/store";

// ── Sea Ice Concentration colour scale ──────────────────────────────────────
// 0%  → transparent deep blue (open water)
// 15% → pale cyan (ice edge)
// 40% → light blue
// 70% → light-blue/white
// 100% → opaque white/light grey
const SIC_COLOR_STOPS: [number, string][] = [
  [0.00, "rgba(10, 40, 100, 0)"],     // fully transparent – open water
  [0.15, "rgba(100, 200, 230, 0.35)"], // ice edge – pale cyan
  [0.30, "rgba(140, 210, 240, 0.55)"], // light blue
  [0.50, "rgba(180, 225, 245, 0.70)"], // blue-white
  [0.70, "rgba(215, 238, 250, 0.80)"], // near-white
  [0.85, "rgba(235, 245, 255, 0.88)"], // off-white
  [1.00, "rgba(245, 248, 255, 0.95)"], // opaque white/light grey
];

function sicToColor(sic: number, opacity: number): string {
  // Clamp
  const s = Math.max(0, Math.min(1, sic));
  // Find surrounding stops
  let lo = SIC_COLOR_STOPS[0];
  let hi = SIC_COLOR_STOPS[SIC_COLOR_STOPS.length - 1];
  for (let i = 0; i < SIC_COLOR_STOPS.length - 1; i++) {
    if (s >= SIC_COLOR_STOPS[i][0] && s <= SIC_COLOR_STOPS[i + 1][0]) {
      lo = SIC_COLOR_STOPS[i];
      hi = SIC_COLOR_STOPS[i + 1];
      break;
    }
  }
  const t = lo[0] === hi[0] ? 0 : (s - lo[0]) / (hi[0] - lo[0]);
  // Parse rgba components
  const parse = (c: string) => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
    if (!m) return [255, 255, 255, 1];
    return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
  };
  const a = parse(lo[1]);
  const b = parse(hi[1]);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bv = Math.round(a[2] + (b[2] - a[2]) * t);
  const ov = (a[3] + (b[3] - a[3]) * t) * opacity;
  return `rgba(${r},${g},${bv},${ov.toFixed(2)})`;
}

export function OverviewMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const tooltipRef = useRef<maplibregl.Popup | null>(null);

  const {
    layers,
    seaIceHeatmap,
    setSeaIceHeatmapMeta,
    setSeaIceHeatmapOpacity,
  } = usePolarisStore();

  const [heatmapLoaded, setHeatmapLoaded] = useState(false);

  // Fetch and render ice heatmap
  const loadHeatmap = useCallback(async (map: maplibregl.Map, opacity: number) => {
    if (!layers.seaIce) return;
    setSeaIceHeatmapMeta({ loading: true, error: null });

    try {
      const grid = await fetchSeaIceGrid({
        min_lat: -80, max_lat: -50,
        min_lon: -180, max_lon: 180,
        res: 0.5,
      });

      setSeaIceHeatmapMeta({
        loading: false,
        dataDate: grid.date ?? null,
        error: null,
      });

      const seaCells = grid.cells.filter((c) => c.sic !== null) as (SeaIceGridCell & { sic: number })[];

      // Build GeoJSON for the heatmap
      const geo: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: seaCells.map((c) => ({
          type: "Feature",
          properties: { sic: c.sic },
          geometry: { type: "Point", coordinates: [c.lon, c.lat] },
        })),
      };

      if (map.getSource("sic-heat")) {
        (map.getSource("sic-heat") as maplibregl.GeoJSONSource).setData(geo);
      } else {
        map.addSource("sic-heat", { type: "geojson", data: geo });
        // Use circle layer with bilinear-like interpolation via large overlapping circles
        map.addLayer(
          {
            id: "sic-heat-layer",
            type: "heatmap",
            source: "sic-heat",
            maxzoom: 9,
            paint: {
              // Weight by SIC value
              "heatmap-weight": ["interpolate", ["linear"], ["get", "sic"], 0, 0, 1, 1],
              // Intensity increases with zoom
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 9, 2],
              // Color ramp: 0→transparent deep blue, 0.15→cyan, 1→opaque white
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,   "rgba(10,40,100,0)",
                0.15,"rgba(100,200,230,0.4)",
                0.35,"rgba(140,210,240,0.6)",
                0.55,"rgba(180,225,245,0.75)",
                0.75,"rgba(215,238,250,0.85)",
                1,   "rgba(245,248,255,0.95)",
              ],
              // Radius in pixels – larger for smooth blending
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 25, 6, 40, 9, 20],
              "heatmap-opacity": opacity,
            },
          },
          // Insert below route lines so routes appear on top
          "sic-circles-layer" in (map.style as any)._layers ? "sic-circles-layer" : undefined
        );

        // Also add a circle layer for tooltip / click lookup
        map.addLayer({
          id: "sic-circles-layer",
          type: "circle",
          source: "sic-heat",
          minzoom: 5,
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "interpolate", ["linear"], ["get", "sic"],
              0, "#0a2864",
              0.15, "#64c8e6",
              0.40, "#8cd2f0",
              0.70, "#d7eefa",
              1.0, "#f5f8ff",
            ],
            "circle-opacity": ["*", ["get", "sic"], opacity],
            "circle-blur": 0.5,
          },
        });

        // Hover tooltip
        map.on("mousemove", "sic-circles-layer", (e) => {
          if (!e.features || e.features.length === 0) return;
          const sic = e.features[0].properties?.sic as number;
          if (!tooltipRef.current) {
            tooltipRef.current = new maplibregl.Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 10,
            });
          }
          tooltipRef.current
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-size:11px;font-family:monospace;padding:4px 8px;background:rgba(0,0,0,0.75);color:#e0f7ff;border-radius:4px;">
                Sea Ice: <strong>${(sic * 100).toFixed(0)}%</strong>
              </div>`
            )
            .addTo(map);
          map.getCanvas().style.cursor = "crosshair";
        });

        map.on("mouseleave", "sic-circles-layer", () => {
          tooltipRef.current?.remove();
          map.getCanvas().style.cursor = "";
        });
      }

      setHeatmapLoaded(true);
    } catch (err: any) {
      setSeaIceHeatmapMeta({
        loading: false,
        error: err?.message ?? "sea_ice_data_unavailable",
      });
      console.warn("[Heatmap] Failed to load sea ice grid:", err);
    }
  }, [layers.seaIce, setSeaIceHeatmapMeta]);

  // Update heatmap opacity when slider changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !heatmapLoaded) return;
    if (map.getLayer("sic-heat-layer")) {
      map.setPaintProperty("sic-heat-layer", "heatmap-opacity", seaIceHeatmap.opacity);
    }
    if (map.getLayer("sic-circles-layer")) {
      map.setPaintProperty("sic-circles-layer", "circle-opacity", [
        "*", ["get", "sic"], seaIceHeatmap.opacity
      ]);
    }
  }, [seaIceHeatmap.opacity, heatmapLoaded]);

  // Toggle heatmap layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !heatmapLoaded) return;
    const vis = layers.seaIce ? "visible" : "none";
    if (map.getLayer("sic-heat-layer")) map.setLayoutProperty("sic-heat-layer", "visibility", vis);
    if (map.getLayer("sic-circles-layer")) map.setLayoutProperty("sic-circles-layer", "visibility", vis);
  }, [layers.seaIce, heatmapLoaded]);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const map = new maplibregl.Map({
      container: ref.current,
      style: token
        ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9?access_token=${token}`
        : {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: "© OpenStreetMap",
              },
            },
            layers: [{ id: "osm", type: "raster", source: "osm" }],
          },
      center: [-52.45, -68.35],
      zoom: 4.2,
    });
    mapRef.current = map;
    map.on("load", async () => {
      // Load sea ice heatmap first (so routes appear on top)
      await loadHeatmap(map, usePolarisStore.getState().seaIceHeatmap.opacity);

      try {
        const day = usePolarisStore.getState().forecastDay;
        const bergs = await fetchIcebergs();
        bergs.icebergs?.forEach((ib: { lon: number; lat: number; name: string }) => {
          new maplibregl.Marker({ color: "#ef4444" })
            .setLngLat([ib.lon, ib.lat])
            .setPopup(new maplibregl.Popup().setText(ib.name))
            .addTo(map);
        });
      } catch {
        /* markers stay empty if API down */
      }
    });

    map.on("click", async (e) => {
      const dest = { lat: e.lngLat.lat, lon: e.lngLat.lng };
      const v = usePolarisStore.getState().vessel;
      usePolarisStore.getState().setDestination(dest);
      try {
        const data = await fetchRoutes([v.lat, v.lon], [dest.lat, dest.lon]);
        if (data.routes?.length) {
          usePolarisStore.getState().setRoutes(data.routes);
          usePolarisStore.getState().lockRoute("balanced");

          // Route colour mapping including eco
          const routeColors: Record<string, string> = {
            safest:   "#22c55e",
            balanced: "#eab308",
            eco:      "#06b6d4",
            fastest:  "#ef4444",
          };

          data.routes.forEach((r: { id: string; points: { lon: number; lat: number }[] }) => {
            const id = `route-${r.id}`;
            const geo = {
              type: "Feature" as const,
              properties: {},
              geometry: {
                type: "LineString" as const,
                coordinates: r.points.map((p) => [p.lon, p.lat]),
              },
            };
            if (map.getSource(id)) {
              (map.getSource(id) as maplibregl.GeoJSONSource).setData(geo);
            } else {
              map.addSource(id, { type: "geojson", data: geo });
              map.addLayer({
                id,
                type: "line",
                source: id,
                paint: {
                  "line-color": routeColors[r.id] ?? "#22c55e",
                  "line-width": 3,
                  "line-opacity": 0.92,
                },
              });
            }
          });

          // Auto-fit bounds across all route points
          let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
          let count = 0;
          data.routes.forEach((r: { points: { lon: number; lat: number }[] }) => {
            r.points?.forEach((p) => {
              count++;
              if (p.lon < minLng) minLng = p.lon;
              if (p.lon > maxLng) maxLng = p.lon;
              if (p.lat < minLat) minLat = p.lat;
              if (p.lat > maxLat) maxLat = p.lat;
            });
          });
          if (count > 0) {
            map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
              padding: 80,
              maxZoom: 7,
              duration: 1000,
            });
          }
        }
      } catch {
        /* ignore */
      }
    });

    const handleResize = () => mapRef.current?.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      tooltipRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [loadHeatmap]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" />

      {/* Sea ice loading spinner */}
      {seaIceHeatmap.loading && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/60 backdrop-blur text-cyan-300 text-xs px-3 py-1.5 rounded-full border border-cyan-500/30">
          <span className="inline-block w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          Loading sea ice data…
        </div>
      )}

      {/* Sea ice unavailable error */}
      {!seaIceHeatmap.loading && seaIceHeatmap.error && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-red-900/80 text-red-200 text-xs px-3 py-1.5 rounded-full border border-red-500/40">
          ⚠ Sea ice data unavailable
        </div>
      )}

      {/* Heatmap legend + controls */}
      {layers.seaIce && heatmapLoaded && !seaIceHeatmap.error && (
        <div className="absolute bottom-4 left-3 z-10 bg-black/65 backdrop-blur rounded-xl p-3 text-[11px] text-white/90 border border-white/10 min-w-[190px]">
          <div className="font-bold text-cyan-300 mb-1.5 uppercase tracking-wider text-[10px]">Sea Ice Concentration</div>

          {/* Gradient bar */}
          <div
            className="w-full h-3 rounded mb-1"
            style={{
              background: "linear-gradient(to right, rgba(10,40,100,0), rgba(100,200,230,0.6), rgba(180,225,245,0.8), rgba(245,248,255,0.95))",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          />
          <div className="flex justify-between text-[10px] text-white/60 mb-2">
            <span>0%</span>
            <span>15%</span>
            <span>50%</span>
            <span>100%</span>
          </div>

          {/* Opacity slider */}
          <label className="flex items-center gap-2 text-white/70 mt-1">
            <span className="text-[10px] w-12 shrink-0">Opacity</span>
            <input
              id="sic-opacity-slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={seaIceHeatmap.opacity}
              onChange={(e) => setSeaIceHeatmapOpacity(parseFloat(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </label>

          {/* Data date */}
          {seaIceHeatmap.dataDate && (
            <div className="text-[10px] text-white/45 mt-1.5">
              Data as of {new Date(seaIceHeatmap.dataDate).toLocaleDateString("en-GB", {
                day: "2-digit", month: "short", year: "numeric",
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
