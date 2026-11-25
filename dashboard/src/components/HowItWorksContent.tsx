import { formatInt, useJson, type ClusterInfo } from "../lib/data";
import EmptyState from "./EmptyState";
import Skeleton from "./Skeleton";

const STEPS = [
  {
    title: "Factory data",
    body: "One row per machine for every minute of production: output, temperature, vibration and maintenance history. The dataset is synthetic.",
  },
  {
    title: "Big-data cluster",
    body: "HDFS stores the files. YARN shares the cluster's CPU and memory between jobs. Spark cleans and aggregates, then trains the model. Hive answers SQL questions over the same files.",
  },
  {
    title: "This dashboard",
    body: "It reads small exported JSON files from those jobs. It never queries the cluster live, and it never calls an outside service.",
  },
] as const;

/** Shared body for the How it works page and the help modal. */
export default function HowItWorksContent() {
  const cluster = useJson<ClusterInfo>("cluster_info");

  return (
    <div className="how">
      <ol className="steps">
        {STEPS.map((step, index) => (
          <li className="step" key={step.title}>
            <span className="step__num">{index + 1}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="how__grid">
        <section className="how__card">
          <h3>Cluster used for these results</h3>
          {cluster.loading ? (
            <Skeleton lines={2} />
          ) : cluster.data ? (
            <dl className="cluster-list">
              <div>
                <dt>NodeManagers</dt>
                <dd>{formatInt(cluster.data.nodes)}</dd>
              </div>
              <div>
                <dt>Rows processed</dt>
                <dd>{formatInt(cluster.data.rows_processed)}</dd>
              </div>
              <div>
                <dt>Spark</dt>
                <dd>{cluster.data.spark_version}</dd>
              </div>
              <div>
                <dt>Hadoop</dt>
                <dd>{cluster.data.hadoop_version}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState
              message="Cluster details are not exported yet."
              detail={cluster.error ? `cluster_info.json — ${cluster.error}` : undefined}
            />
          )}
        </section>

        <section className="how__card">
          <h3>What this is not</h3>
          <ul className="plain-list">
            <li>Not one server per role: every container runs on a single laptop.</li>
            <li>Not real factory data: every row is generated.</li>
            <li>Not a speed-up benchmark: there is no second machine to compare.</li>
            <li>Not a live connection: the dashboard only reads exported files.</li>
          </ul>
        </section>
      </div>

      <div className="note">
        <strong>YARN is the cluster's resource manager.</strong> It is not storage
        and not a learning algorithm. HDFS stores the data, Spark does the work,
        MLlib trains the model, and YARN only decides which machine runs each
        container and how much memory and CPU it gets.
      </div>
    </div>
  );
}
