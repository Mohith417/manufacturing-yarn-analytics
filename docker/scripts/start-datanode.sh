#!/usr/bin/env bash
# Waits for the NameNode RPC port to accept connections, then starts the
# DataNode in the foreground. A DataNode that starts too early just retries in
# a loop and floods the logs, so waiting is cheaper than debugging that.
set -euo pipefail

echo "[start-datanode] waiting for namenode:9000"
for _ in $(seq 1 60); do
  if nc -z namenode 9000; then
    echo "[start-datanode] NameNode is up"
    break
  fi
  sleep 2
done

exec hdfs datanode
