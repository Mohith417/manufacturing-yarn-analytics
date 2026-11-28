/**
 * The last uploaded file, kept for the session.
 *
 * The topbar report is available from every page, so it needs to know what was
 * scored on the Upload page without that page staying mounted. Only a summary is
 * stored (counts and the top machines), never the whole file.
 */
import type { RiskLevel } from "./data";

const KEY = "yarnlens.lastUpload.v1";

export interface UploadSummaryRow {
  machine: string;
  level: RiskLevel;
  chance: number;
  driver: string;
}

export interface UploadSummary {
  fileName: string;
  savedAt: string;
  rowsScored: number;
  machineCount: number;
  check: number;
  watch: number;
  ok: number;
  skipped: number;
  /** True when every row was scored, not only the latest row per machine. */
  everyRow: boolean;
  top: UploadSummaryRow[];
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isLevel(value: unknown): value is RiskLevel {
  return value === "green" || value === "amber" || value === "red";
}

export function saveLastUpload(summary: UploadSummary): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.setItem(KEY, JSON.stringify(summary));
  } catch {
    // A full or blocked sessionStorage only costs the summary, not the app.
  }
}

export function readLastUpload(): UploadSummary | null {
  const store = storage();
  if (!store) {
    return null;
  }
  try {
    const raw = store.getItem(KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<UploadSummary> | null;
    if (!parsed || typeof parsed.fileName !== "string" || !Array.isArray(parsed.top)) {
      return null;
    }
    const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
    return {
      fileName: parsed.fileName,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      rowsScored: number(parsed.rowsScored),
      machineCount: number(parsed.machineCount),
      check: number(parsed.check),
      watch: number(parsed.watch),
      ok: number(parsed.ok),
      skipped: number(parsed.skipped),
      everyRow: parsed.everyRow === true,
      top: parsed.top
        .filter((row): row is UploadSummaryRow => Boolean(row) && typeof row.machine === "string")
        .map((row) => ({
          machine: row.machine,
          level: isLevel(row.level) ? row.level : "green",
          chance: number(row.chance),
          driver: typeof row.driver === "string" ? row.driver : "—",
        })),
    };
  } catch {
    return null;
  }
}

export function clearLastUpload(): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.removeItem(KEY);
  } catch {
    // Nothing to do: the summary is a convenience, not data.
  }
}
