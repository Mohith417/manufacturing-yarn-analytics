"""Phase 11 helper - write a smaller input so the benchmark has real data sizes.

Reads /data/clean once and writes a 50 % random sample as Parquet:

    docker exec spark-client spark-submit --master yarn \
        --conf spark.executor.memory=1g --conf spark.executor.cores=1 \
        /work/benchmarks/prepare_subsets.py

Sampling here is fine (unlike the ML split): the benchmark only measures
throughput over a smaller table, it never evaluates a model, so leakage between
the two datasets is irrelevant.

The subset is real Parquet on HDFS, not a filter applied at read time, so the
"half" run genuinely reads about half the bytes.
"""

import argparse

from pyspark.sql import SparkSession


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="hdfs:///data/clean")
    parser.add_argument("--output", default="hdfs:///data/bench/half")
    parser.add_argument("--fraction", type=float, default=0.5)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    spark = SparkSession.builder.appName("prepare-benchmark-subsets").getOrCreate()
    spark.sparkContext.setLogLevel("WARN")

    df = spark.read.parquet(args.input)
    total = df.count()
    subset = df.sample(withReplacement=False, fraction=args.fraction, seed=args.seed)
    subset.write.mode("overwrite").parquet(args.output)

    written = spark.read.parquet(args.output).count()
    print(f"[subsets] source rows={total} fraction={args.fraction} "
          f"written={written} -> {args.output}")
    print(f"SUBSET_ROWS={written}")

    spark.stop()


if __name__ == "__main__":
    main()
