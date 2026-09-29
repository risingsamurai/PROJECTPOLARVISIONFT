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

export interface FuelBreakdown {
  baseMt: number;
  iceAddedMt: number;
  weatherAddedMt: number;
}

export interface RouteOption {
  id: "safest" | "balanced" | "eco" | "fastest";
  name: string;
  distanceNm: number;
  etaHours: number;
  fuelMt: number;
  riskScore: number;
  avgSpeedKts?: number;
  fuelBreakdown?: FuelBreakdown;
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
