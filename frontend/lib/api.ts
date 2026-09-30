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

export async function fetchWildlifeColonies() {
  try {
    const r = await fetch(`${API}/api/wildlife/colonies`);
    if (!r.ok) throw new Error("wildlife fetch failed");
    return (await r.json()) as { status: string; count: number; colonies: any[] };
  } catch {
    const { FALLBACK_COLONIES } = await import("./mockData");
    return { status: "fallback", count: FALLBACK_COLONIES.length, colonies: FALLBACK_COLONIES };
  }
}

export async function fetchDispersionPlume(day: number = 1) {
  try {
    const r = await fetch(`${API}/api/ocean/dispersion-plume?day=${day}`);
    if (!r.ok) throw new Error("ocean plume fetch failed");
    return await r.json();
  } catch {
    const { FALLBACK_PLUMES, FALLBACK_FLOW_VECTORS } = await import("./mockData");
    return {
      status: "fallback",
      day,
      timestamp: new Date().toISOString(),
      plumes: FALLBACK_PLUMES,
      flowVectors: FALLBACK_FLOW_VECTORS,
    };
  }
}

export async function fetchFlowField(day: number = 1) {
  try {
    const r = await fetch(`${API}/api/ocean/flow-field?day=${day}`);
    if (!r.ok) throw new Error("ocean flow-field fetch failed");
    return (await r.json()) as import("./mockData").FlowFieldData;
  } catch {
    const { generateFallbackFlowField } = await import("./mockData");
    return generateFallbackFlowField(day);
  }
}

