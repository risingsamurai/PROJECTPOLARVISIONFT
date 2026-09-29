// Centralized API Base URL (one env/config constant, no scattered hard-coded ports)
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface FeedStatus {
  status: "LIVE" | "STALE" | "FALLBACK" | "ERROR";
  source_url?: string;
  data_date?: string | null;
  fetched_at?: string | null;
  age_hours?: number | null;
  count?: number;
  points?: number;
  last_error?: string | null;
}

export interface DataStatusResponse {
  nsidc: FeedStatus;
  byu_nic: FeedStatus;
  era5: FeedStatus;
}

export async function fetchDataStatus(timeoutMs = 5000): Promise<DataStatusResponse> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${API_BASE}/api/data-status`, { signal: controller.signal });
    if (!r.ok) {
      throw new Error(`data_status_failed: HTTP ${r.status}`);
    }
    const data = (await r.json()) as DataStatusResponse;
    if (process.env.NODE_ENV === "development") {
      console.log("[DataReality] Status response:", data);
    }
    return data;
  } finally {
    clearTimeout(id);
  }
}

export async function fetchIcebergs() {
  const r = await fetch(`${API_BASE}/api/icebergs`);
  if (!r.ok) throw new Error("icebergs fetch failed");
  return r.json() as Promise<{ count: number; icebergs: any[] }>;
}

export async function fetchForecast(day: number) {
  const r = await fetch(`${API_BASE}/api/ice/forecast?day=${day}`);
  if (!r.ok) throw new Error("forecast failed");
  return r.json();
}

export async function fetchRoutes(
  start: [number, number],
  destination: [number, number]
) {
  try {
    const r = await fetch(`${API_BASE}/api/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, destination }),
    });
    if (!r.ok) throw new Error("route failed");
    const data = await r.json();
    if (process.env.NODE_ENV === "development") {
      console.log("[Router] API routes response:", data);
    }
    return data;
  } catch (error) {
    console.error("Route fetch error:", error);
    throw error;
  }
}

export async function evaluateAlert(lat: number, lon: number, sog: number, cog: number) {
  const r = await fetch(`${API_BASE}/api/alerts/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lon, sog, cog }),
  });
  return r.json();
}

export interface SeaIceGridCell {
  lat: number;
  lon: number;
  sic: number | null; // null = land / no-data
  sic_pct?: number | null;
}

export interface SeaIceGridResponse {
  date: string | null;
  source: string;
  bounds: { min_lat: number; max_lat: number; min_lon: number; max_lon: number };
  width: number;
  height: number;
  resolution_deg: number;
  stats: {
    min: number;
    max: number;
    mean: number;
    non_null_count: number;
    total_cells?: number;
  };
  values?: (number | null)[];
  cells: SeaIceGridCell[];
  n_cells?: number;
}

export async function fetchSeaIceGrid(params?: {
  min_lat?: number;
  max_lat?: number;
  min_lon?: number;
  max_lon?: number;
  res?: number;
}): Promise<SeaIceGridResponse> {
  const q = new URLSearchParams();
  if (params?.min_lat !== undefined) q.set("min_lat", String(params.min_lat));
  if (params?.max_lat !== undefined) q.set("max_lat", String(params.max_lat));
  if (params?.min_lon !== undefined) q.set("min_lon", String(params.min_lon));
  if (params?.max_lon !== undefined) q.set("max_lon", String(params.max_lon));
  if (params?.res !== undefined) q.set("res", String(params.res));

  const url = `${API_BASE}/api/sea-ice/grid${q.toString() ? "?" + q.toString() : ""}`;
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`sea_ice_data_unavailable: HTTP ${r.status}`);
  }
  const data = (await r.json()) as SeaIceGridResponse;
  if (process.env.NODE_ENV === "development") {
    console.log(`[SeaIceGrid] Loaded ${data.cells?.length ?? data.values?.length} cells for ${data.date} (${data.source})`);
  }
  return data;
}

export function getSeaIceImageUrl(params?: {
  min_lat?: number;
  max_lat?: number;
  min_lon?: number;
  max_lon?: number;
  res?: number;
  opacity?: number;
}): string {
  const q = new URLSearchParams();
  if (params?.min_lat !== undefined) q.set("min_lat", String(params.min_lat));
  if (params?.max_lat !== undefined) q.set("max_lat", String(params.max_lat));
  if (params?.min_lon !== undefined) q.set("min_lon", String(params.min_lon));
  if (params?.max_lon !== undefined) q.set("max_lon", String(params.max_lon));
  if (params?.res !== undefined) q.set("res", String(params.res));
  if (params?.opacity !== undefined) q.set("opacity", String(params.opacity));
  return `${API_BASE}/api/sea-ice/image?${q.toString()}`;
}
