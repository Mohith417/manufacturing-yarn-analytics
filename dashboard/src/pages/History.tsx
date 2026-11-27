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
import { formatPct, type MachineRisk } from "../lib/data";
import {
  clearHistory,
  fetchHistory,
  fetchTrends,
  type HistoryReading,
  type TrendPoint,
} from "../lib/api";
import { useApiHealth } from "../lib/useApiHealth";
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

export default function History({ machines }: { machines: MachineRisk[] }) {
  const { mode, retry } = useApiHealth();
  const [machineId, setMachineId] = useState("");
  const [limit, setLimit] = useState(200);
  const [rows, setRows] = useState<HistoryReading[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);

  const machineIds = useMemo(
    () => [...new Set(machines.map((machine) => machine.machine_id))].sort(),
    [machines],
  );

  const load = useCallback(async () => {
    if (mode !== "live") {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [history, trend] = await Promise.all([fetchHistory(machineId, limit), fetchTrends(24)]);
      setRows(history.readings);
      setTrends(trend.points);
    } catch {
      setError("The local API did not answer. The stored history is still in the database.");
    } finally {
      setLoading(false);
    }
  }, [mode, machineId, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () =>
      trends.map((point) => ({
        label: bucketLabel(point.bucket),
        Risk: Math.round(point.avg_risk * 1000) / 10,
        Readings: point.count,
      })),
    [trends],
  );

  async function confirmClear() {
    setClearing(true);
    try {
      const result = await clearHistory();
      setCleared(result.deleted);
      setRows([]);
      setTrends([]);
      setConfirming(false);
    } catch {
      setError("History could not be cleared. Check that the local API is still running.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <PageHeader
        title="History"
        what="Every scored reading stored by the local API, so a machine's risk can be read over time instead of one moment."
        actions={
          mode === "live" ? (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setConfirming(true)}
              disabled={rows.length === 0 && trends.length === 0}
            >
              Clear history
            </button>
          ) : undefined
        }
      />

      {mode !== "live" ? (
        <Panel title="History needs the local API">
          <EmptyState
            message={
              mode === "checking"
                ? "Checking for the local scoring API…"
                : "Scored readings are stored in the local PostgreSQL database by the FastAPI service. The static site keeps working without it."
            }
            detail={
              mode === "checking"
                ? undefined
                : "Start it with: docker compose -f docker/docker-compose.app.yml up --build — then check again."
            }
          />
          <div className="upload-toolbar" style={{ borderBottom: 0, marginTop: 4 }}>
            <span className="upload-scoredby">Upload scoring and the live feed both write here.</span>
            <button type="button" className="btn btn--sm" onClick={() => void retry()}>
              Check again
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <Panel
            title="Average chance of breakdown per hour"
            subtitle="Last 24 hours of stored readings. One point per hour that has a reading."
            hint={trends.length > 0 ? `${trends.length} hours` : undefined}
          >
            {chartData.length === 0 ? (
              <div className="live-empty">
                No reading has been stored yet. Score a file on Upload and score, or run the
                live feed, and it will appear here.
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
            subtitle="Newest first. Simulated rows come from the live feed; upload rows come from a scored file."
            hint={loading ? "reading" : `${rows.length} rows`}
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

              <button type="button" className="btn btn--sm" onClick={() => void load()}>
                <Icon name="reset" size={13} />
                Refresh
              </button>

              <span className="history-meta">
                Stored rows: <strong>{rows.length}</strong>
              </span>
            </div>

            {cleared !== null && (
              <div className="notice notice--warn">
                <Icon name="check" size={15} />
                <div>
                  <p>History cleared: {cleared} stored readings were deleted.</p>
                </div>
              </div>
            )}

            {error && (
              <div className="notice notice--bad" role="alert">
                <Icon name="alert" size={15} />
                <div>
                  <p>{error}</p>
                </div>
              </div>
            )}

            {loading && rows.length === 0 ? (
              <Skeleton lines={5} />
            ) : rows.length === 0 ? (
              <EmptyState message="No stored reading matches this filter yet." />
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
                            {row.simulated ? "Simulated" : row.source === "upload" ? "Upload" : row.source}
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
              This deletes every scored reading in the local database, including rows written
              by the live feed. The machine scores in the JSON exports are not touched.
            </p>
            <div className="history-confirm__actions">
              <button
                type="button"
                className="btn"
                onClick={() => setConfirming(false)}
                autoFocus
                disabled={clearing}
              >
                Keep history
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void confirmClear()}
                disabled={clearing}
              >
                {clearing ? "Clearing…" : "Clear history"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
