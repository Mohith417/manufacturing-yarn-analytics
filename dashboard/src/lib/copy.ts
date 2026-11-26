/**
 * All plain-language copy lives here so the wording is consistent and the
 * "check this" advice stays a rule of thumb rather than a diagnosis. None of
 * these strings contains a number: figures are always passed in from the JSON.
 */

export const RULE_OF_THUMB_NOTE = "Rule of thumb, not a diagnosis.";

interface FactorMeta {
  /** Lower-case words used inside generated sentences. */
  plain: string;
  /** What a supervisor can physically check for this factor. */
  check: string;
}

const FACTOR_META: Record<string, FactorMeta> = {
  vibration_mm_s: {
    plain: "vibration",
    check: "Inspect the bearings and check that the machine is mounted firmly.",
  },
  days_since_maintenance: {
    plain: "days since maintenance",
    check: "Book the overdue service and check the lubrication schedule.",
  },
  machine_age_years: {
    plain: "machine age",
    check: "Look at wear parts first: belts, seals and bearings.",
  },
  temperature_c: {
    plain: "temperature",
    check: "Check cooling, airflow and lubrication around the motor.",
  },
  operating_hours: {
    plain: "operating hours",
    check: "Review the load and shift pattern, and allow a rest period if you can.",
  },
  past_maintenance_events: {
    plain: "past maintenance events",
    check: "Read the last repair reports and look for a repeat fault.",
  },
};

const ALIASES: Record<string, string> = {
  vibration: "vibration_mm_s",
  "days since maintenance": "days_since_maintenance",
  "days since maintenance (protective)": "days_since_maintenance",
  "machine age": "machine_age_years",
  temperature: "temperature_c",
  "operating hours": "operating_hours",
  "past maintenance events": "past_maintenance_events",
};

/** Map a display name from machine_risk.json's top_factors to a feature key. */
export function factorKey(name: string): string | null {
  const clean = name.trim().toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim();
  if (FACTOR_META[clean]) {
    return clean;
  }
  return ALIASES[clean] ?? ALIASES[name.trim().toLowerCase()] ?? null;
}

/** "Vibration" or "Days since maintenance (protective)" -> "vibration". */
export function factorPlain(name: string): string {
  const key = factorKey(name);
  if (key) {
    return FACTOR_META[key].plain;
  }
  return name.trim().toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim();
}

/** Rule-of-thumb physical check for a factor, or null when unmapped. */
export function factorCheck(name: string): string | null {
  const key = factorKey(name);
  return key ? FACTOR_META[key].check : null;
}

export type GlossaryKey =
  | "downtime"
  | "risk"
  | "precision"
  | "recall"
  | "rocAuc"
  | "correlation"
  | "defectRate";

export const GLOSSARY: Record<GlossaryKey, { term: string; definition: string }> = {
  downtime: {
    term: "downtime reading",
    definition:
      "A one-minute record where the machine was not producing. The rate is the share of readings flagged that way.",
  },
  risk: {
    term: "chance of breakdown",
    definition:
      "The model's guess, from 0% to 100%, that a machine's latest reading is a downtime reading. It ranks machines; it is not a promise.",
  },
  precision: {
    term: "precision",
    definition:
      "When the model raises an alarm, precision is the share of those alarms that turn out to be real downtime.",
  },
  recall: {
    term: "recall",
    definition:
      "Of all the real downtime readings, recall is the share the model managed to catch.",
  },
  rocAuc: {
    term: "ROC-AUC",
    definition:
      "How well the model ranks downtime above normal running, from 0.5 for guessing to 1 for perfect.",
  },
  correlation: {
    term: "correlation",
    definition:
      "A number from −1 to +1 describing how strongly two measures move together. It does not prove that one causes the other.",
  },
  defectRate: {
    term: "defect rate",
    definition: "The share of the units a machine made that had a defect.",
  },
};
