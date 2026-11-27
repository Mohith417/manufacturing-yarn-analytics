import { describe, expect, it } from "vitest";
import modelJson from "../../public/data/model_coefficients.json";
import fixtures from "./scoring.fixtures.json";
import { scoreRisk } from "./risk";
import { countLevels, scoreReadings, uploadHeadline } from "./scoring";
import type { ModelCoefficients } from "./data";

const model = modelJson as ModelCoefficients;

describe("browser scoring", () => {
  it("matches scikit-learn predict_proba on two held-out rows", () => {
    // The expected numbers were written by ml/export_sklearn_models.py from the
    // saved model, so this test is independent of the JavaScript formula.
    expect(fixtures.rows).toHaveLength(2);
    for (const row of fixtures.rows) {
      const score = scoreRisk(row.features, model);
      expect(score).toBeCloseTo(row.expected_probability, 9);
    }
  });

  it("scores the dashboard's own machine snapshot", () => {
    // M013's exported risk is 0.912224; the formula is the same one that
    // produced it, so the browser must reproduce the number.
    const score = scoreRisk(
      {
        machine_age_years: 16.6,
        operating_hours: 23.91,
        temperature_c: 74.12,
        vibration_mm_s: 8.435,
        days_since_maintenance: 135,
        past_maintenance_events: 2,
      },
      model,
    );
    expect(score).toBeCloseTo(0.912224, 6);
  });
});

describe("scoreReadings", () => {
  it("ranks rows, assigns a status from the app's thresholds and explains why", () => {
    const rows = scoreReadings(
      [
        {
          line: 2,
          machineId: "M013",
          timestamp: null,
          features: {
            machine_age_years: 16.6,
            operating_hours: 23.91,
            temperature_c: 74.12,
            vibration_mm_s: 8.435,
            days_since_maintenance: 135,
            past_maintenance_events: 2,
          },
        },
        {
          line: 3,
          machineId: "M001",
          timestamp: null,
          features: {
            machine_age_years: 2,
            operating_hours: 8,
            temperature_c: 70,
            vibration_mm_s: 1.2,
            days_since_maintenance: 4,
            past_maintenance_events: 4,
          },
        },
      ],
      model,
      { red_at: 0.7, amber_at: 0.4 },
    );

    expect(rows[0].machineId).toBe("M013");
    expect(rows[0].level).toBe("red");
    expect(rows[1].level).not.toBe("red");
    expect(rows[0].reasons.length).toBeGreaterThan(0);
    expect(rows[0].reasons[0]).toMatch(/above|below/);

    const counts = countLevels(rows);
    expect(counts.check + counts.watch + counts.ok).toBe(2);
    expect(uploadHeadline(rows)).toMatch(/needs a check now/);
  });

  it("uses the app's default thresholds when none are supplied", () => {
    const [row] = scoreReadings(
      [
        {
          line: 2,
          machineId: "M013",
          timestamp: null,
          features: {
            machine_age_years: 16.6,
            operating_hours: 23.91,
            temperature_c: 74.12,
            vibration_mm_s: 8.435,
            days_since_maintenance: 135,
            past_maintenance_events: 2,
          },
        },
      ],
      model,
      null,
    );
    expect(row.level).toBe("red");
  });
});
