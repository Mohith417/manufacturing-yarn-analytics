import { FEATURE_LABELS, type ModelCoefficients, type RiskLevel, type RiskRule } from "./data";
import { contributions } from "./derive";
import { riskLevel, scoreRisk } from "./risk";
import type { ParsedReading } from "./csv";

export interface ScoredReading {
  /** Unique within the result table: machine id for latest, line number for all rows. */
  key: string;
  machineId: string;
  line: number;
  timestamp: string | null;
  features: Record<string, number>;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

const DEFAULT_RULE: RiskRule = { red_at: 0.7, amber_at: 0.4 };

function plainFactor(key: string): string {
  return (FEATURE_LABELS[key] ?? key).toLowerCase();
}

/**
 * Plain words for the three readings pushing this row's score up the most.
 * A contribution is signed, so a large negative coefficient is reported as a
 * low reading that is protecting the machine, never as a reason to check it.
 */
export function whyThisScore(
  features: Record<string, number>,
  model: ModelCoefficients,
): string[] {
  const ranked = contributions(features, model);
  const rising = ranked.filter((item) => item.value > 0).slice(0, 3);
  if (rising.length === 0) {
    return ["No single reading stands out"];
  }
  return rising.map((item) => {
    const label = plainFactor(item.key);
    const value = features[item.key];
    const mean = model.means[model.features.indexOf(item.key)] ?? 0;
    const direction = value >= mean ? "above" : "below";
    return `${label} ${direction} the fleet average`;
  });
}

export function scoreReadings(
  readings: ParsedReading[],
  model: ModelCoefficients,
  rule: RiskRule | null,
): ScoredReading[] {
  const thresholds = rule ?? DEFAULT_RULE;
  return readings.map((reading) => {
    const score = scoreRisk(reading.features, model);
    return {
      key: `${reading.machineId}:${reading.line}`,
      machineId: reading.machineId,
      line: reading.line,
      timestamp: reading.timestamp,
      features: reading.features,
      score,
      level: riskLevel(score, thresholds.red_at, thresholds.amber_at),
      reasons: whyThisScore(reading.features, model),
    };
  });
}

export function countLevels(rows: ScoredReading[]): { check: number; watch: number; ok: number } {
  return rows.reduce(
    (counts, row) => {
      if (row.level === "red") {
        counts.check += 1;
      } else if (row.level === "amber") {
        counts.watch += 1;
      } else {
        counts.ok += 1;
      }
      return counts;
    },
    { check: 0, watch: 0, ok: 0 },
  );
}

/** A sentence for the top of the results, from the scored rows only. */
export function uploadHeadline(rows: ScoredReading[]): string {
  const counts = countLevels(rows);
  if (rows.length === 0) {
    return "No row in this file could be scored";
  }
  if (counts.check === 1) {
    return "1 machine in this file needs a check now";
  }
  if (counts.check > 1) {
    return `${counts.check} machines in this file need a check now`;
  }
  if (counts.watch > 0) {
    return "Nothing needs a check now, but some machines are worth watching";
  }
  return "Every machine in this file looks healthy";
}
