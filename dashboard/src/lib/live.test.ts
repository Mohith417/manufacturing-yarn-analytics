import { describe, expect, it } from "vitest";
import modelJson from "../../public/data/model_coefficients.json";
import machinesJson from "../../public/data/machine_risk.json";
import type { MachineRisk, ModelCoefficients } from "./data";
import { scoreFleet, seedFeatures, stepFleet } from "./live";

const model = modelJson as ModelCoefficients;
const machines = machinesJson as MachineRisk[];

/** A small deterministic generator, so a failing run can be repeated. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("live feed simulator", () => {
  it("starts every machine from its exported reading without sharing objects", () => {
    const seededFeatures = seedFeatures(machines);
    expect(Object.keys(seededFeatures)).toHaveLength(machines.length);
    expect(seededFeatures.M013).toEqual(machines.find((m) => m.machine_id === "M013")?.features);
    seededFeatures.M013.vibration_mm_s = 99;
    expect(machines.find((m) => m.machine_id === "M013")?.features.vibration_mm_s).not.toBe(99);
  });

  it("keeps drifted readings inside the simulator's bounds and leaves the input alone", () => {
    const start = seedFeatures(machines);
    const snapshot = JSON.stringify(start);
    let current = start;
    const rng = seeded(7);
    for (let i = 0; i < 200; i += 1) {
      current = stepFleet(current, machines, rng);
    }
    expect(JSON.stringify(start)).toBe(snapshot);

    for (const features of Object.values(current)) {
      expect(features.operating_hours).toBeGreaterThanOrEqual(0);
      expect(features.operating_hours).toBeLessThanOrEqual(24);
      expect(features.temperature_c).toBeGreaterThanOrEqual(40);
      expect(features.temperature_c).toBeLessThanOrEqual(130);
      expect(features.vibration_mm_s).toBeGreaterThanOrEqual(0.1);
      expect(features.vibration_mm_s).toBeLessThanOrEqual(30);
      expect(Number.isInteger(features.days_since_maintenance)).toBe(true);
      expect(features.past_maintenance_events).toBeGreaterThanOrEqual(0);
    }
  });

  it("scores a whole batch with the saved model", () => {
    const features = stepFleet(seedFeatures(machines), machines, seeded(11));
    const batch = scoreFleet(features, machines, model, { red_at: 0.7, amber_at: 0.4 }, "2026-11-28T10:00:00Z");
    expect(batch).toHaveLength(machines.length);
    batch.forEach((reading) => {
      expect(reading.risk).toBeGreaterThan(0);
      expect(reading.risk).toBeLessThan(1);
      expect(reading.timestamp).toBe("2026-11-28T10:00:00Z");
      expect(["green", "amber", "red"]).toContain(reading.status);
      // A wholly healthy reading can have no driver at all; every driver that
      // is reported carries its value and unit.
      reading.factors.forEach((factor) => {
        expect(factor).toMatch(/\d/);
        expect(factor).toMatch(/mm\/s|day|event|°C|\by\b|\bh\b/);
      });
    });
    expect(batch.some((reading) => reading.factors.length > 0)).toBe(true);
  });
});
