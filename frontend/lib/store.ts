import { create } from "zustand";
import {
  ALL_ICEBERGS,
  FALLBACK_COLONIES,
  FALLBACK_FLOW_VECTORS,
  FALLBACK_PLUMES,
  MOCK_ROUTES,
  MOCK_VESSEL,
  generateFallbackFlowField,
  type CurrentVector,
  type FlowFieldData,
  type Iceberg,
  type PlumeItem,
  type RouteOption,
  type VesselState,
  type WildlifeColony,
} from "./mockData";
import { playProximityAlertSound } from "./audio";

export type DataStatus = "LIVE" | "FALLBACK";

export interface DataSourceReality {
  status: DataStatus;
  lastLive: string | null;
  reason: string | null;
}

export interface Layers {
  seaIce: boolean;
  icebergs: boolean;
  predictions: boolean;
  riskZones: boolean;
  route: boolean;
  vessel: boolean;
  wildlife: boolean;
  freshwaterPlume: boolean;
}

export interface KeysDown {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface PolarisState {
  vessel: VesselState;
  icebergs: Iceberg[];
  selectedIcebergId: string | null;
  colonies: WildlifeColony[];
  selectedColonyId: string | null;
  plumes: PlumeItem[];
  flowVectors: CurrentVector[];
  flowField: FlowFieldData | null;
  routes: RouteOption[];
  lockedRouteId: RouteOption["id"];
  routeVersion: number;
  layers: Layers;
  keys: KeysDown;
  cameraOrbiting: boolean;
  cameraDistance: number;
  orbitYaw: number;
  orbitPitch: number;
  simTimeIso: string;
  dataReality: {
    nsidc: DataSourceReality;
    byu: DataSourceReality;
    era5: DataSourceReality;
    wildlife: DataSourceReality;
    oceanSalinity: DataSourceReality;
  };
  setVessel: (partial: Partial<VesselState>) => void;
  selectIceberg: (id: string | null) => void;
  selectColony: (id: string | null) => void;
  setColonies: (colonies: WildlifeColony[]) => void;
  setPlumes: (plumes: PlumeItem[]) => void;
  setFlowVectors: (vectors: CurrentVector[]) => void;
  setFlowField: (field: FlowFieldData) => void;
  toggleLayer: (key: keyof Layers) => void;
  setKey: (key: keyof KeysDown, down: boolean) => void;
  setCameraOrbiting: (v: boolean) => void;
  setOrbit: (yaw: number, pitch: number, distance?: number) => void;
  recalculateRoute: () => void;
  lockRoute: (id: RouteOption["id"]) => void;
  resetShipToRouteStart: () => void;
  tickTime: () => void;
  autoMode: boolean;
  forecastDay: number;
  destination: { lat: number; lon: number };
  iceGrid: { lat: number; lon: number; sic: number }[];
  alerts: { id?: string; tier: string; message: string; ts: string; timestamp?: string }[];
  detections: {
    name: string;
    confidence: number;
    distanceNm: number;
    lat: number;
    lon: number;
  }[];
  setIceGrid: (grid: { lat: number; lon: number; sic: number }[]) => void;
  setIcebergs: (icebergs: Iceberg[]) => void;
  setRoutes: (routes: RouteOption[]) => void;
  setAutoMode: (v: boolean) => void;
  setForecastDay: (d: number) => void;
  setDestination: (d: { lat: number; lon: number }) => void;
  soundOn: boolean;
  setSoundOn: (v: boolean) => void;
  graphicsQuality: "high" | "low";
  setGraphicsQuality: (q: "high" | "low") => void;
  proximityFlashId: number;
  triggerProximityAlert: (iceberg: { id: string; name: string }) => void;
  pushAlert: (tier: string, message: string) => void;
  pushDetection: (d: PolarisState["detections"][number]) => void;
  setDataReality: (dataReality: Partial<PolarisState["dataReality"]>) => void;
  routeEndpoints: { start: [number, number]; dest: [number, number] } | null;
  routesFetched: boolean;
  fetchRoutesIfNeeded: (
    start: [number, number],
    dest: [number, number],
    force?: boolean
  ) => Promise<RouteOption[]>;
  sharedRoutes: RouteOption[];
  setSharedRoutes: (routes: RouteOption[]) => void;
  sharedRouteLastFetch: number;
  setSharedRouteLastFetch: (timestamp: number) => void;
  shipWarpTarget: { lat: number; lon: number; timestamp: number } | null;
  warpTarget: { lat: number; lon: number } | null;
  setWarpTarget: (target: { lat: number; lon: number } | null) => void;
  clearWarpTarget: () => void;
  allIcebergs: Iceberg[];
  setAllIcebergs: (icebergs: Iceberg[]) => void;
  filterIcebergsAroundPosition: (lat: number, lon: number, radiusNm?: number) => void;
  warpShip: (lat: number, lon: number) => void;
  seaIceHeatmap: {
    opacity: number;
    dataDate: string | null;
    error: string | null;
    loading: boolean;
  };
  setSeaIceHeatmapOpacity: (v: number) => void;
  setSeaIceHeatmapMeta: (meta: { dataDate?: string | null; error?: string | null; loading?: boolean }) => void;
  cameraTargetCoord: [number, number] | null;
  setCameraTargetCoord: (coord: [number, number] | null) => void;
}

const fallback = (reason: string): DataSourceReality => ({
  status: "FALLBACK",
  lastLive: null,
  reason,
});

let inFlightRoutePromise: Promise<RouteOption[]> | null = null;
let inFlightCoords: { start: [number, number]; dest: [number, number] } | null = null;

const getInitialLockedRoute = (): RouteOption["id"] => {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("polaris_locked_route");
      if (saved === "safest" || saved === "balanced" || saved === "eco" || saved === "fastest") {
        return saved;
      }
    } catch {}
  }
  return "balanced";
};

const getInitialRoutes = (): { routes: RouteOption[]; endpoints: { start: [number, number]; dest: [number, number] } | null; fetched: boolean } => {
  if (typeof window !== "undefined") {
    try {
      // Clear legacy cache keys
      localStorage.removeItem("polaris_routes");
      localStorage.removeItem("polaris_routes_v3");
      const savedRoutes = localStorage.getItem("polaris_routes_v4");
      const savedEndpoints = localStorage.getItem("polaris_route_endpoints_v4");
      if (savedRoutes) {
        const parsedRoutes = JSON.parse(savedRoutes);
        const parsedEndpoints = savedEndpoints ? JSON.parse(savedEndpoints) : null;
        if (
          Array.isArray(parsedRoutes) &&
          parsedRoutes.length === 4
        ) {
          const firstPt = parsedRoutes[0]?.points?.[0];
          const lastPt = parsedRoutes[0]?.points?.[parsedRoutes[0].points.length - 1];
          // Ensure endpoints match the actual waypoints in the saved route
          if (
            parsedEndpoints &&
            firstPt &&
            lastPt &&
            Math.abs(parsedEndpoints.start[0] - firstPt.lat) < 0.05 &&
            Math.abs(parsedEndpoints.start[1] - firstPt.lon) < 0.05 &&
            Math.abs(parsedEndpoints.dest[0] - lastPt.lat) < 0.05 &&
            Math.abs(parsedEndpoints.dest[1] - lastPt.lon) < 0.05
          ) {
            return {
              routes: parsedRoutes,
              endpoints: parsedEndpoints,
              fetched: true,
            };
          }
        }
      }
    } catch {}
  }
  return { routes: MOCK_ROUTES, endpoints: null, fetched: false };
};

const initialRouteData = getInitialRoutes();

const getInitialVessel = (): VesselState => {
  if (typeof window !== "undefined") {
    try {
      const saved =
        localStorage.getItem("polaris_vessel_pos") ||
        localStorage.getItem("polaris_warp_target");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.lat === "number" && typeof parsed.lon === "number") {
          const startLat = initialRouteData.routes[0]?.points?.[0]?.lat ?? MOCK_VESSEL.lat;
          const startLon = initialRouteData.routes[0]?.points?.[0]?.lon ?? MOCK_VESSEL.lon;
          const distFromStart = Math.hypot(parsed.lat - startLat, (parsed.lon - startLon) * Math.cos(startLat * Math.PI / 180)) * 60;
          if (distFromStart < 5.0) {
            return { ...MOCK_VESSEL, lat: parsed.lat, lon: parsed.lon };
          }
        }
      }
    } catch {}
  }
  const defaultStartLat = initialRouteData.routes[0]?.points?.[0]?.lat ?? MOCK_VESSEL.lat;
  const defaultStartLon = initialRouteData.routes[0]?.points?.[0]?.lon ?? MOCK_VESSEL.lon;
  return { ...MOCK_VESSEL, lat: defaultStartLat, lon: defaultStartLon };
};

const getInitialWarpTarget = (): { lat: number; lon: number } | null => {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("polaris_warp_target");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.lat === "number" && typeof parsed.lon === "number") {
          return { lat: parsed.lat, lon: parsed.lon };
        }
      }
    } catch {}
  }
  return null;
};

const getInitialDestination = (): { lat: number; lon: number } => {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("polaris_destination");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.lat === "number" && typeof parsed.lon === "number") {
          return { lat: parsed.lat, lon: parsed.lon };
        }
      }
    } catch {}
  }
  return { lat: -64.58, lon: -43.1 };
};

export const usePolarisStore = create<PolarisState>((set, get) => ({
  vessel: getInitialVessel(),
  icebergs: ALL_ICEBERGS,
  selectedIcebergId: null,
  colonies: FALLBACK_COLONIES,
  selectedColonyId: null,
  plumes: FALLBACK_PLUMES,
  flowVectors: FALLBACK_FLOW_VECTORS,
  flowField: generateFallbackFlowField(3),
  routes: initialRouteData.routes,
  lockedRouteId: getInitialLockedRoute(),
  routeVersion: 0,
  routeEndpoints: initialRouteData.endpoints,
  routesFetched: initialRouteData.fetched,
  layers: {
    seaIce: true,
    icebergs: true,
    predictions: true,
    riskZones: true,
    route: true,
    vessel: true,
    wildlife: true,
    freshwaterPlume: true,
  },
  keys: {
    w: false,
    a: false,
    s: false,
    d: false,
    up: false,
    down: false,
    left: false,
    right: false,
  },
  cameraOrbiting: false,
  cameraDistance: 38,
  orbitYaw: 0,
  orbitPitch: 0.42,
  simTimeIso: new Date().toISOString(),
  dataReality: {
    nsidc: fallback("Loading data status..."),
    byu: fallback("Loading data status..."),
    era5: fallback("Loading data status..."),
    wildlife: fallback("SCAR / SO-GLOBEC census baseline"),
    oceanSalinity: fallback("Copernicus Marine / WOA23 assimilation"),
  },
  setVessel: (partial) =>
    set((s) => ({ vessel: { ...s.vessel, ...partial } })),
  selectIceberg: (id) => set({ selectedIcebergId: id }),
  selectColony: (id) => set({ selectedColonyId: id }),
  setColonies: (colonies) => set({ colonies }),
  setPlumes: (plumes) => set({ plumes }),
  setFlowVectors: (flowVectors) => set({ flowVectors }),
  setFlowField: (flowField) => set({ flowField }),
  toggleLayer: (key) =>
    set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  setKey: (key, down) => set((s) => ({ keys: { ...s.keys, [key]: down } })),
  setCameraOrbiting: (v) => set({ cameraOrbiting: v }),
  setOrbit: (yaw, pitch, distance) =>
    set((s) => ({
      orbitYaw: yaw,
      orbitPitch: pitch,
      cameraDistance: distance ?? s.cameraDistance,
    })),
  lockRoute: (id) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("polaris_locked_route", id);
      } catch {}
    }
    set({ lockedRouteId: id });
  },
  resetShipToRouteStart: () => {
    const { routes } = get();
    if (routes && routes.length > 0 && routes[0]?.points?.[0]) {
      const p0 = routes[0].points[0];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("polaris_vessel_pos", JSON.stringify({ lat: p0.lat, lon: p0.lon }));
          localStorage.removeItem("polaris_warp_target");
        } catch {}
      }
      set((s) => ({
        warpTarget: null,
        vessel: {
          ...s.vessel,
          lat: p0.lat,
          lon: p0.lon,
          sogKnots: 0,
        },
      }));
    }
  },
  fetchRoutesIfNeeded: async (start, dest, force = false) => {
    const { routes, routeEndpoints, routesFetched } = get();
    const isSameStart =
      routeEndpoints &&
      Math.abs(routeEndpoints.start[0] - start[0]) < 0.01 &&
      Math.abs(routeEndpoints.start[1] - start[1]) < 0.01;
    const isSameDest =
      routeEndpoints &&
      Math.abs(routeEndpoints.dest[0] - dest[0]) < 0.01 &&
      Math.abs(routeEndpoints.dest[1] - dest[1]) < 0.01;

    // Additionally verify that the actual waypoints in the cached route match the requested start & dest
    const firstPt = routes && routes.length > 0 && routes[0]?.points?.[0];
    const lastPt = routes && routes.length > 0 && routes[0]?.points?.[routes[0].points.length - 1];
    const waypointsMatch =
      firstPt &&
      lastPt &&
      Math.abs(firstPt.lat - start[0]) < 0.05 &&
      Math.abs(firstPt.lon - start[1]) < 0.05 &&
      Math.abs(lastPt.lat - dest[0]) < 0.05 &&
      Math.abs(lastPt.lon - dest[1]) < 0.05;

    // Only reuse cached routes if NOT forced, already fetched, and endpoints + waypoints match requested coordinates
    if (!force && routesFetched && routes && routes.length === 4 && isSameStart && isSameDest && waypointsMatch) {
      return routes;
    }

    const inFlightSame =
      inFlightCoords &&
      Math.abs(inFlightCoords.start[0] - start[0]) < 0.01 &&
      Math.abs(inFlightCoords.start[1] - start[1]) < 0.01 &&
      Math.abs(inFlightCoords.dest[0] - dest[0]) < 0.01 &&
      Math.abs(inFlightCoords.dest[1] - dest[1]) < 0.01;

    if (!force && inFlightRoutePromise && inFlightSame) {
      return inFlightRoutePromise;
    }

    inFlightCoords = { start, dest };
    inFlightRoutePromise = (async () => {
      try {
        const { fetchRoutes } = await import("./api");
        const data = await fetchRoutes(start, dest);
        if (data.routes && data.routes.length > 0) {
          const firstPt = data.routes[0]?.points?.[0];
          const lastPt = data.routes[0]?.points?.[data.routes[0].points.length - 1];
          const realStartLat = firstPt ? firstPt.lat : start[0];
          const realStartLon = firstPt ? firstPt.lon : start[1];
          const realDestLat = lastPt ? lastPt.lat : dest[0];
          const realDestLon = lastPt ? lastPt.lon : dest[1];

          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("polaris_routes_v4", JSON.stringify(data.routes));
              localStorage.setItem("polaris_route_endpoints_v4", JSON.stringify({ start, dest }));
              localStorage.setItem(
                "polaris_vessel_pos",
                JSON.stringify({ lat: realStartLat, lon: realStartLon })
              );
              localStorage.setItem(
                "polaris_warp_target",
                JSON.stringify({ lat: realStartLat, lon: realStartLon })
              );
              localStorage.setItem(
                "polaris_destination",
                JSON.stringify({ lat: realDestLat, lon: realDestLon })
              );
            } catch {}
          }
          set((s) => ({
            routes: data.routes,
            sharedRoutes: data.routes,
            routeEndpoints: { start, dest },
            routesFetched: true,
            routeVersion: s.routeVersion + 1,
            warpTarget: { lat: realStartLat, lon: realStartLon },
            vessel: {
              ...s.vessel,
              lat: realStartLat,
              lon: realStartLon,
              sogKnots: 0,
            },
            destination: {
              lat: realDestLat,
              lon: realDestLon,
            },
          }));
          return data.routes;
        }
      } catch (err) {
        console.error("Failed to fetch routes:", err);
      } finally {
        inFlightRoutePromise = null;
        inFlightCoords = null;
      }
      // If fresh fetch failed and existing routes don't match, do NOT return a mismatched route
      const currentRoutes = get().routes;
      const curFirst = currentRoutes?.[0]?.points?.[0];
      const curLast = currentRoutes?.[0]?.points?.[currentRoutes[0].points.length - 1];
      if (
        curFirst &&
        curLast &&
        Math.abs(curFirst.lat - start[0]) < 0.05 &&
        Math.abs(curFirst.lon - start[1]) < 0.05 &&
        Math.abs(curLast.lat - dest[0]) < 0.05 &&
        Math.abs(curLast.lon - dest[1]) < 0.05
      ) {
        return currentRoutes;
      }
      return [];
    })();

    return inFlightRoutePromise;
  },
  recalculateRoute: async () => {
    const { vessel, destination } = get();
    await get().fetchRoutesIfNeeded(
      [vessel.lat, vessel.lon],
      [destination.lat, destination.lon],
      true
    );
    set((s) => ({
      alerts: [
        ...s.alerts.slice(-40),
        {
          id: `INFO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          tier: "INFO",
          message: "A* land-avoiding route recalculating via backend",
          ts: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        },
      ],
    }));
  },
  tickTime: () => set({ simTimeIso: new Date().toISOString() }),
  autoMode: false,
  forecastDay: 3,
  destination: getInitialDestination(),
  iceGrid: [],
  alerts: [],
  detections: [],
  soundOn: false,
  proximityFlashId: 0,
  triggerProximityAlert: (iceberg) => {
    playProximityAlertSound();
    set({ proximityFlashId: Date.now() });
  },
  sharedRoutes: MOCK_ROUTES,
  sharedRouteLastFetch: 0,
  setIceGrid: (iceGrid) => set({ iceGrid }),
  setIcebergs: (icebergs) =>
    set((s) => ({
      icebergs,
      allIcebergs: icebergs,
    })),
  setRoutes: (routes) => {
    let endpoints: { start: [number, number]; dest: [number, number] } | null = null;
    if (routes && routes.length > 0 && routes[0]?.points && routes[0].points.length >= 2) {
      const p0 = routes[0].points[0];
      const pN = routes[0].points[routes[0].points.length - 1];
      endpoints = { start: [p0.lat, p0.lon], dest: [pN.lat, pN.lon] };
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("polaris_routes_v4", JSON.stringify(routes));
        if (endpoints) {
          localStorage.setItem("polaris_route_endpoints_v4", JSON.stringify(endpoints));
        }
      } catch {}
    }
    set((s) => ({
      routes,
      sharedRoutes: routes,
      routeEndpoints: endpoints || s.routeEndpoints,
      routesFetched: routes.length > 0,
    }));
  },
  setAutoMode: (v) => set({ autoMode: v }),
  setSoundOn: (v) => set({ soundOn: v }),
  graphicsQuality: "high",
  setGraphicsQuality: (q) => set({ graphicsQuality: q }),
  setForecastDay: (d) => set({ forecastDay: d }),
  setDestination: (d) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("polaris_destination", JSON.stringify(d));
      } catch {}
    }
    set({ destination: d });
  },
  pushAlert: (tier, message) =>
    set((s) => {
      const ts = new Date().toISOString();
      const id = `${tier}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      return {
        alerts: [
          ...s.alerts.slice(-40),
          { id, tier, message, ts, timestamp: ts },
        ],
      };
    }),
  pushDetection: (d) =>
    set((s) => ({ detections: [...s.detections.slice(-30), d] })),
  setDataReality: (dataReality) => set((s) => ({ dataReality: { ...s.dataReality, ...dataReality } })),
  setSharedRoutes: (routes) => set({ routes, sharedRoutes: routes }),
  setSharedRouteLastFetch: (timestamp) => set({ sharedRouteLastFetch: timestamp }),
  allIcebergs: ALL_ICEBERGS,
  setAllIcebergs: (allIcebergs) => set({ allIcebergs, icebergs: allIcebergs }),
  seaIceHeatmap: {
    opacity: 0.6,
    dataDate: null,
    error: null,
    loading: false,
  },
  setSeaIceHeatmapOpacity: (v) =>
    set((s) => ({ seaIceHeatmap: { ...s.seaIceHeatmap, opacity: v } })),
  setSeaIceHeatmapMeta: (meta) =>
    set((s) => ({ seaIceHeatmap: { ...s.seaIceHeatmap, ...meta } })),
  filterIcebergsAroundPosition: (lat, lon, radiusNm = 50) => {
    // Keep all 38 icebergs in state; 3D components filter locally
  },
  warpTarget: getInitialWarpTarget(),
  setWarpTarget: (warpTarget) => {
    if (typeof window !== "undefined") {
      try {
        if (warpTarget) {
          localStorage.setItem("polaris_warp_target", JSON.stringify(warpTarget));
          localStorage.setItem("polaris_vessel_pos", JSON.stringify(warpTarget));
        } else {
          localStorage.removeItem("polaris_warp_target");
        }
      } catch {}
    }
    set((s) => ({
      warpTarget,
      vessel: warpTarget
        ? { ...s.vessel, lat: warpTarget.lat, lon: warpTarget.lon, sogKnots: 0 }
        : s.vessel,
    }));
  },
  clearWarpTarget: () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("polaris_warp_target");
      } catch {}
    }
    set({ warpTarget: null, shipWarpTarget: null });
  },
  shipWarpTarget: null,
  warpShip: (lat, lon) => {
    get().setWarpTarget({ lat, lon });
  },
  cameraTargetCoord: null,
  setCameraTargetCoord: (coord) => set({ cameraTargetCoord: coord }),
}));

export const selectLockedRoute = (s: PolarisState) =>
  s.routes.find((r) => r.id === s.lockedRouteId) ?? s.routes[0];

if (typeof window !== "undefined") {
  (window as any).__polarisStore = usePolarisStore;

  window.addEventListener("storage", (e) => {
    if (e.key === "polaris_locked_route" && e.newValue) {
      if (e.newValue === "safest" || e.newValue === "balanced" || e.newValue === "eco" || e.newValue === "fastest") {
        usePolarisStore.setState({ lockedRouteId: e.newValue });
      }
    }
    if (e.key === "polaris_routes_v4" && e.newValue) {
      try {
        const routes = JSON.parse(e.newValue);
        if (Array.isArray(routes) && routes.length > 0) {
          let endpoints = null;
          const p0 = routes[0]?.points?.[0];
          const pN = routes[0]?.points?.[routes[0].points.length - 1];
          if (p0 && pN) {
            endpoints = { start: [p0.lat, p0.lon] as [number, number], dest: [pN.lat, pN.lon] as [number, number] };
          }
          usePolarisStore.setState((s) => ({
            routes,
            sharedRoutes: routes,
            routesFetched: true,
            routeEndpoints: endpoints || s.routeEndpoints,
          }));
        }
      } catch {}
    }
    if (e.key === "polaris_route_endpoints_v4" && e.newValue) {
      try {
        const endpoints = JSON.parse(e.newValue);
        if (endpoints && endpoints.start && endpoints.dest) {
          usePolarisStore.setState({ routeEndpoints: endpoints });
        }
      } catch {}
    }
    if (e.key === "polaris_warp_target" && e.newValue) {
      try {
        const warp = JSON.parse(e.newValue);
        if (warp && typeof warp.lat === "number" && typeof warp.lon === "number") {
          usePolarisStore.getState().warpShip(warp.lat, warp.lon);
        }
      } catch {}
    }
    if (e.key === "polaris_destination" && e.newValue) {
      try {
        const dest = JSON.parse(e.newValue);
        if (dest && typeof dest.lat === "number" && typeof dest.lon === "number") {
          usePolarisStore.setState({ destination: { lat: dest.lat, lon: dest.lon } });
        }
      } catch {}
    }
  });
  (window as any).__POLARIS_STORE__ = usePolarisStore;
}
