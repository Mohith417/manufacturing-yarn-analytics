# The stock Spark image ships python3 but no third-party packages, and
# `pyspark.ml` imports numpy at import time, so `from pyspark.ml...` fails with
# "No module named 'numpy'" (measured). pyspark itself does not pull numpy in.
#
# Only the driver needs these: every MLlib stage below runs as JVM code on the
# executors, and these jobs define no Python UDFs, so the NodeManager image can
# stay minimal (python3 only, no site-packages).
#
# pandas is required by `pyspark.ml.functions` / `vector_to_array`; pyarrow is
# required by `vector_to_array` itself. Both failures were observed at runtime
# (ModuleNotFoundError: No module named 'pandas').
FROM spark:3.5.9-scala2.12-java11-python3-ubuntu

# 2.2.6 is the newest numpy this image's pip resolves for Python 3.10
# (verified by listing the available versions; 2.5.x does not exist for cp310).
USER root
RUN pip3 install --no-cache-dir numpy==2.2.6 pandas==2.2.3 pyarrow==17.0.0
USER spark
