/**
 * Scored readings kept in this browser.
 *
 * The hosted dashboard is static, so there is no database to read history
 * from. Every reading the live feed scores, and every row an uploaded file
 * scores, is appended to localStorage instead: the History page then reads a
 * machine's risk over time rather than one moment. Rows never leave the
 * machine, and "Clear history" only empties this browser's copy.
 */

import type { MachineRisk, ModelCoefficients, RiskLevel, RiskRule } from "./data";
import { scoreFleet, seedFeatures, stepFleet } from "./live";
import { riskLevel, scoreRisk } from "./risk";

const KEY = "yarnlens.history.v1";
const SEEDED_KEY = "yarnlens.history.seeded.v1";
/** Roughly one live-feed session plus a few uploaded files; oldest go first. */
const CAP = 4000;

export const HISTORY_EVENT = "yarnlens:history";

export interface StoredReading {
  id: string;
  machine_id: string;
  risk: number;
  status: RiskLevel;
  simulated: boolean;
  source: "live" | "upload" | "backfill";
  model: string;
  scored_at: string;
}

function announce(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(HISTORY_EVENT));
  }
}

/** Storage can be disabled (private mode, blocked cookies): an empty list is fine. */
export function loadHistory(): StoredReading[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return (parsed as StoredReading[]).filter(
      (row) =>
        typeof row?.id === "string" &&
        typeof row?.machine_id === "string" &&
        Number.isFinite(row?.risk) &&
        typeof row?.scored_at === "string",
    );
  } catch {
    return [];
  }
}

function persist(rows: StoredReading[]): void {
  try {
    // Newest first, whatever order the caller wrote them in.
    const ordered = [...rows].sort((a, b) => b.scored_at.localeCompare(a.scored_at));
    window.localStorage.setItem(KEY, JSON.stringify(ordered.slice(0, CAP)));
  } catch {
    // A full or blocked store must not break the page that is writing.
  }
}

/** Newest first, de-duplicated by id, capped at CAP rows. */
export function appendReadings(rows: StoredReading[]): void {
  if (rows.length === 0) {
    return;
  }
  const seen = new Set<string>();
  const merged: StoredReading[] = [];
  [...rows, ...loadHistory()].forEach((row) => {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  });
  persist(merged);
  announce();
}

export function clearStoredHistory(): number {
  const count = loadHistory().length;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(SEEDED_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
  announce();
  return count;
}

function hourKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  // Bucket in UTC so the chart's hours do not shift with the reader's timezone.
  const copy = new Date(date);
  copy.setUTCMinutes(0, 0, 0);
  return copy.toISOString();
}

export interface HistoryBucket {
  bucket: string;
  avg_risk: number;
  count: number;
}

/** Average chance per hour across the stored window, oldest hour first. */
export function historyTrend(rows: StoredReading[], hours = 24): HistoryBucket[] {
  if (rows.length === 0) {
    return [];
  }
  const oldest = Date.now() - hours * 3_600_000;
  const buckets = new Map<string, { total: number; count: number }>();
  rows.forEach((row) => {
    const at = new Date(row.scored_at).getTime();
    if (Number.isNaN(at) || at < oldest) {
      return;
    }
    const key = hourKey(row.scored_at);
    const entry = buckets.get(key) ?? { total: 0, count: 0 };
    entry.total += row.risk;
    entry.count += 1;
    buckets.set(key, entry);
  });
  return [...buckets.entries()]
    .map(([bucket, entry]) => ({
      bucket,
      avg_risk: entry.total / entry.count,
      count: entry.count,
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/**
 * A first visit would otherwise show an empty chart, because the feed has not
 * run yet. This writes 24 hourly batches ending now, generated the same way the
 * live feed generates them, so the page opens with a real trend.
 */
export function seedHistory(
  machines: MachineRisk[],
  model: ModelCoefficients,
  rule: RiskRule | null,
  force = false,
): number {
  try {
    if (!force && window.localStorage.getItem(SEEDED_KEY) === "1") {
      return 0;
    }
  } catch {
    return 0;
  }
  const rows: StoredReading[] = [];
  let features = seedFeatures(machines);
  const now = Date.now();
  for (let step = 23; step >= 0; step -= 1) {
    features = stepFleet(features, machines);
    const at = new Date(now - step * 3_600_000).toISOString();
    scoreFleet(features, machines, model, rule, at).forEach((reading) => {
      rows.push({
        id: `backfill-${reading.timestamp}-${reading.machine_id}`,
        machine_id: reading.machine_id,
        risk: reading.risk,
        status: reading.status,
        simulated: true,
        source: "backfill",
        model: "logistic_regression",
        scored_at: at,
      });
    });
  }
  persist([...rows, ...loadHistory()]);
  try {
    window.localStorage.setItem(SEEDED_KEY, "1");
  } catch {
    // Without the flag the seed simply runs again next time.
  }
  announce();
  return rows.length;
}

/** One reading for a scored upload row, so Upload writes history too. */
export function readingFromUpload(
  machineId: string,
  features: Record<string, number>,
  model: ModelCoefficients,
  rule: RiskRule | null,
  at: string,
): StoredReading {
  const risk = scoreRisk(features, model);
  return {
    id: `upload-${at}-${machineId}`,
    machine_id: machineId,
    risk,
    status: riskLevel(risk, rule?.red_at ?? 0.7, rule?.amber_at ?? 0.4),
    simulated: true,
    source: "upload",
    model: "logistic_regression",
    scored_at: at,
  };
}
