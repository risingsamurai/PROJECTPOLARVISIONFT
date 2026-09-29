export type IcebergStatus = "tracked" | "predicted" | "hazard";
export type SizeClass = "small" | "medium" | "large" | "very_large";

export interface Iceberg {
  id: string;
  name: string;
  lat: number;
  lon: number;
  diameterNm: number;
  sizeClass: SizeClass;
  status: IcebergStatus;
  highRisk: boolean;
  dangerRadiusNm: number;
  headingDeg: number;
  predictedPath: { lat: number; lon: number; hour: number }[];
}

export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface RouteOption {
  id: "safest" | "balanced" | "fastest";
  name: string;
  distanceNm: number;
  etaHours: number;
  fuelMt: number;
  riskScore: number;
  points: RoutePoint[];
}

export interface VesselState {
  lat: number;
  lon: number;
  headingDeg: number;
  sogKnots: number;
  cogDeg: number;
}

export const SCENE_ORIGIN = { lat: -68.4, lon: -52.1 };

export const MOCK_VESSEL: VesselState = {
  lat: -68.35,
  lon: -52.45,
  headingDeg: 112,
  sogKnots: 8.4,
  cogDeg: 112,
};

export const MOCK_ICEBERGS: Iceberg[] = [
  {
    id: "IBG-2025-0142",
    name: "A76C",
    lat: -68.22,
    lon: -51.85,
    diameterNm: 2.4,
    sizeClass: "large",
    status: "hazard",
    highRisk: true,
    dangerRadiusNm: 10,
    headingDeg: 95,
    predictedPath: [
      { lat: -68.22, lon: -51.85, hour: 0 },
      { lat: -68.18, lon: -51.55, hour: 24 },
      { lat: -68.14, lon: -51.22, hour: 48 },
      { lat: -68.09, lon: -50.88, hour: 72 },
    ],
  },
  {
    id: "IBG-2025-0081",
    name: "A81",
    lat: -68.55,
    lon: -52.05,
    diameterNm: 1.1,
    sizeClass: "medium",
    status: "tracked",
    highRisk: true,
    dangerRadiusNm: 8,
    headingDeg: 80,
    predictedPath: [
      { lat: -68.55, lon: -52.05, hour: 0 },
      { lat: -68.5, lon: -51.8, hour: 24 },
      { lat: -68.46, lon: -51.52, hour: 48 },
      { lat: -68.41, lon: -51.2, hour: 72 },
    ],
  },
  {
    id: "IBG-2025-0083",
    name: "A83",
    lat: -68.08,
    lon: -52.7,
    diameterNm: 3.1,
    sizeClass: "very_large",
    status: "tracked",
    highRisk: false,
    dangerRadiusNm: 12,
    headingDeg: 140,
    predictedPath: [
      { lat: -68.08, lon: -52.7, hour: 0 },
      { lat: -68.16, lon: -52.4, hour: 24 },
      { lat: -68.22, lon: -52.1, hour: 48 },
      { lat: -68.28, lon: -51.82, hour: 72 },
    ],
  },
];

function seedIcebergs(): Iceberg[] {
  const extras: Iceberg[] = [];
  const rng = (n: number) => {
    const x = Math.sin(n * 999.1) * 10000;
    return x - Math.floor(x);
  };
  for (let i = 0; i < 18; i++) {
    const lat = -68.7 + rng(i + 1) * 0.9;
    const lon = -53.2 + rng(i + 7) * 1.8;
    extras.push({
      id: `IBG-2025-${String(200 + i).padStart(4, "0")}`,
      name: `T-${200 + i}`,
      lat,
      lon,
      diameterNm: 0.4 + rng(i + 3) * 1.8,
      sizeClass: rng(i) > 0.7 ? "large" : rng(i) > 0.4 ? "medium" : "small",
      status: "tracked",
      highRisk: rng(i + 11) > 0.82,
      dangerRadiusNm: 6 + rng(i + 5) * 6,
      headingDeg: rng(i + 9) * 360,
      predictedPath: [
        { lat, lon, hour: 0 },
        { lat: lat + 0.04, lon: lon + 0.18, hour: 24 },
        { lat: lat + 0.07, lon: lon + 0.34, hour: 48 },
        { lat: lat + 0.11, lon: lon + 0.5, hour: 72 },
      ],
    });
  }
  return extras;
}

export const ALL_ICEBERGS: Iceberg[] = [...MOCK_ICEBERGS, ...seedIcebergs()];

export const MOCK_ROUTES: RouteOption[] = [
  {
    id: "safest",
    name: "Safest",
    distanceNm: 142.6,
    etaHours: 18.4,
    fuelMt: 21.2,
    riskScore: 0.12,
    points: [
      { lat: -68.35, lon: -52.45 },
      { lat: -68.48, lon: -51.9 },
      { lat: -68.62, lon: -51.2 },
      { lat: -68.7, lon: -50.4 },
      { lat: -68.72, lon: -49.55 },
    ],
  },
  {
    id: "balanced",
    name: "Balanced",
    distanceNm: 118.3,
    etaHours: 14.1,
    fuelMt: 16.8,
    riskScore: 0.31,
    points: [
      { lat: -68.35, lon: -52.45 },
      { lat: -68.38, lon: -51.7 },
      { lat: -68.46, lon: -50.95 },
      { lat: -68.55, lon: -50.2 },
      { lat: -68.72, lon: -49.55 },
    ],
  },
  {
    id: "fastest",
    name: "Fastest",
    distanceNm: 96.4,
    etaHours: 11.2,
    fuelMt: 13.4,
    riskScore: 0.58,
    points: [
      { lat: -68.35, lon: -52.45 },
      { lat: -68.28, lon: -51.55 },
      { lat: -68.4, lon: -50.6 },
      { lat: -68.72, lon: -49.55 },
    ],
  },
];

export const DESTINATION = { lat: -68.72, lon: -49.55 };

export const ICE_LEVELS = [
  { label: "Low", range: "0–0.3", color: "#1e3a8a" },
  { label: "Moderate", range: "0.3–0.6", color: "#3b82f6" },
  { label: "High", range: "0.6–0.8", color: "#93c5fd" },
  { label: "Very High", range: "0.8–1.0", color: "#ffffff" },
] as const;

// ── Wildlife / Eco types ────────────────────────────────────────────────────
// (Simulated demo data – ported from reference repo VIRAJ756/SIH-UI-)
export type WildlifeIcon = "penguin" | "seal" | "petrel";
export type RiskTier = "Low" | "Moderate" | "High" | "Critical";

export interface WildlifeColony {
  id: string;
  name: string;
  species: string;
  icon: WildlifeIcon;
  colonyType: string;
  population: string;
  populationNum: number;
  lat: number;
  lon: number;
  riskTier: RiskTier;
  reason: string;
  sparkline: number[];
}

export interface PlumeItem {
  id: string;
  sourceName: string;
  lat: number;
  lon: number;
  radiusNm: number;
  intensity: number;
  salinityAnomalyPsu: number;
  meltRateM3s: number;
  temperatureAnomalyC: number;
}

export interface CurrentVector {
  id: string;
  start: [number, number]; // [lon, lat]
  end: [number, number];   // [lon, lat]
  speedKnots: number;
  headingDeg: number;
}

export interface PlumeFrame {
  status: string;
  day: number;
  timestamp: string;
  plumes: PlumeItem[];
  flowVectors: CurrentVector[];
}

export const FALLBACK_COLONIES: WildlifeColony[] = [
  {
    id: "col-emperor-snow-hill",
    name: "Snow Hill Island Colony",
    species: "Emperor Penguin (Aptenodytes forsteri)",
    icon: "penguin",
    colonyType: "Breeding Rookery / Fast-Ice",
    population: "~4,200 breeding pairs",
    populationNum: 8400,
    lat: -64.48,
    lon: -57.22,
    riskTier: "High",
    reason: "Tabular iceberg drift corridor within 14 NM; early fast-ice breakup hazard.",
    sparkline: [4100, 4150, 4200, 4180, 4250, 4210, 4200],
  },
  {
    id: "col-adelie-paulet",
    name: "Paulet Island Rookery",
    species: "Adélie Penguin (Pygoscelis adeliae)",
    icon: "penguin",
    colonyType: "Nesting & Foraging Colony",
    population: "~105,000 pairs",
    populationNum: 210000,
    lat: -63.58,
    lon: -55.78,
    riskTier: "Moderate",
    reason: "High krill feeding density across ship transit zone; speed restriction zone.",
    sparkline: [102000, 103500, 104000, 105000, 105200, 104800, 105000],
  },
  {
    id: "col-weddell-erebus-gulf",
    name: "Erebus & Terror Gulf Haul-Out",
    species: "Weddell Seal (Leptonychotes weddellii)",
    icon: "seal",
    colonyType: "Pupping & Molting Aggregation",
    population: "~1,850 individuals",
    populationNum: 1850,
    lat: -64.05,
    lon: -58.40,
    riskTier: "Low",
    reason: "Sheltered pack-ice pupping platform; minimal vessel wake interference.",
    sparkline: [1780, 1800, 1820, 1840, 1850, 1850, 1850],
  },
  {
    id: "col-chinstrap-deception",
    name: "Baily Head / South Shetland",
    species: "Chinstrap Penguin (Pygoscelis antarcticus)",
    icon: "penguin",
    colonyType: "Major Breeding Colony",
    population: "~50,000 pairs",
    populationNum: 100000,
    lat: -62.96,
    lon: -60.51,
    riskTier: "Moderate",
    reason: "Active foraging corridor along brash ice edge.",
    sparkline: [51000, 50500, 50200, 49800, 50000, 50100, 50000],
  },
  {
    id: "col-crabeater-weddell-shelf",
    name: "Larsen Ice Margin Aggregation",
    species: "Crabeater Seal (Lobodon carcinophaga)",
    icon: "seal",
    colonyType: "Pelagic Pack-Ice Pack",
    population: "~12,400 individuals",
    populationNum: 12400,
    lat: -66.85,
    lon: -60.10,
    riskTier: "Critical",
    reason: "Direct overlap with freshwater plume melt front & fragmented tabular bergs.",
    sparkline: [13200, 12900, 12600, 12500, 12450, 12400, 12400],
  },
  {
    id: "col-emperor-halley",
    name: "Brunt Ice Shelf Sanctuary",
    species: "Emperor Penguin (Aptenodytes forsteri)",
    icon: "penguin",
    colonyType: "Primary Breeding Sanctuary",
    population: "~7,600 pairs",
    populationNum: 15200,
    lat: -75.55,
    lon: -26.50,
    riskTier: "High",
    reason: "Calving rift dynamics at Brunt Ice Shelf margin.",
    sparkline: [7400, 7450, 7500, 7550, 7600, 7580, 7600],
  },
];

export const FALLBACK_PLUMES: PlumeItem[] = [
  {
    id: "plume-a76c-d1",
    sourceName: "A76C Tabular Discharge",
    lat: -68.22,
    lon: -51.85,
    radiusNm: 8.5,
    intensity: 0.88,
    salinityAnomalyPsu: -1.38,
    meltRateM3s: 1420.0,
    temperatureAnomalyC: -0.85,
  },
  {
    id: "plume-a81-d1",
    sourceName: "A81 Melt Front",
    lat: -68.55,
    lon: -52.05,
    radiusNm: 7.2,
    intensity: 0.65,
    salinityAnomalyPsu: -1.15,
    meltRateM3s: 890.0,
    temperatureAnomalyC: -0.72,
  },
  {
    id: "plume-a83-d1",
    sourceName: "A83 Grounding-Line Plume",
    lat: -68.08,
    lon: -52.70,
    radiusNm: 9.8,
    intensity: 0.94,
    salinityAnomalyPsu: -1.72,
    meltRateM3s: 1950.0,
    temperatureAnomalyC: -0.92,
  },
  {
    id: "plume-larsen-c-d1",
    sourceName: "Larsen-C Barrier Melt",
    lat: -67.45,
    lon: -60.50,
    radiusNm: 12.0,
    intensity: 0.82,
    salinityAnomalyPsu: -1.55,
    meltRateM3s: 2300.0,
    temperatureAnomalyC: -0.80,
  },
];

export const FALLBACK_FLOW_VECTORS: CurrentVector[] = [
  { id: "fv-1", start: [-52.1, -68.37], end: [-51.74, -68.31], speedKnots: 0.55, headingDeg: 75 },
  { id: "fv-2", start: [-51.85, -68.22], end: [-51.52, -68.17], speedKnots: 0.48, headingDeg: 78 },
  { id: "fv-3", start: [-52.3, -68.55], end: [-51.92, -68.50], speedKnots: 0.52, headingDeg: 72 },
  { id: "fv-4", start: [-52.95, -68.08], end: [-52.55, -68.02], speedKnots: 0.60, headingDeg: 82 },
  { id: "fv-5", start: [-60.75, -67.45], end: [-60.35, -67.40], speedKnots: 0.42, headingDeg: 80 },
  { id: "fv-6", start: [-51.6, -68.45], end: [-51.25, -68.42], speedKnots: 0.38, headingDeg: 85 },
];

export interface FlowGridCell {
  lat: number;
  lon: number;
  u: number;
  v: number;
  speedKnots: number;
  headingDeg: number;
  concentration: number;
  salinityAnomalyPsu: number;
}

export interface FlowFieldData {
  status: string;
  day: number;
  model: string;
  gridBounds: {
    latMin: number;
    latMax: number;
    lonMin: number;
    lonMax: number;
    latStep: number;
    lonStep: number;
    rows: number;
    cols: number;
  };
  grid: FlowGridCell[];
  summary: {
    totalCells: number;
    maxConcentration: number;
    avgSpeedKnots: number;
  };
}

export function generateFallbackFlowField(forecastDay: number = 1): FlowFieldData {
  const day = Math.max(1, Math.min(7, forecastDay));
  const latMin = -70.5;
  const latMax = -62.5;
  const lonMin = -61.0;
  const lonMax = -46.0;
  const latStep = 0.4;
  const lonStep = 0.6;

  const grid: FlowGridCell[] = [];
  const sources = [
    { lat: -68.22, lon: -51.85, strength: 1.0 },
    { lat: -68.55, lon: -52.05, strength: 0.85 },
    { lat: -68.08, lon: -52.7, strength: 0.95 },
    { lat: -67.45, lon: -60.5, strength: 1.2 },
  ];

  for (let lat = latMin; lat <= latMax + 0.01; lat += latStep) {
    for (let lon = lonMin; lon <= lonMax + 0.01; lon += lonStep) {
      const u = +(0.2 + 0.18 * Math.sin((lon + 55) / 5)).toFixed(4);
      const v = +(0.25 + 0.2 * Math.cos((lat + 66) / 4)).toFixed(4);
      const speedKnots = +(Math.hypot(u, v) * 1.94384).toFixed(2);
      const headingDeg = +(((Math.atan2(u, v) * 180) / Math.PI + 360) % 360).toFixed(1);

      let conc = 0;
      for (const s of sources) {
        const driftLat = s.lat + v * 0.14 * (day - 1);
        const driftLon = s.lon + u * 0.32 * (day - 1);
        const dSq = (lat - driftLat) ** 2 * 2.2 + (lon - driftLon) ** 2;
        const sigmaSq = 0.85 + 0.35 * (day - 1);
        conc += s.strength * Math.exp(-dSq / sigmaSq);
      }
      if (lat < -67.0) conc += 0.12 * (Math.abs(lat + 67.0) / 3.5);
      conc = Math.max(0, Math.min(1, +conc.toFixed(3)));

      grid.push({
        lat: +lat.toFixed(3),
        lon: +lon.toFixed(3),
        u,
        v,
        speedKnots,
        headingDeg,
        concentration: conc,
        salinityAnomalyPsu: +(-2.0 * conc).toFixed(2),
      });
    }
  }

  return {
    status: "ok",
    day,
    model: "Client_Fallback_Advection_Field",
    gridBounds: {
      latMin,
      latMax,
      lonMin,
      lonMax,
      latStep,
      lonStep,
      rows: 21,
      cols: 26,
    },
    grid,
    summary: {
      totalCells: grid.length,
      maxConcentration: Math.max(...grid.map((c) => c.concentration)),
      avgSpeedKnots: +(grid.reduce((acc, c) => acc + c.speedKnots, 0) / grid.length).toFixed(2),
    },
  };
}
