/**
 * The report for a file the visitor uploaded.
 *
 * `report.ts` describes the sample plant that ships with the dashboard; this
 * one describes the CSV on screen: every scored row, the chance distribution,
 * each reading against the fleet average, and the rows that were skipped. It is
 * built in the browser from the same rows the table shows, so the download and
 * the page can never disagree.
 */
import {
  FEATURE_LABELS,
  STATUS_LABEL,
  formatDecimal,
  formatInt,
  formatPct,
  type ModelCoefficients,
  type RiskRule,
} from "./data";
import { escapeHtml, table } from "./report";
import { countLevels, uploadHeadline, type ScoredReading } from "./scoring";
import type { ValidationReport } from "./csv";

export interface UploadReportInput {
  rows: ScoredReading[];
  fileName: string;
  fileSize: number;
  report: ValidationReport | null;
  model: ModelCoefficients | null;
  rule: RiskRule | null;
  /** True when every row was scored, not only the latest row per machine. */
  everyRow: boolean;
  generatedAt: Date;
}

const FEATURE_ORDER = [
  "machine_age_years",
  "operating_hours",
  "temperature_c",
  "vibration_mm_s",
  "days_since_maintenance",
  "past_maintenance_events",
] as const;

function machineCell(row: ScoredReading): string {
  return `<strong>${escapeHtml(row.machineId)}</strong>`;
}

function whenCell(row: ScoredReading): string {
  return row.timestamp
    ? escapeHtml(row.timestamp.slice(0, 16).replace("T", " "))
    : `line ${row.line}`;
}

function driverCell(row: ScoredReading): string {
  if (row.drivers.length === 0) {
    return "<span class=\"muted\">No single reading stands out</span>";
  }
  return row.drivers
    .map((driver) => {
      const arrow = driver.direction === "above" ? "&uarr;" : "&darr;";
      const against =
        driver.ratio === null
          ? escapeHtml(driver.meanDisplay)
          : `${driver.direction} fleet average ${escapeHtml(driver.meanDisplay)}`;
      return `${escapeHtml(driver.label)} ${escapeHtml(driver.display)} ${arrow} <span class="small">(${against})</span>`;
    })
    .join("<br>");
}

function bandRows(rows: ScoredReading[]): string[][] {
  const bands = new Array(10).fill(0) as number[];
  for (const row of rows) {
    const index = Math.min(9, Math.max(0, Math.floor(row.score * 10)));
    bands[index] += 1;
  }
  return bands.map((count, index) => {
    const share = rows.length > 0 ? count / rows.length : 0;
    return [
      `${index * 10}–${index * 10 + 10}%`,
      formatInt(count),
      formatPct(share, 1),
      `<span class="bar"><span style="width:${Math.round(share * 100)}%"></span></span>`,
    ];
  });
}

function readingRows(rows: ScoredReading[], model: ModelCoefficients | null): string[][] {
  if (rows.length === 0) {
    return [];
  }
  return FEATURE_ORDER.filter((key) => rows[0].features[key] !== undefined).map((key) => {
    const values = rows.map((row) => row.features[key]).filter((value) => Number.isFinite(value));
    const total = values.reduce((sum, value) => sum + value, 0);
    const mean = values.length > 0 ? total / values.length : 0;
    const fleetMean = model ? model.means[model.features.indexOf(key)] : undefined;
    const above =
      typeof fleetMean === "number" && fleetMean > 0
        ? values.filter((value) => value > fleetMean).length
        : null;
    return [
      escapeHtml(FEATURE_LABELS[key] ?? key),
      formatDecimal(Math.min(...values), 2),
      formatDecimal(mean, 2),
      formatDecimal(Math.max(...values), 2),
      typeof fleetMean === "number" ? formatDecimal(fleetMean, 2) : "—",
      above === null ? "—" : formatInt(above),
    ];
  });
}

const STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; max-width: 900px; padding: 40px 32px 56px;
    background: #ffffff; color: #17150f;
    font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 13px; line-height: 1.55;
  }
  .eyebrow {
    margin: 0; color: #b8451a;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
  }
  h1 { margin: 8px 0 6px; font-size: 30px; letter-spacing: -0.035em; line-height: 1.1; }
  .meta { margin: 0; color: #797264; font-size: 12px; }
  h2 {
    margin: 34px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e4dfd4;
    font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  }
  p { margin: 0 0 10px; }
  .lede { color: #4d473d; max-width: 72ch; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
  .stat { flex: 1 1 118px; padding: 10px 12px; border: 1px solid #e4dfd4; border-radius: 8px; }
  .stat span {
    display: block; color: #797264;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase;
  }
  .stat strong { display: block; margin-top: 2px; font-size: 20px; letter-spacing: -0.02em; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th {
    padding: 6px 8px; border-bottom: 1px solid #cfc7b7; color: #797264;
    font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em;
    text-align: left; text-transform: uppercase;
  }
  td { padding: 6px 8px; border-bottom: 1px solid #eee8dd; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .badge { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; }
  .badge--red { background: #fbe9e7; color: #a4231c; }
  .badge--amber { background: #fdf1dc; color: #8a5a06; }
  .badge--green { background: #e6f5ed; color: #0b6b45; }
  .muted { color: #797264; }
  .small { color: #797264; font-size: 10.5px; }
  .bar { display: block; width: 160px; height: 6px; border-radius: 999px; background: #f1ece2; }
  .bar > span { display: block; height: 6px; border-radius: 999px; background: #b8451a; }
  .note {
    margin-top: 10px; padding: 10px 12px; border-left: 3px solid #b8451a;
    background: #f7f5f0; font-size: 12px;
  }
  .cols { display: flex; flex-wrap: wrap; gap: 28px; }
  .cols > * { flex: 1 1 320px; min-width: 0; }
  ul { margin: 0 0 10px; padding-left: 18px; color: #4d473d; }
  li { margin-bottom: 4px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }
  footer {
    margin-top: 38px; padding-top: 12px; border-top: 1px solid #e4dfd4;
    color: #797264; font-size: 10.5px;
  }
  @media print {
    body { max-width: none; padding: 0 6mm; font-size: 11.5px; }
    h2 { page-break-after: avoid; }
    .note, .summary { page-break-inside: avoid; }
  }
`;

/** A self-contained HTML report for one uploaded file: no scripts, no assets. */
export function buildUploadReportHtml(input: UploadReportInput): string {
  const { rows, fileName, fileSize, report, model, rule, everyRow, generatedAt } = input;
  const counts = countLevels(rows);
  const redAt = rule?.red_at ?? 0.7;
  const amberAt = rule?.amber_at ?? 0.4;

  const ranked = [...rows].sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 15);
  const topRows = top.map((row, index) => [
    String(index + 1),
    machineCell(row),
    whenCell(row),
    `<span class="badge badge--${row.level}">${escapeHtml(STATUS_LABEL[row.level])}</span>`,
    formatPct(row.score, 1),
    driverCell(row),
  ]);

  const meanScore = rows.length > 0 ? rows.reduce((sum, row) => sum + row.score, 0) / rows.length : 0;
  const highest = ranked[0] ?? null;

  const machines = new Set(rows.map((row) => row.machineId));
  const skipped = report?.skipped ?? [];
  const skippedShown = skipped.slice(0, 20);
  const skippedRows = skippedShown.map((skip) => [
    `Line ${skip.line}`,
    escapeHtml(skip.reason),
  ]);

  const generated = escapeHtml(
    generatedAt.toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  const scope = everyRow
    ? `every one of the ${formatInt(rows.length)} scored rows in the file`
    : `the latest row for each of ${formatInt(machines.size)} machines`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>YarnLens report — ${escapeHtml(fileName)}</title>
<style>${STYLES}</style>
</head>
<body>
  <header>
    <p class="eyebrow">YarnLens · uploaded file report</p>
    <h1>${escapeHtml(fileName)}</h1>
    <p class="meta">Generated ${generated} · ${(fileSize / 1024).toFixed(1)} KB ·
    ${formatInt(report?.rowsRead ?? rows.length)} rows read ·
    Scored in the browser with the saved logistic regression · No API, no upload</p>
  </header>

  <section class="summary">
    <div class="stat"><span>Rows scored</span><strong>${formatInt(rows.length)}</strong></div>
    <div class="stat"><span>Machines</span><strong>${formatInt(machines.size)}</strong></div>
    <div class="stat"><span>Check now</span><strong>${formatInt(counts.check)}</strong></div>
    <div class="stat"><span>Watch</span><strong>${formatInt(counts.watch)}</strong></div>
    <div class="stat"><span>OK</span><strong>${formatInt(counts.ok)}</strong></div>
    <div class="stat"><span>Rows skipped</span><strong>${formatInt(skipped.length)}</strong></div>
    <div class="stat"><span>Average chance</span><strong>${formatPct(meanScore, 1)}</strong></div>
    <div class="stat"><span>Highest chance</span><strong>${highest ? formatPct(highest.score, 1) : "—"}</strong></div>
  </section>

  <p class="note"><strong>${escapeHtml(uploadHeadline(rows))}.</strong>
  This report covers ${scope}. Status rule: Check now is ${Math.round(redAt * 100)}% or higher,
  Watch runs from ${Math.round(amberAt * 100)}% to ${Math.round(redAt * 100)}%,
  and OK is below ${Math.round(amberAt * 100)}%.</p>

  <h2>The file checks</h2>
  ${table(
    ["Check", "Result"],
    [
      ["Required columns present", report && report.missingColumns.length === 0 ? "Yes" : `Missing ${(report?.missingColumns ?? []).join(", ")}`],
      ["Columns found", formatInt(report?.header.length ?? 0)],
      ["Rows read", formatInt(report?.rowsRead ?? 0)],
      ["Rows that scored", formatInt(report?.rowsValid ?? rows.length)],
      ["Rows skipped", formatInt(skipped.length)],
      ["Scope of this report", everyRow ? "Every scored row" : "Latest row per machine"],
    ],
    [1],
  )}

  <h2>Machines to check first</h2>
  <p class="lede">The ${formatInt(top.length)} highest scores${rows.length > top.length ? ` of ${formatInt(rows.length)} scored rows` : ""}, with
  the readings that pushed each score up. An arrow after a reading means it is above or below
  the fleet average the model was trained on.</p>
  ${
    topRows.length > 0
      ? table(["#", "Machine", "Reading", "Status", "Chance", "Why this score"], topRows, [0, 4])
      : "<p>No row in this file could be scored.</p>"
  }

  <h2>How the chances are spread</h2>
  <p class="lede">Every scored row counted in ten bands. A file whose rows sit in the left bands is
  healthy; a file with rows in the right bands needs a look.</p>
  ${table(["Chance of breakdown", "Rows", "Share", ""], bandRows(rows), [1, 2])}

  <h2>Readings in this file</h2>
  <p class="lede">Minimum, average and maximum of each reading across the scored rows, next to the
  training-set average the model uses, and how many rows sit above it.</p>
  ${table(
    ["Reading", "Min", "Mean", "Max", "Fleet average", "Rows above average"],
    readingRows(rows, model),
    [1, 2, 3, 4, 5],
  )}

  <h2>Rows that were skipped</h2>
  ${
    skippedRows.length > 0
      ? `${table(["Row", "Reason"], skippedRows)}<p class="small">${
          skipped.length > skippedShown.length
            ? `${formatInt(skipped.length - skippedShown.length)} further skipped rows are listed in the scored CSV download.`
            : "Every skipped row in this file is listed above."
        }</p>`
      : "<p>No row was skipped: every row passed the column and value checks.</p>"
  }

  <h2>How to read this</h2>
  <ul>
    <li>A score is a ranking, not a diagnosis. It says which machine to look at first.</li>
    <li>The score comes from the saved logistic regression in
    <code>model_coefficients.json</code>, applied to your readings in this browser.</li>
    <li>${everyRow ? "Every row in the file was scored, so one machine can appear more than once." : "Only the latest row per machine was scored, matching the table on screen."}</li>
    <li>The model was trained on a synthetic plant dataset, so treat the numbers as indicative of the method, not of a real factory.</li>
  </ul>

  <footer>
    Generated in the browser from the file you chose. Nothing was uploaded to a server.
    Model trained on a synthetic dataset produced by a containerized Hadoop/YARN/Spark
    cluster on a single machine.
  </footer>
</body>
</html>`;
}

function download(html: string, fileName: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build the report for the rows on screen and hand it to the browser. */
export function downloadUploadReport(input: UploadReportInput): void {
  const base = input.fileName.replace(/\.csv$/i, "") || "yarnlens";
  const stamp = input.generatedAt.toISOString().slice(0, 10);
  download(buildUploadReportHtml(input), `${base}-report-${stamp}.html`);
}
