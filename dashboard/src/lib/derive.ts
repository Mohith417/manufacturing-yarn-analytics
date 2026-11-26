import type {
  Correlation,
  DefectBin,
  MachineDowntime,
  MachineRisk,
  ModelCoefficients,
  TrendPoint,
} from "./data";
import { FEATURE_LABELS, formatInt, formatPct } from "./data";
import { factorCheck, factorPlain } from "./copy";

/** Trailing mean for every index; the first `window - 1` entries are null. */
export function movingAverage(
  values: number[],
  window: number,
): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= window) {
      sum -= values[i - window];
    }
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

export interface WeekOverWeek {
  recent: number;
  previous: number;
  changePct: number;
}

/** Mean daily output of the final 7 days vs the 7 days before them. */
export function weekOverWeek(points: TrendPoint[]): WeekOverWeek | null {
  if (points.length < 14) {
    return null;
  }
  const tail = points.slice(-14);
  const mean = (rows: TrendPoint[]) =>
    rows.reduce((total, row) => total + row.units, 0) / rows.length;
  const previous = mean(tail.slice(0, 7));
  const recent = mean(tail.slice(7));
  if (previous === 0) {
    return null;
  }
  return { recent, previous, changePct: (recent - previous) / previous };
}

export interface LineSummary {
  line: string;
  machines: number;
  downtimeCount: number;
  meanRate: number;
}

/** Aggregate the per-machine downtime rows into one row per production line. */
export function byLine(rows: MachineDowntime[]): LineSummary[] {
  const map = new Map<string, { machines: number; count: number; rate: number }>();
  rows.forEach((row) => {
    const entry = map.get(row.line) ?? { machines: 0, count: 0, rate: 0 };
    entry.machines += 1;
    entry.count += row.downtime_count;
    entry.rate += row.downtime_rate;
    map.set(row.line, entry);
  });
  return [...map.entries()]
    .map(([line, entry]) => ({
      line,
      machines: entry.machines,
      downtimeCount: entry.count,
      meanRate: entry.rate / entry.machines,
    }))
    .sort((a, b) => b.meanRate - a.meanRate);
}

/** Machines grouped by line, each group sorted by machine ID. */
export function byLineGrouped(
  machines: MachineRisk[],
): { line: string; machines: MachineRisk[] }[] {
  const map = new Map<string, MachineRisk[]>();
  machines.forEach((machine) => {
    const list = map.get(machine.line) ?? [];
    list.push(machine);
    map.set(machine.line, list);
  });
  return [...map.entries()]
    .map(([line, rows]) => ({
      line,
      machines: [...rows].sort((a, b) => a.machine_id.localeCompare(b.machine_id)),
    }))
    .sort((a, b) => a.line.localeCompare(b.line));
}

export interface StatusCounts {
  ok: number;
  watch: number;
  check: number;
  total: number;
}

export function statusCounts(machines: MachineRisk[]): StatusCounts {
  return machines.reduce<StatusCounts>(
    (counts, machine) => {
      if (machine.risk_level === "red") {
        counts.check += 1;
      } else if (machine.risk_level === "amber") {
        counts.watch += 1;
      } else {
        counts.ok += 1;
      }
      counts.total += 1;
      return counts;
    },
    { ok: 0, watch: 0, check: 0, total: 0 },
  );
}

export function topByRisk(machines: MachineRisk[], count: number): MachineRisk[] {
  return [...machines]
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, count);
}

/** "a", "a and b", "a, b and c". */
export function joinWords(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** One sentence with the figures filled in from machine_risk.json. */
export function machineSentence(machine: MachineRisk): string {
  const chance = Math.round(machine.risk_score * 100);
  const drivers = machine.top_factors.slice(0, 2).map(factorPlain);
  const driverText =
    drivers.length > 0
      ? `Main drivers: ${joinWords(drivers)}.`
      : "No single driver stands out.";
  return `${machine.machine_id} has a ${chance}% chance of being in downtime, based on its latest reading. ${driverText}`;
}

export function leadFactor(machine: MachineRisk): string {
  if (machine.top_factors.length === 0) {
    return "No single driver stands out";
  }
  return machine.top_factors[0].replace(/\s*\(.*?\)\s*/g, "").trim();
}

export function leadCheck(machine: MachineRisk): string | null {
  return machine.top_factors.length > 0 ? factorCheck(machine.top_factors[0]) : null;
}

export interface Contribution {
  key: string;
  label: string;
  /** Signed addend to the log-odds (coefficient × standardized value). */
  value: number;
}

/** Signed log-odds contribution of every model feature for one machine. */
export function contributions(
  features: Record<string, number>,
  model: ModelCoefficients,
): Contribution[] {
  return model.features
    .map((key, index) => {
      const std = model.stds[index] || 1;
      return {
        key,
        label: FEATURE_LABELS[key] ?? key,
        value:
          model.coefficients[index] * ((features[key] - model.means[index]) / std),
      };
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/**
 * The dataset stops mid-day on its final date, so that row is not comparable
 * with a complete day. Every average and comparison uses the rows before it.
 */
export function completeDays(points: TrendPoint[]): TrendPoint[] {
  if (points.length < 3) {
    return points;
  }
  const earlier = points.slice(0, -1).map((point) => point.units);
  const median = [...earlier].sort((a, b) => a - b)[Math.floor(earlier.length / 2)];
  const last = points[points.length - 1].units;
  return median > 0 && last < median * 0.5 ? points.slice(0, -1) : points;
}

/** Plain-English reading of the production export. */
export function productionReading(points: TrendPoint[]): string {
  const complete = completeDays(points);
  const wow = weekOverWeek(complete);
  if (!wow) {
    return "Not enough complete days are exported yet to compare one week with the next.";
  }
  const direction = wow.changePct >= 0 ? "up" : "down";
  return `The last 7 complete days average ${formatInt(wow.recent)} units a day, ${direction} ${Math.abs(
    wow.changePct * 100,
  ).toFixed(1)}% on the 7 days before.`;
}

/** Plain-English reading of the fleet downtime export. */
export function downtimeReading(
  rows: MachineDowntime[],
  fleetRate: number | null | undefined,
): string {
  if (rows.length === 0) {
    return "No per-machine downtime rows are exported yet.";
  }
  const lines = byLine(rows);
  const worst = lines[0];
  const fleet = fleetRate ?? rows.reduce((total, row) => total + row.downtime_rate, 0) / rows.length;
  return `${formatPct(fleet, 1)} of one-minute readings are flagged as downtime. ${worst.line.replace(
    "_",
    " ",
  )} runs highest at ${formatPct(worst.meanRate, 1)}.`;
}

/** Plain-English reading of the defect-rate distribution. */
export function defectReading(bins: DefectBin[]): string {
  if (bins.length === 0) {
    return "No defect-rate rows are exported yet.";
  }
  const peak = bins.reduce((best, bin) => (bin.count > best.count ? bin : best), bins[0]);
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  return `${peak.count} of ${total} machines sit in the ${peak.bin_start.toFixed(
    2,
  )}% to ${peak.bin_end.toFixed(2)}% range — the most common band.`;
}

export interface StrongestPair {
  a: string;
  b: string;
  value: number;
}

/** Strongest off-diagonal Pearson pair in the exported matrix. */
export function strongestPair(data: Correlation | null): StrongestPair | null {
  if (!data) {
    return null;
  }
  let best: StrongestPair | null = null;
  for (let i = 0; i < data.labels.length; i += 1) {
    for (let j = i + 1; j < data.labels.length; j += 1) {
      const value = data.matrix[i][j];
      if (!best || Math.abs(value) > Math.abs(best.value)) {
        best = { a: data.labels[i], b: data.labels[j], value };
      }
    }
  }
  return best;
}
