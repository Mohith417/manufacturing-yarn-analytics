# Uploads data\manufacturing_data.csv into HDFS at /data/raw/.
#
# Why this shape: the CSV lives on Windows, the cluster lives in Linux
# containers. `docker cp` moves the file into the NameNode container's
# filesystem, and then the *container's own* `hdfs` client does the HDFS put.
# Nothing needs a Hadoop client installed on Windows.
#
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File ingestion\upload_to_hdfs.ps1
# Prerequisite:       docker compose up -d must already report the cluster healthy.

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Csv      = Join-Path $RepoRoot "data\manufacturing_data.csv"

if (-not (Test-Path $Csv)) {
    throw "CSV not found at $Csv. Generate it first: python data\generate_data.py 500000"
}

$sizeMb = [math]::Round((Get-Item $Csv).Length / 1MB, 1)
Write-Host "Uploading $Csv ($sizeMb MB) to HDFS /data/raw/"

docker cp $Csv namenode:/tmp/manufacturing_data.csv
if ($LASTEXITCODE -ne 0) { throw "docker cp failed - is the namenode container running?" }

docker exec namenode hdfs dfs -mkdir -p /data/raw
if ($LASTEXITCODE -ne 0) { throw "hdfs mkdir failed" }

docker exec namenode hdfs dfs -put -f /tmp/manufacturing_data.csv /data/raw/
if ($LASTEXITCODE -ne 0) { throw "hdfs put failed" }

Write-Host "Uploaded. HDFS listing:"
docker exec namenode hdfs dfs -ls -h /data/raw
if ($LASTEXITCODE -ne 0) { throw "hdfs ls failed" }
