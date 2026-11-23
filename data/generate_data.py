import sys
import numpy as np
import pandas as pd

rng = np.random.default_rng(42)
N = int(sys.argv[1]) if len(sys.argv) > 1 else 500_000
N_MACHINES = 50

machines = pd.DataFrame({
    "machine_id": [f"M{i:03d}" for i in range(N_MACHINES)],
    "machine_age_years": rng.uniform(1, 20, N_MACHINES).round(1),
    "line": rng.choice(["Line_A", "Line_B", "Line_C", "Line_D"], N_MACHINES),
})

df = pd.DataFrame({
    "timestamp": pd.date_range("2024-01-01", periods=N, freq="min"),
    "machine_id": rng.choice(machines.machine_id.to_numpy(), N),
}).merge(machines, on="machine_id")

n = len(df)
df["operating_hours"] = rng.uniform(0, 24, n).round(2)
df["temperature_c"] = rng.normal(70, 10, n).round(2) + df.machine_age_years * 0.4
df["vibration_mm_s"] = rng.gamma(2.0, 1.5, n).round(3) + df.machine_age_years * 0.05
df["days_since_maintenance"] = rng.integers(0, 180, n)
df["past_maintenance_events"] = rng.poisson(3, n)
df["units_produced"] = rng.normal(500, 60, n).clip(0).round()
df["defects"] = rng.binomial(df.units_produced.astype(int), 0.02 + df.vibration_mm_s / 400)
df["defect_rate"] = (df.defects / df.units_produced.replace(0, np.nan)).round(4)

risk = (0.08 * df.machine_age_years + 0.03 * (df.temperature_c - 70)
        + 0.4 * df.vibration_mm_s + 0.012 * df.days_since_maintenance
        - 0.05 * df.past_maintenance_events)
prob = 1 / (1 + np.exp(-(risk - 6.5)))
df["downtime"] = (rng.random(n) < prob).astype(int)

for col in ["temperature_c", "vibration_mm_s", "units_produced"]:
    df.loc[df.sample(frac=0.01, random_state=1).index, col] = np.nan
df = pd.concat([df, df.sample(frac=0.005, random_state=2)])

df.to_csv("data/manufacturing_data.csv", index=False)
print(f"Wrote {len(df):,} rows. Downtime rate: {df.downtime.mean():.1%}")
