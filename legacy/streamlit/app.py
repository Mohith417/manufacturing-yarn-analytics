"""Phase 9 - Streamlit dashboard (legacy prototype).

Superseded by the React front end in dashboard/ and kept for reference.

Runs on Windows with the local venv and NO cluster:

    .venv\\Scripts\\Activate.ps1
    streamlit run legacy\\streamlit\\app.py

It reads only the small CSVs in dashboard/data/, which the Spark jobs exported
from HDFS. The dashboard must never talk to HDFS/YARN - if the cluster is off,
every page here still works.
"""

import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
import streamlit as st

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "dashboard" / "data"

st.set_page_config(page_title="Manufacturing Analytics (YARN)", layout="wide")


@st.cache_data(show_spinner=False)
def load(name):
    path = DATA_DIR / f"{name}.csv"
    if not path.exists():
        return None
    return pd.read_csv(path)


def missing_notice(what):
    st.warning(
        f"{what} not found in dashboard/data/. Run the Spark jobs and let them "
        f"export their CSVs first."
    )


production_by_day = load("production_by_day")
downtime_by_machine = load("downtime_by_machine")
defect_by_machine = load("defect_by_machine")
defect_by_line = load("defect_by_line")
correlation = load("correlation_matrix")
importance = load("feature_importance")
confusion = load("confusion_matrix")
metrics = load("model_metrics")
risk = load("machine_risk")
priority = load("maintenance_priority")
model_parameters = load("model_parameters")

# Feature order used by the model; exported with the parameters so this list
# can never silently drift from ml/train.py without an obvious mismatch.
FEATURES = [
    "machine_age_years",
    "operating_hours",
    "temperature_c",
    "vibration_mm_s",
    "days_since_maintenance",
    "past_maintenance_events",
]


def as_parameters(frame):
    """Reshape model_parameters.csv into the structure the scorer needs.

    The file is written by ml/train.py from the FITTED logistic-regression
    pipeline: coefficient per feature, the scaler's mean/std, and the intercept.
    Scoring with these reproduces the saved model exactly (train.py prints the
    absolute difference between this formula and the pipeline on a held-out row).
    """
    if frame is None:
        return None
    params = {"intercept": 0.0, "coefficient": {}, "scaler_mean": {}, "scaler_std": {}}
    for row in frame.itertuples(index=False):
        if row.kind == "intercept":
            params["intercept"] = float(row.value)
        else:
            params[row.kind][row.name] = float(row.value)
    missing = [f for f in FEATURES
               if f not in params["coefficient"]
               or f not in params["scaler_mean"]
               or f not in params["scaler_std"]]
    if missing:
        st.error(f"model_parameters.csv is missing entries for: {', '.join(missing)}")
        return None
    return params


MODEL_PARAMS = as_parameters(model_parameters)


def risk_score(features, params):
    """Probability of downtime for one feature dict (scaled linear model)."""
    z = params["intercept"]
    for name in FEATURES:
        z += (params["coefficient"][name]
              * (features[name] - params["scaler_mean"][name])
              / params["scaler_std"][name])
    return 1.0 / (1.0 + math.exp(-z))

st.title("Manufacturing Data Analytics: A YARN Approach")
st.caption(
    "HDFS storage -> Spark on YARN processing -> Hive SQL -> this dashboard. "
    "The dashboard reads exported result files only; it has no connection to the cluster."
)

st.error(
    "DATA IS SYNTHETIC. Every row was produced by data/generate_data.py. "
    "These are not measurements from real machines and nothing here validates "
    "real-world performance.",
    icon="⚠️",
)

if production_by_day is None or downtime_by_machine is None or defect_by_machine is None:
    missing_notice("The analytics exports")
    st.stop()

# ------------------------------------------------------------------ KPIs ----
total_units = int(production_by_day["units_produced"].sum())
total_defects = int(production_by_day["defects"].sum())

col1, col2, col3, col4 = st.columns(4)
col1.metric("Total units produced", f"{total_units:,}")
col2.metric(
    "Downtime rate",
    f"{(downtime_by_machine['downtime_readings'].sum() / downtime_by_machine['total_readings'].sum()) * 100:.2f} %",
)
col3.metric("Average defect rate", f"{(total_defects / total_units) * 100:.2f} %")
col4.metric("Machines tracked", f"{downtime_by_machine['machine_id'].nunique()}")

st.divider()

# ------------------------------------------------------------- machine -----
st.subheader("Machine explorer")
machines = sorted(risk["machine_id"].unique()) if risk is not None else \
    sorted(downtime_by_machine["machine_id"].unique())
selected = st.selectbox("Select a machine", machines)

dow = downtime_by_machine[downtime_by_machine["machine_id"] == selected].iloc[0]
st.write(
    f"**{selected}** — line {dow['line']}: "
    f"{dow['downtime_rate'] * 100:.2f} % of readings flagged as downtime "
    f"({int(dow['downtime_readings']):,} of {int(dow['total_readings']):,})."
)

if risk is not None:
    row = risk[risk["machine_id"] == selected].iloc[0]
    st.metric(
        "Predicted downtime risk (most recent reading)",
        f"{row['downtime_probability'] * 100:.1f} %",
        help="Model probability that this machine's latest observed reading is a downtime reading.",
    )
    st.caption(f"Scored at {row['scored_at']}.")

if defect_by_machine is not None:
    drow = defect_by_machine[defect_by_machine["machine_id"] == selected].iloc[0]
    st.write(
        f"Defect rate {drow['defect_rate'] * 100:.2f} % "
        f"({int(drow['defects']):,} defects in {int(drow['units_produced']):,} units)."
    )

st.divider()

# ------------------------------------------------- what-if simulator -----
st.subheader("What-if risk simulator")
if MODEL_PARAMS is None or risk is None:
    missing_notice("model_parameters and machine_risk")
else:
    st.caption(
        f"Scores the saved logistic-regression model for **{selected}** while you move "
        "three inputs. The other three features (machine age, operating hours, "
        "maintenance history) stay at this machine's current values."
    )
    current_row = risk[risk["machine_id"] == selected].iloc[0]
    current = {feature: float(current_row[feature]) for feature in FEATURES}

    col_days, col_temp, col_vib = st.columns(3)
    days = col_days.slider(
        "Days since maintenance", min_value=0, max_value=200,
        value=int(round(current["days_since_maintenance"])),
        help="Days since the last maintenance event.",
    )
    temperature = col_temp.slider(
        "Temperature (\u00b0C)", min_value=40.0, max_value=110.0,
        value=float(round(current["temperature_c"], 1)), step=0.1,
    )
    vibration = col_vib.slider(
        "Vibration (mm/s)", min_value=0.0, max_value=10.0,
        value=float(round(current["vibration_mm_s"], 2)), step=0.01,
    )

    simulated = dict(current)
    simulated.update(
        days_since_maintenance=float(days),
        temperature_c=float(temperature),
        vibration_mm_s=float(vibration),
    )

    base_probability = risk_score(current, MODEL_PARAMS)
    simulated_probability = risk_score(simulated, MODEL_PARAMS)

    col_before, col_after = st.columns(2)
    col_before.metric("Current risk (this machine now)", f"{base_probability * 100:.1f} %")
    col_after.metric(
        "Simulated risk",
        f"{simulated_probability * 100:.1f} %",
        delta=f"{(simulated_probability - base_probability) * 100:+.1f} pp",
        delta_color="inverse",
    )
    threshold = 0.5
    st.caption(
        f"At the model's {threshold:.1f} decision threshold this machine would be "
        f"flagged **{'yes' if simulated_probability >= threshold else 'no'}** "
        "under the simulated values. These are model outputs on synthetic data, "
        "not a validated maintenance recommendation."
    )

st.divider()

# -------------------------------------------------- maintenance priority --
st.subheader("Maintenance priority list")
if priority is None:
    missing_notice("maintenance_priority")
else:
    shown = priority.head(10).copy()
    shown["downtime_probability"] = (shown["downtime_probability"] * 100).round(1)
    shown["estimated_lost_units_24h"] = shown["estimated_lost_units_24h"].round(0)
    st.dataframe(shown, hide_index=True)
    st.caption(
        "Ranked by estimated lost units over the next 24 h = "
        "p(downtime) x 1440 minutes x this machine's mean units per running "
        "minute. The mean production rate is measured from history; the 24 h "
        "horizon assumes the near future resembles it. Risk percentage is the "
        "model's probability for the machine's latest reading."
    )

st.divider()

# -------------------------------------------------------------- charts -----
st.subheader("Production trend")
fig, ax = plt.subplots(figsize=(10, 3.6))
days = pd.to_datetime(production_by_day["day"])
ax.plot(days, production_by_day["units_produced"], linewidth=1.0)
ax.set_xlabel("Date")
ax.set_ylabel("Units per day")
ax.grid(alpha=0.3)
st.pyplot(fig)

col_a, col_b = st.columns(2)
with col_a:
    st.subheader("Downtime by machine")
    order = downtime_by_machine.sort_values("downtime_rate", ascending=False)
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.bar(order["machine_id"], order["downtime_rate"] * 100, color="#d62728")
    ax.set_ylabel("Downtime readings (%)")
    ax.tick_params(axis="x", rotation=90, labelsize=6)
    ax.grid(alpha=0.3)
    st.pyplot(fig)

with col_b:
    st.subheader("Defect rate across machines")
    fig, ax = plt.subplots(figsize=(6, 4))
    sns.histplot(defect_by_machine["defect_rate"] * 100, bins=12, ax=ax, color="#2ca02c")
    ax.set_xlabel("Defect rate (%)")
    ax.set_ylabel("Machines")
    st.pyplot(fig)

col_c, col_d = st.columns(2)
with col_c:
    st.subheader("Correlation heatmap")
    if correlation is None:
        missing_notice("correlation_matrix")
    else:
        fig, ax = plt.subplots(figsize=(6.5, 5))
        sns.heatmap(correlation.set_index("variable"), annot=True, fmt=".2f",
                    cmap="coolwarm", center=0, vmin=-1, vmax=1, ax=ax,
                    annot_kws={"size": 6})
        st.pyplot(fig)

with col_d:
    st.subheader("Feature importance (Random Forest)")
    if importance is None:
        missing_notice("feature_importance")
    else:
        rf = importance[importance["model"] == "random_forest"].sort_values("importance")
        fig, ax = plt.subplots(figsize=(6, 4))
        ax.barh(rf["feature"], rf["importance"], color="#9467bd")
        ax.grid(alpha=0.3)
        st.pyplot(fig)

st.subheader("Confusion matrix (held-out period)")
if confusion is None:
    missing_notice("confusion_matrix")
else:
    pivot = confusion.pivot(index="actual", columns="predicted", values="count")
    fig, ax = plt.subplots(figsize=(5, 3.6))
    sns.heatmap(pivot, annot=True, fmt=",d", cmap="Blues", ax=ax)
    st.pyplot(fig)

if metrics is not None:
    st.subheader("Model metrics (measured, not targets)")
    st.dataframe(metrics, hide_index=True)
    st.caption(
        "Precision/recall/F1 and ROC-AUC on the time-based hold-out set. "
        "Accuracy is shown last on purpose: with ~7.5 % downtime, a model that "
        "always says 'running' already scores high accuracy while being useless."
    )

st.caption(
    "Synthetic dataset. Single-laptop containerized cluster: it demonstrates the "
    "architecture, not multi-server speed-ups."
)
