/**
 * The live feed's simulator, in the browser.
 *
 * The hosted dashboard is static, so the stream cannot come from the FastAPI
 * service. This module does what backend/app/simulator.py does, with the same
 * distributions: each machine's latest exported reading drifts by a small
 * bounded random walk, a service visit occasionally resets its day counter, and
 * the saved logistic regression scores the result. Nothing here is a
 * measurement of a real machine.
 */

import type { MachineRisk, ModelCoefficients, RiskLevel, RiskRule } from "./data";
import { riskLevel, scoreRisk } from "./risk";
import { driversFor } from "./scoring";

export interface LiveReading {
  machine_id: string;
  line: string;
  timestamp: string;
  risk: number;
  status: RiskLevel;
  /** The reading that produced the score, after this tick's drift. */
  features: Record<string, number>;
  /** "Vibration 8.58 mm/s" for the top three drivers. */
  factors: string[];
}

/** Bounds from backend/app/simulator.py, so a long session cannot run away. */
const CLIP: Record<string, [number, number]> = {
  operating_hours: [0, 24],
  temperature_c: [40, 130],
  vibration_mm_s: [0.1, 30],
};

const NOISE: Record<string, number> = {
  operating_hours: 2.2,
  temperature_c: 1.1,
  vibration_mm_s: 0.14,
};

/** Box–Muller, so a test can pass a seeded generator instead of Math.random. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) {
    u = rng();
  }
  while (v === 0) {
    v = rng();
  }
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clip(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Every machine's starting point: its latest exported reading. */
export function seedFeatures(
  machines: MachineRisk[],
): Record<string, Record<string, number>> {
  const seeded: Record<string, Record<string, number>> = {};
  machines.forEach((machine) => {
    seeded[machine.machine_id] = { ...machine.features };
  });
  return seeded;
}

/**
 * One tick: drift every machine's reading, then return the new values. The
 * input is never mutated, so a paused feed can resume from exactly where it was.
 */
export function stepFleet(
  current: Record<string, Record<string, number>>,
  machines: MachineRisk[],
  rng: () => number = Math.random,
): Record<string, Record<string, number>> {
  const next: Record<string, Record<string, number>> = {};
  machines.forEach((machine) => {
    const start = current[machine.machine_id] ?? machine.features;
    const features: Record<string, number> = { ...start };

    (Object.keys(NOISE) as string[]).forEach((key) => {
      const [low, high] = CLIP[key];
      features[key] = clip((features[key] ?? 0) + gaussian(rng) * NOISE[key], low, high);
    });

    // The counter creeps up a day at a time, and a service visit resets it.
    if (rng() < 0.06) {
      features.days_since_maintenance = Math.min(
        3650,
        Math.round(features.days_since_maintenance ?? 0) + 1,
      );
    }
    if (rng() < 0.004) {
      features.days_since_maintenance = 0;
      features.past_maintenance_events = Math.min(
        10000,
        Math.round(features.past_maintenance_events ?? 0) + 1,
      );
    }

    next[machine.machine_id] = features;
  });
  return next;
}

/** Score a whole tick with the same model the rest of the dashboard uses. */
export function scoreFleet(
  features: Record<string, Record<string, number>>,
  machines: MachineRisk[],
  model: ModelCoefficients,
  rule: RiskRule | null,
  at: string,
): LiveReading[] {
  const redAt = rule?.red_at ?? 0.7;
  const amberAt = rule?.amber_at ?? 0.4;
  return machines.map((machine) => {
    const reading = features[machine.machine_id] ?? machine.features;
    const risk = scoreRisk(reading, model);
    return {
      machine_id: machine.machine_id,
      line: machine.line,
      timestamp: at,
      risk,
      status: riskLevel(risk, redAt, amberAt),
      features: reading,
      factors: driversFor(reading, model).map(
        (driver) => `${driver.label} ${driver.display}`,
      ),
    };
  });
}
