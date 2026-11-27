"""Load the joblib artifacts once and score readings with them."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from .config import AMBER_AT, MODEL_DIR, RED_AT

FEATURES = [
    "machine_age_years",
    "operating_hours",
    "temperature_c",
    "vibration_mm_s",
    "days_since_maintenance",
    "past_maintenance_events",
]

LABELS = {
    "machine_age_years": "Machine age",
    "operating_hours": "Operating hours",
    "temperature_c": "Temperature",
    "vibration_mm_s": "Vibration",
    "days_since_maintenance": "Days since maintenance",
    "past_maintenance_events": "Past maintenance events",
}

MODEL_FILES = {
    "logistic_regression": "logistic_regression.joblib",
    "decision_tree": "decision_tree.joblib",
    "random_forest": "random_forest.joblib",
}


def status_for(probability: float) -> str:
    if probability >= RED_AT:
        return "red"
    if probability >= AMBER_AT:
        return "amber"
    return "green"


class ModelStore:
    """The saved scikit-learn models and the metrics of the run that produced
    them. Nothing is refitted at request time."""

    def __init__(self, directory: Path = MODEL_DIR) -> None:
        self.directory = directory
        self.models: dict[str, Any] = {}
        self.metrics: dict[str, Any] = {}
        self.load()

    def load(self) -> None:
        for name, filename in MODEL_FILES.items():
            path = self.directory / filename
            if path.exists():
                self.models[name] = joblib.load(path)
        metrics_path = self.directory / "metrics_sklearn.json"
        if metrics_path.exists():
            self.metrics = json.loads(metrics_path.read_text(encoding="utf-8"))

    def available(self) -> list[str]:
        return sorted(self.models)

    def metrics_for(self, name: str) -> dict[str, Any] | None:
        for row in self.metrics.get("metrics", []):
            if row.get("model") == name:
                return row
        return None

    def factors(self, name: str, values: dict[str, float]) -> list[str]:
        """The readings pushing this score up the most, in plain words."""
        model = self.models[name]
        if name == "logistic_regression":
            coefficients = model.named_steps["model"].coef_[0]
            mean = model.named_steps["scale"].mean_
            scale = model.named_steps["scale"].scale_
            contributions = [
                float(coefficients[index] * (values[feature] - mean[index]) / scale[index])
                for index, feature in enumerate(FEATURES)
            ]
            ranked = sorted(
                zip(FEATURES, contributions), key=lambda pair: pair[1], reverse=True
            )
            return [LABELS[feature] for feature, value in ranked[:3] if value > 0]

        importances = getattr(model, "feature_importances_", None)
        if importances is None:
            return []
        ranked = sorted(zip(FEATURES, importances), key=lambda pair: pair[1], reverse=True)
        return [LABELS[feature] for feature, _value in ranked[:3]]

    def score(self, name: str, values: dict[str, float]) -> tuple[float, list[str]]:
        if name not in self.models:
            raise KeyError(name)
        matrix = np.array([[values[feature] for feature in FEATURES]], dtype=float)
        # predict_proba, never predict: the probability is what the dashboard
        # ranks on, and what a ROC-AUC must be computed from.
        probability = float(self.models[name].predict_proba(matrix)[0][1])
        return probability, self.factors(name, values)
