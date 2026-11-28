import { useMemo, useRef, useState } from "react";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import MachineDrawer from "../components/MachineDrawer";
import PageHeader from "../components/PageHeader";
import Panel from "../components/Panel";
import RiskBadge from "../components/RiskBadge";
import {
  latestPerMachine,
  parseCsv,
  toCsv,
  validateTable,
  type ParsedReading,
  type ValidationReport,
} from "../lib/csv";
import { formatPct, type MachineRisk, type ModelCoefficients, type RiskRule } from "../lib/data";
import { contributions } from "../lib/derive";
import { appendReadings, readingFromUpload } from "../lib/history";
import { scoreWithApi, type ModelName } from "../lib/api";
import {
  countLevels,
  driversFor,
  scoreReadings,
  uploadHeadline,
  type ScoredReading,
} from "../lib/scoring";
import { useApiHealth } from "../lib/useApiHealth";
import { downloadUploadReport } from "../lib/uploadReport";
import "../styles-pages.css";

const MODEL_LABEL: Record<ModelName, string> = {
  logistic_regression: "Logistic regression",
  decision_tree: "Decision tree",
  random_forest: "Random forest",
};

const SAMPLES = [
  { file: "sample_ok.csv", label: "Sample of 50 machines", tone: "good" as const },
  { file: "bad_missing_column.csv", label: "Test: a missing column", tone: "bad" as const },
  { file: "bad_empty_cells.csv", label: "Test: empty cells", tone: "bad" as const },
  { file: "bad_text_values.csv", label: "Test: text in a number column", tone: "bad" as const },
];

const MAX_BYTES = 10 * 1024 * 1024;

interface UploadState {
  name: string;
  size: number;
  status: "idle" | "reading" | "ready" | "error";
  error: string | null;
  report: ValidationReport | null;
  rows: ScoredReading[];
  apiNote: string | null;
  scoredBy: string;
}

const EMPTY: UploadState = {
  name: "",
  size: 0,
  status: "idle",
  error: null,
  report: null,
  rows: [],
  apiNote: null,
  scoredBy: "browser",
};

function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function factorsFor(features: Record<string, number>, model: ModelCoefficients): string[] {
  return contributions(features, model)
    .filter((item) => item.value > 0)
    .slice(0, 3)
    .map((item) => item.label);
}

export default function Upload({
  model,
  modelError,
  rule,
}: {
  model: ModelCoefficients | null;
  modelError: string | null;
  rule: RiskRule | null;
}) {
  const [state, setState] = useState<UploadState>(EMPTY);
  const [showAll, setShowAll] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [modelName, setModelName] = useState<ModelName>("logistic_regression");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mode, health } = useApiHealth();

  /** Switching latest/all invalidates any API-scored table: rescore it. */
  function changeRowScope(next: boolean) {
    setShowAll(next);
    setState((current) => ({ ...current, rows: [], apiNote: null, scoredBy: "browser" }));
  }

  const readings = useMemo<ParsedReading[]>(() => {
    if (!state.report) {
      return [];
    }
    return showAll ? state.report.readings : latestPerMachine(state.report.readings);
  }, [state.report, showAll]);

  const rows = useMemo<ScoredReading[]>(() => {
    if (!model || readings.length === 0) {
      return [];
    }
    return scoreReadings(readings, model, rule).sort((a, b) => b.score - a.score);
  }, [readings, model, rule]);

  const drawerMachines = useMemo<MachineRisk[]>(
    () =>
      rows.map((row) => ({
        machine_id: row.machineId,
        line: row.timestamp ? `Read at ${row.timestamp.slice(0, 16).replace("T", " ")}` : `Row ${row.line}`,
        age_years: row.features.machine_age_years,
        risk_score: row.score,
        risk_level: row.level,
        top_factors: model ? factorsFor(row.features, model) : [],
        features: row.features,
      })),
    [rows, model],
  );

  const selected = drawerMachines.find((_machine, index) => rows[index]?.key === selectedKey) ?? null;

  async function readFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setState({ ...EMPTY, name: file.name, size: file.size, status: "error", error: "That is not a .csv file. Choose a file ending in .csv." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setState({
        ...EMPTY,
        name: file.name,
        size: file.size,
        status: "error",
        error: "The file is larger than 10 MB. Split it and score the parts one at a time.",
      });
      return;
    }
    if (!model) {
      setState({
        ...EMPTY,
        name: file.name,
        size: file.size,
        status: "error",
        error: "The saved model settings (model_coefficients.json) are not available, so nothing can be scored.",
      });
      return;
    }

    setState({ ...EMPTY, name: file.name, size: file.size, status: "reading" });

    let text: string;
    try {
      text = await file.text();
    } catch {
      setState({
        ...EMPTY,
        name: file.name,
        size: file.size,
        status: "error",
        error: "The browser could not read that file.",
      });
      return;
    }

    const table = parseCsv(text);
    const report = validateTable(table);
    setShowAll(false);
    setSelectedKey(null);
    setState({
      name: file.name,
      size: file.size,
      status: report.fatal ? "error" : "ready",
      error: report.fatal,
      report,
      rows: [],
      apiNote: null,
      scoredBy: "browser",
    });

    // The scored file also becomes history, one row per machine, so a later
    // visit can compare this reading with the ones that followed it.
    if (!report.fatal && report.rowsValid > 0) {
      const at = new Date().toISOString();
      appendReadings(
        latestPerMachine(report.readings).map((reading) =>
          readingFromUpload(reading.machineId, reading.features, model, rule, at),
        ),
      );
    }
  }

  /** The local API scores exactly the rows on screen, when it is running. */
  async function scoreThroughApi(selectedModel: ModelName) {
    setModelName(selectedModel);
    if (selectedModel === "logistic_regression" || !state.report || readings.length === 0) {
      return;
    }
    try {
      const payload = readings.map((reading) => ({
        machine_id: reading.machineId,
        timestamp: reading.timestamp,
        machine_age_years: reading.features.machine_age_years,
        operating_hours: reading.features.operating_hours,
        temperature_c: reading.features.temperature_c,
        vibration_mm_s: reading.features.vibration_mm_s,
        days_since_maintenance: reading.features.days_since_maintenance,
        past_maintenance_events: reading.features.past_maintenance_events,
      }));
      const response = await scoreWithApi(selectedModel, payload);
      const scored = response.results.map((result, index) => {
        const reading = readings[index];
        return {
          key: `${reading.machineId}:${reading.line}`,
          machineId: reading.machineId,
          line: reading.line,
          timestamp: reading.timestamp,
          features: reading.features,
          score: result.risk,
          level: result.status,
          reasons: result.top_factors,
          drivers: model ? driversFor(reading.features, model) : [],
        } satisfies ScoredReading;
      });
      setState((current) => ({
        ...current,
        rows: scored.sort((a, b) => b.score - a.score),
        apiNote: null,
        scoredBy: response.model,
      }));
    } catch {
      setState((current) => ({
        ...current,
        apiNote: `${MODEL_LABEL[selectedModel]} needs the local API, which did not answer. The table below uses the saved logistic regression in the browser.`,
        scoredBy: "browser",
      }));
    }
  }

  // The API result replaces the browser result only when the chosen model is
  // one the browser cannot run. A failed call drops back to the saved model.
  const tableRows = state.rows.length > 0 && !state.apiNote ? state.rows : rows;
  const scoredBy = state.rows.length > 0 && !state.apiNote ? state.scoredBy : "browser";
  const counts = countLevels(tableRows);

  function downloadResults() {
    const header = [
      "machine_id",
      "timestamp",
      "risk",
      "status",
      "top_reasons",
      "machine_age_years",
      "operating_hours",
      "temperature_c",
      "vibration_mm_s",
      "days_since_maintenance",
      "past_maintenance_events",
    ];
    const body = tableRows.map((row) => [
      row.machineId,
      row.timestamp ?? "",
      row.score.toFixed(7),
      row.level === "red" ? "Check now" : row.level === "amber" ? "Watch" : "OK",
      row.reasons.join("; "),
      row.features.machine_age_years,
      row.features.operating_hours,
      row.features.temperature_c,
      row.features.vibration_mm_s,
      row.features.days_since_maintenance,
      row.features.past_maintenance_events,
    ]);
    const base = state.name.replace(/\.csv$/i, "") || "yarnlens";
    downloadText(`${base}-scored.csv`, toCsv(header, body));
  }

  const skipped = state.report?.skipped ?? [];
  const shownSkipped = skipped.slice(0, 12);

  return (
    <>
      <PageHeader
        title="Upload and score"
        what="Score a CSV of machine readings with the saved model. The file is read in this browser and never uploaded."
      />

      <section className="upload-grid">
        <Panel
          title="1 · Choose a file"
          subtitle="Drag a .csv here, or pick one. Required columns are listed below."
        >
          <div
            className={`dropzone${dragging ? " is-dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) {
                void readFile(file);
              }
            }}
          >
            <span className="dropzone__icon" aria-hidden="true">
              <Icon name="upload" size={20} />
            </span>
            <p className="dropzone__title">
              {state.status === "reading" ? "Reading the file…" : "Drop a CSV, or choose one"}
            </p>
            <p className="dropzone__hint">
              One row per reading. Several rows for one machine are fine — the latest row is
              used by default.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => inputRef.current?.click()}
            >
              Choose CSV
            </button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void readFile(file);
                }
                event.target.value = "";
              }}
            />
            {state.name && (
              <p className="dropzone__file">
                <Icon name="check" size={13} /> {state.name}
                <span>{(state.size / 1024).toFixed(1)} KB</span>
              </p>
            )}
          </div>

          {state.status === "error" && state.error && (
            <div className="notice notice--bad" role="alert">
              <Icon name="alert" size={15} />
              <div>
                <strong>{state.report ? "These rows cannot be scored" : "That file was not read"}</strong>
                <p>{state.error}</p>
              </div>
            </div>
          )}

          <div className="upload-samples">
            <div>
              <p className="upload-samples__title">No file handy?</p>
              <p className="upload-samples__note">
                Every sample is synthetic, generated from the same distributions as the
                training data.
              </p>
            </div>
            <ul>
              {SAMPLES.map((sample) => (
                <li key={sample.file}>
                  <a
                    className={`upload-sample${sample.tone === "bad" ? " upload-sample--bad" : ""}`}
                    href={`${import.meta.env.BASE_URL}samples/${sample.file}`}
                    download
                  >
                    <Icon name="download" size={13} />
                    {sample.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <dl className="upload-columns">
            <div>
              <dt>Required</dt>
              <dd>
                machine_id, machine_age_years, operating_hours, temperature_c,
                vibration_mm_s, days_since_maintenance, past_maintenance_events
              </dd>
            </div>
            <div>
              <dt>Optional</dt>
              <dd>timestamp — used to pick the latest row per machine</dd>
            </div>
          </dl>
        </Panel>

        <Panel
          title="2 · File check"
          subtitle="Every row is counted: read, scored, or skipped with a reason."
          hint={state.report ? `${state.report.rowsRead} rows read` : undefined}
        >
          {!state.report ? (
            <EmptyState message="Choose a file to see what was read, what was scored and what was skipped." />
          ) : (
            <div className="filecheck">
              <dl className="filecheck__stats">
                <div>
                  <dt>Columns found</dt>
                  <dd>{state.report.header.length}</dd>
                </div>
                <div>
                  <dt>Rows read</dt>
                  <dd>{state.report.rowsRead}</dd>
                </div>
                <div>
                  <dt>Rows scored</dt>
                  <dd>{state.report.rowsValid}</dd>
                </div>
                <div>
                  <dt>Skipped</dt>
                  <dd>{skipped.length}</dd>
                </div>
              </dl>

              {state.report.missingColumns.length > 0 && (
                <div className="notice notice--bad">
                  <Icon name="alert" size={15} />
                  <div>
                    <strong>Missing required columns</strong>
                    <p>{state.report.missingColumns.join(", ")}</p>
                  </div>
                </div>
              )}

              {state.report.unknownColumns.length > 0 && (
                <p className="filecheck__note">
                  Extra columns are ignored: {state.report.unknownColumns.join(", ")}.
                </p>
              )}

              {skipped.length > 0 ? (
                <div className="filecheck__skips">
                  <p className="filecheck__label">Skipped rows</p>
                  <ul>
                    {shownSkipped.map((skip) => (
                      <li key={`${skip.line}-${skip.reason}`}>
                        <span className="filecheck__line">Line {skip.line}</span>
                        <span>{skip.reason}</span>
                      </li>
                    ))}
                  </ul>
                  {skipped.length > shownSkipped.length && (
                    <p className="filecheck__note">
                      {skipped.length - shownSkipped.length} more skipped rows are in the
                      download.
                    </p>
                  )}
                </div>
              ) : (
                state.report.rowsRead > 0 && (
                  <p className="filecheck__ok">
                    <Icon name="check" size={14} /> Every row passed the column and value checks.
                  </p>
                )
              )}
            </div>
          )}
        </Panel>
      </section>

      <Panel
        title="3 · Results"
        subtitle={
          model
            ? "Ranked by chance of breakdown, highest first. Open a row for the reason and a what-if."
            : undefined
        }
        hint={tableRows.length > 0 ? `${tableRows.length} scored` : undefined}
        action={
          <div className="results-actions">
            {mode === "live" && (
              <label className="model-pick">
                Model
                <select
                  value={modelName}
                  onChange={(event) => void scoreThroughApi(event.target.value as ModelName)}
                >
                  {(health?.models ?? []).map((name) => (
                    <option key={name} value={name}>
                      {MODEL_LABEL[name] ?? name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {tableRows.length > 0 && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    downloadUploadReport({
                      rows: tableRows,
                      fileName: state.name,
                      fileSize: state.size,
                      report: state.report,
                      model,
                      rule,
                      everyRow: showAll,
                      generatedAt: new Date(),
                    })
                  }
                  title="Download a printable report of this file's scored rows"
                >
                  <Icon name="download" size={14} />
                  Download report
                </button>
                <button type="button" className="btn" onClick={downloadResults}>
                  <Icon name="download" size={14} />
                  Download results
                </button>
              </>
            )}
          </div>
        }
      >
        {!model ? (
          <EmptyState
            message="The saved model settings are not available, so this page cannot score a file."
            detail={modelError ? `model_coefficients.json — ${modelError}` : undefined}
          />
        ) : state.report && state.report.rowsValid === 0 ? (
          <EmptyState
            message="No row in this file could be scored."
            detail={
              state.report.fatal ??
              (skipped[0] ? `First problem, line ${skipped[0].line}: ${skipped[0].reason}` : undefined)
            }
          />
        ) : tableRows.length === 0 ? (
          <EmptyState message="Choose a file above to score it. Nothing leaves this computer." />
        ) : (
          <>
            <div className="upload-headline">
              <div>
                <p className="upload-headline__kicker">This file</p>
                <h3>{uploadHeadline(tableRows)}</h3>
              </div>
              <div className="upload-counts">
                <span className="upload-count upload-count--red">
                  <strong>{counts.check}</strong> Check now
                </span>
                <span className="upload-count upload-count--amber">
                  <strong>{counts.watch}</strong> Watch
                </span>
                <span className="upload-count upload-count--green">
                  <strong>{counts.ok}</strong> Healthy
                </span>
              </div>
            </div>

            <div className="upload-toolbar">
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(event) => changeRowScope(event.target.checked)}
                />
                Score every row, not just the latest row per machine
              </label>
              <span className="upload-scoredby">
                Scored by <strong>{scoredBy.replace(/_/g, " ")}</strong>
              </span>
            </div>

            {state.apiNote && (
              <div className="notice notice--warn">
                <Icon name="info" size={15} />
                <div>
                  <p>{state.apiNote}</p>
                </div>
              </div>
            )}

            <div className="table-wrap">
              <table className="table table--upload">
                <thead>
                  <tr>
                    <th scope="col" className="col-rank">
                      #
                    </th>
                    <th scope="col">Machine</th>
                    {showAll && <th scope="col">Timestamp</th>}
                    <th scope="col" className="col-score">
                      Chance of breakdown
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">Why this score</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, index) => (
                    <tr
                      key={row.key}
                      className={`is-clickable${selectedKey === row.key ? " is-selected" : ""}`}
                      onClick={() => setSelectedKey(row.key)}
                    >
                      <td className="num muted">{index + 1}</td>
                      <td>
                        <button
                          type="button"
                          className="linkbtn"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedKey(row.key);
                          }}
                        >
                          {row.machineId}
                        </button>
                      </td>
                      {showAll && (
                        <td className="num muted">
                          {row.timestamp ? row.timestamp.slice(0, 16).replace("T", " ") : `Line ${row.line}`}
                        </td>
                      )}
                      <td className="num col-score">
                        <span className={`risk-cell risk-cell--${row.level}`}>
                          <strong>{formatPct(row.score, 1)}</strong>
                          <span className="risk-bar">
                            <i style={{ width: `${Math.max(3, row.score * 100)}%` }} />
                          </span>
                        </span>
                      </td>
                      <td>
                        <RiskBadge level={row.level} size="sm" />
                      </td>
                      <td className="upload-reasons">
                        {row.drivers.length === 0 ? (
                          <span className="muted">No single reading stands out</span>
                        ) : (
                          <ul className="drivers">
                            {row.drivers.map((driver) => (
                              <li className="driver" key={driver.key}>
                                <span className="driver__label">{driver.label}</span>
                                <span className="driver__value">{driver.display}</span>
                                <span
                                  className={`driver__dir driver__dir--${driver.direction}`}
                                  title={
                                    driver.ratio === null
                                      ? `Fleet average ${driver.meanDisplay}`
                                      : `${driver.direction} the fleet average of ${driver.meanDisplay}`
                                  }
                                >
                                  {driver.direction === "above" ? "\u2191" : "\u2193"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="upload-footnote">
              A score ranks machines for a human to check. It is a rule of thumb, not a
              diagnosis. Top reasons name the readings pushing the score up, in plain words.
            </p>
          </>
        )}
      </Panel>

      <MachineDrawer
        machine={selected}
        machines={drawerMachines}
        model={model}
        modelError={modelError}
        rule={rule}
        onClose={() => setSelectedKey(null)}
      />
    </>
  );
}
