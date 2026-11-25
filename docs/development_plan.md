# Development Plan — Manufacturing Data Analytics: A YARN Approach

Living document. Every number in it came from a real command run on the laptop.
Dataset: **synthetic**. Cluster: **single laptop, containerized** (architecture
demonstration, not a multi-server benchmark).

---

## 0. Environment verified on this machine

| Item | Verified value | How it was checked |
|---|---|---|
| OS shell | Windows, PowerShell 5.1 (commands below are PS-compatible) | user-stated |
| RAM | 15.67 GB usable | `(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB` |
| Docker CLI | 29.5.2 (build 79eb04c) | `docker --version` |
| Docker Compose | v5.1.3 | `docker compose version` |
| WSL | v2, distros `docker-desktop` (default) and `Ubuntu`, both **Stopped** | `wsl --status`, `wsl -l -v` |
| Docker engine | **NOT RUNNING** — `docker ps` fails: cannot open `//./pipe/dockerDesktopLinuxEngine` | `docker ps` |
| Local Spark | pyspark 4.3.0 in `.venv` (must not be used for cluster jobs) | `requirements.txt` |
| Repo | `origin` = github.com/Mohith417/manufacturing-yarn-analytics, branch `main`, HEAD `0a247e9` = remote `main` (in sync, clean tree) | `git ls-remote --heads origin`, `git status` |
| `gh` CLI | not installed (only needed for PRs; not required) | `gh --version` |

**Blocker to clear first:** start Docker Desktop and wait for the engine, then
`docker ps` must print a header row instead of the npipe error.

---

## 1. Phase 1 (Data) — done, numbers now measured

`data/manufacturing_data.csv`, 42,136,960 bytes, 502,500 rows, 13 columns in the
documented order.

| Measurement | Value |
|---|---|
| rows | 502,500 |
| exact duplicate rows | 2,500 |
| downtime rate | 0.075431 (7.54 %) |
| `temperature_c` NaN | 5,023 |
| `vibration_mm_s` NaN | 5,023 |
| `units_produced` NaN | 5,023 |
| `defect_rate` NaN | 0 |
| `defects` NaN | 0 |
| `units_produced == 0` | 0 |
| timestamp range | 2024-01-01 00:00 → 2024-12-13 05:19 |
| machines / lines | 50 / Line_A..Line_D |

### Two facts about the data that the cleanup step must respect

1. **The three NaN columns are the same 5,023 rows.** `generate_data.py` calls
   `df.sample(frac=0.01, random_state=1)` three times with the *same* seed, so
   the missingness is perfectly correlated, not independent. Consequence: any
   "drop rows with missing values" policy would delete 5,023 rows, and median
   imputation is being applied to 1.0 % of one shared row set. State this
   honestly in the report; do not describe the missingness as independent.
2. **`defect_rate` is never NaN, even where `units_produced` is NaN.** The
   generator computes `defect_rate` *before* injecting nulls, so 5,023 rows have
   a null `units_produced` but a non-null `defect_rate`. `units_produced == 0`
   never occurs (normal(500, 60) clipped at 0 does not produce zeros at this
   sample size), so the "defect_rate is NaN when units are 0" branch is never
   exercised in this file. `clean.py` must therefore **recompute**
   `defect_rate = defects / units_produced` and set it to null when
   `units_produced` is null or 0 — that is the documented rule, and it is what
   makes the derived column consistent again.

---

## 2. Version decisions (pin exactly, never `latest`)

| Component | Pin | Why | Status |
|---|---|---|---|
| Hadoop (HDFS + YARN) | `apache/hadoop:3.3.6` | last 3.3.x tag on Docker Hub; matches the approved 3.3.x line | tag existence seen on hub.docker.com/r/apache/hadoop/tags — **confirm by `docker pull`** |
| Spark client (runs `spark-submit --master yarn`) | `spark:3.5.9-scala2.12-java11-python3-ubuntu` | its Dockerfile downloads `spark-3.5.9-bin-hadoop3.tgz`, i.e. a Hadoop 3.3.x client — same line as the cluster, so no cross-version shuffle/HDFS risk | Dockerfile read at apache/spark-docker — **confirm by `docker pull`** |
| Hive (HiveServer2 + metastore) | `apache/hive:4.0.0` | the official "Hive with Docker" page documents the PostgreSQL-metastore recipe for 4.0.0 verbatim; following a documented recipe beats improvising. Hadoop 3.3.x compatible | **confirm by `docker pull`**; if absent, fall back to `4.2.1` and I re-verify its recipe before writing config |
| PostgreSQL (metastore DB) | `postgres:16-alpine` | small, stable; the Hive compose example uses postgres | confirm by `docker pull` |
| Local venv | unchanged | pandas/scikit-learn/plots/Streamlit only | — |

**Recommendation (version pairing): also remove local `pyspark` from `.venv`.**
Reason: the cluster containers own Spark; a stray 4.3.0 on the host can only
produce a confusing mismatch and a classpath surprise, and nothing local needs it.

### Two small repo fixes (no behaviour change)

- `requirements.txt` is **UTF-16LE with a BOM** (PowerShell `pip freeze >` default).
  Tools that read it as UTF-8 see garbage. Re-save as UTF-8 — one-time fix.
- Remove `pyspark==4.3.0` from `requirements.txt` with the uninstall.

---

## 3. Memory plan for a 16 GB laptop

`.wslconfig` (in `C:\Users\<you>\.wslconfig`, **outside** this repo):

```ini
[wsl2]
memory=10GB
processors=4
swap=2GB
```

- 10 GB of 15.67 GB leaves ~5.6 GB for Windows + Docker Desktop UI. WSL2 is
  greedy by default and will otherwise take most of RAM and stall Windows.
- 4 vCPUs keeps the fans sane while 10 JVMs run.

Container sizing (to be set in `docker-compose.yml` + `yarn-site.xml`):

| Setting | Value | Why |
|---|---|---|
| `yarn.nodemanager.resource.memory-mb` | 4096 per nodemanager | 2 NMs × 4 GB = 8 GB of YARN capacity, inside 10 GB WSL |
| `yarn.scheduler.minimum-allocation-mb` | 512 | small containers, so `spark-submit` fits |
| `yarn.nodemanager.resource.cpu-vcores` | 2 per nodemanager | 4 vCPU total |
| `spark.executor.memory` | 1g | 502 k rows / ~42 MB CSV is tiny; 512m also works |
| `spark.executor.cores` | 1 | leaves room for driver + other containers |
| `spark.driver.memory` | 1g | |
| NameNode / DataNode heap | default (1000 MB) | not tuned, not needed at this size |
| Metastore / HS2 heap | `-Xmx1G` each (as in the Hive docs recipe) | |

Total provisioned ≈ 9 GB with headroom under 10 GB. Numbers are deliberately
conservative; they are capacity settings, not performance claims.

---

## 4. Phase plan (each phase ends in a check that produces real output)

### Phase 2 — Cluster (hardest; several small confirmations, not one big file)
2a. Start Docker engine; verify `docker ps` works.
2b. `docker pull` all four pinned images → tags confirmed or corrected.
2c. Write `.wslconfig` (user applies it, then `wsl --shutdown`).
2d. Write Hadoop config files under `docker/hadoop-config/`:
`core-site.xml`, `hdfs-site.xml`, `yarn-site.xml`, `mapred-site.xml`,
`workers`. All scripts **LF**, `chmod` where needed.
2e. `docker/docker-compose.yml`: namenode, datanode1, datanode2,
resourcemanager, nodemanager1, nodemanager2, spark-client, postgres,
hive-metastore, hiveserver2.
2f. Format HDFS (`hdfs namenode -format`) once, then `docker compose up -d`.
2g. **Check:** HDFS UI `http://localhost:9870` → 2 live datanodes; YARN UI
`http://localhost:8088` → 2 active nodes; `hdfs dfs -ls /` works from the
namenode container; `spark-submit --master yarn` on Spark Pi finishes with
`Pi is roughly ...` **and the application appears in the YARN UI** (screenshot
for the README).

Risks to expect: CRLF in mounted `.sh` files (`bad interpreter`), ports 9870 /
8088 / 9000 / 9083 / 10000 already taken, containers formed before the
namenode is ready, and the `apache/hadoop:3.3.6` image's expectations about
`HADOOP_CONF_DIR` (its own docs: `hadoop.apache.org/docs/.../HadoopDocker`).

### Phase 3 — Ingestion
`ingestion/upload_to_hdfs.ps1` (PowerShell, host side) → `docker cp` the CSV into
the namenode, then `hdfs dfs -put` to `/data/raw/`.
**Check:** `hdfs dfs -ls -h /data/raw` lists ~40 M, visible in the HDFS UI.

### Phase 4 — Cleaning (`spark_jobs/clean.py`, `--master yarn`)
Explicit schema; drop exact duplicates; median imputation for `temperature_c`
and `vibration_mm_s` (median computed by Spark, not hardcoded); `units_produced`
null handling documented; recompute `defect_rate`; cast types; write Parquet to
`/data/clean/`; log before/after counts.
**Check:** printed counts from the real run (duplicates removed, nulls imputed),
Parquet readable back, job visible in YARN UI.

### Phase 5 — Analytics (`spark_jobs/analytics.py`)
Production per machine/line/day, downtime count+rate per machine, defect rate by
line and machine, explicit efficiency metric (defined in a code comment).
**Check:** row counts per output table, CSV exports opened locally.

### Phase 6 — Hive
`hive/create_tables.sql` (EXTERNAL over Parquet) + `hive/queries.sql`; run with
`beeline -u jdbc:hive2://...`. **Check:** each query returns rows from this data.

### Phase 7 — ML (`ml/train.py`, Spark MLlib on YARN)
Six features, target `downtime`; **time-based split** (train on the earlier part
of 2024, test on the later part) because the rows are a chronological stream and
a random split would let the model see the same machines' interleaved minutes;
`VectorAssembler` + `StandardScaler` for LR; class weights for imbalance
(7.54 % positives); LR, DT, RF; precision/recall/F1/ROC-AUC + confusion matrix;
export metrics, importances, per-machine risk, model to `/models/`.
**Check:** metrics files exist and are non-placeholder; nothing hardcoded.

### Phase 8 — Six figures (`visualizations/make_figures.py`)
Reads only exported files → `docs/figures/*.png` (production trend, downtime per
machine, defect-rate distribution, correlation heatmap, feature importance,
confusion matrix). **Check:** 6 PNGs with titles/axis labels, opened by eye.

### Phase 9 — Dashboard
Shipped as the React front end in `dashboard/` (the Streamlit prototype originally
planned here is archived in `legacy/streamlit/`). Both read only exported files:
KPI cards, charts, machine selector with risk score, visible "synthetic data"
note. **Check:** the dashboard works with the cluster stopped.

### Phase 10 — Docs
README (overview, Mermaid architecture, prerequisites, Windows setup, UI
screenshots, results table filled only from pasted run output, limitations,
future work), `docs/viva_qa.md` (HDFS vs YARN vs Spark vs Hive, why Parquet,
class imbalance, precision/recall/F1 vs accuracy, what YARN is not).

---

## 5. Open decisions for the user

1. **Missingness design** — leave the CSV as generated (recommended: cleaning
   handles the rule, docs state the missingness is correlated and that zero-unit
   rows never occur), or change the generator to inject independent NaN masks
   plus a few zero-production rows and regenerate everything?
2. **Local pyspark** — uninstall and drop it from `requirements.txt`? (recommended yes)
3. **Git identity of commits** — nothing to decide, just committing per step.

## 6. Honesty rules carried into every document

- No accuracy / F1 / runtime / speed-up number is written anywhere until it comes
  from a pasted real run. Placeholders stay `<RESULT_FROM_RUN>`.
- Data is synthetic, always labelled synthetic.
- Single-laptop containerized cluster: demonstrates architecture, does not
  demonstrate multi-server speed-ups. Never phrase it as a benchmark.
