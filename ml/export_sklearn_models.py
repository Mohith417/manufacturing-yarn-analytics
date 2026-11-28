"""Train the serving models with scikit-learn and export joblib artifacts.

The features, the label and the split are the same as ml/train.py:

  * six sensor / maintenance features;
  * the label is the `downtime` flag of a reading;
  * the split is TIME BASED at 2024-10-01, never random, so the test period is
    strictly after the training period;
  * every model gets class_weight="balanced" because downtime is rare.

The metrics written here are scikit-learn metrics from this held-out run and
are labelled as such wherever they appear. They are NOT the Spark MLlib metrics
in dashboard/public/data/model_metrics.json; the two libraries split, weight and
score differently and must never be compared as if they were one number.

Run from the repository root:

    .venv/Scripts/python.exe ml/export_sklearn_models.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "manufacturing_data.csv"
SNAPSHOT = ROOT / "dashboard" / "public" / "data" / "machine_risk.json"
MODEL_DIR = ROOT / "backend" / "models"
FIXTURE = ROOT / "dashboard" / "src" / "lib" / "scoring.fixtures.json"

FEATURES = [
    "machine_age_years",
    "operating_hours",
    "temperature_c",
    "vibration_mm_s",
    "days_since_maintenance",
    "past_maintenance_events",
]
LABEL = "downtime"
CUTOFF = pd.Timestamp("2024-10-01")
SEED = 42


def build_models() -> dict[str, object]:
    return {
        "logistic_regression": Pipeline(
            [
                ("scale", StandardScaler()),
                (
                    "model",
                    LogisticRegression(
                        class_weight="balanced",
                        max_iter=1000,
                        random_state=SEED,
                    ),
                ),
            ]
        ),
        "decision_tree": DecisionTreeClassifier(
            class_weight="balanced",
            max_depth=5,
            min_samples_leaf=20,
            random_state=SEED,
        ),
        "random_forest": RandomForestClassifier(
            class_weight="balanced",
            n_estimators=120,
            max_depth=5,
            min_samples_leaf=20,
            random_state=SEED,
            n_jobs=-1,
        ),
    }


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    usecols = FEATURES + [LABEL, "timestamp", "machine_id", "line"]
    frame = pd.read_csv(DATA, usecols=usecols)
    frame = frame.dropna(subset=FEATURES + [LABEL])
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], errors="coerce")
    frame = frame.dropna(subset=["timestamp"])

    train = frame[frame["timestamp"] < CUTOFF]
    test = frame[frame["timestamp"] >= CUTOFF]
    print(f"[export] time split at {CUTOFF.date()}: train={len(train):,} test={len(test):,}")

    x_train, y_train = train[FEATURES].to_numpy(dtype=float), train[LABEL].to_numpy(dtype=int)
    x_test, y_test = test[FEATURES].to_numpy(dtype=float), test[LABEL].to_numpy(dtype=int)

    metrics = []
    for name, model in build_models().items():
        print(f"[export] fitting {name}")
        model.fit(x_train, y_train)
        # Probabilities, never hard 0/1 labels: a ROC-AUC computed from
        # argmax predictions collapses to ~0.5 by construction.
        probabilities = model.predict_proba(x_test)[:, 1]
        predictions = (probabilities >= 0.5).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_test, predictions, labels=[0, 1]).ravel()
        row = {
            "model": name,
            "precision": float(precision_score(y_test, predictions, zero_division=0)),
            "recall": float(recall_score(y_test, predictions, zero_division=0)),
            "f1": float(f1_score(y_test, predictions, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_test, probabilities)),
            "accuracy": float((predictions == y_test).mean()),
            "true_positives": int(tp),
            "false_positives": int(fp),
            "false_negatives": int(fn),
            "true_negatives": int(tn),
        }
        metrics.append(row)
        print(
            f"[export] {name}: precision={row['precision']:.4f} recall={row['recall']:.4f} "
            f"f1={row['f1']:.4f} roc_auc={row['roc_auc']:.4f}"
        )
        joblib.dump(model, MODEL_DIR / f"{name}.joblib", compress=3)

    payload = {
        "library": "scikit-learn",
        "note": (
            "Held-out metrics from ml/export_sklearn_models.py. Separate from the Spark "
            "MLlib metrics in model_metrics.json; the two are not comparable."
        ),
        "cutoff_date": CUTOFF.date().isoformat(),
        "features": FEATURES,
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "metrics": metrics,
    }
    (MODEL_DIR / "metrics_sklearn.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )
    print(f"[export] wrote {MODEL_DIR / 'metrics_sklearn.json'}")

    # Machines the simulated feed drifts from: the dashboard's own latest
    # reading per machine, so the stream starts where the static pages are.
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    machines = [
        {
            "machine_id": machine["machine_id"],
            "line": machine["line"],
            "features": {name: float(machine["features"][name]) for name in FEATURES},
        }
        for machine in sorted(snapshot, key=lambda row: row["machine_id"])
    ]
    (MODEL_DIR / "machines.json").write_text(
        json.dumps(machines, indent=2) + "\n", encoding="utf-8"
    )
    print(f"[export] wrote {MODEL_DIR / 'machines.json'} ({len(machines)} machines)")

    # Two real rows with the exported coefficients' own probabilities.
    #
    # The browser scores with dashboard/public/data/model_coefficients.json,
    # which is the Spark MLlib logistic regression. This block recomputes that
    # formula here, in Python, independently of the JavaScript, so the Vitest
    # suite proves the browser matches the artifact the dashboard actually loads.
    exported = json.loads(
        (ROOT / "dashboard" / "public" / "data" / "model_coefficients.json").read_text(
            encoding="utf-8"
        )
    )
    probe_rows = test.iloc[[0, len(test) // 2]]

    def exported_probability(values: dict[str, float]) -> float:
        z = float(exported["intercept"])
        for index, name in enumerate(exported["features"]):
            z += float(exported["coefficients"][index]) * (
                (values[name] - float(exported["means"][index]))
                / float(exported["stds"][index])
            )
        return 1.0 / (1.0 + np.exp(-z))

    expected = [
        exported_probability(
            {name: float(probe_rows.iloc[index][name]) for name in FEATURES}
        )
        for index in range(len(probe_rows))
    ]
    fixture = {
        "note": (
            "Generated by ml/export_sklearn_models.py from "
            "dashboard/public/data/model_coefficients.json (the Spark MLlib model the "
            "browser loads). Expected values are that formula computed in Python."
        ),
        "features": FEATURES,
        "rows": [
            {
                "features": {name: float(probe_rows.iloc[index][name]) for name in FEATURES},
                "expected_probability": round(float(expected[index]), 9),
            }
            for index in range(len(probe_rows))
        ],
    }
    FIXTURE.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
    print(f"[export] wrote {FIXTURE}")

    report = {row["model"]: round(row["roc_auc"], 4) for row in metrics}
    print(f"[export] ROC-AUC by model: {report}")


if __name__ == "__main__":
    main()
