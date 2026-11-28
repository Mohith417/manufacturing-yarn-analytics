import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import Panel from "../components/Panel";
import RiskBadge from "../components/RiskBadge";
import Skeleton from "../components/Skeleton";
import { formatPct, type MachineRisk, type ModelCoefficients, type RiskRule } from "../lib/data";
import {
  clearStoredHistory,
  historyTrend,
  loadHistory,
  seedHistory,
  type StoredReading,
} from "../lib/history";
import "../styles-pages.css";

function bucketLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function History({
  machines,
  model,
  rule,
}: {
  machines: MachineRisk[];
  model: ModelCoefficients | null;
  rule: RiskRule | null;
}) {
  const [machineId, setMachineId] = useState("");
  const [limit, setLimit] = useState(200);
  const [all, setAll] = useState<StoredReading[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);
  /** False until the first read (and seed) finishes, so a slow load is not
   * mistaken for an empty history. */
  const [attempted, setAttempted] = useState(false);

  const reload = useCallback(() => setAll(loadHistory()), []);

  // Open the page with 24 hours of readings, once, so the chart is not empty on
  // a first visit. After that the live feed and uploads keep appending.
  useEffect(() => {
    if (model && machines.length > 0) {
      seedHistory(machines, model, rule);
    }
    reload();
    setAttempted(true);
  }, [machines, model, rule, reload]);

  // Another page wrote a reading (live feed batch, scored file): re-read.
  useEffect(() => {
    const onChange = () => reload();
    window.addEventListener("yarnlens:history", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("yarnlens:history", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [reload]);

  const machineIds = useMemo(
    () => [...new Set(machines.map((machine) => machine.machine_id))].sort(),
    [machines],
  );

  const filtered = useMemo(
    () => all.filter((row) => (machineId ? row.machine_id === machineId : true)),
    [all, machineId],
  );

  const rows = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  const trends = useMemo(() => historyTrend(filtered, 24), [filtered]);

  const chartData = useMemo(
    () =>
      trends.map((point) => ({
        label: bucketLabel(point.bucket),
        Risk: Math.round(point.avg_risk * 1000) / 10,
        Readings: point.count,
      })),
    [trends],
  );

  function confirmClear() {
    const deleted = clearStoredHistory();
    setAll([]);
    setCleared(deleted);
    setConfirming(false);
  }

  function rebuild() {
    if (!model) {
      return;
    }
    seedHistory(machines, model, rule, true);
    setCleared(null);
    reload();
  }

  return (
    <>
      <PageHeader
        title="History"
        what="Every scored reading kept in this browser, so a machine's risk can be read over time instead of one moment."
        actions={
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setConfirming(true)}
            disabled={all.length === 0}
          >
            Clear history
          </button>
        }
      />

      {!attempted ? (
        <Panel title="Reading this browser's history">
          <Skeleton lines={6} />
        </Panel>
      ) : !model || machines.length === 0 ? (
        <Panel title="History needs the machine snapshot and the saved model">
          <EmptyState
            message="Stored readings are scored with model_coefficients.json against each machine's latest reading in machine_risk.json."
            detail="Those two files did not load, so there is nothing to read over time yet."
          />
        </Panel>
      ) : (
        <>
          <Panel
            title="Average chance of breakdown per hour"
            subtitle="The last 24 hours of readings kept in this browser. One point per hour that has a reading."
            hint={trends.length > 0 ? `${trends.length} hours` : undefined}
          >
            {chartData.length === 0 ? (
              <div className="live-empty">
                No reading is stored in the last 24 hours. Run the live feed or score a file
                on Upload and score, and it will appear here.
              </div>
            ) : chartData.length < 2 ? (
              // A line needs two points. Saying so beats an empty frame.
              <div className="live-empty">
                One hour of readings so far: {chartData[0].Risk}% average over{" "}
                {chartData[0].Readings} stored readings. The trend line appears as soon as a
                second hour has data.
              </div>
            ) : (
              <div className="history-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--text-3)" }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--border)" }}
                      minTickGap={40}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: "var(--text-3)" }}
                      tickLine={false}
                      axisLine={false}
                      unit="%"
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 11,
                        color: "var(--text)",
                      }}
                      labelStyle={{ color: "var(--text-2)" }}
                      formatter={(value: number | string, name: string) =>
                        name === "Risk" ? `${value}%` : `${value} readings`
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="Risk"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ r: 2.5, strokeWidth: 0, fill: "var(--accent)" }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel
            title="Stored readings"
            subtitle="Newest first. Live rows come from the feed, upload rows from a scored file, sample rows from the first visit's history."
            hint={`${rows.length} rows`}
          >
            <div className="history-filters">
              <div className="field">
                <label htmlFor="history-machine">Machine</label>
                <select
                  id="history-machine"
                  value={machineId}
                  onChange={(event) => setMachineId(event.target.value)}
                >
                  <option value="">All machines</option>
                  {machineIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="history-limit">Rows</label>
                <select
                  id="history-limit"
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value))}
                >
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>

              <button type="button" className="btn btn--sm" onClick={reload}>
                <Icon name="reset" size={13} />
                Refresh
              </button>

              <span className="history-meta">
                Stored rows: <strong>{filtered.length}</strong>
              </span>
            </div>

            {cleared !== null && (
              <div className="notice notice--warn">
                <Icon name="check" size={15} />
                <div>
                  <p>
                    History cleared: {cleared} stored readings were removed from this browser.
                  </p>
                </div>
              </div>
            )}

            {rows.length === 0 ? (
              <>
                <EmptyState
                  message={
                    cleared !== null
                      ? "This browser has no stored readings now."
                      : "No stored reading matches this filter yet."
                  }
                  detail="Run the live feed or score a file to add readings, or rebuild the 24-hour sample below."
                />
                <div className="history-filters" style={{ borderBottom: 0 }}>
                  <button type="button" className="btn btn--sm" onClick={rebuild}>
                    Generate 24 hours of sample history
                  </button>
                </div>
              </>
            ) : (
              <div className="table-wrap">
                <table className="table table--history">
                  <thead>
                    <tr>
                      <th scope="col">Machine</th>
                      <th scope="col">Chance</th>
                      <th scope="col">Status</th>
                      <th scope="col">Source</th>
                      <th scope="col">Model</th>
                      <th scope="col">Stored at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.machine_id}</td>
                        <td className="num">{formatPct(row.risk, 1)}</td>
                        <td>
                          <RiskBadge level={row.status} size="sm" />
                        </td>
                        <td>
                          <span className={`source-tag${row.simulated ? " source-tag--sim" : ""}`}>
                            {row.source === "upload"
                              ? "Upload"
                              : row.source === "live"
                                ? "Live feed"
                                : "Simulated"}
                          </span>
                        </td>
                        <td className="muted">{row.model.replace(/_/g, " ")}</td>
                        <td className="muted">{stamp(row.scored_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {confirming && (
        <div className="history-confirm" role="dialog" aria-modal="true" aria-labelledby="clear-title">
          <div className="history-confirm__box">
            <h2 id="clear-title">Clear all stored readings?</h2>
            <p>
              This deletes every scoring this browser kept, including rows written by the
              live feed and by scored files. The machine scores in the JSON exports are not
              touched, and nothing on a server changes.
            </p>
            <div className="history-confirm__actions">
              <button
                type="button"
                className="btn"
                onClick={() => setConfirming(false)}
                autoFocus
              >
                Keep history
              </button>
              <button type="button" className="btn btn--primary" onClick={confirmClear}>
                Clear history
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
