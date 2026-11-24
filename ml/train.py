"""Phase 7 - Spark MLlib on YARN: predict the `downtime` flag per reading.

Run inside the cluster:

    docker exec spark-client spark-submit --master yarn \
        --conf spark.executor.memory=1g --conf spark.executor.cores=1 \
        /work/ml/train.py

Split: TIME-BASED, not random
-----------------------------
Rows are 1-minute readings from 50 machines over ~11 months, interleaved in
time. A random split would put minute 10:00 of machine M007 in train and minute
10:01 in test, so the model would be scored on data that is almost a copy of
what it saw - a leak that inflates every metric. We therefore train on the
earlier part of the period and test on the later part: the test set is strictly
"the future" relative to training, which is also how the model would be used on
a factory floor. The cutoff is a date, printed by the job, not a row number.

Class imbalance: downtime is 0 for about 92.5 % of readings, so a model that
always predicts 0 would score ~92 % accuracy and be useless. Two things are
done about it:
  * accuracy is not the headline metric - precision/recall/F1 and ROC-AUC are;
  * each model gets a weight column: weight = neg/pos for positive rows and 1.0
    for negative rows, so both classes contribute equally during training.

Nothing in this file hardcodes a result. Every number printed or written comes
from the run itself.
"""

import argparse
import csv
import os

from pyspark.ml import Pipeline
from pyspark.ml.classification import (
    DecisionTreeClassifier,
    LogisticRegression,
    RandomForestClassifier,
)
from pyspark.ml.evaluation import BinaryClassificationEvaluator
from pyspark.ml.feature import StandardScaler, VectorAssembler
from pyspark.ml.functions import vector_to_array
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window

FEATURES = [
    "machine_age_years",
    "operating_hours",
    "temperature_c",
    "vibration_mm_s",
    "days_since_maintenance",
    "past_maintenance_events",
]
LABEL = "downtime"
EXPORT_DIR = "/work/dashboard/data"

# Everything before this date trains, everything on/after it is the test set.
# ~83 % / ~17 % of the period by calendar, which is a normal hold-out size.
CUTOFF_DATE = "2024-10-01"


def confusion_counts(predictions):
    """TP/FP/TN/FN from the prediction column (label 1 = downtime)."""
    row = predictions.agg(
        F.sum(F.when((F.col(LABEL) == 1) & (F.col("prediction") == 1), 1).otherwise(0)).alias("tp"),
        F.sum(F.when((F.col(LABEL) == 0) & (F.col("prediction") == 1), 1).otherwise(0)).alias("fp"),
        F.sum(F.when((F.col(LABEL) == 1) & (F.col("prediction") == 0), 1).otherwise(0)).alias("fn"),
        F.sum(F.when((F.col(LABEL) == 0) & (F.col("prediction") == 0), 1).otherwise(0)).alias("tn"),
    ).collect()[0]
    return {key: int(row[key]) for key in ("tp", "fp", "fn", "tn")}


def metrics_from_counts(counts):
    tp, fp, fn, tn = counts["tp"], counts["fp"], counts["fn"], counts["tn"]
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    accuracy = (tp + tn) / (tp + tn + fp + fn) if (tp + tn + fp + fn) else 0.0
    return precision, recall, f1, accuracy


def write_rows(header, rows, name, export_dir):
    path = os.path.join(export_dir, f"{name}.csv")
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    print(f"[train] wrote {path} ({len(rows)} rows)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="hdfs:///data/clean")
    parser.add_argument("--model-dir", default="hdfs:///models")
    parser.add_argument("--output", default="hdfs:///data/ml_output")
    parser.add_argument("--export-dir", default=EXPORT_DIR)
    args = parser.parse_args()

    spark = (
        SparkSession.builder.appName("manufacturing-mllib")
        .config("spark.sql.shuffle.partitions", "8")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")
    os.makedirs(args.export_dir, exist_ok=True)

    df = spark.read.parquet(args.input).select(*FEATURES, LABEL, "timestamp", "machine_id", "line")

    train = df.filter(F.col("timestamp") < F.lit(CUTOFF_DATE).cast("timestamp"))
    test = df.filter(F.col("timestamp") >= F.lit(CUTOFF_DATE).cast("timestamp"))
    n_train, n_test = train.count(), test.count()
    print(f"[train] time split at {CUTOFF_DATE}: train={n_train} rows, test={n_test} rows")

    pos = train.filter(F.col(LABEL) == 1).count()
    neg = n_train - pos
    print(f"[train] training class balance: positives={pos}, negatives={neg}, "
          f"positive share={pos / n_train if n_train else 0:.4f}")

    # Class weights: make each class contribute the same total weight.
    pos_weight = neg / pos if pos else 1.0
    weighted = train.withColumn(
        "class_weight",
        F.when(F.col(LABEL) == 1, F.lit(pos_weight)).otherwise(F.lit(1.0)),
    )
    test_weighted = test.withColumn("class_weight", F.lit(1.0))
    print(f"[train] positive-class weight = {pos_weight:.4f}")

    assembler = VectorAssembler(inputCols=FEATURES, outputCol="features_raw")
    scaler = StandardScaler(
        inputCol="features_raw", outputCol="features", withMean=True, withStd=True
    )

    evaluator = BinaryClassificationEvaluator(
        labelCol=LABEL, rawPredictionCol="rawPrediction", metricName="areaUnderROC"
    )

    models = {
        # Logistic Regression needs scaled inputs to converge sensibly; the tree
        # models do not care about feature scale, but they are given the
        # assembled (unscaled) features.
        "logistic_regression": Pipeline(
            stages=[
                assembler,
                scaler,
                LogisticRegression(
                    featuresCol="features",
                    labelCol=LABEL,
                    weightCol="class_weight",
                    maxIter=50,
                ),
            ]
        ),
        "decision_tree": Pipeline(
            stages=[
                assembler,
                DecisionTreeClassifier(
                    featuresCol="features_raw",
                    labelCol=LABEL,
                    weightCol="class_weight",
                    maxDepth=5,
                    seed=42,
                ),
            ]
        ),
        "random_forest": Pipeline(
            stages=[
                assembler,
                RandomForestClassifier(
                    featuresCol="features_raw",
                    labelCol=LABEL,
                    weightCol="class_weight",
                    numTrees=100,
                    maxDepth=5,
                    seed=42,
                ),
            ]
        ),
    }

    metric_rows = []
    predictions_by_model = {}
    importance_rows = []

    for name, pipeline in models.items():
        print(f"[train] fitting {name}")
        fitted = pipeline.fit(weighted)
        predictions = fitted.transform(test_weighted).cache()
        predictions_by_model[name] = predictions

        counts = confusion_counts(predictions)
        precision, recall, f1, accuracy = metrics_from_counts(counts)
        auc = evaluator.evaluate(predictions)
        metric_rows.append([name, precision, recall, f1, auc, accuracy,
                            counts["tp"], counts["fp"], counts["fn"], counts["tn"]])
        print(f"[train] {name}: precision={precision:.4f} recall={recall:.4f} "
              f"f1={f1:.4f} roc_auc={auc:.4f} accuracy={accuracy:.4f} "
              f"confusion={counts}")

        # Feature importance: tree models expose importances directly; for
        # Logistic Regression the story is the coefficient magnitude.
        final_stage = fitted.stages[-1]
        if hasattr(final_stage, "featureImportances"):
            values = final_stage.featureImportances.toArray()
        else:
            values = [abs(v) for v in final_stage.coefficients.toArray()]
        for feature, value in sorted(zip(FEATURES, values), key=lambda x: -x[1]):
            importance_rows.append([name, feature, float(value)])

        fitted.write().overwrite().save(f"{args.model_dir}/{name}")

    write_rows(
        ["model", "precision", "recall", "f1", "roc_auc", "accuracy",
         "true_positives", "false_positives", "false_negatives", "true_negatives"],
        metric_rows,
        "model_metrics",
        args.export_dir,
    )
    write_rows(["model", "feature", "importance"], importance_rows,
               "feature_importance", args.export_dir)

    # Confusion matrix of the best model by F1 on the held-out period.
    best_name = max(metric_rows, key=lambda row: row[3])[0]
    best_predictions = predictions_by_model[best_name]
    best_counts = confusion_counts(best_predictions)
    write_rows(
        ["actual", "predicted", "count"],
        [
            ["1 (downtime)", "1 (downtime)", best_counts["tp"]],
            ["1 (downtime)", "0 (running)", best_counts["fn"]],
            ["0 (running)", "1 (downtime)", best_counts["fp"]],
            ["0 (running)", "0 (running)", best_counts["tn"]],
        ],
        "confusion_matrix",
        args.export_dir,
    )
    print(f"[train] confusion matrix exported for best model: {best_name}")

    # ------------------------------------------------------ machine risk ----
    # Risk score = predicted probability of downtime on each machine's MOST
    # RECENT reading, i.e. "how risky does this machine look right now". Scoring
    # the latest snapshot (not a historical average) keeps the dashboard's
    # selector honest about what the number means.
    best_predictions = best_predictions.withColumn(
        "downtime_probability", vector_to_array("probability")[1]
    )
    latest = (
        best_predictions.select("machine_id", "line", "timestamp", "downtime_probability")
        .withColumn(
            "rn",
            F.row_number().over(
                Window.partitionBy("machine_id").orderBy(F.desc("timestamp"))
            ),
        )
        .filter(F.col("rn") == 1)
        .drop("rn")
    )
    latest.write.mode("overwrite").parquet(f"{args.output}/machine_risk")
    write_rows(
        ["machine_id", "line", "scored_at", "downtime_probability"],
        [[r["machine_id"], r["line"], r["timestamp"], float(r["downtime_probability"])]
         for r in latest.collect()],
        "machine_risk",
        args.export_dir,
    )

    print(f"[train] best model by F1 on the test period: {best_name}")
    spark.stop()


if __name__ == "__main__":
    main()
