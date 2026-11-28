import { useState } from "react";
import Icon from "./Icon";
import {
  useJson,
  type ClusterInfo,
  type Kpis,
  type MachineRisk,
  type ModelCoefficients,
  type ModelMetric,
} from "../lib/data";
import { readLastUpload } from "../lib/lastUpload";
import { withOverrides } from "../lib/overrides";
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
  const model = useJson<ModelCoefficients>("model_coefficients");
  const [busy, setBusy] = useState(false);

  const ready = Boolean(machines.data && kpis.data);

  async function handleClick() {
    setBusy(true);
    try {
      // Read both at click time, so the file always reflects what is on screen:
      // conditions kept from the what-if sliders, and the file last scored.
      await downloadReport({
        machines: withOverrides(machines.data ?? [], model.data),
        kpis: kpis.data,
        cluster: cluster.data,
        metrics: metrics.data ?? [],
        upload: readLastUpload(),
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
      title="Download a printable report of the sample plant that ships with the dashboard"
    >
      <Icon name="download" size={15} />
      <span className="topbar__download-label">
        {busy ? "Preparing…" : "Plant report"}
      </span>
    </button>
  );
}
