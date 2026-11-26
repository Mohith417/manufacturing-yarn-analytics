import type { MachineRisk, ModelCoefficients, RiskLevel } from "./data";

/**
 * Score the saved logistic regression in the browser.
 *
 *   z = intercept + sum_i coef_i * (x_i - mean_i) / std_i
 *   risk = 1 / (1 + exp(-z))
 *
 * ml/train.py printed `abs_diff=0.000000000` between this formula and the
 * Spark pipeline's own probability on a held-out row, so the numbers here match
 * the saved model rather than a re-fit.
 */
export function scoreRisk(
  features: Record<string, number>,
  model: ModelCoefficients,
): number {
  let z = model.intercept;
  model.features.forEach((name, index) => {
    const std = model.stds[index] || 1;
    z += model.coefficients[index] * ((features[name] - model.means[index]) / std);
  });
  return 1 / (1 + Math.exp(-z));
}

export function riskLevel(score: number, redAt = 0.7, amberAt = 0.4): RiskLevel {
  if (score >= redAt) {
    return "red";
  }
  if (score >= amberAt) {
    return "amber";
  }
  return "green";
}

/** Current inputs of one machine, as the sliders need them. */
export function baseFeatures(machine: MachineRisk): Record<string, number> {
  return { ...machine.features };
}
