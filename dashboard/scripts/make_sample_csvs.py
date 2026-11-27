"""Write the upload page's sample CSVs.

Every value is synthetic and derived from the exported machine snapshot, with
its own random seed (7) so it is not a copy of the training split. The four
files exist so a visitor, and the test suite, can exercise both the happy path
and the three failure reports without inventing a file.

    python dashboard/scripts/make_sample_csvs.py
"""

import csv
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "samples"
SNAPSHOT = ROOT / "public" / "data" / "machine_risk.json"

COLUMNS = [
    "timestamp",
    "machine_id",
    "machine_age_years",
    "operating_hours",
    "temperature_c",
    "vibration_mm_s",
    "days_since_maintenance",
    "past_maintenance_events",
]


def main() -> None:
    machines = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    rng = np.random.default_rng(7)
    OUT.mkdir(parents=True, exist_ok=True)

    rows = []
    for index, machine in enumerate(sorted(machines, key=lambda row: row["machine_id"])):
        features = machine["features"]
        rows.append(
            {
                "timestamp": f"2024-12-01T{6 + index % 12:02d}:{(index * 7) % 60:02d}:00",
                "machine_id": machine["machine_id"],
                "machine_age_years": round(float(features["machine_age_years"]), 1),
                "operating_hours": round(
                    float(np.clip(features["operating_hours"] + rng.normal(0, 2.5), 0, 24)), 2
                ),
                "temperature_c": round(
                    float(features["temperature_c"] + rng.normal(0, 1.8)), 2
                ),
                "vibration_mm_s": round(
                    float(np.clip(features["vibration_mm_s"] + rng.normal(0, 0.25), 0.1, None)), 3
                ),
                "days_since_maintenance": int(
                    np.clip(features["days_since_maintenance"] + rng.integers(-4, 5), 0, 365)
                ),
                "past_maintenance_events": int(
                    max(0, features["past_maintenance_events"] + rng.integers(-1, 2))
                ),
            }
        )

    def write(name: str, header: list[str], data: list[dict]) -> None:
        path = OUT / name
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=header, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(data)
        print(f"wrote {path.relative_to(ROOT.parent)} ({len(data)} rows)")

    write("sample_ok.csv", COLUMNS, rows)

    # 1. A required column is gone entirely.
    write("bad_missing_column.csv", [column for column in COLUMNS if column != "vibration_mm_s"], rows)

    # 2. Five rows carry an empty required cell (one per column, spread out).
    empty = [dict(row) for row in rows]
    for offset, column in enumerate(
        ["temperature_c", "vibration_mm_s", "days_since_maintenance", "operating_hours", "machine_id"]
    ):
        empty[offset * 9 + 2][column] = ""
    write("bad_empty_cells.csv", COLUMNS, empty)

    # 3. Four rows carry text where a number belongs.
    text = [dict(row) for row in rows]
    text[1]["temperature_c"] = "hot"
    text[4]["vibration_mm_s"] = "n/a"
    text[7]["days_since_maintenance"] = "twelve"
    text[11]["machine_age_years"] = ""
    write("bad_text_values.csv", COLUMNS, text)


if __name__ == "__main__":
    main()
