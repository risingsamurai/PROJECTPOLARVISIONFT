"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { fetchForecast, fetchIcebergs, fetchRoutes } from "@/lib/api";
import { usePolarisStore } from "@/lib/store";

export function OverviewMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

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
      try {
        const day = usePolarisStore.getState().forecastDay;
        const [bergs, ice] = await Promise.all([
          fetchIcebergs(),
          fetchForecast(day),
        ]);
        bergs.icebergs?.forEach((ib: { lon: number; lat: number; name: string }) => {
          new maplibregl.Marker({ color: "#ef4444" })
            .setLngLat([ib.lon, ib.lat])
            .setPopup(new maplibregl.Popup().setText(ib.name))
            .addTo(map);
        });
        if (ice.grid) {
          const geo = {
            type: "FeatureCollection" as const,
            features: ice.grid
              .filter((_: unknown, i: number) => i % 3 === 0)
              .map((c: { lon: number; lat: number; sic: number }) => ({
                type: "Feature" as const,
                properties: { sic: c.sic },
                geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
              })),
          };
          map.addSource("ice", { type: "geojson", data: geo });
          map.addLayer({
            id: "ice-heat",
            type: "circle",
            source: "ice",
            paint: {
              "circle-radius": 10,
              "circle-color": [
                "interpolate",
                ["linear"],
                ["get", "sic"],
                0,
                "#1e3a8a",
                0.5,
                "#3b82f6",
                1,
                "#ffffff",
              ],
              "circle-opacity": 0.45,
            },
          });
        }
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
          data.routes.forEach((r: { id: string; points: { lon: number; lat: number }[] }, idx: number) => {
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
                  "line-color": ["#22c55e", "#eab308", "#ef4444"][idx] || "#22c55e",
                  "line-width": 3,
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
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={ref} className="h-full w-full" />;
}
