-- Phase 6 - Hive external tables over the Parquet that Spark wrote to HDFS.
--
-- "EXTERNAL" means Hive stores only the table definition (in the PostgreSQL
-- metastore) and reads the files where they already are. Dropping one of these
-- tables does NOT delete data, which is exactly what you want when Spark and
-- Hive share the same Parquet.
--
-- Column types must match the Parquet Spark wrote; see spark_jobs/clean.py.
-- Run with:
--   docker exec -it hiveserver2 beeline -u 'jdbc:hive2://localhost:10000/' -f /work/hive/create_tables.sql

CREATE DATABASE IF NOT EXISTS manufacturing;
USE manufacturing;

-- Cleaned readings: one row per machine per minute.
CREATE EXTERNAL TABLE IF NOT EXISTS manufacturing_clean (
  -- `timestamp` is a reserved word in Hive, so the column is quoted.
  `timestamp`              TIMESTAMP,
  machine_id             STRING,
  machine_age_years      DOUBLE,
  line                   STRING,
  operating_hours        DOUBLE,
  temperature_c          DOUBLE,
  vibration_mm_s         DOUBLE,
  days_since_maintenance INT,
  past_maintenance_events INT,
  units_produced         INT,
  defects                INT,
  defect_rate            DOUBLE,
  downtime               INT
)
STORED AS PARQUET
LOCATION 'hdfs://namenode:9000/data/clean';

-- Aggregates produced by spark_jobs/analytics.py.
CREATE EXTERNAL TABLE IF NOT EXISTS production_by_day (
  day             DATE,
  units_produced  BIGINT,
  defects         BIGINT,
  defect_rate     DOUBLE,
  downtime_rate   DOUBLE
)
STORED AS PARQUET
LOCATION 'hdfs://namenode:9000/data/analytics/production_by_day';

CREATE EXTERNAL TABLE IF NOT EXISTS downtime_by_machine (
  machine_id       STRING,
  line             STRING,
  downtime_readings BIGINT,
  total_readings   BIGINT,
  downtime_rate    DOUBLE
)
STORED AS PARQUET
LOCATION 'hdfs://namenode:9000/data/analytics/downtime_by_machine';

CREATE EXTERNAL TABLE IF NOT EXISTS defect_by_line (
  line            STRING,
  defects         BIGINT,
  units_produced  BIGINT,
  defect_rate     DOUBLE
)
STORED AS PARQUET
LOCATION 'hdfs://namenode:9000/data/analytics/defect_by_line';

-- Quick sanity check that the tables point at readable data.
SELECT 'manufacturing_clean' AS table_name, COUNT(*) AS row_count FROM manufacturing_clean
UNION ALL
SELECT 'production_by_day', COUNT(*) FROM production_by_day
UNION ALL
SELECT 'downtime_by_machine', COUNT(*) FROM downtime_by_machine
UNION ALL
SELECT 'defect_by_line', COUNT(*) FROM defect_by_line;
