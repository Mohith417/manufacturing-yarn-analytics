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
  /** One sentence per driver, for the downloaded CSV. */
  reasons: string[];
  /** The same drivers, with the reading and the fleet average kept apart. */
  drivers: Driver[];
}

/** Units and precision for each reading, so a value is never a bare number. */
const READING_FORMAT: Record<string, { unit: string; digits: number }> = {
  machine_age_years: { unit: "y", digits: 1 },
  operating_hours: { unit: "h", digits: 2 },
  temperature_c: { unit: "\u00b0C", digits: 1 },
  vibration_mm_s: { unit: "mm/s", digits: 2 },
  days_since_maintenance: { unit: "days", digits: 0 },
  past_maintenance_events: { unit: "events", digits: 0 },
};

export interface Driver {
  key: string;
  label: string;
  /** The row's reading, with its unit, e.g. "8.44 mm/s". */
  display: string;
  /** The same reading as a plain number, for sorting or exports. */
  value: number;
  /** The training-set average for this reading, formatted the same way. */
  meanDisplay: string;
  /** value / fleet average; null when the average is zero. */
  ratio: number | null;
  direction: "above" | "below";
}

function readingText(key: string, value: number): string {
  const format = READING_FORMAT[key];
  if (!format) {
    return String(value);
  }
  const unit = format.unit;
  if (unit === "days" || unit === "events") {
    const count = Math.round(value);
    const word = unit === "days" ? (count === 1 ? "day" : "days") : count === 1 ? "event" : "events";
    return `${count} ${word}`;
  }
  // Keep the decimals fixed (7.10 mm/s, not 7.1) so the chips line up.
  return `${value.toFixed(format.digits)} ${unit}`;
}

const DEFAULT_RULE: RiskRule = { red_at: 0.7, amber_at: 0.4 };

function plainFactor(key: string): string {
  return (FEATURE_LABELS[key] ?? key).toLowerCase();
}

/**
 * The readings pushing this row's score up, most influential first, each with
 * its own value and the fleet average it is being compared with. A contribution
 * is signed: a large negative coefficient means a *low* reading is what raises
 * the score, and that is reported as "below the fleet average", never as a
 * reason to expect a low value to be safe.
 */
export function driversFor(
  features: Record<string, number>,
  model: ModelCoefficients,
  count = 3,
): Driver[] {
  return contributions(features, model)
    .filter((item) => item.value > 0)
    .slice(0, count)
    .map((item) => {
      const value = features[item.key];
      const mean = model.means[model.features.indexOf(item.key)] ?? 0;
      const ratio = mean > 0 ? value / mean : null;
      return {
        key: item.key,
        label: item.label,
        display: readingText(item.key, value),
        value,
        meanDisplay: readingText(item.key, mean),
        ratio,
        direction: value >= mean ? "above" : "below",
      } satisfies Driver;
    });
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
  const drivers = driversFor(features, model);
  if (drivers.length === 0) {
    return ["No single reading stands out"];
  }
  return drivers.map((driver) => {
    const label = plainFactor(driver.key);
    if (driver.ratio === null || driver.ratio === 1) {
      return `${label} ${driver.display} \u2014 at the fleet average (${driver.meanDisplay})`;
    }
    const factor =
      driver.direction === "above"
        ? driver.ratio.toFixed(1)
        : (1 / driver.ratio).toFixed(1);
    return `${label} ${driver.display} \u2014 ${factor}\u00d7 ${driver.direction} the fleet average (${driver.meanDisplay})`;
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
      drivers: driversFor(reading.features, model),
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
