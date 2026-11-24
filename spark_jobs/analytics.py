"""Phase 5 - aggregations over the cleaned Parquet, computed on YARN.

Run inside the cluster:

    docker exec spark-client spark-submit --master yarn \
        --conf spark.executor.memory=1g --conf spark.executor.cores=1 \
        /work/spark_jobs/analytics.py

Outputs
-------
HDFS  /data/analytics/<table>/        Parquet, for Hive and for later Spark jobs
local /work/dashboard/data/<table>.csv  small CSVs the Streamlit dashboard and
                                        the figure script read (they must never
                                        talk to the cluster)

Definitions used below, so the report and the viva can point at one place:

* production  - sum of units_produced per group.
* downtime rate - mean of the 0/1 downtime flag per group. It is a *share of
  1-minute readings flagged as downtime*, not a count of stoppage events; the
  data has no event boundaries, so claiming "number of breakdowns" would be
  inventing information.
* defect rate - sum(defects) / sum(units_produced). Weighted by volume, which
  is the only correct way to aggregate a rate: averaging per-row rates would let
  a machine with 3 units weigh as much as one with 600.
* efficiency - GOOD units per operating hour:
      efficiency = sum(units_produced - defects) / sum(operating_hours)
  Why this one: it needs no invented target, it is directly comparable between
  machines, and it combines throughput and quality in one number. It is NOT
  OEE: real OEE also needs planned production time and ideal cycle time, and
  this synthetic dataset contains neither. Availability (1 - downtime rate) is
  reported next to it instead of being multiplied in.
"""

import argparse
import csv
import os

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

EXPORT_DIR = "/work/dashboard/data"


def write_rows(header, rows, name, export_dir):
    """Write an already-materialised small table as one CSV file."""
    path = os.path.join(export_dir, f"{name}.csv")
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    print(f"[analytics] wrote {path} ({len(rows)} rows)")


def write_csv(df, name, export_dir):
    """Write a small aggregate as one CSV file on the host mount.

    The aggregates are tiny (50 machines, ~350 days), so collecting them to the
    driver and writing with the csv module gives exactly one clean .csv file
    instead of Spark's usual directory-of-part-files, which the dashboard and
    the plotting script would have to work around.
    """
    rows = df.collect()
    path = os.path.join(export_dir, f"{name}.csv")
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(df.columns)
        for row in rows:
            writer.writerow(row)
    print(f"[analytics] wrote {path} ({len(rows)} rows)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="hdfs:///data/clean")
    parser.add_argument("--output", default="hdfs:///data/analytics")
    parser.add_argument("--export-dir", default=EXPORT_DIR)
    args = parser.parse_args()

    spark = (
        SparkSession.builder.appName("manufacturing-analytics")
        .config("spark.sql.shuffle.partitions", "8")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    df = spark.read.parquet(args.input).cache()
    total = df.count()
    print(f"[analytics] clean rows: {total}")
    os.makedirs(args.export_dir, exist_ok=True)

    df = df.withColumn("day", F.to_date("timestamp"))

    # ---------------------------------------------------------- production --
    production_by_day = df.groupBy("day").agg(
        F.sum("units_produced").alias("units_produced"),
        F.sum("defects").alias("defects"),
        (F.sum("defects") / F.sum("units_produced")).alias("defect_rate"),
        F.avg("downtime").alias("downtime_rate"),
    ).orderBy("day")

    production_by_machine = df.groupBy("machine_id", "line").agg(
        F.sum("units_produced").alias("units_produced"),
        F.sum("defects").alias("defects"),
        F.sum("operating_hours").alias("operating_hours"),
    ).orderBy("machine_id")

    production_by_line = df.groupBy("line").agg(
        F.sum("units_produced").alias("units_produced"),
        F.sum("defects").alias("defects"),
        F.avg("downtime").alias("downtime_rate"),
    ).orderBy("line")

    # ------------------------------------------------------------ downtime --
    downtime_by_machine = df.groupBy("machine_id", "line").agg(
        F.sum("downtime").alias("downtime_readings"),
        F.count("downtime").alias("total_readings"),
        F.avg("downtime").alias("downtime_rate"),
    ).orderBy(F.desc("downtime_rate"))

    downtime_by_day = df.groupBy("day").agg(
        F.sum("downtime").alias("downtime_readings"),
        F.count("downtime").alias("total_readings"),
        F.avg("downtime").alias("downtime_rate"),
    ).orderBy("day")

    # -------------------------------------------------------------- defects --
    defect_by_line = df.groupBy("line").agg(
        F.sum("defects").alias("defects"),
        F.sum("units_produced").alias("units_produced"),
        (F.sum("defects") / F.sum("units_produced")).alias("defect_rate"),
    ).orderBy(F.desc("defect_rate"))

    defect_by_machine = df.groupBy("machine_id", "line").agg(
        F.sum("defects").alias("defects"),
        F.sum("units_produced").alias("units_produced"),
        (F.sum("defects") / F.sum("units_produced")).alias("defect_rate"),
    ).orderBy(F.desc("defect_rate"))

    # ----------------------------------------------------------- efficiency --
    # efficiency = good units per operating hour (see the module docstring).
    efficiency_by_machine = (
        df.groupBy("machine_id", "line")
        .agg(
            (F.sum(F.col("units_produced") - F.col("defects"))
             / F.sum("operating_hours")).alias("good_units_per_operating_hour"),
            (1 - F.avg("downtime")).alias("availability"),
            (F.sum("defects") / F.sum("units_produced")).alias("defect_rate"),
            F.sum("units_produced").alias("units_produced"),
        )
        .orderBy(F.desc("good_units_per_operating_hour"))
    )

    tables = {
        "production_by_day": production_by_day,
        "production_by_machine": production_by_machine,
        "production_by_line": production_by_line,
        "downtime_by_machine": downtime_by_machine,
        "downtime_by_day": downtime_by_day,
        "defect_by_line": defect_by_line,
        "defect_by_machine": defect_by_machine,
        "efficiency_by_machine": efficiency_by_machine,
    }

    for name, table in tables.items():
        target = f"{args.output}/{name}"
        table.write.mode("overwrite").parquet(target)
        row_count = table.count()
        print(f"[analytics] {name}: {row_count} rows -> {target}")
        write_csv(table, name, args.export_dir)

    # ------------------------------------------------- correlation matrix --
    # Pearson correlation between the operational variables, for the heatmap in
    # the figure script (Streamlit/plotting must not touch the cluster).
    corr_vars = [
        "machine_age_years",
        "operating_hours",
        "temperature_c",
        "vibration_mm_s",
        "days_since_maintenance",
        "past_maintenance_events",
        "defect_rate",
        "downtime",
    ]
    complete = df.select(*corr_vars).na.drop()
    corr_rows = []
    for left in corr_vars:
        corr_rows.append([left] + [round(complete.stat.corr(left, right), 6)
                                   for right in corr_vars])
    write_rows(["variable"] + corr_vars, corr_rows, "correlation_matrix", args.export_dir)

    spark.stop()


if __name__ == "__main__":
    main()
