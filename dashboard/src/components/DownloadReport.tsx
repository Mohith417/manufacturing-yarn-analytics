import { useState } from "react";
import Icon from "./Icon";
import {
  useJson,
  type ClusterInfo,
  type Kpis,
  type MachineRisk,
  type ModelMetric,
} from "../lib/data";
import { downloadReport } from "../lib/report";

/**
 * The printable report is a dashboard action: it reads the same exported JSON
 * as the pages and writes one self-contained HTML file in the browser.
 */
export default function DownloadReport() {
  const machines = useJson<MachineRisk[]>("machine_risk");
  const kpis = useJson<Kpis>("kpis");
  const cluster = useJson<ClusterInfo>("cluster_info");
  const metrics = useJson<ModelMetric[]>("model_metrics");
  const [busy, setBusy] = useState(false);

  const ready = Boolean(machines.data && kpis.data);

  async function handleClick() {
    setBusy(true);
    try {
      await downloadReport({
        machines: machines.data ?? [],
        kpis: kpis.data,
        cluster: cluster.data,
        metrics: metrics.data ?? [],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn topbar__download"
      onClick={handleClick}
      disabled={busy || !ready}
      title="Download a printable plant report"
    >
      <Icon name="download" size={15} />
      <span className="topbar__download-label">
        {busy ? "Preparing…" : "Download report"}
      </span>
    </button>
  );
}
