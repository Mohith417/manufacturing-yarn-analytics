# Hadoop 3.3.6 on Ubuntu 22.04 (jammy) with Python 3.
#
# Why not apache/hadoop:3.3.6 directly? That image is CentOS 7.6, and its yum
# mirrors now return HTTP 404 ("No package python3 available" - measured
# 2026-11-23), so Python 3 cannot be installed there. PySpark executors run a
# Python worker on every NodeManager, so the NodeManager image must have
# python3. Building from the official Apache release tarball on Ubuntu gets us
# Hadoop 3.3.6 + python3 + Java 11 in one reproducible step.
#
# Version pin: Hadoop 3.3.6 is the last 3.3.x release; the Hive 4.0.0 image we
# use also bundles Hadoop 3.3.6, so client and cluster agree.
FROM eclipse-temurin:11-jammy

ARG HADOOP_VERSION=3.3.6
# Checksum published by Apache at
#   https://archive.apache.org/dist/hadoop/common/hadoop-3.3.6/hadoop-3.3.6.tar.gz.sha512
# The download uses dlcdn.apache.org (Apache's own CDN, same 730,107,476-byte
# file) because archive.apache.org served it at ~490 KB/s, i.e. ~25 minutes.
# The sha512 below is what proves the CDN file is the released artifact.
ARG HADOOP_SHA512=de3eaca2e0517e4b569a88b63c89fae19cb8ac6c01ff990f1ff8f0cc0f3128c8e8a23db01577ca562a0e0bb1b4a3889f8c74384e609cd55e537aada3dcaa9f8a

RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        python3 \
        curl \
        netcat-openbsd \
        procps \
        hostname \
        ca-certificates; \
    rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    curl -fsSL --retry 3 -o /tmp/hadoop.tgz \
      "https://dlcdn.apache.org/hadoop/common/hadoop-${HADOOP_VERSION}/hadoop-${HADOOP_VERSION}.tar.gz"; \
    echo "${HADOOP_SHA512}  /tmp/hadoop.tgz" | sha512sum -c -; \
    tar -xzf /tmp/hadoop.tgz -C /opt; \
    mv "/opt/hadoop-${HADOOP_VERSION}" /opt/hadoop; \
    rm -f /tmp/hadoop.tgz

ENV HADOOP_HOME=/opt/hadoop \
    HADOOP_CONF_DIR=/opt/hadoop/etc/hadoop \
    HADOOP_LOG_DIR=/var/log/hadoop \
    HADOOP_HOME_WARN_SUPPRESS=1 \
    PYSPARK_PYTHON=python3 \
    PATH=/opt/hadoop/bin:/opt/hadoop/sbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Lab cluster: runs as root inside the container, so the mounted data volumes
# never hit a permission wall. HDFS "simple" auth then treats root as superuser,
# which is exactly why we chmod the shared directories later.
RUN set -eux; \
    mkdir -p /data/namenode /data/datanode /data/tmp \
             /data/yarn/local /data/yarn/log /var/log/hadoop; \
    chmod -R 777 /data /var/log/hadoop

WORKDIR /opt/hadoop
CMD ["bash"]
