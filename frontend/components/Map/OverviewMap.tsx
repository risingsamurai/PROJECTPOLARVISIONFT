"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import {
  fetchFlowField,
  fetchWildlifeColonies,
} from "@/lib/api";
import { usePolarisStore } from "@/lib/store";
import type { FlowFieldData, FlowGridCell, WildlifeColony } from "@/lib/mockData";

// ── Wildlife marker DOM factory ─────────────────────────────────────────────
function createWildlifeMarkerElement(colony: WildlifeColony): HTMLElement {
  const container = document.createElement("div");
  container.className = "wildlife-marker-node";
  container.setAttribute("data-colony-id", colony.id);
  container.style.cursor = "pointer";
  container.style.transform = "translate(-50%, -100%)";
  container.title = `${colony.name} (${colony.species})`;

  const isSeal = colony.icon === "seal";
  const glyphSvg = isSeal
    ? `<path d="M7 14C8.5 12 11 11.5 14 11.5C17 11.5 19.5 12 21 14C19 16.5 16.5 17 14 17C11.5 17 9 16.5 7 14Z" fill="#a7f3d0"/><circle cx="11.5" cy="13.2" r="0.9" fill="#042f2e"/><circle cx="16.5" cy="13.2" r="0.9" fill="#042f2e"/>`
    : `<path d="M14 7C12.5 7 11.5 8.2 11.5 10C11.5 11.2 12.2 12.5 11.2 13.5C10.5 14.2 10 15.5 10 17C10 18.2 11.8 19 14 19C16.2 19 18 18.2 18 17C18 15.5 17.5 14.2 16.8 13.5C15.8 12.5 16.5 11.2 16.5 10C16.5 8.2 15.5 7 14 7Z" fill="#5eead4"/><circle cx="12.8" cy="9.2" r="0.8" fill="#ffffff"/><polygon points="14,10.2 12.8,11.2 15.2,11.2" fill="#fbbf24"/>`;

  container.innerHTML = `
    <div style="position: relative; width: 28px; height: 36px; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6)); transition: transform 0.15s ease;">
      <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 36 14 36C14 36 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="#0d9488" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="14" cy="13.5" r="9" fill="#042f2e" />
        ${glyphSvg}
      </svg>
    </div>
  `;

  container.addEventListener("mouseenter", () => {
    const child = container.firstElementChild as HTMLElement;
    if (child) child.style.transform = "scale(1.2) translateY(-2px)";
  });
  container.addEventListener("mouseleave", () => {
    const child = container.firstElementChild as HTMLElement;
    if (child) child.style.transform = "scale(1) translateY(0)";
  });

  return container;
}

// ── Canvas particle constants ───────────────────────────────────────────────
const NUM_PARTICLES = 2200;

interface CanvasParticle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  history?: { x: number; y: number }[];
}

// ── OverviewMap component ───────────────────────────────────────────────────
export function OverviewMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const wildlifeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const icebergMarkersRef = useRef<maplibregl.Marker[]>([]);
  const flowFieldRef = useRef<FlowFieldData | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      preserveDrawingBuffer: true,
      style: token
        ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9?access_token=${token}`
        : {
            version: 8,
            sources: {
              esri: {
                type: "raster",
                tiles: [
                  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                ],
                tileSize: 256,
                attribution:
                  "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
              },
            },
            layers: [{ id: "esri-tiles", type: "raster", source: "esri" }],
          },
      center: [-52.45, -68.35],
      zoom: 4.3,
      minZoom: 2,
      maxZoom: 14,
    });
    mapRef.current = map;
    if (typeof window !== "undefined") {
      (window as any).mapForTesting = map;
    }

    // Route drawing helper
    const drawRoutes = (routes: any[]) => {
      routes.forEach((r, idx) => {
        const id = `route-${r.id}`;
        const geo = {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: r.points.map((p: { lon: number; lat: number }) => [p.lon, p.lat]),
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
              "line-color": (["#22c55e", "#eab308", "#ef4444"][idx] || "#22c55e") as string,
              "line-width": 3.5,
              "line-opacity": 0.9,
            },
          });
        }
      });
    };

    map.on("load", async () => {
      map.resize();

      // Add exclusion zone source/layers
      map.addSource("drawing-polygon", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "drawing-polygon-fill", type: "fill", source: "drawing-polygon", paint: { "fill-color": "rgba(239, 68, 68, 0.2)" } });
      map.addLayer({ id: "drawing-polygon-outline", type: "line", source: "drawing-polygon", paint: { "line-color": "#ef4444", "line-width": 2, "line-dasharray": [2, 2] } });
      map.addSource("exclusion-zones", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "exclusion-zones-fill", type: "fill", source: "exclusion-zones", paint: { "fill-color": "rgba(239, 68, 68, 0.25)" } });
      map.addLayer({ id: "exclusion-zones-outline", type: "line", source: "exclusion-zones", paint: { "line-color": "#ef4444", "line-width": 2.5 } });

      // Iceberg trajectory layers
      map.addSource("selected-iceberg-cone", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-iceberg-cone-fill", type: "fill", source: "selected-iceberg-cone", paint: { "fill-color": "rgba(249, 115, 22, 0.15)" } });
      map.addLayer({ id: "selected-iceberg-cone-outline", type: "line", source: "selected-iceberg-cone", paint: { "line-color": "rgba(249, 115, 22, 0.5)", "line-width": 1, "line-dasharray": [3, 2] } });
      map.addSource("selected-iceberg-path", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-iceberg-path-line", type: "line", source: "selected-iceberg-path", paint: { "line-color": "#eab308", "line-width": 2.5 } });

      usePolarisStore.setState({ mapLoaded: true } as any);

      try {
        const day = usePolarisStore.getState().forecastDay;
        const [wildlifeRes, flowData] = await Promise.all([
          fetchWildlifeColonies(),
          fetchFlowField(day),
        ]);

        flowFieldRef.current = flowData;
        usePolarisStore.getState().setFlowField(flowData);

        // Draw initial routes
        const initialRoutes = usePolarisStore.getState().routes;
        if (initialRoutes?.length) drawRoutes(initialRoutes);

        // Load wildlife colonies
        if (wildlifeRes.colonies?.length) {
          usePolarisStore.getState().setColonies(wildlifeRes.colonies);
          wildlifeRes.colonies.forEach((colony: WildlifeColony) => {
            const el = createWildlifeMarkerElement(colony);
            el.addEventListener("click", (e) => {
              e.stopPropagation();
              usePolarisStore.getState().selectColony(colony.id);
              // Push wildlife alert
              const tier = colony.riskTier === "Critical" ? "CRITICAL" : colony.riskTier === "High" ? "WARNING" : "INFO";
              usePolarisStore.getState().pushAlert(tier, `Wildlife habitat nearby — ${colony.name} (${colony.riskTier} risk): ${colony.reason.split(";")[0]}`);
            });
            const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
              .setLngLat([colony.lon, colony.lat])
              .addTo(map);
            wildlifeMarkersRef.current.push(marker);
          });
        }
      } catch {
        /* fallback resilient */
      }
    });

    // Map click removed (handled by parent map)

    // Subscribe to layer visibility + forecastDay changes
    const unsub = usePolarisStore.subscribe((state, prevState) => {
      if (state.layers.wildlife !== prevState.layers.wildlife) {
        wildlifeMarkersRef.current.forEach((m) => {
          const el = m.getElement();
          if (el) el.style.display = state.layers.wildlife ? "block" : "none";
        });
      }
      if (state.layers.icebergs !== prevState.layers.icebergs) {
        icebergMarkersRef.current.forEach((m) => {
          const el = m.getElement();
          if (el) el.style.display = state.layers.icebergs ? "block" : "none";
        });
      }
      if (state.forecastDay !== prevState.forecastDay) {
        fetchFlowField(state.forecastDay).then((f) => {
          flowFieldRef.current = f;
          usePolarisStore.getState().setFlowField(f);
        });
      }
      // Re-draw routes when they change
      if (state.routes !== prevState.routes && state.routes.length > 0 && map.isStyleLoaded()) {
        drawRoutes(state.routes);
      }
    });

    const handleResize = () => mapRef.current?.resize();
    window.addEventListener("resize", handleResize);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
      ro = new ResizeObserver(() => mapRef.current?.resize());
      ro.observe(mapContainerRef.current);
    }

    return () => {
      unsub();
      window.removeEventListener("resize", handleResize);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      wildlifeMarkersRef.current = [];
      icebergMarkersRef.current = [];
    };
  }, []);

  // ── Canvas freshwater particle animation ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = mapContainerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = container.clientWidth;
    let height = container.clientHeight;
    let dpr = window.devicePixelRatio || 1;

    const resizeCanvas = () => {
      if (!container || !canvas) return;
      width = container.clientWidth;
      height = container.clientHeight;
      dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const particles: CanvasParticle[] = [];
    for (let i = 0; i < NUM_PARTICLES; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        age: Math.floor(Math.random() * 60),
        maxAge: 40 + Math.floor(Math.random() * 50),
      });
    }

    // Land mask
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
    let maskData: Uint8ClampedArray | null = null;
    let maskWidth = 0;
    let maskHeight = 0;
    let landGeoJSON: any = null;
    let maskAttached = false;

    fetch("/land.geojson")
      .then((r) => r.json())
      .then((data) => {
        data.features.forEach((f: any) => {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          const processCoord = (c: number[]) => {
            if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
            if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
          };
          if (f.geometry.type === "Polygon") f.geometry.coordinates.forEach((r: any) => r.forEach(processCoord));
          else if (f.geometry.type === "MultiPolygon") f.geometry.coordinates.forEach((p: any) => p.forEach((r: any) => r.forEach(processCoord)));
          f.bbox = [minX, minY, maxX, maxY];
        });
        landGeoJSON = data;
        updateMask();
      })
      .catch(() => {});

    const updateMask = () => {
      const map = mapRef.current;
      if (!map || !landGeoJSON || !maskCtx) return;
      const bounds = map.getBounds();
      const west = bounds.getWest() - 2, east = bounds.getEast() + 2;
      const south = bounds.getSouth() - 2, north = bounds.getNorth() + 2;
      maskWidth = mapContainerRef.current?.clientWidth || width;
      maskHeight = mapContainerRef.current?.clientHeight || height;
      maskCanvas.width = maskWidth;
      maskCanvas.height = maskHeight;
      maskCtx.clearRect(0, 0, maskWidth, maskHeight);
      maskCtx.fillStyle = "black";
      maskCtx.beginPath();
      const project = (coord: number[]) => map.project([coord[0], coord[1]]);
      for (const feature of landGeoJSON.features) {
        const [minX, minY, maxX, maxY] = feature.bbox || [-180, -90, 180, 90];
        if (maxX < west || minX > east || maxY < south || minY > north) continue;
        if (feature.geometry.type === "Polygon") {
          for (const ring of feature.geometry.coordinates) {
            for (let i = 0; i < ring.length; i++) { const pt = project(ring[i]); if (i === 0) maskCtx.moveTo(pt.x, pt.y); else maskCtx.lineTo(pt.x, pt.y); }
          }
        } else if (feature.geometry.type === "MultiPolygon") {
          for (const poly of feature.geometry.coordinates) for (const ring of poly) {
            for (let i = 0; i < ring.length; i++) { const pt = project(ring[i]); if (i === 0) maskCtx.moveTo(pt.x, pt.y); else maskCtx.lineTo(pt.x, pt.y); }
          }
        }
      }
      maskCtx.fill();
      try { maskData = maskCtx.getImageData(0, 0, maskWidth, maskHeight).data; } catch { maskData = null; }
    };

    const checkLand = (x: number, y: number) => {
      if (!maskData) return false;
      const ix = Math.floor(x), iy = Math.floor(y);
      if (ix < 0 || ix >= maskWidth || iy < 0 || iy >= maskHeight) return false;
      return maskData[(iy * maskWidth + ix) * 4 + 3] > 128;
    };

    const sampleField = (lon: number, lat: number) => {
      const field = flowFieldRef.current;
      if (!field?.grid?.length) return { u: 0.25, v: 0.2, conc: 0.2, speedKnots: 0.6 };
      const b = field.gridBounds;
      const latIdx = Math.round((lat - b.latMin) / b.latStep);
      const lonIdx = Math.round((lon - b.lonMin) / b.lonStep);
      const r = Math.max(0, Math.min(b.rows - 1, latIdx));
      const c = Math.max(0, Math.min(b.cols - 1, lonIdx));
      const cell: FlowGridCell | undefined = field.grid[r * b.cols + c];
      if (!cell) return { u: 0.2, v: 0.2, conc: 0.1, speedKnots: 0.5 };
      return { u: cell.u, v: cell.v, conc: cell.concentration, speedKnots: cell.speedKnots };
    };

    let running = true;
    const render = () => {
      if (!running) return;
      const isPlumeVisible = usePolarisStore.getState().layers.freshwaterPlume;
      if (!isPlumeVisible) {
        ctx.clearRect(0, 0, width, height);
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }
      const map = mapRef.current;
      if (!map) { animFrameRef.current = requestAnimationFrame(render); return; }
      if (!maskAttached) { map.on("moveend", updateMask); updateMask(); maskAttached = true; }
      ctx.clearRect(0, 0, width, height);
      const zoom = map.getZoom();
      const zoomScale = Math.pow(2, zoom - 4.0);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.age++;
        if (p.age > p.maxAge || p.x < 0 || p.x > width || p.y < 0 || p.y > height || checkLand(p.x, p.y)) {
          let found = false;
          for (let attempt = 0; attempt < 8; attempt++) {
            const rx = Math.random() * width, ry = Math.random() * height;
            if (!checkLand(rx, ry)) { p.x = rx; p.y = ry; found = true; break; }
          }
          if (!found) { p.x = Math.random() * width; p.y = Math.random() * height; }
          p.age = 0; p.maxAge = 40 + Math.floor(Math.random() * 50); p.history = [];
          continue;
        }
        const lngLat = map.unproject([p.x, p.y]);
        const { u, v, conc } = sampleField(lngLat.lng, lngLat.lat);
        const speedScale = 4.8 * zoomScale;
        const dx = u * speedScale, dy = -v * speedScale;
        const nextX = p.x + dx, nextY = p.y + dy;
        if (!p.history) p.history = [];
        p.history.push({ x: p.x, y: p.y });
        if (p.history.length > 18) p.history.shift();
        p.x = nextX; p.y = nextY;
        if (p.history.length < 3) continue;
        const progress = p.age / p.maxAge;
        const fade = Math.sin(progress * Math.PI) * (0.4 + conc * 0.6);
        const head = p;
        const grad = ctx.createLinearGradient(p.history[0].x, p.history[0].y, head.x, head.y);
        let coreWidth = 3.5;
        if (conc > 0.5) {
          grad.addColorStop(0, "rgba(160, 240, 255, 0)");
          grad.addColorStop(1, `rgba(160, 240, 255, ${Math.min(1, fade * 1.0)})`);
          coreWidth = 5;
        } else if (conc > 0.2) {
          grad.addColorStop(0, "rgba(100, 210, 255, 0)");
          grad.addColorStop(1, `rgba(100, 210, 255, ${Math.min(1, fade * 0.85)})`);
          coreWidth = 4;
        } else {
          grad.addColorStop(0, "rgba(50, 180, 255, 0)");
          grad.addColorStop(1, `rgba(50, 180, 255, ${Math.min(1, fade * 0.65)})`);
          coreWidth = 3.5;
        }
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(p.history[0].x, p.history[0].y);
        for (let j = 1; j < p.history.length - 1; j++) {
          const cp0 = p.history[j], cp1 = p.history[j + 1];
          const midX = (cp0.x + cp1.x) / 2, midY = (cp0.y + cp1.y) / 2;
          ctx.quadraticCurveTo(cp0.x, cp0.y, midX, midY);
        }
        const lastPt = p.history[p.history.length - 1];
        ctx.quadraticCurveTo(lastPt.x, lastPt.y, head.x, head.y);
        ctx.lineWidth = coreWidth + 4; ctx.globalAlpha = 0.35; ctx.stroke();
        ctx.lineWidth = coreWidth; ctx.globalAlpha = 1.0; ctx.stroke();
      }

      ctx.globalCompositeOperation = "source-over";
      if (maskWidth > 0) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.drawImage(maskCanvas, 0, 0, maskWidth, maskHeight);
        ctx.globalCompositeOperation = "source-over";
      }
      animFrameRef.current = requestAnimationFrame(render);
    };
    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  return (
    <div className="absolute inset-0 h-full w-full">
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        style={{ pointerEvents: "none" }}
      />
    </div>
  );
}
