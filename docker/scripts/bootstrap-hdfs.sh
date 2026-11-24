#!/usr/bin/env bash
# One-time HDFS plumbing: creates the directories the pipeline writes to.
# HDFS keeps UNIX-style permissions, and three different container users touch
# these paths later (root for the NameNode shell, `spark` for the Spark client,
# `hive` for the metastore), so the shared roots are opened up. On a lab
# cluster with HDFS "simple" auth this is the usual shortcut; a production
# cluster would use groups and proper ownership instead.
set -euo pipefail

# /tmp is HiveServer2's scratch root (hive.exec.scratchdir=/tmp/hive/<user>).
# If it is missing, HS2 tries to create /tmp directly under "/" as user `hive`
# and dies in CLIService.init with
#   AccessControlException: Permission denied: user=hive, access=WRITE,
#   inode="/":root:supergroup:drwxr-xr-x
# which leaves the Thrift port 10000 unbound (measured).
for d in /data/raw /data/clean /data/analytics /models /tmp /user/hive/warehouse /user/spark; do
  echo "[bootstrap-hdfs] ensuring $d"
  hdfs dfs -mkdir -p "$d"
done

# Recursive (-R) on purpose: /data/analytics, /data/clean, ... were created
# with root:supergroup 755, and the Spark client runs as `spark` - without -R
# the first write into a subdirectory fails with AccessControlException.
hdfs dfs -chmod -R 777 /data /models /user

echo "[bootstrap-hdfs] contents of /"
hdfs dfs -ls /
