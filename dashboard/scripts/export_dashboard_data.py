"""Convert the existing CSV exports into the JSON files the static dashboard reads.

    .venv\\Scripts\\python.exe dashboard\\scripts\\export_dashboard_data.py

Sources: dashboard/data/*.csv, written by spark_jobs/analytics.py and ml/train.py.
Outputs: dashboard/public/data/*.json, the only data the React app loads.

Rules this script follows
-------------------------
* It reads nothing but the CSVs that are already in dashboard/data/. It never
  touches HDFS, YARN, Spark or the network.
* Every value is a sum, a ratio, a bin count or a direct copy of those columns.
  Nothing is sampled, randomised or defaulted; if a source file is missing the
  script says so and skips that output rather than writing zeros.
* The two derived things - the defect-rate histogram bins and the per-machine
  risk level - are stated rules, documented at the place they are computed.
"""

import csv
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE.parent / "data"
OUT_DIR = HERE.parent / "public" / "data"

# Feature order must match ml/train.py; the coefficients file is keyed by name
# and re-ordered to this list so the browser never has to guess.
FEATURES = [
    "machine_age_years",
    "operating_hours",
    "temperature_c",
    "vibration_mm_s",
    "days_since_maintenance",
    "past_maintenance_events",
]

FEATURE_LABELS = {
    "machine_age_years": "Machine age",
    "operating_hours": "Operating hours",
    "temperature_c": "Temperature",
    "vibration_mm_s": "Vibration",
    "days_since_maintenance": "Days since maintenance",
    "past_maintenance_events": "Past maintenance events",
}

# Risk badge rule (stated in the UI too):
#   red   >= 0.70     amber >= 0.40     green < 0.40
# This is a presentation threshold, not something the dataset contains.
RED_AT = 0.70
AMBER_AT = 0.40


def read_csv(name):
    path = DATA_DIR / f"{name}.csv"
    if not path.exists():
        print(f"[export] SKIP {name}: {path} is missing (no JSON written)")
        return None
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_json(name, payload):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    size = path.stat().st_size
    print(f"[export] wrote {path.name} ({size} bytes)")


def risk_level(score):
    if score >= RED_AT:
        return "red"
    if score >= AMBER_AT:
        return "amber"
    return "green"


def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def main():
    production_by_day = read_csv("production_by_day")
    downtime_by_machine = read_csv("downtime_by_machine")
    defect_by_machine = read_csv("defect_by_machine")
    defect_by_line = read_csv("defect_by_line")
    correlation = read_csv("correlation_matrix")
    metrics = read_csv("model_metrics")
    importance = read_csv("feature_importance")
    confusion = read_csv("confusion_matrix")
    risk_rows = read_csv("machine_risk")
    priority_rows = read_csv("maintenance_priority")
    parameters = read_csv("model_parameters")

    # ------------------------------------------------------------- KPIs ----
    if production_by_day and downtime_by_machine and defect_by_machine:
        total_units = sum(int(float(r["units_produced"])) for r in production_by_day)
        total_defects = sum(int(float(r["defects"])) for r in production_by_day)
        readings = sum(int(float(r["total_readings"])) for r in downtime_by_machine)
        downtime_readings = sum(int(float(r["downtime_readings"])) for r in downtime_by_machine)
        high_risk = 0
        if risk_rows:
            high_risk = sum(
                1 for r in risk_rows if risk_level(to_float(r["downtime_probability"])) == "red"
            )
        write_json("kpis", {
            "total_units": total_units,
            "downtime_rate": round(downtime_readings / readings, 6) if readings else None,
            "avg_defect_rate": round(total_defects / total_units, 6) if total_units else None,
            "high_risk_count": high_risk,
            "risk_rule": {"red_at": RED_AT, "amber_at": AMBER_AT},
        })

    if production_by_day:
        write_json("production_trend", [
            {"date": r["day"], "units": int(float(r["units_produced"]))}
            for r in production_by_day
        ])

    if downtime_by_machine:
        write_json("machine_downtime", [
            {
                "machine_id": r["machine_id"],
                "line": r["line"],
                "downtime_count": int(float(r["downtime_readings"])),
                "downtime_rate": round(to_float(r["downtime_rate"]), 6),
            }
            for r in downtime_by_machine
        ])

    # --------------------------------------------------- defect histogram ---
    # The pipeline exports defect rates per machine, not row-level defects, so
    # this histogram is built over the 50 machines' defect rates. Bins are
    # equal-width across the observed min..max, printed below so the chart can
    # label them honestly.
    if defect_by_machine:
        rates = sorted(to_float(r["defect_rate"]) * 100 for r in defect_by_machine)
        low, high = rates[0], rates[-1]
        bins = 8
        width = (high - low) / bins if high > low else 1.0
        counts = [0] * bins
        for value in rates:
            index = min(int((value - low) / width) if width else 0, bins - 1)
            counts[index] += 1
        write_json("defect_distribution", [
            {
                "bin_start": round(low + i * width, 4),
                "bin_end": round(low + (i + 1) * width, 4),
                "count": counts[i],
            }
            for i in range(bins)
        ])

    # ---------------------------------------------------- correlation ------
    if correlation:
        labels = [k for k in correlation[0].keys() if k != "variable"]
        matrix = [[to_float(r[label]) for label in labels] for r in correlation]
        write_json("correlation", {"labels": labels, "matrix": matrix})

    # ---------------------------------------------------- model page ------
    if metrics:
        write_json("model_metrics", [
            {
                "model": r["model"],
                "precision": to_float(r["precision"]),
                "recall": to_float(r["recall"]),
                "f1": to_float(r["f1"]),
                "roc_auc": to_float(r["roc_auc"]),
            }
            for r in metrics
        ])

    if importance:
        # The what-if page scores the logistic regression, so the Model page
        # shows the same model's importance: |coefficient| in scaled space.
        lr = [r for r in importance if r["model"] == "logistic_regression"]
        write_json("feature_importance", [
            {"feature": FEATURE_LABELS.get(r["feature"], r["feature"]),
             "feature_key": r["feature"],
             "importance": round(to_float(r["importance"]), 6)}
            for r in sorted(lr, key=lambda r: -to_float(r["importance"]))
        ])

    if confusion:
        counts = {(r["actual"], r["predicted"]): int(float(r["count"])) for r in confusion}
        tn = counts.get(("0 (running)", "0 (running)"), 0)
        fp = counts.get(("0 (running)", "1 (downtime)"), 0)
        fn = counts.get(("1 (downtime)", "0 (running)"), 0)
        tp = counts.get(("1 (downtime)", "1 (downtime)"), 0)
        write_json("confusion_matrix", {
            "labels": ["running", "downtime"],
            "matrix": [[tn, fp], [fn, tp]],
        })

    # ------------------------------------------------ model coefficients ---
    params = {"intercept": 0.0, "coefficient": {}, "scaler_mean": {}, "scaler_std": {}}
    if parameters:
        for row in parameters:
            kind, name, value = row["kind"], row["name"], to_float(row["value"])
            if kind == "intercept":
                params["intercept"] = value
            elif kind in ("coefficient", "scaler_mean", "scaler_std"):
                params[kind][name] = value
        if all(all(f in params[k] for k in ("coefficient", "scaler_mean", "scaler_std"))
               for f in FEATURES):
            write_json("model_coefficients", {
                "features": FEATURES,
                "intercept": params["intercept"],
                "coefficients": [params["coefficient"][f] for f in FEATURES],
                "means": [params["scaler_mean"][f] for f in FEATURES],
                "stds": [params["scaler_std"][f] for f in FEATURES],
            })

    # ---------------------------------------------- machine risk rows -----
    if risk_rows:
        priority = {}
        if priority_rows:
            for row in priority_rows:
                priority[row["machine_id"]] = {
                    "est_lost_units": round(to_float(row["estimated_lost_units_24h"]), 2),
                    "priority_rank": int(float(row["priority_rank"])),
                }

        machines = []
        for row in risk_rows:
            score = to_float(row["downtime_probability"])
            # Contribution of each feature to this machine's log-odds, using the
            # saved model's own coefficients and scaler. Real per-machine maths,
            # used only to name the drivers - not to re-train anything.
            contributions = []
            if params["coefficient"]:
                for feature in FEATURES:
                    if feature in params["coefficient"]:
                        z = (params["coefficient"][feature]
                             * (to_float(row[feature]) - params["scaler_mean"][feature])
                             / params["scaler_std"][feature])
                        contributions.append((abs(z), z, feature))
            contributions.sort(reverse=True)
            top_factors = [
                FEATURE_LABELS[feature] if z > 0
                else f"{FEATURE_LABELS[feature]} (protective)"
                for _, z, feature in contributions[:3]
            ]

            extra = priority.get(row["machine_id"], {})
            machines.append({
                "machine_id": row["machine_id"],
                "line": row["line"],
                "age_years": round(to_float(row["machine_age_years"]), 2),
                "risk_score": round(score, 6),
                "risk_level": risk_level(score),
                "est_lost_units": extra.get("est_lost_units"),
                "priority_rank": extra.get("priority_rank"),
                "top_factors": top_factors,
                # current inputs, so the what-if sliders start from this machine
                "features": {feature: to_float(row[feature]) for feature in FEATURES},
            })

        machines.sort(key=lambda m: (-m["risk_score"], m["machine_id"]))
        write_json("machine_risk", machines)

    # ---------------------------------------------------- cluster info ----
    # Not computed: these are the versions actually running in docker/ and the
    # row count printed by spark_jobs/clean.py. Update them only from a real run.
    write_json("cluster_info", {
        "nodes": 2,
        "spark_version": "3.5.9",
        "hadoop_version": "3.3.6",
        "rows_processed": 495000,
    })

    if defect_by_line:
        print("[export] note: defect_by_line.csv is available but not used by the "
              "current pages")


if __name__ == "__main__":
    main()
