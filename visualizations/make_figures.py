"""Phase 8 - the six required figures.

Local only: reads the small CSVs that the Spark jobs exported into
dashboard/data/ and writes PNGs into docs/figures/. It never touches the
cluster, and it invents no numbers - if a CSV is missing the script says so
instead of drawing a placeholder chart.

    .venv\\Scripts\\Activate.ps1
    python visualizations\\make_figures.py

Figures:
  01_production_trend.png     output over time
  02_downtime_by_machine.png  downtime per machine
  03_defect_rate_distribution.png  defect-rate spread across machines
  04_correlation_heatmap.png  operational variables
  05_feature_importance.png   what the model leans on
  06_confusion_matrix.png     held-out classification result
"""

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # no window: this must run headless and in CI

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "dashboard" / "data"
FIG_DIR = REPO_ROOT / "docs" / "figures"

plt.rcParams.update(
    {
        "figure.dpi": 130,
        "savefig.dpi": 130,
        "font.size": 10,
        "axes.titlesize": 12,
        "axes.labelsize": 10,
        "axes.grid": True,
        "grid.alpha": 0.3,
    }
)


def load(name):
    path = DATA_DIR / f"{name}.csv"
    if not path.exists():
        sys.exit(
            f"Missing {path}. Run the Spark analytics/ML jobs first "
            f"(spark_jobs/analytics.py, ml/train.py) so the CSVs exist."
        )
    return pd.read_csv(path)


def save(fig, filename):
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    out = FIG_DIR / filename
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)
    print(f"wrote {out}")


def figure_production_trend():
    df = load("production_by_day")
    df["day"] = pd.to_datetime(df["day"])

    fig, ax = plt.subplots(figsize=(10, 4.5))
    ax.plot(df["day"], df["units_produced"], linewidth=1.0, color="#1f77b4",
            label="Units produced")
    ax.set_title("Daily production output (synthetic data)")
    ax.set_xlabel("Date")
    ax.set_ylabel("Units produced per day")
    ax.legend(loc="upper left")
    save(fig, "01_production_trend.png")


def figure_downtime_by_machine():
    df = load("downtime_by_machine").sort_values("downtime_rate", ascending=False)

    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.bar(df["machine_id"], df["downtime_rate"] * 100, color="#d62728")
    ax.set_title("Downtime rate by machine (synthetic data)")
    ax.set_xlabel("Machine ID")
    ax.set_ylabel("Share of readings flagged as downtime (%)")
    ax.tick_params(axis="x", rotation=90, labelsize=7)
    save(fig, "02_downtime_by_machine.png")


def figure_defect_rate_distribution():
    df = load("defect_by_machine")

    fig, ax = plt.subplots(figsize=(8, 4.5))
    sns.histplot(df["defect_rate"] * 100, bins=15, ax=ax, color="#2ca02c")
    ax.set_title("Distribution of per-machine defect rates (synthetic data)")
    ax.set_xlabel("Defect rate (%)")
    ax.set_ylabel("Number of machines")
    save(fig, "03_defect_rate_distribution.png")


def figure_correlation_heatmap():
    df = load("correlation_matrix").set_index("variable")

    fig, ax = plt.subplots(figsize=(8, 6.5))
    sns.heatmap(df, annot=True, fmt=".2f", cmap="coolwarm", center=0,
                vmin=-1, vmax=1, square=True, cbar_kws={"label": "Pearson r"}, ax=ax)
    ax.set_title("Correlation between operational variables (synthetic data)")
    ax.set_xlabel("")
    ax.set_ylabel("")
    save(fig, "04_correlation_heatmap.png")


def figure_feature_importance():
    df = load("feature_importance")
    # Tree importances are comparable to each other; Logistic Regression
    # coefficients are a different scale, so plot the Random Forest only and
    # keep the CSV complete for the report.
    df = df[df["model"] == "random_forest"].sort_values("importance")

    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.barh(df["feature"], df["importance"], color="#9467bd")
    ax.set_title("Random Forest feature importance for predicting downtime")
    ax.set_xlabel("Importance (sums to 1 within the model)")
    ax.set_ylabel("Feature")
    save(fig, "05_feature_importance.png")


def figure_confusion_matrix():
    df = load("confusion_matrix")
    pivot = df.pivot(index="actual", columns="predicted", values="count")

    fig, ax = plt.subplots(figsize=(6, 4.5))
    sns.heatmap(pivot, annot=True, fmt=",d", cmap="Blues", ax=ax)
    ax.set_title("Confusion matrix on the held-out period")
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    save(fig, "06_confusion_matrix.png")


def main():
    figure_production_trend()
    figure_downtime_by_machine()
    figure_defect_rate_distribution()
    figure_correlation_heatmap()
    figure_feature_importance()
    figure_confusion_matrix()
    print("all six figures written to docs/figures/")


if __name__ == "__main__":
    main()
