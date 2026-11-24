# YARN tuning benchmark

The same Spark job — `spark_jobs/benchmark.py`, a full scan plus a
`groupBy(machine_id, line)` aggregation written as Parquet — run under five
executor configurations and two input sizes. Every number below is copied from
`docs/benchmark_runs.csv`, which `benchmarks/run_benchmarks.ps1` appends after
each run. No timing in this document is estimated.

## How it was measured

| Column | Meaning |
|---|---|
| `read_s` | seconds inside the driver: read the Parquet and `count()` it |
| `agg_s` | seconds inside the driver: `groupBy` + aggregate + ordered Parquet write |
| `driver_wall_s` | total seconds inside the Spark driver (includes session and executor start-up) |
| `end_to_end_s` | `Stopwatch` around the whole `docker exec spark-submit` call, so it also includes JVM launch |

Cluster under test: 2 NodeManagers x 2048 MB x 2 vcores = 4096 MB / 4 vcores of
YARN capacity, Hadoop 3.3.6, Spark 3.5.9, one Docker engine on one laptop with an
8.15 GB WSL2 VM. Runs executed 2026-11-24, in the order shown, with the HDFS,
YARN, PostgreSQL and Hive daemons up but idle.

Datasets: `full` = `/data/clean`, 495,000 rows; `half` =
`/data/bench/half` (a 50 % sample materialised as Parquet, 247,772 rows), so the
smaller run genuinely reads fewer bytes.

## Results

| Dataset | Executors | Exec. memory | Exec. cores | Rows | `read_s` | `agg_s` | `driver_wall_s` | `end_to_end_s` |
|---|---|---|---|---|---|---|---|---|
| full | 1 | 1024m | 1 | 495,000 | 1.636 | 1.869 | 17.887 | 19.659 |
| full | 2 | 1024m | 1 | 495,000 | 1.613 | 1.882 | 38.009 | 40.196 |
| full | 2 | 512m | 1 | 495,000 | 2.832 | 2.124 | 18.924 | 21.082 |
| full | 4 | 512m | 1 | 495,000 | 2.910 | 2.406 | 39.718 | 41.597 |
| full | 2 | 1024m | 2 | 495,000 | 2.116 | 2.590 | 39.700 | 41.671 |
| half | 1 | 1024m | 1 | 247,772 | 2.459 | 2.728 | 22.181 | 24.531 |
| half | 2 | 1024m | 1 | 247,772 | 1.662 | 1.949 | 38.022 | 40.562 |
| half | 2 | 512m | 1 | 247,772 | 2.946 | 2.263 | 19.498 | 21.624 |
| half | 4 | 512m | 1 | 247,772 | 2.727 | 2.994 | 40.238 | 42.234 |
| half | 2 | 1024m | 2 | 247,772 | 1.696 | 2.007 | 38.534 | 40.830 |

## What the numbers show

**1. The cost is where the containers land, not how many there are.**
Every run sorts into one of two groups:

* ~18-22 s driver time: 1 x 1024m, 2 x 512m. Both fit on **one** NodeManager
  (2 x 896 MB = 1792 MB <= 2048 MB).
* ~38-40 s driver time: 2 x 1024m, 4 x 512m, 2 x 1024m with 2 cores. Each of
  these needs containers on **both** NodeManagers (2 x 1408 MB, or 4 x 896 MB).

The difference is about 19 seconds of provisioning work for a container on the
second NodeManager. Splitting the same work over more executors inside one
NodeManager was almost free: 1 x 1024m took 17.887 s and 2 x 512m took 18.924 s
on the full dataset.

**2. Task work is small next to start-up.**
`read_s` + `agg_s` is 3.5-5.7 s in every run, while the driver reports 17.9-40.2 s.
Roughly three quarters of the wall time is Spark/JVM/container start-up, which is
what you expect from a 5 MB Parquet table.

**3. Halving the data did not halve the time.**
The same configuration (1 x 1024m) took 17.887 s on 495,000 rows and 22.181 s on
247,772 rows — the half-size run was *slower*. Aggregation time went from 1.869 s
to 2.728 s. With a single sample per cell and a laptop shared with five daemons,
run-to-run variance is larger than the data-size effect. This is reported as
observed; it is not evidence that smaller data is slower.

**4. Adding executors did not speed this job up.**
Four executors were slower than one in both datasets (39.718 s vs 17.887 s full,
40.238 s vs 22.181 s half) because the extra containers had to be created. At this
data size the fastest configurations are 1 x 1024m and 2 x 512m on a single
NodeManager.

## Limitations (read these before quoting the table)

* **One sample per configuration.** No repetition was run, so no confidence
  interval is claimed. The two-group pattern is consistent across both datasets,
  which is why it is reported as a finding at all.
* **Single laptop, shared with daemons.** HDFS, YARN, PostgreSQL and Hive were
  running. These numbers describe this machine, not a multi-server cluster, and
  they are not a speed-up claim.
* **Start-up dominated.** With ~5 MB of Parquet, the benchmark mostly measures
  YARN container allocation. On a larger dataset the aggregation phase would
  grow and the picture would change — that experiment has not been run.
* **`driver_wall_s` is not pure compute.** It includes Spark session creation and
  waiting for executors, which is intentional: that wait is real user-visible
  cost, and it is exactly what the executor configuration changes.

## Reproducing

```powershell
# cluster up, cleaned data in HDFS, then:
docker exec spark-client spark-submit --master yarn `
  --conf spark.executor.memory=1g --conf spark.executor.cores=1 `
  /work/benchmarks/prepare_subsets.py

.\benchmarks\run_benchmarks.ps1
```

The second command rewrites `docs/benchmark_runs.csv` and prints the parameters
of each run; `-Repeat 2` runs each configuration twice if you want two samples.
