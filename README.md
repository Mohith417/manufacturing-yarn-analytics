# Manufacturing Data Analytics: A YARN Approach

A software-only big-data pipeline over **synthetic** manufacturing telemetry:

```
generate  ->  HDFS  ->  Spark on YARN  ->  Hive (PostgreSQL metastore)  ->  figures + web dashboard
```

> **The data is synthetic.** Every row comes from `data/generate_data.py`. No number
> in this repository describes a real factory, and nothing here is a benchmark of
> real-world performance. The cluster is a single Docker engine on one laptop: it
> demonstrates the architecture, it does not demonstrate multi-server speed-ups.

## What runs where

| Layer | Component | Version (pinned) |
|---|---|---|
| Storage | HDFS, 1 NameNode + 2 DataNodes | Hadoop 3.3.6 |
| Resource management | YARN, 1 ResourceManager + 2 NodeManagers | Hadoop 3.3.6 |
| Processing | Spark submitted with `--master yarn` | Spark 3.5.9 (Scala 2.12, Java 11, Hadoop 3.3 client) |
| ML | Spark MLlib (LR, Decision Tree, Random Forest) | bundled with Spark 3.5.9 |
| SQL | HiveServer2 + metastore, schema in PostgreSQL 16 | Hive 4.0.0 |
| Local analysis | pandas / numpy / matplotlib / seaborn / scikit-learn | see `requirements.txt` |
| Dashboard | Static React + Vite front end, reads exported JSON only | see `dashboard/package.json` |

Images are pinned in `docker/docker-compose.yml`; nothing uses `latest`.

## Repository layout

```
data/                  synthetic dataset + generator (CSVs are gitignored)
ingestion/             upload_to_hdfs.ps1 - docker cp + hdfs dfs -put
docker/                compose file, images, Hadoop/Hive config, start scripts
spark_jobs/clean.py    cleaning: schema, duplicates, missing values, derived rate
spark_jobs/analytics.py 8 aggregates + correlation matrix, exports small CSVs
spark_jobs/benchmark.py  the benchmark job (scan + aggregate), timed phases
benchmarks/            PowerShell driver + subset builder for the tuning runs
hive/create_tables.sql external tables over the Parquet Spark wrote
hive/queries.sql       five analytical SQL queries
ml/train.py            time-based split, class weighting, models, risk + priority
visualizations/         six figures from the exported CSVs
dashboard/             React + Vite front end: landing page, report download, eight pages
dashboard/scripts/     export_dashboard_data.py - CSV exports to JSON
                       make_sample_csvs.py - the synthetic upload samples
dashboard/public/samples/  sample_ok.csv + three broken files for the upload page
backend/               FastAPI scoring API, saved joblib models, Postgres schema
ml/export_sklearn_models.py  trains the servable models and their metrics
docker/docker-compose.app.yml  the local API + Postgres stack (separate from Hadoop)
dashboard/README.md    pages, design notes and the JSON data contract
legacy/streamlit/      previous Streamlit prototype (superseded)
docs/benchmarks.md     measured YARN tuning table
```

## Running it

Cluster (PowerShell, from the repository root):

```powershell
cd docker
docker compose up -d --build
docker compose ps
```

HDFS directories and the raw upload:

```powershell
.\ingestion\upload_to_hdfs.ps1
```

Spark jobs (Linux commands inside the containers - run from Git Bash with
`export MSYS_NO_PATHCONV=1`, otherwise `/work/...` is rewritten to a Windows path):

```bash
docker exec spark-client spark-submit --master yarn \
  --conf spark.executor.memory=1g --conf spark.executor.cores=1 \
  --conf spark.driver.memory=1g /work/spark_jobs/clean.py

docker exec spark-client spark-submit --master yarn \
  --conf spark.executor.memory=1g --conf spark.executor.cores=1 \
  --conf spark.driver.memory=1g /work/spark_jobs/analytics.py

docker exec spark-client spark-submit --master yarn \
  --conf spark.executor.memory=1g --conf spark.executor.cores=1 \
  --conf spark.driver.memory=1g /work/ml/train.py
```

YARN tuning benchmark (PowerShell, from the repository root) - writes
`docs/benchmark_runs.csv`, summarised in `docs/benchmarks.md`:

```powershell
docker exec spark-client spark-submit --master yarn `
  --conf spark.executor.memory=1g --conf spark.executor.cores=1 `
  /work/benchmarks/prepare_subsets.py

.\benchmarks\run_benchmarks.ps1
```

Hive (Linux commands):

```bash
docker exec hiveserver2 beeline -u 'jdbc:hive2://localhost:10000/' -f /work/hive/create_tables.sql
docker exec hiveserver2 beeline -u 'jdbc:hive2://localhost:10000/' -f /work/hive/queries.sql
```

Local figures and web dashboard (PowerShell, no cluster needed):

```powershell
.venv\Scripts\Activate.ps1
python visualizations\make_figures.py

# convert the exported CSVs into the JSON the web app reads
.venv\Scripts\python.exe dashboard\scripts\export_dashboard_data.py

# install once, then start the front end
cd dashboard
npm install
npm run dev        # http://127.0.0.1:5173

npm run build      # static production build in dashboard/dist
```

Web UIs: NameNode <http://localhost:9870>, YARN <http://localhost:8088>,
HiveServer2 <http://localhost:10002>. The dashboard opens on its landing page at
<http://127.0.0.1:5173/#home>; `#today` goes straight to the report, and the
dashboard top bar can download a printable HTML report of the same exported JSON.

## Two ways to run the dashboard

**Static mode (default, no server).** `npm run dev` in `dashboard/` is enough,
and so is any static host serving `dist/`. Every page works without a backend:
Upload scores a CSV in the browser with the exported coefficients, **Live feed**
drifts and scores a simulated batch every three seconds, and **History** keeps
those readings in this browser's `localStorage`. Nothing is uploaded, and
nothing in the console is an error.

**Optional: the scoring API.** One command brings up the API and its own
Postgres (this is a different container from the Hive metastore and does not
touch the Hadoop stack):

```powershell
Copy-Item .env.example .env     # once; local values only, .env is gitignored
docker compose --env-file .env -f docker/docker-compose.app.yml up --build
```

Then `npm run dev` and open the dashboard. `GET /api/health` answers on
<http://127.0.0.1:8000/api/health>; the front end probes it once at startup. With
the API up, Upload also offers the three scikit-learn models (decision tree and
random forest, which the browser cannot run) and per-machine history is
available from `GET /api/history`. Stop the containers and the app returns to
static mode without a reload error.

### The four added features

| Feature | Where | How it works |
|---|---|---|
| A. Upload and score | `#upload` | CSV parsed and scored in the browser; nothing leaves the machine |
| B. Scoring API | `backend/app/main.py` | `POST /api/score` with the saved joblib models |
| C. Simulated live feed | `#live` | Browser simulator (`src/lib/live.ts`): each machine's exported reading drifts, the saved logistic regression scores it every 3 s, labelled Simulated |
| D. History | `#history` | Readings kept in the browser (`src/lib/history.ts`), 24 hours seeded on first visit; the API's `/api/history` remains available for a Postgres-backed store |

The upload page has a working sample plus three deliberately broken files
(`bad_missing_column.csv`, `bad_empty_cells.csv`, `bad_text_values.csv`) so the
file-check report can be tested without inventing data.

### Tests

```powershell
cd dashboard; npm test          # 24 tests: CSV reader/validator, scoring vs Python, live simulator, history store
cd backend;   ..\.venv\Scripts\python.exe -m pytest tests -q   # 10 tests
```

The pytest storage test is skipped unless the Postgres container is running;
point `DATABASE_URL` at `127.0.0.1:5433` to run it against the compose database.

### Two sets of metrics, never mixed

`dashboard/public/data/model_metrics.json` holds the **Spark MLlib** metrics of
the pipeline run. `backend/models/metrics_sklearn.json` holds the
**scikit-learn** metrics of `ml/export_sklearn_models.py` on its own held-out
split. They use different libraries, splitters and class weighting, so they are
printed separately and must not be compared as one number.

| scikit-learn model | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|
| Logistic regression | 0.1886 | 0.7282 | 0.2996 | 0.8131 |
| Decision tree | 0.1869 | 0.6850 | 0.2937 | 0.7943 |
| Random forest | 0.1826 | 0.7208 | 0.2914 | 0.8044 |

Time split at 2024-10-01: 392,536 training rows, 104,941 held-out rows, every
model with `class_weight="balanced"`.

### Limitations

- The dataset is synthetic; the live feed is simulated and labelled so.
- The API and database are local-only. The hosted static build has no backend.
- The Hadoop cluster is a single Docker engine on one machine, so it
demonstrates the architecture rather than multi-server speed-up.
- Precision is low on purpose: the model is tuned to catch downtime, and the
Accuracy page prints the false alarms instead of hiding them.
- The maintenance priority list uses an estimated lost-units formula; that
column stays hidden in the UI and is documented as an estimate, not a forecast.

### The decision-tree ROC-AUC

The earlier Spark MLlib export reported roughly 0.53 for the decision tree. The
cause was scoring hard 0/1 predictions rather than probabilities. Both the API
and `ml/export_sklearn_models.py` now call `predict_proba`, which gives 0.7943 on
the held-out period; `backend/tests/test_api.py` asserts that the served tree
returns probabilities that vary between machines, so the regression cannot
return unnoticed.

## Measured results

Everything below was copied from the runs of the commands above on this machine.

### Cleaning (`clean.py`)

| Step | Rows |
|---|---|
| Read from `/data/raw/manufacturing_data.csv` | 502,500 |
| Exact duplicate rows dropped | 2,500 |
| Rows dropped for null `units_produced` (production cannot be invented) | 5,000 |
| Written to `/data/clean` (read back to confirm) | 495,000 |

`temperature_c` and `vibration_mm_s` are median-imputed (medians 74.49 and 3.088);
`defect_rate` is recomputed from `defects / units_produced`.

### Hive layer

Row counts returned by `create_tables.sql`, matching Spark's own counts:

| Table | Rows |
|---|---|
| `manufacturing_clean` | 495,000 |
| `production_by_day` | 348 |
| `downtime_by_machine` | 50 |
| `defect_by_line` | 4 |

Downtime readings rise with time since maintenance (`queries.sql`, query 5):

| Days since maintenance | Readings | Downtime readings (%) |
|---|---|---|
| 0-29 | 82,895 | 3.1956 |
| 30-59 | 82,306 | 4.2682 |
| 60-89 | 82,058 | 5.9312 |
| 90-119 | 82,474 | 7.9516 |
| 120+ | 165,267 | 11.9697 |

Defect rate by line (volume weighted, query 2): Line_D 2.9170 %, Line_C 2.8826 %,
Line_B 2.8819 %, Line_A 2.8749 %.

Highest-downtime machines (query 4): M031 13.8277 %, M022 13.7042 %,
M005 13.4811 %, M011 13.1321 %, M023 12.7451 %.

### Model (`ml/train.py`)

Time-based split at `2024-10-01`: 390,587 training rows, 104,413 held-out rows,
positive (downtime) share in training 0.0755, positive-class weight 12.2488.

| Model | Precision | Recall | F1 | ROC-AUC | Accuracy |
|---|---|---|---|---|---|
| Logistic regression | 0.1887 | 0.7283 | 0.2998 | 0.8133 | 0.7429 |
| Decision tree | 0.1817 | 0.6923 | 0.2879 | 0.5336 | 0.7413 |
| Random forest | 0.1822 | 0.7075 | 0.2897 | 0.7992 | 0.7379 |

Accuracy is listed last on purpose: with ~7.5 % downtime, predicting "running"
every time already scores about 92 % accuracy. The low precision is a real result,
not a bug to hide - the synthetic classes overlap, so most positive predictions
are false positives. ROC-AUC near 0.81 for logistic regression and random forest
shows the ranking signal exists; the 0.5 threshold does not turn it into a usable
alarm, which is exactly what a follow-up would have to address (threshold tuning,
more features, or resampling).

Leading coefficients of the logistic regression: `vibration_mm_s` 0.861,
`days_since_maintenance` 0.632, `machine_age_years` 0.420, `temperature_c` 0.310.

### Maintenance priority list (`ml/train.py`)

Risk alone ranks machines by probability; a slow machine that is down often can
cost fewer units than a fast one with a lower probability. The job therefore
prices the risk in units and exports `maintenance_priority.csv`:

```
estimated_lost_units_24h = p(downtime) x 1440 minutes x mean units per running minute
```

The production rate is measured per machine from readings where it was **not**
down. The 24-hour horizon assumes the near future resembles that machine's own
history - an estimate for ordering work, not a forecast.

Top of the list as measured: M013 (Line_B) ~657,019 units at p = 0.9122,
M006 (Line_D) ~647,843 at p = 0.8994, M030 (Line_C) ~647,124 at p = 0.8989.

### What-if simulator (web dashboard)

`ml/train.py` exports the fitted logistic-regression coefficients, intercept and
the scaler's mean/std (`model_parameters.csv`), because the browser must not
load a Spark pipeline from HDFS. The exporter copies them into
`dashboard/public/data/model_coefficients.json`, and the React front end
evaluates that linear model in the browser, so the sliders show the **saved**
model's probability:

```
z = intercept + sum_i coef_i * (x_i - mean_i) / std_i      p = 1 / (1 + exp(-z))
```

The run prints a check comparing this formula against the pipeline's own
probability for a held-out row: `pipeline=0.266533 formula=0.266533
abs_diff=0.000000000`. Sliders move days since maintenance, temperature and
vibration; machine age, operating hours and maintenance history stay at the
selected machine's latest values.

### Figures

`docs/figures/` - production trend, downtime by machine, defect-rate distribution,
correlation heatmap, feature importance, confusion matrix.

## Design decisions worth defending

* **Time-based split, not random.** Readings are one-minute samples from 50
  interleaved machines; a random split would score the model on rows that are
  near-copies of its training rows.
* **Drop, do not impute, unknown production.** Imputing `units_produced` would
  invent output; temperature and vibration are imputed because they are sensor
  readings and their median is a defensible stand-in.
* **Hive tables are EXTERNAL.** Hive reads the Parquet Spark already wrote;
  dropping a table never deletes data, and nothing is duplicated.
* **Dashboard reads files, not the cluster.** The presentation layer keeps working
  with the cluster stopped, which is what makes it demo-able.
* **Benchmarks state their limits.** `docs/benchmarks.md` reports one sample per
  configuration and explains that a 5 MB table mostly measures YARN container
  start-up, so the fastest configuration there is not a general recommendation.
* **No invented numbers anywhere.** Every figure quoted above came from a run of
  the scripts in this repository.
