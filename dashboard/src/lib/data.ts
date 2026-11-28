import { useEffect, useState } from "react";

/**
 * The dashboard is static: every number comes from one of these JSON files in
 * public/data/, written by dashboard/scripts/export_dashboard_data.py from the
 * CSVs the Spark jobs exported. There is no API, no database and no fetch to
 * any third party.
 */

export interface Kpis {
  total_units: number;
  downtime_rate: number;
  avg_defect_rate: number;
  high_risk_count: number;
  risk_rule?: RiskRule;
}

export interface RiskRule {
  red_at: number;
  amber_at: number;
}

export interface TrendPoint {
  date: string;
  units: number;
}

export interface MachineDowntime {
  machine_id: string;
  line: string;
  downtime_count: number;
  downtime_rate: number;
}

export interface DefectBin {
  bin_start: number;
  bin_end: number;
  count: number;
}

export interface Correlation {
  labels: string[];
  matrix: number[][];
}

export interface ModelMetric {
  model: string;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
}

export interface FeatureImportance {
  feature: string;
  feature_key: string;
  importance: number;
}

export interface ConfusionMatrix {
  labels: string[];
  matrix: number[][];
}

export type RiskLevel = "green" | "amber" | "red";

export interface MachineRisk {
  machine_id: string;
  line: string;
  age_years: number;
  risk_score: number;
  risk_level: RiskLevel;
  top_factors: string[];
  features: Record<string, number>;
  /** True when a visitor kept a what-if change; the row is then synthetic. */
  simulated?: boolean;
  /** When that change was applied, as an ISO string. */
  applied_at?: string;
}

export interface ModelCoefficients {
  features: string[];
  intercept: number;
  coefficients: number[];
  means: number[];
  stds: number[];
}

export interface ClusterInfo {
  nodes: number;
  spark_version: string;
  hadoop_version: string;
  rows_processed: number;
}

interface JsonState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Load one JSON file from public/data/. Missing file -> error + empty state. */
export function useJson<T>(file: string): JsonState<T> {
  const [state, setState] = useState<JsonState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let alive = true;
    const url = `${import.meta.env.BASE_URL}data/${file}.json`;
    setState({ data: null, loading: true, error: null });
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        // A dev/static server may answer a missing file with the SPA index
        // page. Parsing that as JSON would surface a confusing syntax error, so
        // check the content type first and report "not found" instead.
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("json")) {
          throw new Error("not found");
        }
        return response.json().catch(() => {
          throw new Error("the file is not valid JSON");
        });
      })
      .then((payload: T) => {
        if (alive) {
          setState({ data: payload, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (alive) {
          const message = error instanceof Error ? error.message : String(error);
          setState({ data: null, loading: false, error: message });
        }
      });
    return () => {
      alive = false;
    };
  }, [file]);

  return state;
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return Math.round(value).toLocaleString("en-US");
}

export function formatPct(ratio: number | null | undefined, digits = 2): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) {
    return "—";
  }
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatDecimal(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(digits);
}

export function formatDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const FEATURE_LABELS: Record<string, string> = {
  machine_age_years: "Machine age",
  operating_hours: "Operating hours",
  temperature_c: "Temperature",
  vibration_mm_s: "Vibration",
  days_since_maintenance: "Days since service",
  past_maintenance_events: "Past services",
};

export const STATUS_LABEL: Record<RiskLevel, string> = {
  red: "Check now",
  amber: "Watch",
  green: "OK",
};
