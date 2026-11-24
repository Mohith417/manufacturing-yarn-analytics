-- Phase 6 - analytical SQL over the same Parquet that Spark wrote.
--
-- This is the point of the Hive layer: the data is not copied anywhere. Hive
-- reads the Parquet in HDFS, and the metastore (PostgreSQL) holds only the
-- table-to-location mapping.
--
-- Run with:
--   docker exec -it hiveserver2 beeline -u 'jdbc:hive2://localhost:10000/' -f /work/hive/queries.sql

USE manufacturing;

-- 1. Downtime readings per machine per month.
--    "readings" not "failures": the data has no event boundaries, so a count of
--    events would be invented. Each reading is one minute.
SELECT
  machine_id,
  date_format(`timestamp`, 'yyyy-MM') AS month,
  COUNT(*)                          AS total_readings,
  SUM(downtime)                     AS downtime_readings,
  ROUND(AVG(downtime) * 100, 4)     AS downtime_pct
FROM manufacturing_clean
GROUP BY machine_id, date_format(`timestamp`, 'yyyy-MM')
ORDER BY machine_id, month;

-- 2. Lines ranked by defect rate (volume weighted, not an average of rates).
SELECT
  line,
  SUM(units_produced)                                AS units_produced,
  SUM(defects)                                       AS defects,
  ROUND(SUM(defects) / SUM(units_produced) * 100, 4) AS defect_pct
FROM manufacturing_clean
GROUP BY line
ORDER BY defect_pct DESC;

-- 3. Production by day (first and last 5 days, to keep the output readable).
SELECT day, units_produced, defects, ROUND(defect_rate * 100, 4) AS defect_pct
FROM production_by_day
WHERE day <= DATE '2024-01-05'
ORDER BY day;

SELECT day, units_produced, defects, ROUND(defect_rate * 100, 4) AS defect_pct
FROM production_by_day
ORDER BY day DESC
LIMIT 5;

-- 4. Machines with the highest downtime rate overall.
SELECT machine_id, line,
       ROUND(downtime_rate * 100, 4) AS downtime_pct
FROM downtime_by_machine
ORDER BY downtime_rate DESC
LIMIT 10;

-- 5. Does maintenance age go with downtime? Bucketed by days since maintenance.
SELECT
  CASE
    WHEN days_since_maintenance < 30  THEN '0-29 days'
    WHEN days_since_maintenance < 60  THEN '30-59 days'
    WHEN days_since_maintenance < 90  THEN '60-89 days'
    WHEN days_since_maintenance < 120 THEN '90-119 days'
    ELSE '120+ days'
  END                            AS maintenance_bucket,
  COUNT(*)                       AS readings,
  ROUND(AVG(downtime) * 100, 4)  AS downtime_pct
FROM manufacturing_clean
GROUP BY
  CASE
    WHEN days_since_maintenance < 30  THEN '0-29 days'
    WHEN days_since_maintenance < 60  THEN '30-59 days'
    WHEN days_since_maintenance < 90  THEN '60-89 days'
    WHEN days_since_maintenance < 120 THEN '90-119 days'
    ELSE '120+ days'
  END
ORDER BY maintenance_bucket;
