import {
  FEATURE_LABELS,
  STATUS_LABEL,
  formatDecimal,
  formatInt,
  formatPct,
  type ClusterInfo,
  type ConfusionMatrix,
  type DefectBin,
  type Kpis,
  type MachineRisk,
  type ModelMetric,
} from "./data";

export interface ReportInput {
  machines: MachineRisk[];
  kpis: Kpis | null;
  cluster: ClusterInfo | null;
  metrics: ModelMetric[];
  defects: DefectBin[] | null;
  confusion: ConfusionMatrix | null;
  generatedAt: Date;
}

export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[character] ?? character;
  });
}

function driverLabel(machine: MachineRisk): string {
  const key = machine.top_factors[0] ?? "";
  const label = FEATURE_LABELS[key] ?? key.replace(/_/g, " ");
  return label === "" ? "—" : label;
}

function lineName(line: string): string {
  return line.replace("_", " ");
}

function badge(level: MachineRisk["risk_level"]): string {
  return `<span class="badge badge--${level}">${escapeHtml(STATUS_LABEL[level])}</span>`;
}

export function table(head: string[], rows: string[][], numeric: number[] = []): string {
  const headHtml = head
    .map(
      (cell, index) =>
        `<th${numeric.includes(index) ? ' class="num"' : ""}>${escapeHtml(cell)}</th>`,
    )
    .join("");
  const bodyHtml = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, index) =>
              `<td${numeric.includes(index) ? ' class="num"' : ""}>${cell}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

/** The whole report is a single self-contained HTML file: no scripts, no assets. */
export function buildReportHtml(input: ReportInput): string {
  const { machines, kpis, cluster, metrics, defects, confusion, generatedAt } = input;

  const counts = { red: 0, amber: 0, green: 0 };
  for (const machine of machines) {
    counts[machine.risk_level] += 1;
  }

  const redAt = kpis?.risk_rule?.red_at ?? 0.7;
  const amberAt = kpis?.risk_rule?.amber_at ?? 0.4;

  const ranked = [...machines].sort((a, b) => b.risk_score - a.risk_score);
  const priorityRows = ranked.slice(0, 10).map((machine, index) => [
    String(index + 1),
    `<strong>${escapeHtml(machine.machine_id)}</strong>`,
    escapeHtml(lineName(machine.line)),
    badge(machine.risk_level),
    formatPct(machine.risk_score, 0),
    escapeHtml(driverLabel(machine)),
  ]);

  const lines = new Map<string, MachineRisk[]>();
  for (const machine of machines) {
    const group = lines.get(machine.line) ?? [];
    group.push(machine);
    lines.set(machine.line, group);
  }
  const lineRows = [...lines.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([line, list]) => {
      const local = { red: 0, amber: 0, green: 0 };
      let total = 0;
      for (const machine of list) {
        local[machine.risk_level] += 1;
        total += machine.risk_score;
      }
      const mean = list.length > 0 ? total / list.length : 0;
      return [
        escapeHtml(lineName(line)),
        String(list.length),
        String(local.red),
        String(local.amber),
        String(local.green),
        formatPct(mean, 0),
      ];
    });

  const defectRows = (defects ?? []).map((bin) => [
    `${bin.bin_start.toFixed(2)}–${bin.bin_end.toFixed(2)}%`,
    String(bin.count),
  ]);
  const defectPeak = (defects ?? []).reduce<DefectBin | null>(
    (best, bin) => (!best || bin.count > best.count ? bin : best),
    null,
  );

  const bestModel = metrics.reduce<ModelMetric | null>(
    (best, row) => (!best || row.roc_auc > best.roc_auc ? row : best),
    null,
  );
  const modelRows = metrics.map((row) => {
    const name = row.model.replace(/_/g, " ");
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    return [
      `${escapeHtml(label)}${row === bestModel ? ' <span class="tag">used</span>' : ""}`,
      formatPct(row.recall, 1),
      formatPct(row.precision, 1),
      formatDecimal(row.f1, 2),
      formatDecimal(row.roc_auc, 2),
    ];
  });

  const matrix = confusion?.matrix ?? [];
  const [[tn = 0, fp = 0], [fn = 0, tp = 0]] = matrix;
  const actualDowntime = tp + fn;
  const alarms = tp + fp;
  const recall = actualDowntime > 0 ? tp / actualDowntime : null;
  const precision = alarms > 0 ? tp / alarms : null;

  const generated = escapeHtml(
    generatedAt.toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>YarnLens plant report — ${generated}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    max-width: 880px;
    padding: 40px 32px 56px;
    background: #ffffff;
    color: #17150f;
    font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 13px;
    line-height: 1.55;
  }
  .eyebrow {
    margin: 0;
    color: #b8451a;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  h1 { margin: 8px 0 6px; font-size: 30px; letter-spacing: -0.035em; line-height: 1.1; }
  .meta { margin: 0; color: #797264; font-size: 12px; }
  h2 {
    margin: 34px 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e4dfd4;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  p { margin: 0 0 10px; }
  .lede { color: #4d473d; max-width: 70ch; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
  .stat { flex: 1 1 128px; padding: 10px 12px; border: 1px solid #e4dfd4; border-radius: 8px; }
  .stat span {
    display: block;
    color: #797264;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .stat strong { display: block; margin-top: 2px; font-size: 20px; letter-spacing: -0.02em; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th {
    padding: 6px 8px;
    border-bottom: 1px solid #cfc7b7;
    color: #797264;
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-align: left;
    text-transform: uppercase;
  }
  td { padding: 6px 8px; border-bottom: 1px solid #eee8dd; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
  }
  .badge--red { background: #fbe9e7; color: #a4231c; }
  .badge--amber { background: #fdf1dc; color: #8a5a06; }
  .badge--green { background: #e6f5ed; color: #0b6b45; }
  .tag {
    display: inline-block;
    margin-left: 4px;
    padding: 0 5px;
    border: 1px solid #e4dfd4;
    border-radius: 4px;
    color: #797264;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 8.5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .note {
    margin-top: 10px;
    padding: 10px 12px;
    border-left: 3px solid #b8451a;
    background: #f7f5f0;
    font-size: 12px;
  }
  .cols { display: flex; flex-wrap: wrap; gap: 28px; }
  .cols > * { flex: 1 1 320px; min-width: 0; }
  ul { margin: 0 0 10px; padding-left: 18px; color: #4d473d; }
  li { margin-bottom: 4px; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
  }
  footer {
    margin-top: 38px;
    padding-top: 12px;
    border-top: 1px solid #e4dfd4;
    color: #797264;
    font-size: 10.5px;
  }
  @media print {
    body { max-width: none; padding: 0 6mm; font-size: 11.5px; }
    h2 { page-break-after: avoid; }
    .note, .summary { page-break-inside: avoid; }
    footer { page-break-before: avoid; }
  }
</style>
</head>
<body>
  <header>
    <p class="eyebrow">YarnLens · plant report</p>
    <h1>Manufacturing risk report</h1>
    <p class="meta">Generated ${generated} · Synthetic dataset · ${formatInt(
      machines.length,
    )} machines across ${formatInt(lines.size)} lines · Open this file and print it to save a PDF.</p>
  </header>

  <section class="summary">
    <div class="stat"><span>Machines scored</span><strong>${formatInt(machines.length)}</strong></div>
    <div class="stat"><span>Check now</span><strong>${formatInt(counts.red)}</strong></div>
    <div class="stat"><span>Watch</span><strong>${formatInt(counts.amber)}</strong></div>
    <div class="stat"><span>OK</span><strong>${formatInt(counts.green)}</strong></div>
    <div class="stat"><span>Downtime readings</span><strong>${formatPct(
      kpis?.downtime_rate,
      1,
    )}</strong></div>
    <div class="stat"><span>Units with a defect</span><strong>${formatPct(
      kpis?.avg_defect_rate,
      2,
    )}</strong></div>
  </section>
  <p class="note"><strong>Status rule.</strong> Check now means a ${Math.round(
    redAt * 100,
  )}% or higher chance of breakdown. Watch runs from ${Math.round(
    amberAt * 100,
  )}% up to ${Math.round(redAt * 100)}%, and OK is below ${Math.round(
    amberAt * 100,
  )}%. The score ranks machines for a person to check; it is not a diagnosis.</p>

  <h2>Machines to check first</h2>
  <p class="lede">The ten highest scores on the latest reading. The main driver is the reading that moved the score most.</p>
  ${
    priorityRows.length > 0
      ? table(
          ["#", "Machine", "Line", "Status", "Chance", "Main driver"],
          priorityRows,
          [0, 4],
        )
      : "<p>No machine scores are available in the export.</p>"
  }

  <h2>By production line</h2>
  ${table(
    ["Line", "Machines", "Check now", "Watch", "OK", "Average chance"],
    lineRows,
    [1, 2, 3, 4, 5],
  )}

  ${
    defectRows.length > 0
      ? `<h2>Quality: defect rate by range</h2>
  <p class="lede">Each machine falls into one of ${defectRows.length} equal ranges of defect rate.
  ${defectPeak ? `The fullest range is ${defectPeak.bin_start.toFixed(2)}–${defectPeak.bin_end.toFixed(
          2,
        )}% with ${defectPeak.count} machines.` : ""}</p>
  ${table(["Defect rate range", "Machines"], defectRows, [1])}`
      : ""
  }

  <h2>How good the alarm is</h2>
  ${
    modelRows.length > 0
      ? table(
          ["Model", "Catches (recall)", "Alarm is right (precision)", "F1", "Ranking (ROC-AUC)"],
          modelRows,
          [1, 2, 3, 4],
        )
      : "<p>No model scores are available in the export.</p>"
  }
  ${
    matrix.length > 0
      ? `<div class="cols" style="margin-top:16px">
    <div>
      <p class="lede" style="margin-bottom:6px">Held-out rows, what really happened against what the model said.</p>
      ${table(
        ["", "Said OK", "Said downtime"],
        [
          ["<strong>Actually OK</strong>", formatInt(tn), formatInt(fp)],
          ["<strong>Actually downtime</strong>", formatInt(fn), formatInt(tp)],
        ],
        [1, 2],
      )}
    </div>
    <div>
      <p class="lede" style="margin-bottom:6px">In plain words</p>
      <p>The model caught <strong>${formatPct(recall, 1)}</strong> of real downtime and raised
      <strong>${formatInt(alarms)}</strong> alarms in total, of which
      <strong>${formatInt(fp)}</strong> were false (precision
      <strong>${formatPct(precision, 1)}</strong>). It missed
      <strong>${formatInt(fn)}</strong> breakdowns.</p>
      <p>Precision is low on purpose: running and downtime readings overlap, so the model is
      tuned to catch downtime rather than to avoid every false alarm. That is why it orders
      checks instead of replacing them.</p>
    </div>
  </div>`
      : ""
  }

  <h2>Where the numbers come from</h2>
  <div class="cols">
    <div>
      ${table(
        ["Cluster", "Value"],
        [
          ["NodeManagers", formatInt(cluster?.nodes)],
          ["Rows processed", formatInt(cluster?.rows_processed)],
          ["Hadoop", escapeHtml(cluster?.hadoop_version ?? "—")],
          ["Spark", escapeHtml(cluster?.spark_version ?? "—")],
        ],
      )}
    </div>
    <div>
      <p class="lede" style="margin-bottom:6px">Every figure in this report was read from the exported files:</p>
      <p><code>machine_risk.json</code> · <code>kpis.json</code> · <code>model_metrics.json</code>
      · <code>confusion_matrix.json</code> · <code>defect_distribution.json</code> ·
      <code>cluster_info.json</code></p>
      <p>The dashboard never queries the cluster live and never calls a third party.</p>
    </div>
  </div>

  <h2>How to read this report</h2>
  <ul>
    <li>A score is a ranking, not a diagnosis. It says which machine to look at first.</li>
    <li>Recall is the share of real downtime the model caught; precision is the share of alarms
    that were right. Low precision means some checks find a healthy machine.</li>
    <li>Every row is synthetic. The cluster runs on a single machine, so the numbers describe
    the pipeline, not a real factory.</li>
  </ul>

  <footer>
    Generated in the browser from <code>public/data/*.json</code>. No server, no database,
    no live cluster. Dataset is synthetic; results come from a containerized Hadoop/YARN/Spark
    cluster on a single machine.
  </footer>
</body>
</html>`;
}

/** Fetch the two files only the report needs, then hand the HTML to the browser. */
export async function downloadReport(input: {
  machines: MachineRisk[];
  kpis: Kpis | null;
  cluster: ClusterInfo | null;
  metrics: ModelMetric[];
}): Promise<void> {
  const load = async <T,>(file: string): Promise<T | null> => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/${file}.json`);
      if (!response.ok) {
        return null;
      }
      if (!(response.headers.get("content-type") ?? "").includes("json")) {
        return null;
      }
      return (await response.json()) as T;
    } catch {
      return null;
    }
  };

  const [defects, confusion] = await Promise.all([
    load<DefectBin[]>("defect_distribution"),
    load<ConfusionMatrix>("confusion_matrix"),
  ]);

  const html = buildReportHtml({
    ...input,
    defects,
    confusion,
    generatedAt: new Date(),
  });

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `yarnlens-plant-report-${stamp}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
