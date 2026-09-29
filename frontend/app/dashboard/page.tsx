"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  MapPin,
  Compass,
  Layers,
  ShieldAlert,
  FileText,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  ChevronRight,
  Route,
  PenTool,
  Navigation,
  Bird,
  Waves,
} from "lucide-react";
import { fetchIcebergs, fetchRoutes } from "@/lib/api";
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

interface RouteOption {
  id: "safest" | "balanced" | "fastest";
  name: string;
  distanceNm: number;
  etaHours: number;
  fuelMt: number;
  riskScore: number;
  points: { lat: number; lon: number }[];
}

export default function HomePage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const lastFittedRouteKeyRef = useRef<string>("");

  // States
  const [icebergs, setIcebergs] = useState<Iceberg[]>([]);
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
  const [startCoords, setStartCoords] = useState<[number, number]>([-68.35, -52.45]); // default mock vessel lat/lon
  const [destCoords, setDestCoords] = useState<[number, number]>([-68.72, -49.55]); // default destination
  const [pickMode, setPickMode] = useState<"none" | "start" | "dest">("none");

  // Drawing Exclusion Zones State
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]); // Array of [lon, lat]
  const [exclusionZones, setExclusionZones] = useState<[number, number][][]>([]); // Array of polygons (array of [lon, lat])
  const [warpToast, setWarpToast] = useState<{ lat: number; lon: number } | null>(null);

  // Auto-dismiss warp confirmation toast after 8 seconds
  useEffect(() => {
    if (!warpToast) return;
    const timer = setTimeout(() => {
      setWarpToast(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [warpToast]);

  // Fetch initial data
  useEffect(() => {
    // 1. Fetch icebergs
    fetchIcebergs()
      .then((data) => {
        if (data.icebergs) {
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

    // 4. Fetch initial routes with shared cache (only fetches if not already loaded)
    fetchRoutesIfNeeded(startCoords, destCoords)
      .catch((err) => console.error("Initial 2D route fetch failed:", err));
  }, []);

  // Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      preserveDrawingBuffer: true, // Crucial for PDF canvas screenshot export
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
                attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
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
      console.log("[MAP_ON_LOAD_START]");
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

      setMapLoaded(true);
    });

    // Map Click Listener
    map.on("click", (e) => {
      // 1. Ignore clicks that landed on marker or popup DOM elements
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

      // 2. Handle Drawing Zone
      if (useIsDrawingRef.current) {
        setDrawingPoints((prev) => {
          const next: [number, number][] = [...prev, [clickedLng, clickedLat] as [number, number]];
          updateDrawingLayer(next);
          return next;
        });
        return;
      }

      // 3. Handle picking start/dest coords
      if (usePickModeRef.current === "start") {
        setStartCoords([+clickedLat.toFixed(4), +clickedLng.toFixed(4)] as [number, number]);
        setPickMode("none");
        return;
      } else if (usePickModeRef.current === "dest") {
        setDestCoords([+clickedLat.toFixed(4), +clickedLng.toFixed(4)] as [number, number]);
        setPickMode("none");
        return;
      }

      // 4. Exclude clicks on existing route lines, exclusion zones, or prediction lines
      const interactiveLayers = [
        "route-safest-layer",
        "route-balanced-layer",
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
            const match = routeFeature.layer.id.match(/^route-(safest|balanced|fastest)-layer$/);
            if (match) {
              lockRoute(match[1] as RouteOption["id"]);
            }
          }
          return;
        }
      }

      // 5. Valid click on the map surface itself: capture lat/lon, set warpTarget in store
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

  // Sync refs to avoid dependency issues inside map listener
  const useIsDrawingRef = useRef(isDrawing);
  useEffect(() => {
    useIsDrawingRef.current = isDrawing;
  }, [isDrawing]);

  const usePickModeRef = useRef(pickMode);
  useEffect(() => {
    usePickModeRef.current = pickMode;
  }, [pickMode]);

  // Update Drawing Visual Layer
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

    // Draw line
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

    // Draw growing uncertainty cone
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
    if (!map) return;

    // Clear previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Clear previous danger circles source
    if (map.getLayer("risk-circles-layer")) {
      map.removeLayer("risk-circles-layer");
    }
    if (map.getSource("risk-circles-source")) {
      map.removeSource("risk-circles-source");
    }

    if (!showIcebergs || icebergs.length === 0) return;

    // Generate Risk Circles GeoJSON
    const highRiskBergs = icebergs.filter((ib) => ib.highRisk);
    const riskCirclesFeatures = highRiskBergs.map((ib) => {
      const lon = ib.lon;
      const lat = ib.lat;
      const radiusNm = ib.dangerRadiusNm;
      const points = [];
      const numPoints = 32;
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
        properties: { id: ib.id },
      };
    });

    map.addSource("risk-circles-source", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: riskCirclesFeatures,
      },
    });

    map.addLayer({
      id: "risk-circles-layer",
      type: "fill",
      source: "risk-circles-source",
      paint: {
        "fill-color": "rgba(239, 68, 68, 0.12)",
        "fill-outline-color": "rgba(239, 68, 68, 0.75)",
      },
    });

    // Create Marker Popups & Points
    icebergs.forEach((ib) => {
      const popup = new maplibregl.Popup({
        offset: 25,
        closeButton: true,
      }).setText(ib.name);

      const marker = new maplibregl.Marker({ color: "#ef4444" })
        .setLngLat([ib.lon, ib.lat])
        .setPopup(popup)
        .addTo(map);

      // Save selected iceberg state on popup open
      popup.on("open", () => {
        setSelectedIceberg(ib);
      });
      popup.on("close", () => {
        setSelectedIceberg((prev) => (prev?.id === ib.id ? null : prev));
      });

      markersRef.current.push(marker);
    });
  }, [icebergs, showIcebergs]);



  // Handle Route Calculation Submit
  const handleRouteSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchRoutesIfNeeded(startCoords, destCoords, true);
      lockRoute("balanced");
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

      // Clear previous routes layers & sources
      const routeIds: RouteOption["id"][] = ["safest", "balanced", "fastest"];
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

          // Color maps: Safest green, Balanced yellow, Fastest red
          const color = rid === "safest" ? "#22c55e" : rid === "balanced" ? "#eab308" : "#ef4444";
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

      // Auto-fit bounds of all route profiles so the entire route is visible
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
              padding: { top: 90, bottom: 90, left: 100, right: 100 },
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

  // Finish Polygon Drawing
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

  // Clear Zones
  const handleClearZones = () => {
    setExclusionZones([]);
    setDrawingPoints([]);
    setIsDrawing(false);
    updateDrawingLayer([]);
  };

  // Export PDF Mission Plan
  const handleExportPdf = async () => {
    try {
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage([595.276, 841.89]); // A4 dimensions in points
      const { width, height } = page.getSize();

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Header block
      page.drawRectangle({
        x: 0,
        y: height - 100,
        width,
        height: 100,
        color: rgb(15 / 255, 23 / 255, 42 / 255),
      });

      page.drawText("POLARIS OPERATIONS MISSION REPORT", {
        x: 40,
        y: height - 48,
        size: 18,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      page.drawText(`Exported: ${new Date().toLocaleString()} · Sector: Antarctic Peninsula`, {
        x: 40,
        y: height - 72,
        size: 9,
        font,
        color: rgb(148 / 255, 163 / 255, 184 / 255),
      });

      let yPos = height - 140;

      // 1. Capture Map Libre Canvas Image
      try {
        const mapCanvas = mapRef.current?.getCanvas();
        if (mapCanvas) {
          const dataUrl = mapCanvas.toDataURL("image/png");
          const base64Data = dataUrl.split(",")[1];
          const binaryString = window.atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const mapImage = await pdfDoc.embedPng(bytes);
          const drawWidth = width - 80;
          const drawHeight = (mapImage.height / mapImage.width) * drawWidth;

          page.drawImage(mapImage, {
            x: 40,
            y: yPos - drawHeight,
            width: drawWidth,
            height: drawHeight,
          });

          yPos -= drawHeight + 35;
        }
      } catch (err) {
        console.error("Canvas capture failed, generating summary-only PDF:", err);
        page.drawText("[Map Visualization unavailable in this export]", {
          x: 40,
          y: yPos,
          size: 10,
          font,
          color: rgb(0.5, 0.5, 0.5),
        });
        yPos -= 35;
      }

      // 2. Selected Route Stats Section
      page.drawText("I. Locked Route Analysis", {
        x: 40,
        y: yPos,
        size: 13,
        font: fontBold,
        color: rgb(30 / 255, 58 / 255, 138 / 255),
      });

      page.drawLine({
        start: { x: 40, y: yPos - 5 },
        end: { x: width - 40, y: yPos - 5 },
        thickness: 1,
        color: rgb(226 / 255, 232 / 255, 240 / 255),
      });

      yPos -= 25;

      const activeRoute = routes.find((r) => r.id === selectedRouteId);
      if (activeRoute) {
        // Table layout
        const headers = ["Metric", "safest", "balanced (locked)", "fastest"];
        const metrics = [
          ["Distance", "142.6 NM", `${activeRoute.id === "balanced" ? activeRoute.distanceNm : "118.3"} NM`, "96.4 NM"],
          ["ETA", "18.4 Hrs", `${activeRoute.id === "balanced" ? activeRoute.etaHours : "14.1"} Hrs`, "11.2 Hrs"],
          ["Fuel Cons.", "21.2 MT", `${activeRoute.id === "balanced" ? activeRoute.fuelMt : "16.8"} MT`, "13.4 MT"],
          ["Risk Index", "0.12", `${activeRoute.id === "balanced" ? activeRoute.riskScore : "0.31"}`, "0.58"],
        ];

        // Draw headers
        headers.forEach((h, idx) => {
          page.drawText(h, {
            x: 40 + idx * 130,
            y: yPos,
            size: 9,
            font: fontBold,
            color: rgb(71 / 255, 85 / 255, 105 / 255),
          });
        });

        yPos -= 18;

        metrics.forEach((rowValues) => {
          rowValues.forEach((val, idx) => {
            const isMetricHeader = idx === 0;
            const isLockedRoute = idx === 2;
            page.drawText(val, {
              x: 40 + idx * 130,
              y: yPos,
              size: 8.5,
              font: isMetricHeader || isLockedRoute ? fontBold : font,
              color: isLockedRoute ? rgb(234 / 255, 179 / 255, 8 / 255) : rgb(15 / 255, 23 / 255, 42 / 255),
            });
          });
          yPos -= 14;
        });

        yPos -= 10;
      } else {
        page.drawText("No active route locked. Setup coordinates to compute navigation profiles.", {
          x: 45,
          y: yPos,
          size: 9.5,
          font,
          color: rgb(100 / 255, 116 / 255, 139 / 255),
        });
        yPos -= 20;
      }

      // Page break check for Icebergs section
      if (yPos < 200) {
        page = pdfDoc.addPage([595.276, 841.89]);
        yPos = height - 60;
      } else {
        yPos -= 15;
      }

      // 3. High Risk Icebergs
      page.drawText("II. High-Risk Iceberg Hazards", {
        x: 40,
        y: yPos,
        size: 13,
        font: fontBold,
        color: rgb(185 / 255, 28 / 255, 28 / 255), // Red
      });

      page.drawLine({
        start: { x: 40, y: yPos - 5 },
        end: { x: width - 40, y: yPos - 5 },
        thickness: 1,
        color: rgb(226 / 255, 232 / 255, 240 / 255),
      });

      yPos -= 25;

      const highRisk = icebergs.filter((ib) => ib.highRisk);
      if (highRisk.length > 0) {
        // Table Headers
        page.drawText("Iceberg ID", { x: 40, y: yPos, size: 9, font: fontBold });
        page.drawText("Name", { x: 120, y: yPos, size: 9, font: fontBold });
        page.drawText("Position (Lat, Lon)", { x: 200, y: yPos, size: 9, font: fontBold });
        page.drawText("Danger Radius", { x: 380, y: yPos, size: 9, font: fontBold });
        page.drawText("Status", { x: 480, y: yPos, size: 9, font: fontBold });

        yPos -= 16;

        highRisk.forEach((ib) => {
          if (yPos < 50) {
            page = pdfDoc.addPage([595.276, 841.89]);
            yPos = height - 60;
          }

          page.drawText(ib.id, { x: 40, y: yPos, size: 8, font });
          page.drawText(ib.name, { x: 120, y: yPos, size: 8, font });
          page.drawText(`${ib.lat.toFixed(4)}, ${ib.lon.toFixed(4)}`, { x: 200, y: yPos, size: 8, font });
          page.drawText(`${ib.dangerRadiusNm} NM`, { x: 380, y: yPos, size: 8, font });
          page.drawText(ib.status.toUpperCase(), { x: 480, y: yPos, size: 8, font, color: rgb(0.8, 0.2, 0.2) });

          yPos -= 14;
        });
      } else {
        page.drawText("No high-risk iceberg hazards currently detected in the operational sector.", {
          x: 45,
          y: yPos,
          size: 9.5,
          font,
          color: rgb(100 / 255, 116 / 255, 139 / 255),
        });
      }

      // Save and download PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `polaris_mission_plan_${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
    } catch (err) {
      console.error("PDF Export failed:", err);
      alert("An error occurred during PDF generation.");
    }
  };

  return (
    <main className="h-screen w-screen relative bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Map Element + Canvas Particle Overlay */}
      <div className="absolute inset-0 z-0 bg-slate-900">
        <div
          ref={mapContainerRef}
          className="w-full h-full"
        />
        {/* Freshwater / Ice-flow particle canvas – rendered on top of the map tile */}
        <OverviewMapCanvas />
      </div>

      {/* Ship Relocated Warp Confirmation Toast */}
      {warpToast && (
        <div
          id="warp-confirmation-toast"
          className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-cyan-500/50 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-mono text-cyan-200 animate-in fade-in slide-in-from-top-4 duration-300"
        >
          <Navigation className="h-4 w-4 text-cyan-400 animate-pulse shrink-0" />
          <span className="font-semibold text-white">
            Ship relocated — view in 3D simulator
          </span>
          <span className="text-[11px] text-cyan-300/80 font-mono">
            [{warpToast.lat.toFixed(2)}°, {warpToast.lon.toFixed(2)}°]
          </span>
          <Link
            href="/simulation"
            className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 hover:text-white text-[11px] font-bold font-sans transition-all flex items-center gap-1 shrink-0"
          >
            Open 3D Simulator &rarr;
          </Link>
          <button
            onClick={() => setWarpToast(null)}
            className="text-white/40 hover:text-white ml-1 text-base leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
      )}

      {/* Styled Canvas Layer Inversion Reversal Styles */}
      <style jsx global>{`
        .maplibregl-canvas {
          outline: none;
        }
        /* Make sure popups do not inherit map container inversion filter */
        .hud-popup-container .maplibregl-popup-content {
          background: rgba(15, 23, 42, 0.95) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          border-radius: 8px !important;
          padding: 0 !important;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5) !important;
        }
        .hud-popup-container .maplibregl-popup-close-button {
          color: rgba(255, 255, 255, 0.5) !important;
          padding: 4px 8px !important;
          font-size: 14px !important;
          outline: none !important;
        }
        .hud-popup-container .maplibregl-popup-close-button:hover {
          color: white !important;
          background: transparent !important;
        }
        .hud-popup-container .maplibregl-popup-anchor-top .maplibregl-popup-tip {
          border-bottom-color: rgba(15, 23, 42, 0.95) !important;
        }
        .hud-popup-container .maplibregl-popup-anchor-bottom .maplibregl-popup-tip {
          border-top-color: rgba(15, 23, 42, 0.95) !important;
        }
        .hud-popup-container .maplibregl-popup-anchor-left .maplibregl-popup-tip {
          border-right-color: rgba(15, 23, 42, 0.95) !important;
        }
        .hud-popup-container .maplibregl-popup-anchor-right .maplibregl-popup-tip {
          border-left-color: rgba(15, 23, 42, 0.95) !important;
        }
      `}</style>

      {/* Overlapping Glassmorphism HUD Panels */}
      <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between z-10">
        {/* Top bar & Header info */}
        <div className="flex justify-between items-start">
          <div className="pointer-events-auto bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4 max-w-md shadow-2xl flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-blue-500 animate-spin-slow" />
              <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-widest">
                POLARIS MISSION MANAGEMENT
              </p>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight mt-1">
              Analytics & Routing Dashboard
            </h1>
            <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
              Examine live satellite sea ice grids, inspect historical drift trajectory uncertainty cones, draw mission exclusion zones, and compare cost/risk route matrices.
            </p>
            <div className="border-t border-white/10 my-2 pt-2 flex flex-col gap-2">
              <p className="text-[10px] text-slate-400 italic">
                Configure start/destination coordinates, lock a route option, and run the real-time simulation:
              </p>
              <Link
                href="/simulation"
                className="inline-flex rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 text-xs font-bold uppercase transition-all justify-center items-center gap-1.5 shadow-lg w-full"
              >
                Launch 3D Simulator
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2.5 shrink-0">
            <AlertBanner />
            {/* Quick Layer Controls Panel */}
            <div className="pointer-events-auto bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-3.5 w-60 shadow-2xl flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-blue-400" />
              Active Overlay Layers
            </h3>
            <div className="flex flex-col gap-2 text-xs">
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                  showHeatmap ? "bg-blue-500/10 border-blue-500/30 text-blue-300" : "bg-white/5 border-white/5 text-slate-400"
                }`}
              >
                <span>Sea Ice Concentration (Heatmap)</span>
                {showHeatmap ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>

              <button
                onClick={() => setShowIcebergs(!showIcebergs)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                  showIcebergs ? "bg-blue-500/10 border-blue-500/30 text-blue-300" : "bg-white/5 border-white/5 text-slate-400"
                }`}
              >
                <span>Iceberg Hazard Vectors</span>
                {showIcebergs ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>

              <button
                onClick={() => setShowRoutes(!showRoutes)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                  showRoutes ? "bg-blue-500/10 border-blue-500/30 text-blue-300" : "bg-white/5 border-white/5 text-slate-400"
                }`}
              >
                <span>Pathfinding Options</span>
                {showRoutes ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>

              <button
                onClick={() => setShowExclusionZones(!showExclusionZones)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                  showExclusionZones ? "bg-blue-500/10 border-blue-500/30 text-blue-300" : "bg-white/5 border-white/5 text-slate-400"
                }`}
              >
                <span>Mission Exclusion Zones</span>
                {showExclusionZones ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>

              {/* Wildlife / Eco layers */}
              <div className="border-t border-white/10 pt-2 mt-1 flex flex-col gap-2">
                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Eco-Impact Layers</p>
                <button
                  onClick={() => usePolarisStore.getState().toggleLayer("wildlife")}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                    usePolarisStore.getState().layers.wildlife ? "bg-teal-500/10 border-teal-500/30 text-teal-300" : "bg-white/5 border-white/5 text-slate-400"
                  }`}
                >
                  <span className="flex items-center gap-1.5"><Bird className="h-3.5 w-3.5" />Wildlife Impact</span>
                  {usePolarisStore.getState().layers.wildlife ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => usePolarisStore.getState().toggleLayer("freshwaterPlume")}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                    usePolarisStore.getState().layers.freshwaterPlume ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300" : "bg-white/5 border-white/5 text-slate-400"
                  }`}
                >
                  <span className="flex items-center gap-1.5"><Waves className="h-3.5 w-3.5" />Freshwater / Meltwater</span>
                  {usePolarisStore.getState().layers.freshwaterPlume ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
          <div className="pointer-events-auto">
            <DataRealityBadge />
          </div>
          {/* Wildlife Info Card – shown when a colony is selected */}
          <div className="pointer-events-auto">
            <WildlifeInfoCard />
          </div>
          {/* Plume legend – shown when freshwaterPlume layer is on */}
          <div className="pointer-events-auto">
            <PlumeLegend />
          </div>
        </div>
      </div>

        {/* Bottom controls panel */}
        <div className="flex justify-between items-end gap-4 mt-auto">
          {/* Legend and drawing controls */}
          <div className="pointer-events-auto flex flex-col gap-3">
            <AlertHistoryLog />
            {/* Exclusion drawing controls */}
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl w-72 flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <PenTool className="h-4 w-4 text-red-400" />
                Exclusion Zone Polygon Tool
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => {
                    setIsDrawing(!isDrawing);
                    setDrawingPoints([]);
                    updateDrawingLayer([]);
                  }}
                  className={`px-3 py-2 rounded-lg border font-semibold transition-all ${
                    isDrawing ? "bg-red-500/20 border-red-500 text-red-300 animate-pulse" : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {isDrawing ? "Cancel Draw" : "Draw Zone"}
                </button>
                <button
                  onClick={handleFinishDrawing}
                  disabled={!isDrawing || drawingPoints.length < 3}
                  className="px-3 py-2 rounded-lg bg-green-600 border border-green-500 hover:bg-green-500 text-white font-semibold disabled:opacity-30 disabled:hover:bg-green-600 disabled:cursor-not-allowed transition-all"
                >
                  Finish Polygon
                </button>
              </div>
              {isDrawing && (
                <div className="text-[10px] text-red-300 font-medium bg-red-950/20 p-2 rounded border border-red-900/30">
                  Click on the map to define the polygon vertices (Minimum 3 points). Current nodes: {drawingPoints.length}
                </div>
              )}
              {exclusionZones.length > 0 && (
                <button
                  onClick={handleClearZones}
                  className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg border border-red-500/20 text-red-400 bg-red-950/15 hover:bg-red-500/10 text-xs transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All Zones ({exclusionZones.length})
                </button>
              )}
              {/* [Simulated demo data] Wildlife-sensitive zone preset */}
              <button
                onClick={() => {
                  // Add preset polygon around Snow Hill Emperor Penguin colony
                  const preset: [number, number][] = [
                    [-58.5, -64.1], [-55.8, -64.1], [-55.8, -63.0], [-58.5, -63.0], [-58.5, -64.1],
                  ];
                  setExclusionZones((prev) => [...prev, preset]);
                  const map = mapRef.current;
                  if (map) {
                    const all = [...exclusionZones, preset];
                    const src = map.getSource("exclusion-zones") as any;
                    if (src) src.setData({
                      type: "FeatureCollection",
                      features: all.map((z) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [z] } })),
                    });
                  }
                  usePolarisStore.getState().pushAlert("WARNING", "Wildlife-sensitive exclusion zone added — Snow Hill Emperor Penguin Colony (64.48°S, 57.22°W, High Risk)");
                }}
                className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg border border-teal-500/30 text-teal-300 bg-teal-950/15 hover:bg-teal-500/10 text-xs transition-all"
              >
                <Bird className="h-3.5 w-3.5" />
                Add Wildlife-Sensitive Zone Preset
              </button>
            </div>

            {/* Ice level Legend */}
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl w-72">
              <h4 className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider mb-2">
                Sea Ice Concentration (SIC) Density
              </h4>
              <div className="grid grid-cols-4 gap-1 text-[9px] text-center">
                <div className="flex flex-col gap-1">
                  <div className="h-2 rounded bg-[#1e3a8a]" />
                  <span className="font-bold text-slate-200">Low</span>
                  <span className="text-slate-400">0.0–0.3</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="h-2 rounded bg-[#3b82f6]" />
                  <span className="font-bold text-slate-200">Moderate</span>
                  <span className="text-slate-400">0.3–0.6</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="h-2 rounded bg-[#93c5fd]" />
                  <span className="font-bold text-slate-200">High</span>
                  <span className="text-slate-400">0.6–0.8</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="h-2 rounded bg-white" />
                  <span className="font-bold text-slate-200">Very High</span>
                  <span className="text-slate-400">0.8–1.0</span>
                </div>
              </div>
              {/* Ice Flow / Ocean Current legend row */}
              <div className="mt-2.5 pt-2 border-t border-white/10">
                <h4 className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider mb-1.5">
                  Ice Flow &amp; Ocean Current
                </h4>
                <div className="flex items-center justify-between text-[9px]">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3.5 h-1.5 rounded-full" style={{ background: "linear-gradient(to right, rgba(50,180,255,0.4), rgba(160,240,255,0.95))" }} />
                    <span className="text-slate-400">Streamline particles (freshwater advection)</span>
                  </div>
                </div>
                <div className="flex justify-between text-[9px] text-slate-500 mt-1 tabular-nums">
                  <span>Low conc. &lt;0.2</span>
                  <span className="text-cyan-300">High conc. &gt;0.6</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation route picker and stats table */}
          <div className="pointer-events-auto bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4 w-[520px] shadow-2xl flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Route className="h-4 w-4 text-emerald-400 animate-pulse" />
                Transit Router & Cost/Risk Evaluation
              </span>
              <button
                onClick={handleExportPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all border border-blue-400"
              >
                <FileText className="h-3.5 w-3.5" />
                Export Mission Plan
              </button>
            </h3>

            {/* Inputs coordinate picker */}
            <form onSubmit={handleRouteSearch} className="grid grid-cols-5 gap-3.5 items-end text-xs">
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[10px] text-slate-400 uppercase font-semibold">Start Coordinates</label>
                <div className="flex gap-1.5 items-center">
                  <input
                    type="text"
                    value={startCoords.join(", ")}
                    onChange={(e) => {
                      const parts = e.target.value.split(",").map((p) => parseFloat(p.trim()) || 0);
                      if (parts.length === 2) setStartCoords([parts[0], parts[1]]);
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded p-1.5 text-center text-slate-200 tabular-nums focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPickMode(pickMode === "start" ? "none" : "start")}
                    className={`px-2 py-1.5 rounded border transition-all ${
                      pickMode === "start" ? "bg-amber-500 text-black border-amber-500" : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                    title="Click map to pick starting position"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[10px] text-slate-400 uppercase font-semibold">Destination Coords</label>
                <div className="flex gap-1.5 items-center">
                  <input
                    type="text"
                    value={destCoords.join(", ")}
                    onChange={(e) => {
                      const parts = e.target.value.split(",").map((p) => parseFloat(p.trim()) || 0);
                      if (parts.length === 2) setDestCoords([parts[0], parts[1]]);
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded p-1.5 text-center text-slate-200 tabular-nums focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPickMode(pickMode === "dest" ? "none" : "dest")}
                    className={`px-2 py-1.5 rounded border transition-all ${
                      pickMode === "dest" ? "bg-amber-500 text-black border-amber-500" : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                    title="Click map to pick destination position"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 border border-blue-500 hover:bg-blue-500 text-white font-bold p-1.5 rounded h-[31px] transition-all"
              >
                Compute
              </button>
            </form>

            {pickMode !== "none" && (
              <div className="text-[10px] text-amber-300 font-medium animate-pulse text-center bg-amber-950/20 border border-amber-900/30 p-1.5 rounded">
                Interactive Picking Mode active. Click on the map to record target coordinates for: {pickMode.toUpperCase()}
              </div>
            )}

            {/* Route Stats Table */}
            <div className="border border-white/10 rounded-xl overflow-hidden bg-slate-950/60 max-h-44 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-slate-300 border-b border-white/10 text-[10px] uppercase font-bold tracking-wider">
                    <th className="p-2 pl-3">Route Profile</th>
                    <th className="p-2 text-right">Dist (NM)</th>
                    <th className="p-2 text-right">ETA (hr)</th>
                    <th className="p-2 text-right">Fuel (MT)</th>
                    <th className="p-2 text-right">Risk</th>
                    <th className="p-2 text-right"><Bird className="inline h-3 w-3 mr-0.5 text-teal-400" />Wildlife</th>
                    <th className="p-2 text-center">Lock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-[11px] tabular-nums">
                  {routes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-slate-400 italic">
                        Input operational endpoints and click &quot;Compute&quot; to compare navigation routes.
                      </td>
                    </tr>
                  ) : (
                    routes.map((r) => {
                      const isSelected = selectedRouteId === r.id;
                      const textTheme = r.id === "safest" ? "text-green-400" : r.id === "balanced" ? "text-yellow-400" : "text-red-400";
                      // [Simulated demo data] Wildlife risk per route profile
                      const wildlifeRisk = r.id === "safest" ? { label: "Low", cls: "text-emerald-400" } : r.id === "balanced" ? { label: "Mod", cls: "text-yellow-400" } : { label: "High", cls: "text-red-400" };
                      return (
                        <tr
                          key={r.id}
                          className={`hover:bg-white/5 transition-all ${
                            isSelected ? "bg-blue-500/10 text-white font-medium" : "text-slate-300"
                          }`}
                        >
                          <td className={`p-2 pl-3 font-semibold ${textTheme} uppercase`}>
                            {r.name}
                          </td>
                          <td className="p-2 text-right font-medium">{r.distanceNm}</td>
                          <td className="p-2 text-right font-medium">{r.etaHours}</td>
                          <td className="p-2 text-right font-medium">{r.fuelMt}</td>
                          <td className="p-2 text-right font-semibold">{r.riskScore.toFixed(2)}</td>
                          <td className={`p-2 text-right font-bold text-[10px] ${wildlifeRisk.cls}`}>{wildlifeRisk.label}</td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                lockRoute(r.id);
                                const store = usePolarisStore.getState();
                                if (r.id === "fastest") {
                                  store.pushAlert("WARNING", `Route [${r.name}] passes 40 km from Weddell seal haul-out — HIGH wildlife risk`);
                                  store.pushAlert("WARNING", `Route [${r.name}] crosses A81 freshwater plume zone (salinity -1.15 PSU)`);
                                } else if (r.id === "balanced") {
                                  store.pushAlert("INFO", `Route [${r.name}] passes 72 km from Adelie penguin corridor — MODERATE eco-impact`);
                                } else {
                                  store.pushAlert("INFO", `Route [${r.name}] avoids all critical wildlife habitats — LOW eco-impact`);
                                }
                              }}
                              className={`p-1 px-2.5 rounded text-[10px] font-bold uppercase transition-all ${
                                isSelected
                                  ? "bg-emerald-500 text-slate-950 border border-emerald-400"
                                  : "bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                              }`}
                            >
                              {isSelected ? "Locked" : "Select"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
