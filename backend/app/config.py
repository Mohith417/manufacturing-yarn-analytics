"""Configuration, read from the environment with safe local defaults."""

from __future__ import annotations

import os
from pathlib import Path

MODEL_DIR = Path(os.environ.get("MODEL_DIR", Path(__file__).resolve().parents[1] / "models"))
DB_DIR = Path(os.environ.get("DB_DIR", Path(__file__).resolve().parents[1] / "db"))

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://yarnlens:yarnlens@localhost:5433/yarnlens",
)
SIMULATED_INTERVAL_SECONDS = float(os.environ.get("SIMULATED_INTERVAL_SECONDS", "3"))
HISTORY_RETENTION = int(os.environ.get("HISTORY_RETENTION", "100000"))

# The same thresholds the dashboard reads from kpis.json, so the API can return
# a status the UI shows without a second lookup.
RED_AT = float(os.environ.get("RISK_RED_AT", "0.7"))
AMBER_AT = float(os.environ.get("RISK_AMBER_AT", "0.4"))

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
