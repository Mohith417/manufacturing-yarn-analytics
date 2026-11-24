"""Phase 4 - clean the raw synthetic manufacturing CSV into Parquet on HDFS.

Run inside the cluster (never from the Windows venv):

    docker exec spark-client spark-submit \
        --master yarn \
        --conf spark.executor.memory=1g \
        --conf spark.executor.cores=1 \
        /work/spark_jobs/clean.py

Data quality rules applied here (and why):

1. Exact duplicate rows are dropped. The generator deliberately appends 0.5 %
   duplicated rows, so this step has real work to do.
2. temperature_c and vibration_mm_s get MEDIAN imputation. These are sensor
   readings: the median of the same column is a defensible stand-in, and it is
   robust to the outliers a sensor can produce. The median is computed from the
   data at run time - never hardcoded.
3. Rows with a NULL units_produced are DROPPED. This is a deliberate choice:
   you cannot invent how many units a machine produced without corrupting every
   production total downstream, and those same rows also have a meaningless
   defect count. The count is logged so the report can state it.
4. defect_rate is RECOMPUTED as defects / units_produced for every row, and set
   to NULL when units_produced is 0 (no units, no meaningful rate). The raw CSV
   computes it before injecting nulls, so a few rows carry a defect_rate that no
   longer matches their columns; recomputing is what makes the derived column
   consistent again.
5. Types are cast explicitly: the CSV arrives with strings.
"""

import argparse

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    DoubleType,
    IntegerType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

# Explicit schema: never let Spark infer 13 columns from 500k rows and guess a
# type wrong. Column order matches data/generate_data.py.
RAW_SCHEMA = StructType(
    [
        StructField("timestamp", TimestampType(), True),
        StructField("machine_id", StringType(), True),
        StructField("machine_age_years", DoubleType(), True),
        StructField("line", StringType(), True),
        StructField("operating_hours", DoubleType(), True),
        StructField("temperature_c", DoubleType(), True),
        StructField("vibration_mm_s", DoubleType(), True),
        StructField("days_since_maintenance", IntegerType(), True),
        StructField("past_maintenance_events", IntegerType(), True),
        # Read as DOUBLE even though these are counts: the generator rounds
        # floats, so the CSV literally contains "497.0", and an IntegerType
        # parse would return NULL for every row (measured). They are cast to
        # int below, after a fractional-value check.
        StructField("units_produced", DoubleType(), True),
        StructField("defects", DoubleType(), True),
        StructField("defect_rate", DoubleType(), True),
        StructField("downtime", IntegerType(), True),
    ]
)


def median_of(df, column):
    """Exact median (50th percentile) of one column, ignoring nulls.

    relativeError=0 asks for the exact quantile instead of Spark's default
    approximation, which is affordable at this data size.
    """
    return df.approxQuantile(column, [0.5], 0.0)[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="hdfs:///data/raw/manufacturing_data.csv")
    parser.add_argument("--output", default="hdfs:///data/clean")
    args = parser.parse_args()

    spark = (
        SparkSession.builder.appName("manufacturing-clean")
        # 500k rows on 2 NodeManagers x 2 vcores: the default 200 shuffle
        # partitions would mean 200 tiny tasks. 8 is plenty here.
        .config("spark.sql.shuffle.partitions", "8")
        .config("spark.sql.adaptive.enabled", "true")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    raw = spark.read.option("header", "true").schema(RAW_SCHEMA).csv(args.input)

    rows_raw = raw.count()
    print(f"[clean] rows read from {args.input}: {rows_raw}")

    # 1. exact duplicates --------------------------------------------------
    deduped = raw.dropDuplicates()
    rows_deduped = deduped.count()
    print(f"[clean] exact duplicates dropped: {rows_raw - rows_deduped} "
          f"(rows after dedupe: {rows_deduped})")

    # 2. null diagnostics before touching anything -------------------------
    nulls = deduped.select(
        *[
            F.sum(F.when(F.col(c).isNull(), 1).otherwise(0)).alias(c)
            for c in ("temperature_c", "vibration_mm_s", "units_produced", "defect_rate")
        ]
    ).collect()[0]
    print(f"[clean] nulls after dedupe: {nulls.asDict()}")

    # 3. median imputation of the two sensor columns -----------------------
    temp_median = median_of(deduped, "temperature_c")
    vib_median = median_of(deduped, "vibration_mm_s")
    print(f"[clean] median temperature_c = {temp_median}, "
          f"median vibration_mm_s = {vib_median}")

    imputed = deduped.fillna({"temperature_c": temp_median, "vibration_mm_s": vib_median})

    # 4. drop rows without a production count ------------------------------
    fractional = imputed.filter(
        F.col("units_produced").isNotNull()
        & (F.col("units_produced") != F.floor("units_produced"))
    ).count()
    print(f"[clean] rows with fractional units_produced: {fractional} "
          f"(must be 0 before casting to int)")

    production_known = (
        imputed.filter(F.col("units_produced").isNotNull())
        .withColumn("units_produced", F.col("units_produced").cast(IntegerType()))
        .withColumn("defects", F.col("defects").cast(IntegerType()))
    )
    rows_production_known = production_known.count()
    print(f"[clean] rows dropped for null units_produced: "
          f"{rows_deduped - rows_production_known} "
          f"(rows kept: {rows_production_known})")

    # 5. recompute the derived defect rate --------------------------------
    cleaned = production_known.withColumn(
        "defect_rate",
        F.when(F.col("units_produced") > 0,
               F.round(F.col("defects").cast("double") / F.col("units_produced"), 6))
         .otherwise(F.lit(None).cast("double")),
    )

    # 6. sanity checks that would invalidate the analytics if they failed --
    invalid = cleaned.filter(
        (F.col("defects") < 0)
        | (F.col("units_produced") < 0)
        | (F.col("defects") > F.col("units_produced"))
        | (~F.col("downtime").isin(0, 1))
        | F.col("timestamp").isNull()
    ).count()
    print(f"[clean] rows failing sanity checks (defects>units, downtime not 0/1, "
          f"null timestamp): {invalid}")

    rows_out = cleaned.count()
    print(f"[clean] rows written: {rows_out}")

    # Small output (500k rows), so 4 files keeps the NameNode and the task
    # count sane instead of writing 200 tiny Parquet files.
    (
        cleaned.repartition(4)
        .write.mode("overwrite")
        .option("compression", "snappy")
        .parquet(args.output)
    )
    print(f"[clean] wrote Parquet to {args.output}")

    # Read the result back: this proves the write is readable, not just that
    # the job exited 0.
    check = spark.read.parquet(args.output)
    print(f"[clean] read-back rows: {check.count()}")
    check.printSchema()

    spark.stop()


if __name__ == "__main__":
    main()
