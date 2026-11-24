# Official Hive 4.0.0 (it bundles Hadoop 3.3.6) plus the PostgreSQL JDBC driver
# the metastore needs. Upstream's recipe bind-mounts that jar from the host;
# baking it in keeps `docker compose up` to a single command.
#
# Driver version 42.5.1 is the one the Apache Hive 4.0.0 Docker docs use:
# https://github.com/apache/hive/blob/rel/release-4.0.0/packaging/src/docker/README.md
FROM apache/hive:4.0.0

USER root
ADD https://repo1.maven.org/maven2/org/postgresql/postgresql/42.5.1/postgresql-42.5.1.jar /opt/hive/lib/postgres.jar
RUN chmod 644 /opt/hive/lib/postgres.jar

USER hive
