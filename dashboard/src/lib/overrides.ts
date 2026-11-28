/**
 * What-if changes that a visitor decides to keep.
 *
 * `public/data/machine_risk.json` is an export from the Spark pipeline and is
 * never rewritten. A kept change lives in localStorage instead, and is marked
 * `simulated` everywhere it is shown: it is a condition a person typed into the
 * sliders, scored by the saved model, not a reading the cluster produced.
 */
import type { MachineRisk, ModelCoefficients, RiskLevel } from "./data";
import { contributions } from "./derive";

const KEY = "yarnlens.overrides.v1";

/** Fired in this tab after a write; `storage` covers the other tabs. */
export const OVERRIDE_EVENT = "yarnlens:overrides";

export interface MachineOverride {
  features: Record<string, number>;
  risk_score: number;
  risk_level: RiskLevel;
  applied_at: string;
}

export type OverrideMap = Record<string, MachineOverride>;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isLevel(value: unknown): value is RiskLevel {
  return value === "green" || value === "amber" || value === "red";
}

export function readOverrides(): OverrideMap {
  const store = storage();
  if (!store) {
    return {};
  }
  try {
    const raw = store.getItem(KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const result: OverrideMap = {};
    for (const [machineId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = value as Partial<MachineOverride> | null;
      if (!entry || typeof entry !== "object" || !entry.features) {
        continue;
      }
      if (typeof entry.risk_score !== "number" || !isLevel(entry.risk_level)) {
        continue;
      }
      const features: Record<string, number> = {};
      for (const [name, reading] of Object.entries(entry.features)) {
        if (typeof reading === "number" && Number.isFinite(reading)) {
          features[name] = reading;
        }
      }
      result[machineId] = {
        features,
        risk_score: entry.risk_score,
        risk_level: entry.risk_level,
        applied_at:
          typeof entry.applied_at === "string" ? entry.applied_at : new Date().toISOString(),
      };
    }
    return result;
  } catch {
    return {};
  }
}

function write(map: OverrideMap): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    if (Object.keys(map).length === 0) {
      store.removeItem(KEY);
    } else {
      store.setItem(KEY, JSON.stringify(map));
    }
  } catch {
    // A full or blocked localStorage only loses the kept change, not the app.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OVERRIDE_EVENT));
  }
}

/** Keep the sliders' values as this machine's condition and state. */
export function applyOverride(
  machineId: string,
  features: Record<string, number>,
  score: number,
  level: RiskLevel,
): void {
  const map = readOverrides();
  map[machineId] = {
    features: { ...features },
    risk_score: score,
    risk_level: level,
    applied_at: new Date().toISOString(),
  };
  write(map);
}

/** Forget a kept change and show the exported reading again. */
export function clearOverride(machineId: string): void {
  const map = readOverrides();
  if (!(machineId in map)) {
    return;
  }
  delete map[machineId];
  write(map);
}

/** Clear every kept change; returns how many were removed. */
export function clearAllOverrides(): number {
  const map = readOverrides();
  const count = Object.keys(map).length;
  write({});
  return count;
}

/**
 * The fleet as it should be shown: exported rows, with kept changes on top.
 * The main driver is recomputed so a changed machine explains its new score.
 */
export function withOverrides(
  machines: MachineRisk[],
  model: ModelCoefficients | null,
): MachineRisk[] {
  const map = readOverrides();
  if (Object.keys(map).length === 0) {
    return machines;
  }
  return machines.map((machine) => {
    const override = map[machine.machine_id];
    if (!override) {
      return machine;
    }
    const features = { ...machine.features, ...override.features };
    const topFactors = model
      ? contributions(features, model)
          .filter((item) => item.value > 0)
          .slice(0, 3)
          .map((item) => item.label)
      : machine.top_factors;
    return {
      ...machine,
      features,
      risk_score: override.risk_score,
      risk_level: override.risk_level,
      top_factors: topFactors,
      simulated: true,
      applied_at: override.applied_at,
    };
  });
}
