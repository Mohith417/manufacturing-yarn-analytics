"""Simulated live readings.

The generator drifts each machine's latest exported reading with noise shaped
like data/generate_data.py. It is a demonstration stream: every row it writes is
flagged simulated, and the UI labels it as such.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from .config import MODEL_DIR


class Simulator:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or (MODEL_DIR / "machines.json")
        self.machines: list[dict[str, Any]] = []
        self.rng = np.random.default_rng(11)
        self.load()

    def load(self) -> None:
        if self.path.exists():
            self.machines = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            self.machines = []

    def step(self) -> list[dict[str, Any]]:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        readings: list[dict[str, Any]] = []
        for machine in self.machines:
            features = machine["features"]
            # Bounded random walk around the machine's own latest reading.
            features["operating_hours"] = float(
                np.clip(features["operating_hours"] + self.rng.normal(0, 2.2), 0, 24)
            )
            features["temperature_c"] = float(
                np.clip(features["temperature_c"] + self.rng.normal(0, 1.1), 40, 130)
            )
            features["vibration_mm_s"] = float(
                np.clip(features["vibration_mm_s"] + self.rng.normal(0, 0.14), 0.1, 30)
            )
            if self.rng.random() < 0.06:
                features["days_since_maintenance"] = float(
                    min(3650, features["days_since_maintenance"] + 1)
                )
            if self.rng.random() < 0.004:
                # A service visit: the counter resets, as in the source data.
                features["days_since_maintenance"] = 0.0
                features["past_maintenance_events"] = float(
                    min(10000, features["past_maintenance_events"] + 1)
                )
            readings.append(
                {
                    "machine_id": machine["machine_id"],
                    "line": machine["line"],
                    "timestamp": now,
                    "features": dict(features),
                }
            )
        return readings
