#!/usr/bin/env bash
# Formats the NameNode exactly once, then runs it in the foreground.
# `docker compose down -v` deletes the volume, so the next `up` formats again.
set -euo pipefail

if [ ! -d /data/namenode/current ]; then
  echo "[start-namenode] no NameNode metadata in /data/namenode -> formatting now"
  hdfs namenode -format -force -nonInteractive
else
  echo "[start-namenode] existing NameNode metadata found -> skipping format"
fi

exec hdfs namenode
