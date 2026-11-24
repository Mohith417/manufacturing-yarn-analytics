#!/usr/bin/env bash
# Waits for the ResourceManager scheduler port, then starts the NodeManager.
set -euo pipefail

echo "[start-nodemanager] waiting for resourcemanager:8030"
for _ in $(seq 1 90); do
  if nc -z resourcemanager 8030; then
    echo "[start-nodemanager] ResourceManager is up"
    break
  fi
  sleep 2
done

exec yarn nodemanager
