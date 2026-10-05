"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { generateMissionPdf } from "@/lib/missionPdfGenerator";
import {
  MapPin,
  Compass,
  Layers,
  FileText,
  Eye,
  EyeOff,
  Trash2,
  ChevronRight,
  Route,
  PenTool,
  Navigation,
  Bird,
  Waves,
} from "lucide-react";
import { ALL_ICEBERGS } from "@/lib/mockData";
import { fetchIcebergs } from "@/lib/api";
import { usePolarisStore } from "@/lib/store";
import { AlertBanner } from "@/components/HUD/AlertBanner";
import { AlertHistoryLog } from "@/components/HUD/AlertHistoryLog";
import { DataRealityBadge } from "@/components/HUD/DataRealityBadge";
import { WildlifeInfoCard } from "@/components/HUD/WildlifeInfoCard";
import { PlumeLegend } from "@/components/HUD/PlumeLegend";
import Link from "next/link";
import dynamic from "next/dynamic";

const OverviewMapCanvas = dynamic(
  () => import("@/components/Map/OverviewMap").then((m) => m.OverviewMap),
  { ssr: false }
);

interface Iceberg {
  id: string;
  name: string;
  lat: number;
  lon: number;
  diameterNm: number;
  sizeClass: "small" | "medium" | "large" | "very_large";
  status: string;
  highRisk: boolean;
  dangerRadiusNm: number;
  headingDeg: number;
  predictedPath: { lat: number; lon: number; hour: number }[];
  uncertainty?: { hour: number; lat: number; lon: number; uncertainty_nm: number }[];
}

interface IceCell {
  lat: number;
  lon: number;
  sic: number;
}

const PROFILE_CONFIG: Record<string, { label: string; color: string; hex: string }> = {
  safest:   { label: "Safest",   color: "text-emerald-400", hex: "#22c55e" },
  balanced: { label: "Balanced", color: "text-amber-400",   hex: "#eab308" },
  eco:      { label: "Eco",      color: "text-sky-400",     hex: "#38bdf8" },
  fastest:  { label: "Fastest",  color: "text-rose-400",    hex: "#ef4444" },
};

function buildIcebergFeatures(icebergList: Iceberg[]) {
  const riskFeatures = icebergList.map((ib) => {
    const lon = ib.lon;
    const lat = ib.lat;
    const radiusNm = ib.dangerRadiusNm || 7.0;
    const points = [];
    const numPoints = 28;
    const radiusDeg = radiusNm / 60.0;
    const cosLat = Math.cos((lat * Math.PI) / 180.0);
    for (let i = 0; i < numPoints; i++) {
      const angle = (i * 2 * Math.PI) / numPoints;
      const dx = (Math.sin(angle) * radiusDeg) / cosLat;
      const dy = Math.cos(angle) * radiusDeg;
      points.push([lon + dx, lat + dy]);
    }
    points.push(points[0]);
    return {
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [points],
      },
      properties: { id: ib.id, highRisk: ib.highRisk },
    };
  });

  const bodyFeatures = icebergList.map((ib) => {
    const lon = ib.lon;
    const lat = ib.lat;
    const diam = ib.diameterNm || 1.5;
    const physRadiusNm = diam / 2.0;
    const points = [];
    const numPoints = 20;
    const radiusDeg = physRadiusNm / 60.0;
    const cosLat = Math.cos((lat * Math.PI) / 180.0);
    for (let i = 0; i < numPoints; i++) {
      const angle = (i * 2 * Math.PI) / numPoints;
      const dx = (Math.sin(angle) * radiusDeg) / cosLat;
      const dy = Math.cos(angle) * radiusDeg;
      points.push([lon + dx, lat + dy]);
    }
    points.push(points[0]);
    return {
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [points],
      },
      properties: { id: ib.id, name: ib.name, highRisk: ib.highRisk },
    };
  });

  const pointFeatures = icebergList.map((ib) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [ib.lon, ib.lat],
    },
    properties: {
      id: ib.id,
      name: ib.name,
      highRisk: ib.highRisk,
      status: ib.status || "tracking",
      diameterNm: ib.diameterNm || 1.5,
      dangerRadiusNm: ib.dangerRadiusNm || 7.0,
      sizeClass: ib.sizeClass || "medium",
    },
  }));

  return {
    risk: { type: "FeatureCollection" as const, features: riskFeatures },
    body: { type: "FeatureCollection" as const, features: bodyFeatures },
    points: { type: "FeatureCollection" as const, features: pointFeatures },
  };
}

export default function HomePage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const lastFittedRouteKeyRef = useRef<string>("");

  // States - immediately pre-seeded so icebergs appear instantly without network wait
  const storeIcebergs = usePolarisStore((s) => s.allIcebergs?.length > 0 ? s.allIcebergs : s.icebergs);
  const [icebergs, setIcebergs] = useState<Iceberg[]>(() => {
    if (typeof window !== "undefined") {
      const s = usePolarisStore.getState();
      if (s.allIcebergs && s.allIcebergs.length > 0) return s.allIcebergs as any;
      if (s.icebergs && s.icebergs.length > 0) return s.icebergs as any;
    }
    return ALL_ICEBERGS as any;
  });

  // Sync state if store updates from API or navigation
  useEffect(() => {
    if (storeIcebergs && storeIcebergs.length > 0) {
      setIcebergs(storeIcebergs as any);
    }
  }, [storeIcebergs]);

  const [iceCells, setIceCells] = useState<IceCell[]>([]);
  const routes = usePolarisStore((s) => s.routes);
  const selectedRouteId = usePolarisStore((s) => s.lockedRouteId);
  const lockRoute = usePolarisStore((s) => s.lockRoute);
  const fetchRoutesIfNeeded = usePolarisStore((s) => s.fetchRoutesIfNeeded);
  const [selectedIceberg, setSelectedIceberg] = useState<Iceberg | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Layer Toggles
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showIcebergs, setShowIcebergs] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showExclusionZones, setShowExclusionZones] = useState(true);

  // Route pick state
  const [startCoords, setStartCoords] = useState<[number, number]>([-68.35, -52.45]);
  const [destCoords, setDestCoords] = useState<[number, number]>([-64.58, -43.1]);
  const [pickMode, setPickMode] = useState<"none" | "start" | "dest">("none");

  // Drawing Exclusion Zones State
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [exclusionZones, setExclusionZones] = useState<[number, number][][]>([]);
  const [warpToast, setWarpToast] = useState<{ lat: number; lon: number } | null>(null);

  // Auto-dismiss warp confirmation toast
  useEffect(() => {
    if (!warpToast) return;
    const timer = setTimeout(() => {
      setWarpToast(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [warpToast]);

  // Fetch initial data
  useEffect(() => {
    // Pre-populate store if empty
    const s = usePolarisStore.getState();
    if (!s.allIcebergs || s.allIcebergs.length === 0) {
      s.setIcebergs(ALL_ICEBERGS);
      s.setAllIcebergs(ALL_ICEBERGS);
    }

    // 1. Fetch icebergs in background
    fetchIcebergs()
      .then((data) => {
        if (data.icebergs && data.icebergs.length > 0) {
          setIcebergs(data.icebergs);
          usePolarisStore.getState().setIcebergs(data.icebergs);
          usePolarisStore.getState().setAllIcebergs(data.icebergs);
        }
      })
      .catch((err) => console.error("Error fetching icebergs:", err));

    // 2. Fetch current ice concentration
    const API = process.env.NEXT_PUBLIC_API_URL ?? "";
    fetch(`${API}/api/ice/current`)
      .then((res) => {
        if (!res.ok) throw new Error("current ice fetch failed");
        return res.json();
      })
      .then((data) => {
        if (data.grid) {
          setIceCells(data.grid);
          usePolarisStore.getState().setIceGrid(data.grid);
        }
      })
      .catch((err) => console.error("Error fetching current ice:", err));

    // 3. Fetch Data Reality Statuses
    fetch(`${API}/api/status`)
      .then((res) => {
        if (!res.ok) throw new Error("status fetch failed");
        return res.json();
      })
      .then((data) => {
        usePolarisStore.getState().setDataReality({
          nsidc: {
            status: data.nsidc?.status ?? "FALLBACK",
            lastLive: data.nsidc?.fetched_at ?? null,
            reason: data.nsidc?.status === "FALLBACK" ? (data.nsidc?.error ?? "Unknown error") : null,
          },
          byu: {
            status: data.byu?.status ?? "FALLBACK",
            lastLive: data.byu?.status === "LIVE" ? new Date().toISOString() : null,
            reason: data.byu?.status === "FALLBACK" ? (data.byu?.error ?? "Unknown error") : null,
          },
          era5: {
            status: data.era5?.status ?? "FALLBACK",
            lastLive: data.era5?.fetched_at ?? null,
            reason: data.era5?.status === "FALLBACK" ? (data.era5?.error ?? "Unknown error") : null,
          },
          wildlife: { status: "FALLBACK", lastLive: null, reason: "SCAR / SO-GLOBEC census baseline" },
          oceanSalinity: { status: "FALLBACK", lastLive: null, reason: "Copernicus Marine / WOA23 assimilation" },
        });
      })
      .catch((err) => console.error("Error fetching status:", err));

    // 4. Fetch initial routes with shared cache
    fetchRoutesIfNeeded(startCoords, destCoords)
      .catch((err) => console.error("Initial 2D route fetch failed:", err));
  }, []);

  // Map Initialization
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
                  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                ],
                tileSize: 256,
                attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
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

    map.on("load", () => {
      map.resize();
      // Add source & layers for drawing zone
      map.addSource("drawing-polygon", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "drawing-polygon-fill",
        type: "fill",
        source: "drawing-polygon",
        paint: {
          "fill-color": "rgba(239, 68, 68, 0.2)",
        },
      });
      map.addLayer({
        id: "drawing-polygon-outline",
        type: "line",
        source: "drawing-polygon",
        paint: {
          "line-color": "#ef4444",
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });

      // Add source & layers for exclusion zones
      map.addSource("exclusion-zones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "exclusion-zones-fill",
        type: "fill",
        source: "exclusion-zones",
        paint: {
          "fill-color": "rgba(239, 68, 68, 0.25)",
        },
      });
      map.addLayer({
        id: "exclusion-zones-outline",
        type: "line",
        source: "exclusion-zones",
        paint: {
          "line-color": "#ef4444",
          "line-width": 2.5,
        },
      });

      // Add source & layers for selected iceberg predicted path and cone
      map.addSource("selected-iceberg-cone", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "selected-iceberg-cone-fill",
        type: "fill",
        source: "selected-iceberg-cone",
        paint: {
          "fill-color": "rgba(249, 115, 22, 0.15)",
        },
      });
      map.addLayer({
        id: "selected-iceberg-cone-outline",
        type: "line",
        source: "selected-iceberg-cone",
        paint: {
          "line-color": "rgba(249, 115, 22, 0.5)",
          "line-width": 1,
          "line-dasharray": [3, 2],
        },
      });

      map.addSource("selected-iceberg-path", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "selected-iceberg-path-line",
        type: "line",
        source: "selected-iceberg-path",
        paint: {
          "line-color": "#eab308",
          "line-width": 2.5,
        },
      });

      // Initialize all 38 icebergs instantly on frame 0 WebGL
      const initialIcebergsGeo = buildIcebergFeatures(ALL_ICEBERGS);

      map.addSource("risk-circles-source", {
        type: "geojson",
        data: initialIcebergsGeo.risk,
      });
      map.addLayer({
        id: "risk-circles-layer",
        type: "fill",
        source: "risk-circles-source",
        paint: {
          "fill-color": "rgba(239, 68, 68, 0.08)",
          "fill-outline-color": "rgba(239, 68, 68, 0.65)",
        },
      });

      map.addSource("iceberg-bodies-source", {
        type: "geojson",
        data: initialIcebergsGeo.body,
      });
      map.addLayer({
        id: "iceberg-bodies-layer",
        type: "fill",
        source: "iceberg-bodies-source",
        paint: {
          "fill-color": "rgba(248, 250, 252, 0.9)",
          "fill-outline-color": "#38bdf8",
        },
      });

      map.addSource("iceberg-points-source", {
        type: "geojson",
        data: initialIcebergsGeo.points,
      });
      map.addLayer({
        id: "iceberg-points-layer",
        type: "circle",
        source: "iceberg-points-source",
        paint: {
          "circle-radius": 5.5,
          "circle-color": [
            "case",
            ["get", "highRisk"],
            "#ef4444",
            "#eab308"
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      setMapLoaded(true);
    });

    // Map Click Listener
    map.on("click", (e) => {
      const originalTarget = e.originalEvent?.target as HTMLElement | null;
      if (
        originalTarget &&
        originalTarget.closest &&
        (originalTarget.closest(".maplibregl-marker") ||
          originalTarget.closest(".maplibregl-popup"))
      ) {
        return;
      }

      const clickedLng = e.lngLat.lng;
      const clickedLat = e.lngLat.lat;

      if (useIsDrawingRef.current) {
        setDrawingPoints((prev) => {
          const next: [number, number][] = [...prev, [clickedLng, clickedLat] as [number, number]];
          updateDrawingLayer(next);
          return next;
        });
        return;
      }

      if (usePickModeRef.current === "start") {
        setStartCoords([+clickedLat.toFixed(4), +clickedLng.toFixed(4)] as [number, number]);
        setPickMode("none");
        return;
      } else if (usePickModeRef.current === "dest") {
        setDestCoords([+clickedLat.toFixed(4), +clickedLng.toFixed(4)] as [number, number]);
        setPickMode("none");
        return;
      }

      const interactiveLayers = [
        "route-safest-layer",
        "route-balanced-layer",
        "route-eco-layer",
        "route-fastest-layer",
        "exclusion-zones-fill",
        "exclusion-zones-outline",
        "drawing-polygon-fill",
        "drawing-polygon-outline",
        "selected-iceberg-cone-fill",
        "selected-iceberg-cone-outline",
        "selected-iceberg-path-line",
      ].filter((id) => map.getLayer(id));

      if (interactiveLayers.length > 0) {
        const features = map.queryRenderedFeatures(e.point, {
          layers: interactiveLayers,
        });
        if (features && features.length > 0) {
          const routeFeature = features.find((f) => f.layer.id.startsWith("route-"));
          if (routeFeature) {
            const match = routeFeature.layer.id.match(/^route-(safest|balanced|eco|fastest)-layer$/);
            if (match) {
              lockRoute(match[1] as any);
            }
          }
          return;
        }
      }

      // Valid map click: warp ship
      const lat = +clickedLat.toFixed(4);
      const lon = +clickedLng.toFixed(4);
      usePolarisStore.getState().setWarpTarget({ lat, lon });
      setStartCoords([lat, lon]);
      setWarpToast({ lat, lon });
    });

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };
    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const useIsDrawingRef = useRef(isDrawing);
  useEffect(() => {
    useIsDrawingRef.current = isDrawing;
  }, [isDrawing]);

  const usePickModeRef = useRef(pickMode);
  useEffect(() => {
    usePickModeRef.current = pickMode;
  }, [pickMode]);

  const updateDrawingLayer = (pts: [number, number][]) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("drawing-polygon") as maplibregl.GeoJSONSource;
    if (!src) return;

    if (pts.length < 2) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const closedCoords = pts.length >= 3 ? [...pts, pts[0]] : pts;
    src.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: pts.length >= 3 ? "Polygon" : "LineString",
            coordinates: pts.length >= 3 ? [closedCoords] : pts,
          } as any,
        },
      ],
    });
  };

  // Redraw Saved Exclusion Zones
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("exclusion-zones") as maplibregl.GeoJSONSource;
    if (!src) return;

    if (!showExclusionZones || exclusionZones.length === 0) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const features = exclusionZones.map((zone) => ({
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Polygon" as const,
        coordinates: [[...zone, zone[0]]],
      },
    }));

    src.setData({
      type: "FeatureCollection",
      features,
    });
  }, [exclusionZones, showExclusionZones]);

  // Redraw Sea Ice Heatmap Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;

    if (!showHeatmap || iceCells.length === 0) {
      if (map.getLayer("ice-heatmap-layer")) {
        map.removeLayer("ice-heatmap-layer");
      }
      if (map.getSource("ice-heatmap-source")) {
        map.removeSource("ice-heatmap-source");
      }
      return;
    }

    const geojson = {
      type: "FeatureCollection" as const,
      features: iceCells.map((c) => ({
        type: "Feature" as const,
        properties: { sic: c.sic },
        geometry: {
          type: "Point" as const,
          coordinates: [c.lon, c.lat],
        },
      })),
    };

    if (map.getSource("ice-heatmap-source")) {
      (map.getSource("ice-heatmap-source") as maplibregl.GeoJSONSource).setData(geojson);
    } else {
      map.addSource("ice-heatmap-source", {
        type: "geojson",
        data: geojson,
      });
    }

    if (!map.getLayer("ice-heatmap-layer")) {
      map.addLayer({
        id: "ice-heatmap-layer",
        type: "heatmap",
        source: "ice-heatmap-source",
        paint: {
          "heatmap-weight": ["get", "sic"],
          "heatmap-intensity": 1.4,
          "heatmap-radius": 32,
          "heatmap-opacity": 0.55,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(30,58,138,0)",
            0.3,
            "rgba(30,58,138,0.55)",
            0.6,
            "rgba(59,130,246,0.75)",
            0.8,
            "rgba(147,197,253,0.9)",
            1.0,
            "rgba(255,255,255,1.0)",
          ],
        },
      });
    }
  }, [iceCells, showHeatmap, mapLoaded]);

  // Redraw Selected Iceberg Trajectory
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;

    const coneSrc = map.getSource("selected-iceberg-cone") as maplibregl.GeoJSONSource;
    const pathSrc = map.getSource("selected-iceberg-path") as maplibregl.GeoJSONSource;

    if (!selectedIceberg || !selectedIceberg.predictedPath || selectedIceberg.predictedPath.length < 2) {
      if (coneSrc) coneSrc.setData({ type: "FeatureCollection", features: [] });
      if (pathSrc) pathSrc.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    if (pathSrc) {
      pathSrc.setData({
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: selectedIceberg.predictedPath.map((p) => [p.lon, p.lat]),
        },
      });
    }

    const uncertaintyList = selectedIceberg.uncertainty || [
      { hour: 0, lat: selectedIceberg.lat, lon: selectedIceberg.lon, uncertainty_nm: 0 },
      { hour: 24, lat: selectedIceberg.predictedPath[1]?.lat || selectedIceberg.lat, lon: selectedIceberg.predictedPath[1]?.lon || selectedIceberg.lon, uncertainty_nm: 4.5 },
      { hour: 48, lat: selectedIceberg.predictedPath[2]?.lat || selectedIceberg.lat, lon: selectedIceberg.predictedPath[2]?.lon || selectedIceberg.lon, uncertainty_nm: 6.36 },
      { hour: 72, lat: selectedIceberg.predictedPath[3]?.lat || selectedIceberg.lat, lon: selectedIceberg.predictedPath[3]?.lon || selectedIceberg.lon, uncertainty_nm: 7.79 },
    ];

    const leftSide: [number, number][] = [];
    const rightSide: [number, number][] = [];

    for (let i = 0; i < selectedIceberg.predictedPath.length; i++) {
      const p = selectedIceberg.predictedPath[i];
      const u = uncertaintyList.find((item) => item.hour === p.hour) || { uncertainty_nm: i * 2.5 };
      const r = u.uncertainty_nm;

      let dx = 0;
      let dy = 0;

      if (i === 0) {
        dx = (selectedIceberg.predictedPath[1]?.lon || p.lon) - p.lon;
        dy = (selectedIceberg.predictedPath[1]?.lat || p.lat) - p.lat;
      } else if (i === selectedIceberg.predictedPath.length - 1) {
        dx = p.lon - (selectedIceberg.predictedPath[i - 1]?.lon || p.lon);
        dy = p.lat - (selectedIceberg.predictedPath[i - 1]?.lat || p.lat);
      } else {
        dx = (selectedIceberg.predictedPath[i + 1]?.lon || p.lon) - (selectedIceberg.predictedPath[i - 1]?.lon || p.lon);
        dy = (selectedIceberg.predictedPath[i + 1]?.lat || p.lat) - (selectedIceberg.predictedPath[i - 1]?.lat || p.lat);
      }

      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const rDeg = r / 60.0;
      const cosLat = Math.cos((p.lat * Math.PI) / 180.0);

      leftSide.push([p.lon + nx * (rDeg / cosLat), p.lat + ny * rDeg]);
      rightSide.unshift([p.lon - nx * (rDeg / cosLat), p.lat - ny * rDeg]);
    }

    const coneCoords = [...leftSide, ...rightSide, leftSide[0]];

    if (coneSrc) {
      coneSrc.setData({
        type: "FeatureCollection" as const,
        features: [
          {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "Polygon" as const,
              coordinates: [coneCoords],
            },
          },
        ],
      });
    }
  }, [selectedIceberg]);

  // Manage Iceberg HTML Markers & Danger Radius Circles
  const markersRef = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;

    try {
      const geo = buildIcebergFeatures(showIcebergs ? icebergs : []);

      const riskSrc = map.getSource("risk-circles-source") as maplibregl.GeoJSONSource;
      if (riskSrc) riskSrc.setData(geo.risk);

      const bodySrc = map.getSource("iceberg-bodies-source") as maplibregl.GeoJSONSource;
      if (bodySrc) bodySrc.setData(geo.body);

      const ptSrc = map.getSource("iceberg-points-source") as maplibregl.GeoJSONSource;
      if (ptSrc) ptSrc.setData(geo.points);

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      if (!showIcebergs || icebergs.length === 0) return;

      icebergs.forEach((ib) => {
        let svgContent = "";
        if (ib.predictedPath && ib.predictedPath.length >= 2) {
          const lats = ib.predictedPath.map((p) => p.lat);
          const lons = ib.predictedPath.map((p) => p.lon);
          const minLat = Math.min(...lats), maxLat = Math.max(...lats);
          const minLon = Math.min(...lons), maxLon = Math.max(...lons);
          const latRange = maxLat - minLat || 0.01;
          const lonRange = maxLon - minLon || 0.01;
          const w = 140, h = 60, pad = 8;
          const getX = (lon: number) => pad + ((lon - minLon) / lonRange) * (w - 2 * pad);
          const getY = (lat: number) => h - (pad + ((lat - minLat) / latRange) * (h - 2 * pad));
          const ptsStr = ib.predictedPath.map((p) => `${getX(p.lon)},${getY(p.lat)}`).join(" ");
          svgContent = `
            <div style="margin-top: 6px; padding: 4px; background: #0f172a; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
              <div style="font-size: 8px; color: #94a3b8; font-weight: bold; margin-bottom: 2px;">72H DRIFT TRAJECTORY</div>
              <svg width="${w}" height="${h}">
                <polyline points="${ptsStr}" fill="none" stroke="#eab308" stroke-width="1.5" stroke-dasharray="3,2" />
                ${ib.predictedPath.map((p) => `<circle cx="${getX(p.lon)}" cy="${getY(p.lat)}" r="2" fill="#38bdf8" />`).join("")}
              </svg>
            </div>
          `;
        }

        const htmlContent = `
          <div style="padding: 8px 10px; font-size: 11px; font-family: monospace; color: white; background: #0f172a; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); min-width: 160px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong style="color: ${ib.highRisk ? '#ef4444' : '#eab308'}; font-size: 12px;">${ib.name}</strong>
              <span style="font-size: 9px; padding: 1px 4px; border-radius: 3px; background: ${ib.highRisk ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)'}; color: ${ib.highRisk ? '#f87171' : '#fde047'};">${(ib.status || 'tracking').toUpperCase()}</span>
            </div>
            <div style="font-size: 10px; color: #94a3b8; line-height: 1.4;">
              <div>ID: <span style="color: #cbd5e1;">${ib.id}</span></div>
              <div>Pos: <span style="color: #cbd5e1;">${ib.lat.toFixed(2)}°, ${ib.lon.toFixed(2)}°</span></div>
              <div>Size: <span style="color: #cbd5e1;">${ib.sizeClass || 'medium'} (${ib.diameterNm || 6} NM)</span></div>
              <div>Danger Radius: <span style="color: #cbd5e1;">${ib.dangerRadiusNm || 6} NM</span></div>
            </div>
            ${svgContent}
          </div>
        `;

        const popupNode = document.createElement("div");
        popupNode.innerHTML = htmlContent;

        const popup = new maplibregl.Popup({
          offset: 20,
          closeButton: true,
          className: "hud-popup-container",
        }).setDOMContent(popupNode);

        const color = ib.highRisk ? "#ef4444" : "#eab308";
        const marker = new maplibregl.Marker({ color })
          .setLngLat([ib.lon, ib.lat])
          .setPopup(popup)
          .addTo(map);

        popup.on("open", () => setSelectedIceberg(ib));
        popup.on("close", () => setSelectedIceberg((prev) => (prev?.id === ib.id ? null : prev)));

        markersRef.current.push(marker);
      });
    } catch (e) {
      console.warn("Error updating iceberg layers/markers:", e);
    }
  }, [icebergs, showIcebergs, mapLoaded]);

  // Manage Start ("S") and Destination ("D") Markers
  const endpointMarkersRef = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    endpointMarkersRef.current.forEach((m) => m.remove());
    endpointMarkersRef.current = [];

    // Start Marker (S)
    const startEl = document.createElement("div");
    startEl.className = "start-endpoint-marker";
    startEl.innerHTML = `
      <div style="background: #10b981; color: #022c22; font-weight: 900; font-family: monospace; font-size: 13px; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 10px rgba(16,185,129,0.8); cursor: pointer;" title="Route Start (S)">
        S
      </div>
    `;
    const startMarker = new maplibregl.Marker({ element: startEl })
      .setLngLat([startCoords[1], startCoords[0]])
      .addTo(map);

    // Destination Marker (D)
    const destEl = document.createElement("div");
    destEl.className = "dest-endpoint-marker";
    destEl.innerHTML = `
      <div style="background: #ef4444; color: #ffffff; font-weight: 900; font-family: monospace; font-size: 13px; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 10px rgba(239,68,68,0.8); cursor: pointer;" title="Route Destination (D)">
        D
      </div>
    `;
    const destMarker = new maplibregl.Marker({ element: destEl })
      .setLngLat([destCoords[1], destCoords[0]])
      .addTo(map);

    endpointMarkersRef.current = [startMarker, destMarker];
  }, [startCoords, destCoords, mapLoaded]);

  // Handle Route Calculation Submit
  const handleRouteSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await fetchRoutesIfNeeded(startCoords, destCoords, true);
      if (data && data.length > 0) {
        lockRoute(selectedRouteId || "safest");
      }
    } catch (err) {
      console.error("Failed to compute routes:", err);
    }
  };

  // Render/Update Route Paths on Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let isMounted = true;

    const render = () => {
      if (!isMounted || !map || !mapLoaded) return;

      const routeIds = ["safest", "balanced", "eco", "fastest"];
      routeIds.forEach((rid) => {
        try {
          if (map.getLayer(`route-${rid}-layer`)) {
            map.removeLayer(`route-${rid}-layer`);
          }
          if (map.getSource(`route-${rid}-source`)) {
            map.removeSource(`route-${rid}-source`);
          }
        } catch {}
      });

      if (!showRoutes || !routes || routes.length === 0) return;

      routes.forEach((r) => {
        try {
          const rid = r.id;
          const isSelected = selectedRouteId === rid;
          const color = PROFILE_CONFIG[rid]?.hex ?? "#eab308";
          const width = isSelected ? 6.5 : 3.0;
          const opacity = isSelected ? 1.0 : 0.35;

          if (!r.points || r.points.length < 2) return;

          map.addSource(`route-${rid}-source`, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: r.points.map((p) => [p.lon, p.lat]),
              },
            },
          });

          map.addLayer({
            id: `route-${rid}-layer`,
            type: "line",
            source: `route-${rid}-source`,
            paint: {
              "line-color": color,
              "line-width": width,
              "line-opacity": opacity,
            },
          });
        } catch (err) {
          console.error(`Error adding route layer for ${r.id}:`, err);
        }
      });

      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      let hasRoutePoints = false;

      routes.forEach((r) => {
        r.points?.forEach((p) => {
          if (typeof p.lon === "number" && typeof p.lat === "number") {
            hasRoutePoints = true;
            if (p.lon < minLng) minLng = p.lon;
            if (p.lon > maxLng) maxLng = p.lon;
            if (p.lat < minLat) minLat = p.lat;
            if (p.lat > maxLat) maxLat = p.lat;
          }
        });
      });

      if (hasRoutePoints && map) {
        const currentRouteKey = routes
          .map((r) => `${r.id}:${r.points?.length}:${r.distanceNm}`)
          .join("|");
        if (lastFittedRouteKeyRef.current !== currentRouteKey) {
          lastFittedRouteKeyRef.current = currentRouteKey;
          map.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            {
              padding: { top: 90, bottom: 90, left: 440, right: 100 },
              maxZoom: 7,
              duration: 1000,
            }
          );
        }
      }
    };

    if (mapLoaded) {
      render();
    }

    return () => {
      isMounted = false;
    };
  }, [routes, selectedRouteId, showRoutes, mapLoaded]);

  const handleFinishDrawing = () => {
    if (drawingPoints.length < 3) {
      alert("Exclusion zone polygon requires at least 3 vertices!");
      return;
    }
    setExclusionZones((prev) => [...prev, drawingPoints]);
    setDrawingPoints([]);
    setIsDrawing(false);
    updateDrawingLayer([]);
  };

  const handleClearZones = () => {
    setExclusionZones([]);
    setDrawingPoints([]);
    setIsDrawing(false);
    updateDrawingLayer([]);
  };

  const handleExportPdf = async () => {
    try {
      const mapCanvas = mapRef.current?.getCanvas() || null;
      const storeState = usePolarisStore.getState();
      const pdfBytes = await generateMissionPdf({
        vessel: {
          lat: startCoords[0],
          lon: startCoords[1],
          headingDeg: storeState.vessel?.headingDeg ?? 112,
          sogKnots: storeState.vessel?.sogKnots ?? 8.4,
          cogDeg: storeState.vessel?.cogDeg ?? 112,
        },
        destination: { lat: destCoords[0], lon: destCoords[1] },
        routes,
        selectedRouteId: selectedRouteId || "safest",
        icebergs: icebergs.length > 0 ? (icebergs as any) : storeState.icebergs,
        alerts: storeState.alerts,
        mapCanvas,
      });

      const blob = new Blob([pdfBytes as any], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `polaris_mission_plan_${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("PDF Export failed:", err);
    }
  };

  return (
    <main className="h-screen w-screen relative bg-slate-950 text-slate-100 flex font-sans overflow-hidden">
      {/* Map Element + Canvas Particle Overlay */}
      <div className="absolute inset-0 z-0 bg-slate-900">
        <div ref={mapContainerRef} className="w-full h-full" />
        <OverviewMapCanvas map={mapRef.current} />
      </div>

      {/* Ship Relocated Warp Confirmation Toast */}
      {warpToast && (
        <div
          id="warp-confirmation-toast"
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-cyan-500/50 backdrop-blur-md px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-mono text-cyan-200"
        >
          <Navigation className="h-4 w-4 text-cyan-400 animate-pulse shrink-0" />
          <span className="font-semibold text-white">Ship relocated to</span>
          <span className="text-[11px] text-cyan-300 font-mono">
            [{warpToast.lat.toFixed(2)}°, {warpToast.lon.toFixed(2)}°]
          </span>
          <Link
            href="/simulation"
            className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 hover:text-white text-[11px] font-bold font-sans transition-all shrink-0"
          >
            Open 3D &rarr;
          </Link>
          <button
            onClick={() => setWarpToast(null)}
            className="text-white/40 hover:text-white ml-1 text-base leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* Left Sidebar: Scrollable panel containing Router, Table, Layers, Exclusion Tools */}
      <div className="relative z-10 w-96 max-w-[400px] h-full p-3 pointer-events-none flex flex-col">
        <div className="pointer-events-auto bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-3.5 max-h-full overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-cyan-400 animate-spin-slow" />
              <div>
                <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest leading-none">
                  POLARIS NAVIGATION
                </p>
                <h1 className="text-sm font-bold text-white tracking-tight leading-tight mt-0.5">
                  Route Planner &amp; 2D Map
                </h1>
              </div>
            </div>
            <Link
              href="/simulation"
              className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold uppercase transition-all flex items-center gap-1 shadow-md shadow-cyan-600/30 shrink-0"
            >
              Launch 3D
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Router Inputs */}
          <form onSubmit={handleRouteSearch} className="flex flex-col gap-2 bg-white/5 p-2.5 rounded-xl border border-white/5">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-white/50 uppercase font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  Start (Lat, Lon)
                </label>
                <div className="flex gap-1 items-center">
                  <input
                    type="text"
                    value={startCoords.join(", ")}
                    suppressHydrationWarning
                    onChange={(e) => {
                      const parts = e.target.value.split(",").map((p) => parseFloat(p.trim()) || 0);
                      if (parts.length === 2) setStartCoords([parts[0], parts[1]]);
                    }}
                    className="w-full bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-slate-100 tabular-nums font-mono focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPickMode(pickMode === "start" ? "none" : "start")}
                    className={`px-1.5 py-1 rounded border transition-all ${
                      pickMode === "start" ? "bg-amber-500 text-black border-amber-500" : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                    title="Click map to pick starting position"
                  >
                    <MapPin className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-white/50 uppercase font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                  Dest (Lat, Lon)
                </label>
                <div className="flex gap-1 items-center">
                  <input
                    type="text"
                    value={destCoords.join(", ")}
                    suppressHydrationWarning
                    onChange={(e) => {
                      const parts = e.target.value.split(",").map((p) => parseFloat(p.trim()) || 0);
                      if (parts.length === 2) setDestCoords([parts[0], parts[1]]);
                    }}
                    className="w-full bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-slate-100 tabular-nums font-mono focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPickMode(pickMode === "dest" ? "none" : "dest")}
                    className={`px-1.5 py-1 rounded border transition-all ${
                      pickMode === "dest" ? "bg-amber-500 text-black border-amber-500" : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                    title="Click map to pick destination position"
                  >
                    <MapPin className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>

            {pickMode !== "none" && (
              <div className="text-[10px] text-amber-300 font-medium animate-pulse text-center bg-amber-950/40 border border-amber-500/30 py-1 rounded">
                Click map to select {pickMode.toUpperCase()} coordinate
              </div>
            )}

            <button
              id="compute-route-btn"
              type="submit"
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1.5 rounded-lg text-xs uppercase tracking-wider transition-all shadow-md shadow-cyan-600/30 mt-1"
            >
              Compute Routes
            </button>
          </form>

          {/* 4-Row Route Comparison Table */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 flex items-center gap-1.5">
                <Route className="h-3.5 w-3.5 text-cyan-400" />
                Pathfinding Profiles (4)
              </span>
              <button
                onClick={handleExportPdf}
                className="text-[9px] font-bold text-cyan-300 hover:text-white flex items-center gap-1 uppercase"
              >
                <FileText className="h-3 w-3" />
                Export PDF
              </button>
            </div>

            <div className="border border-white/10 rounded-xl overflow-hidden bg-slate-950/70">
              <table className="w-full text-left text-xs border-collapse" suppressHydrationWarning>
                <thead>
                  <tr className="bg-white/5 text-white/50 border-b border-white/10 text-[9px] uppercase font-bold tracking-wider">
                    <th className="p-1.5 pl-2.5">Profile</th>
                    <th className="p-1.5 text-right">DIST</th>
                    <th className="p-1.5 text-right">ETA</th>
                    <th className="p-1.5 text-right">FUEL</th>
                    <th className="p-1.5 text-right">MAX SIC</th>
                    <th className="p-1.5 text-right">RISK</th>
                    <th className="p-1.5 text-center">Lock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-[10px] font-mono tabular-nums" suppressHydrationWarning>
                  {routes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-3 text-center text-white/40 italic font-sans text-xs">
                        Click Compute to calculate routes
                      </td>
                    </tr>
                  ) : (
                    routes.map((r) => {
                      const isSelected = selectedRouteId === r.id;
                      const cfg = PROFILE_CONFIG[r.id] ?? { color: "text-white", label: r.name };
                      const maxSic = Number(((r as any).maxSicPct ?? 79.6).toFixed(0));
                      return (
                        <tr
                          key={r.id}
                          onClick={() => lockRoute(r.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-white/10 text-white font-bold" : "text-white/70 hover:bg-white/5"
                          }`}
                          suppressHydrationWarning
                        >
                          <td className={`p-1.5 pl-2.5 font-bold ${cfg.color} capitalize`}>
                            {cfg.label}
                          </td>
                          <td className="p-1.5 text-right" suppressHydrationWarning>{r.distanceNm.toFixed(1)}</td>
                          <td className="p-1.5 text-right" suppressHydrationWarning>{r.etaHours.toFixed(1)}h</td>
                          <td className="p-1.5 text-right" suppressHydrationWarning>{r.fuelMt.toFixed(1)}</td>
                          <td className="p-1.5 text-right font-mono text-cyan-300" suppressHydrationWarning>
                            <span>{maxSic}%</span>
                            {maxSic > 70 && (
                              <span className="ml-1 px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[8px] font-sans font-bold">
                                !
                              </span>
                            )}
                          </td>
                          <td className="p-1.5 text-right font-bold text-emerald-400" suppressHydrationWarning>
                            {(r.riskScore * 100).toFixed(0)}%
                          </td>
                          <td className="p-1.5 text-center" suppressHydrationWarning>
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-sans font-bold uppercase ${
                                isSelected
                                  ? "bg-emerald-500 text-slate-950 font-extrabold"
                                  : "bg-white/5 text-white/40"
                              }`}
                            >
                              {isSelected ? "Locked" : "Select"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Overlay Layers Toggles */}
          <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2.5">
            <h3 className="text-[10px] font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-cyan-400" />
              Map Layers
            </h3>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`flex items-center justify-between px-2 py-1 rounded-lg border transition-all ${
                  showHeatmap ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300" : "bg-white/5 border-white/5 text-white/40"
                }`}
              >
                <span>Sea Ice (SIC)</span>
                {showHeatmap ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>

              <button
                onClick={() => setShowIcebergs(!showIcebergs)}
                className={`flex items-center justify-between px-2 py-1 rounded-lg border transition-all ${
                  showIcebergs ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300" : "bg-white/5 border-white/5 text-white/40"
                }`}
              >
                <span>Icebergs (38)</span>
                {showIcebergs ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>

              <button
                onClick={() => setShowRoutes(!showRoutes)}
                className={`flex items-center justify-between px-2 py-1 rounded-lg border transition-all ${
                  showRoutes ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300" : "bg-white/5 border-white/5 text-white/40"
                }`}
              >
                <span>Routes</span>
                {showRoutes ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>

              <button
                onClick={() => setShowExclusionZones(!showExclusionZones)}
                className={`flex items-center justify-between px-2 py-1 rounded-lg border transition-all ${
                  showExclusionZones ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300" : "bg-white/5 border-white/5 text-white/40"
                }`}
              >
                <span>Exclusion Zones</span>
                {showExclusionZones ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>

              <button
                onClick={() => usePolarisStore.getState().toggleLayer("wildlife")}
                className={`flex items-center justify-between px-2 py-1 rounded-lg border transition-all ${
                  usePolarisStore.getState().layers.wildlife ? "bg-teal-500/15 border-teal-500/30 text-teal-300" : "bg-white/5 border-white/5 text-white/40"
                }`}
              >
                <span className="flex items-center gap-1"><Bird className="h-3 w-3" />Wildlife</span>
                {usePolarisStore.getState().layers.wildlife ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>

              <button
                onClick={() => usePolarisStore.getState().toggleLayer("freshwaterPlume")}
                className={`flex items-center justify-between px-2 py-1 rounded-lg border transition-all ${
                  usePolarisStore.getState().layers.freshwaterPlume ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300" : "bg-white/5 border-white/5 text-white/40"
                }`}
              >
                <span className="flex items-center gap-1"><Waves className="h-3 w-3" />Freshwater</span>
                {usePolarisStore.getState().layers.freshwaterPlume ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>
            </div>
          </div>

          {/* Exclusion Polygon Tool */}
          <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2.5">
            <h3 className="text-[10px] font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
              <PenTool className="h-3 w-3 text-rose-400" />
              Exclusion Zone Tool
            </h3>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <button
                onClick={() => {
                  setIsDrawing(!isDrawing);
                  setDrawingPoints([]);
                  updateDrawingLayer([]);
                }}
                className={`py-1 px-2 rounded-lg border font-semibold transition-all ${
                  isDrawing ? "bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                }`}
              >
                {isDrawing ? "Cancel" : "Draw Zone"}
              </button>
              <button
                onClick={handleFinishDrawing}
                disabled={!isDrawing || drawingPoints.length < 3}
                className="py-1 px-2 rounded-lg bg-emerald-600 border border-emerald-500 hover:bg-emerald-500 text-white font-semibold disabled:opacity-30 transition-all"
              >
                Finish ({drawingPoints.length})
              </button>
            </div>
            {exclusionZones.length > 0 && (
              <button
                onClick={handleClearZones}
                className="flex items-center justify-center gap-1 w-full py-1 rounded-lg border border-rose-500/20 text-rose-400 bg-rose-950/20 text-[10px] transition-all"
              >
                <Trash2 className="h-3 w-3" />
                Clear Zones ({exclusionZones.length})
              </button>
            )}
          </div>

          {/* Alert History Log in left sidebar */}
          <div className="border-t border-white/10 pt-2.5">
            <AlertHistoryLog />
          </div>
        </div>
      </div>

      {/* Right Floating Elements */}
      <div className="absolute top-3 right-3 z-10 pointer-events-none flex flex-col items-end gap-2.5">
        <div className="pointer-events-auto">
          <AlertBanner />
        </div>
        <div className="pointer-events-auto">
          <DataRealityBadge />
        </div>
        <div className="pointer-events-auto">
          <WildlifeInfoCard />
        </div>
        <div className="pointer-events-auto">
          <PlumeLegend />
        </div>
      </div>
    </main>
  );
}
