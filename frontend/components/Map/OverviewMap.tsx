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
const NUM_PARTICLES = 600; // Capped at 600 particles for high FPS

interface CanvasParticle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  history?: { x: number; y: number }[];
}

// ── OverviewMap component (Freshwater Particle Canvas & Wildlife Overlay) ─────
export function OverviewMap({ map }: { map?: maplibregl.Map | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wildlifeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const flowFieldRef = useRef<FlowFieldData | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // ── Attach Wildlife Markers onto passed MapLibre map ────────────────────────
  useEffect(() => {
    if (!map) return;

    let active = true;

    fetchWildlifeColonies().then((res) => {
      if (!active || !map) return;
      // Clear previous markers
      wildlifeMarkersRef.current.forEach((m) => m.remove());
      wildlifeMarkersRef.current = [];

      if (res.colonies?.length) {
        usePolarisStore.getState().setColonies(res.colonies);
        res.colonies.forEach((colony: WildlifeColony) => {
          const el = createWildlifeMarkerElement(colony);
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            usePolarisStore.getState().selectColony(colony.id);
            const tier =
              colony.riskTier === "Critical"
                ? "CRITICAL"
                : colony.riskTier === "High"
                ? "WARNING"
                : "INFO";
            usePolarisStore.getState().pushAlert(
              tier,
              `Wildlife habitat nearby — ${colony.name} (${colony.riskTier} risk): ${
                colony.reason.split(";")[0]
              }`
            );
          });
          const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
            .setLngLat([colony.lon, colony.lat])
            .addTo(map);
          wildlifeMarkersRef.current.push(marker);
        });
      }
    }).catch(() => {});

    // Subscribe to wildlife layer visibility
    const unsub = usePolarisStore.subscribe((state, prevState) => {
      if (state.layers.wildlife !== prevState.layers.wildlife) {
        wildlifeMarkersRef.current.forEach((m) => {
          const el = m.getElement();
          if (el) el.style.display = state.layers.wildlife ? "block" : "none";
        });
      }
    });

    return () => {
      active = false;
      unsub();
      wildlifeMarkersRef.current.forEach((m) => m.remove());
      wildlifeMarkersRef.current = [];
    };
  }, [map]);

  // ── Canvas freshwater particle animation ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = canvas.parentElement?.clientWidth || window.innerWidth;
    let height = canvas.parentElement?.clientHeight || window.innerHeight;
    let dpr = Math.min(1.5, window.devicePixelRatio || 1);

    const resizeCanvas = () => {
      if (!canvas) return;
      const parent = canvas.parentElement;
      width = parent?.clientWidth || window.innerWidth;
      height = parent?.clientHeight || window.innerHeight;
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
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

    const day = usePolarisStore.getState().forecastDay;
    fetchFlowField(day).then((f) => {
      flowFieldRef.current = f;
      usePolarisStore.getState().setFlowField(f);
    }).catch(() => {});

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
    let lastTime = 0;
    const targetInterval = 1000 / 30; // 30 FPS cap for maximum smoothness without CPU burn

    const render = (currentTime: number) => {
      if (!running) return;

      if (document.hidden) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const elapsed = currentTime - lastTime;
      if (elapsed < targetInterval) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastTime = currentTime - (elapsed % targetInterval);

      const isPlumeVisible = usePolarisStore.getState().layers.freshwaterPlume;
      if (!isPlumeVisible || !map.isStyleLoaded()) {
        ctx.clearRect(0, 0, width, height);
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }
      ctx.clearRect(0, 0, width, height);
      const zoom = map.getZoom();
      const zoomScale = Math.pow(2, zoom - 4.0);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.age++;
        if (p.age > p.maxAge || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
          p.x = Math.random() * width;
          p.y = Math.random() * height;
          p.age = 0;
          p.maxAge = 40 + Math.floor(Math.random() * 50);
          p.history = [];
          continue;
        }
        const lngLat = map.unproject([p.x, p.y]);
        const { u, v, conc } = sampleField(lngLat.lng, lngLat.lat);
        const speedScale = 4.8 * zoomScale;
        const dx = u * speedScale,
          dy = -v * speedScale;
        const nextX = p.x + dx,
          nextY = p.y + dy;
        if (!p.history) p.history = [];
        p.history.push({ x: p.x, y: p.y });
        if (p.history.length > 10) p.history.shift();
        p.x = nextX;
        p.y = nextY;
        if (p.history.length < 2) continue;

        const progress = p.age / p.maxAge;
        const fade = Math.sin(progress * Math.PI) * (0.4 + conc * 0.6);
        const head = p;
        const grad = ctx.createLinearGradient(p.history[0].x, p.history[0].y, head.x, head.y);
        let coreWidth = 2.0;
        if (conc > 0.5) {
          grad.addColorStop(0, "rgba(160, 240, 255, 0)");
          grad.addColorStop(1, `rgba(160, 240, 255, ${Math.min(1, fade * 1.0)})`);
          coreWidth = 3.2;
        } else if (conc > 0.2) {
          grad.addColorStop(0, "rgba(100, 210, 255, 0)");
          grad.addColorStop(1, `rgba(100, 210, 255, ${Math.min(1, fade * 0.85)})`);
          coreWidth = 2.4;
        } else {
          grad.addColorStop(0, "rgba(50, 180, 255, 0)");
          grad.addColorStop(1, `rgba(50, 180, 255, ${Math.min(1, fade * 0.65)})`);
          coreWidth = 1.8;
        }
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(p.history[0].x, p.history[0].y);
        for (let j = 1; j < p.history.length; j++) {
          ctx.lineTo(p.history[j].x, p.history[j].y);
        }
        ctx.lineWidth = coreWidth;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };
    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [map]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      style={{ pointerEvents: "none" }}
    />
  );
}
