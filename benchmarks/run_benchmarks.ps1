# Phase 11 - YARN tuning benchmark driver (Windows PowerShell 5.1).
#
# Runs the SAME Spark job (spark_jobs/benchmark.py) once per combination of
# executor count / executor memory / input size, and appends one row per run to
# docs/benchmark_runs.csv. Every number written is measured by that run:
#
#   driver_wall_s  seconds inside the Spark driver (printout of the job)
#   read_s / agg_s phases measured by the job itself
#   end_to_end_s   Stopwatch around the whole `docker exec spark-submit` call,
#                  so it also contains JVM start-up and container allocation
#
# Nothing here is hardcoded or estimated. If a run fails, the row is written
# with status=FAILED and blank timings - never with a guessed value.
#
# Usage (from the repository root, cluster already up):
#   .\benchmarks\run_benchmarks.ps1
#   .\benchmarks\run_benchmarks.ps1 -Repeat 2     # two samples per config
#
# Prerequisite: the "half" dataset must exist
#   docker exec spark-client spark-submit --master yarn /
#       /work/benchmarks/prepare_subsets.py

param(
    [int]$Repeat = 1
)

# PowerShell 5.1 turns a native command's stderr output into an ErrorRecord, and
# with $ErrorActionPreference = "Stop" that aborts the whole run: spark-submit
# writes its log to stderr, so the very first benchmark died on an INFO line
# (measured). "Continue" keeps the text in $output where the regex below reads it.
$ErrorActionPreference = "Continue"
$csv = "docs\benchmark_runs.csv"
$subset = "hdfs:///data/bench/half"

# YARN capacity on this laptop: 2 NodeManagers x 2048 MB x 2 vcores.
# The four configurations below deliberately span under- and full-subscription:
#   1 x 1024m            -> one executor, one NodeManager busy
#   2 x 1024m            -> one executor per NodeManager (the default used so far)
#   2 x 512m             -> both NodeManagers but less memory each
#   4 x 512m             -> two executors per NodeManager (fills the cluster)
$configs = @(
    @{ name = "e1_m1024_c1"; executors = 1; memory = "1024m"; cores = 1 },
    @{ name = "e2_m1024_c1"; executors = 2; memory = "1024m"; cores = 1 },
    @{ name = "e2_m512_c1";  executors = 2; memory = "512m";  cores = 1 },
    @{ name = "e4_m512_c1";  executors = 4; memory = "512m";  cores = 1 },
    @{ name = "e2_m1024_c2"; executors = 2; memory = "1024m"; cores = 2 }
)

$datasets = @(
    @{ name = "full"; path = "hdfs:///data/clean" },
    @{ name = "half"; path = $subset }
)

if (-not (Test-Path $csv)) {
    # ascii, not utf8: PS 5.1 writes a BOM with -Encoding utf8, which would put
    # invisible bytes in front of the header column.
    "timestamp,run,dataset,input,executors,executor_memory,executor_cores,input_rows,read_s,agg_s,driver_wall_s,end_to_end_s,status" |
        Out-File -FilePath $csv -Encoding ascii
}

foreach ($dataset in $datasets) {
    foreach ($config in $configs) {
        for ($i = 1; $i -le $Repeat; $i++) {
            $run = $config.name
            if ($Repeat -gt 1) { $run = "$run`_r$i" }
            $label = "$($dataset.name)_$run"
            Write-Host "[bench] $label ($($config.executors) executors x $($config.memory), input $($dataset.path))"

            $watch = [System.Diagnostics.Stopwatch]::StartNew()
            $output = & docker exec spark-client spark-submit --master yarn `
                --conf "spark.executor.memory=$($config.memory)" `
                --conf "spark.executor.cores=$($config.cores)" `
                --conf "spark.executor.instances=$($config.executors)" `
                --conf "spark.dynamicAllocation.enabled=false" `
                --conf "spark.driver.memory=1g" `
                /work/spark_jobs/benchmark.py `
                --input $dataset.path --label $label 2>&1 | Out-String
            $watch.Stop()
            $endToEnd = [math]::Round($watch.Elapsed.TotalSeconds, 3)

            $match = [regex]::Match($output, 'BENCH_RESULT\s+.*?input_rows=(\d+)\s+read_s=([0-9.]+)\s+agg_s=([0-9.]+)\s+driver_wall_s=([0-9.]+)')
            if ($match.Success) {
                $row = @(
                    (Get-Date).ToString("s"),
                    $run,
                    $dataset.name,
                    $dataset.path,
                    $config.executors,
                    $config.memory,
                    $config.cores,
                    $match.Groups[1].Value,
                    $match.Groups[2].Value,
                    $match.Groups[3].Value,
                    $match.Groups[4].Value,
                    $endToEnd,
                    "OK"
                ) -join ","
                Write-Host "[bench]   rows=$($match.Groups[1].Value) driver=$($match.Groups[4].Value)s end_to_end=$endToEnd s"
            }
            else {
                Write-Warning "[bench]   no BENCH_RESULT line; marking run FAILED"
                $row = @(
                    (Get-Date).ToString("s"),
                    $run,
                    $dataset.name,
                    $dataset.path,
                    $config.executors,
                    $config.memory,
                    $config.cores,
                    "", "", "", "", $endToEnd, "FAILED"
                ) -join ","
            }
            $row | Out-File -FilePath $csv -Encoding ascii -Append
        }
    }
}

Write-Host "[bench] results appended to $csv"
