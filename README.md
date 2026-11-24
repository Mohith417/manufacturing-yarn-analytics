# Manufacturing Data Analytics: A YARN Approach

A software-only big-data pipeline over **synthetic** manufacturing telemetry:

```
generate  ->  HDFS  ->  Spark on YARN  ->  Hive (PostgreSQL metastore)  ->  figures + Streamlit
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
| Dashboard | Streamlit, reads exported CSVs only | see `requirements.txt` |

Images are pinned in `docker/docker-compose.yml`; nothing uses `latest`.

## Repository layout

```
data/                  synthetic dataset + generator (CSVs are gitignored)
ingestion/             upload_to_hdfs.ps1 - docker cp + hdfs dfs -put
docker/                compose file, images, Hadoop/Hive config, start scripts
spark_jobs/clean.py    cleaning: schema, duplicates, missing values, derived rate
spark_jobs/analytics.py 8 aggregates + correlation matrix, exports small CSVs
hive/create_tables.sql external tables over the Parquet Spark wrote
hive/queries.sql       five analytical SQL queries
ml/train.py            time-based split, class weighting, three models, risk score
visualizations/         six figures from the exported CSVs
dashboard/app.py       Streamlit dashboard (no cluster connection)
docs/                  development plan, figures
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

Hive (Linux commands):

```bash
docker exec hiveserver2 beeline -u 'jdbc:hive2://localhost:10000/' -f /work/hive/create_tables.sql
docker exec hiveserver2 beeline -u 'jdbc:hive2://localhost:10000/' -f /work/hive/queries.sql
```

Local figures and dashboard (PowerShell, no cluster needed):

```powershell
.venv\Scripts\Activate.ps1
python visualizations\make_figures.py
streamlit run dashboard\app.py
```

Web UIs: NameNode <http://localhost:9870>, YARN <http://localhost:8088>,
HiveServer2 <http://localhost:10002>.

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
* **No invented numbers anywhere.** Every figure quoted above came from a run of
  the scripts in this repository.
