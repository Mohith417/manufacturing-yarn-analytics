import { beforeEach, describe, expect, it } from "vitest";
import machinesJson from "../../public/data/machine_risk.json";
import modelJson from "../../public/data/model_coefficients.json";
import type { MachineRisk, ModelCoefficients } from "./data";
import {
  appendReadings,
  clearStoredHistory,
  historyTrend,
  loadHistory,
  seedHistory,
  type StoredReading,
} from "./history";

const machines = machinesJson as MachineRisk[];
const model = modelJson as ModelCoefficients;

/** A minimal window + localStorage, since the test runner has no DOM. */
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  },
  dispatchEvent: () => true,
};

function reading(overrides: Partial<StoredReading>): StoredReading {
  return {
    id: "r1",
    machine_id: "M001",
    risk: 0.4,
    status: "amber",
    simulated: true,
    source: "live",
    model: "logistic_regression",
    scored_at: "2026-11-28T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  store.clear();
});

describe("browser history store", () => {
  it("keeps the newest row first and drops duplicate ids", () => {
    appendReadings([reading({ id: "a" }), reading({ id: "b" })]);
    appendReadings([reading({ id: "b" }), reading({ id: "c", machine_id: "M002" })]);
    const rows = loadHistory();
    expect(rows.map((row) => row.id)).toEqual(["b", "c", "a"]);
  });

  it("groups readings into one hourly bucket with an average", () => {
    appendReadings([
      reading({ id: "a", risk: 0.2, scored_at: "2026-11-28T10:01:00.000Z" }),
      reading({ id: "b", risk: 0.4, scored_at: "2026-11-28T10:59:00.000Z" }),
      reading({ id: "c", risk: 0.6, scored_at: "2026-11-28T09:30:00.000Z" }),
    ]);
    // The window is relative to now, so build it from the newest stored hour.
    const buckets = historyTrend(loadHistory(), 24 * 365 * 100);
    expect(buckets).toHaveLength(2);
    // Oldest hour first: the single 09:00 reading, then both 10:00 readings.
    expect(buckets[0].count).toBe(1);
    expect(buckets[0].avg_risk).toBeCloseTo(0.6, 6);
    expect(buckets[1].count).toBe(2);
    expect(buckets[1].avg_risk).toBeCloseTo(0.3, 6);
  });

  it("clears every stored row and reports how many went", () => {
    appendReadings([reading({ id: "a" }), reading({ id: "b" })]);
    expect(clearStoredHistory()).toBe(2);
    expect(loadHistory()).toHaveLength(0);
  });

  it("seeds 24 hours of scored readings once, then leaves it alone", () => {
    const written = seedHistory(machines, model, { red_at: 0.7, amber_at: 0.4 });
    expect(written).toBe(24 * machines.length);
    expect(historyTrend(loadHistory(), 24 * 365 * 100)).toHaveLength(24);
    // A second visit must not double the store.
    expect(seedHistory(machines, model, null)).toBe(0);
  });
});
