/**
 * The only place the front end talks to a server.
 *
 * The hosted build is static. Every call here is optional: a missing API sets
 * `mode` to "static", the live pages explain that they need the local API, and
 * nothing throws an uncaught error in the console.
 */

const DEFAULT_BASE = "http://127.0.0.1:8000";

export const API_BASE = (import.meta.env.VITE_API_URL ?? DEFAULT_BASE).replace(/\/+$/, "");

export type ModelName = "logistic_regression" | "decision_tree" | "random_forest";

export interface Health {
  status: string;
  models: ModelName[];
  database: boolean;
  simulated_interval_seconds: number;
  rows_stored: number;
}

export interface StreamReading {
  machine_id: string;
  line: string;
  timestamp: string;
  risk: number;
  status: "green" | "amber" | "red";
  factors: string[];
  simulated: true;
  model: string;
}

export interface HistoryReading {
  id: number;
  machine_id: string;
  risk: number;
  status: "green" | "amber" | "red";
  simulated: boolean;
  source: string;
  model: string;
  scored_at: string;
}

export interface TrendPoint {
  bucket: string;
  avg_risk: number;
  count: number;
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || `HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * A hosted build must not probe the visitor's own machine: the request would be
 * refused and only add a console error. The probe runs on a loopback origin, or
 * wherever VITE_API_URL points the front end at a real server.
 */
function apiCouldExist(): boolean {
  if (import.meta.env.VITE_API_URL) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
}

/** One probe at startup. `null` means "no local API", not an error to show. */
export async function fetchHealth(): Promise<Health | null> {
  if (!apiCouldExist()) {
    return null;
  }
  try {
    const health = await request<Health>("/api/health", { method: "GET" }, 2500);
    return health?.status === "ok" ? health : null;
  } catch {
    return null;
  }
}

export interface ApiScoreRow {
  machine_id: string;
  risk: number;
  status: "green" | "amber" | "red";
  top_factors: string[];
}

export interface ApiScoreResponse {
  model: string;
  results: ApiScoreRow[];
}

export function scoreWithApi(
  model: ModelName,
  readings: { machine_id: string; timestamp?: string | null; machine_age_years: number; operating_hours: number; temperature_c: number; vibration_mm_s: number; days_since_maintenance: number; past_maintenance_events: number }[],
): Promise<ApiScoreResponse> {
  return request<ApiScoreResponse>("/api/score", {
    method: "POST",
    body: JSON.stringify({ model, readings }),
  });
}

export function fetchHistory(machineId: string, limit = 200): Promise<{ readings: HistoryReading[] }> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (machineId) {
    query.set("machine_id", machineId);
  }
  return request<{ readings: HistoryReading[] }>(`/api/history?${query.toString()}`);
}

export function fetchTrends(hours = 24): Promise<{ points: TrendPoint[] }> {
  return request<{ points: TrendPoint[] }>(`/api/trends?hours=${hours}`);
}

export function clearHistory(): Promise<{ deleted: number }> {
  return request<{ deleted: number }>("/api/history?confirm=clear-all", { method: "DELETE" });
}

export function streamUrl(): string {
  return `${API_BASE}/api/stream`;
}
