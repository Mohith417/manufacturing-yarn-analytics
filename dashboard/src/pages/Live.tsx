import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatPct, type MachineRisk, type ModelCoefficients, type RiskRule } from "../lib/data";
import { appendReadings, type StoredReading } from "../lib/history";
import { scoreFleet, seedFeatures, stepFleet, type LiveReading } from "../lib/live";
import "../styles-pages.css";

type Connection = "idle" | "live" | "paused";

interface Tick {
  label: string;
  average: number;
  highest: number;
}

interface Alert {
  key: string;
  machineId: string;
  risk: number;
  time: string;
}

const MAX_TICKS = 40;
const MAX_ALERTS = 12;
/** One batch every three seconds, as the local API stream did. */
const TICK_MS = 3000;

function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function Live({
  machines,
  model,
  rule,
}: {
  machines: MachineRisk[];
  model: ModelCoefficients | null;
  rule: RiskRule | null;
}) {
  const [connection, setConnection] = useState<Connection>("idle");
  const [readings, setReadings] = useState<Record<string, LiveReading>>({});
  const [series, setSeries] = useState<Tick[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [batches, setBatches] = useState(0);

  const featuresRef = useRef<Record<string, Record<string, number>>>({});
  const previousLevels = useRef<Record<string, string>>({});
  const wantedRef = useRef(false);

  /** One batch for every machine, scored with the saved model. */
  const tick = useCallback(() => {
    if (!model || machines.length === 0) {
      return;
    }
    const at = new Date().toISOString();
    featuresRef.current = stepFleet(featuresRef.current, machines);
    const batch = scoreFleet(featuresRef.current, machines, model, rule, at);

    const next: Record<string, LiveReading> = {};
    batch.forEach((reading) => {
      next[reading.machine_id] = reading;
    });
    setReadings((current) => ({ ...current, ...next }));
    setBatches((count) => count + 1);

    const risks = batch.map((reading) => reading.risk);
    const label = clockLabel(at);
    setSeries((current) =>
      [
        ...current,
        {
          label,
          average: risks.reduce((total, risk) => total + risk, 0) / risks.length,
          highest: Math.max(...risks),
        },
      ].slice(-MAX_TICKS),
    );

    // An alert fires when a machine enters Check now, not on every batch, so a
    // permanently risky machine does not flood the list.
    const fresh: Alert[] = [];
    batch.forEach((reading) => {
      const before = previousLevels.current[reading.machine_id];
      if (reading.status === "red" && before !== "red") {
        fresh.push({
          key: `${reading.machine_id}-${reading.timestamp}`,
          machineId: reading.machine_id,
          risk: reading.risk,
          time: label,
        });
      }
      previousLevels.current[reading.machine_id] = reading.status;
    });
    if (fresh.length > 0) {
      setAlerts((current) => [...fresh, ...current].slice(0, MAX_ALERTS));
    }

    // Every batch is kept in this browser, so the History page can plot it.
    appendReadings(
      batch.map(
        (reading) =>
          ({
            id: `live-${reading.timestamp}-${reading.machine_id}`,
            machine_id: reading.machine_id,
            risk: reading.risk,
            status: reading.status,
            simulated: true,
            source: "live",
            model: "logistic_regression",
            scored_at: reading.timestamp,
          }) satisfies StoredReading,
      ),
    );
  }, [machines, model, rule]);

  // The feed runs on a plain interval: no server, no connection to drop.
  useEffect(() => {
    if (connection !== "live") {
      return undefined;
    }
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [connection, tick]);

  const start = useCallback(() => {
    if (!model) {
      return;
    }
    wantedRef.current = true;
    if (Object.keys(featuresRef.current).length === 0) {
      featuresRef.current = seedFeatures(machines);
    }
    setConnection("live");
  }, [machines, model]);

  const pause = useCallback(() => {
    wantedRef.current = false;
    setConnection("paused");
  }, []);

  const reset = useCallback(() => {
    wantedRef.current = false;
    featuresRef.current = {};
    previousLevels.current = {};
    setReadings({});
    setSeries([]);
    setAlerts([]);
    setBatches(0);
    setConnection("idle");
  }, []);

  // A hidden tab stops generating batches. Coming back does not restart on its
  // own: the button says Resume, so the reader chooses.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && wantedRef.current) {
        pause();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  const machineReadings = useMemo(
    () => Object.values(readings).sort((a, b) => a.machine_id.localeCompare(b.machine_id)),
    [readings],
  );

  const latestBatch = useMemo(() => {
    if (machineReadings.length === 0) {
      return null;
    }
    const average =
      machineReadings.reduce((total, reading) => total + reading.risk, 0) /
      machineReadings.length;
    return {
      average,
      worst: machineReadings.reduce((best, reading) =>
        reading.risk > best.risk ? reading : best,
      ),
      at: machineReadings[0].timestamp,
    };
  }, [machineReadings]);

  const chartData = series.map((point) => ({
    label: point.label,
    Average: Math.round(point.average * 1000) / 10,
    Highest: Math.round(point.highest * 1000) / 10,
  }));

  const statusText: Record<Connection, string> = {
    idle: "Not started",
    live: "Streaming a simulated reading",
    paused: "Paused",
  };

  return (
    <>
      <PageHeader
        title="Live feed"
        what="A simulated reading for every machine, scored in this browser by the saved model. This is a demonstration stream, not plant telemetry."
      />

      <div className="live-bar">
        <span className={`live-badge${connection === "live" ? " is-running" : ""}`}>
          <i aria-hidden="true" /> Simulated data
        </span>
        <span className={`live-status live-status--${connection}`}>
          <i aria-hidden="true" />
          {statusText[connection]}
        </span>
        <div className="live-controls">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={start}
            disabled={!model || machines.length === 0 || connection === "live"}
          >
            {connection === "paused" ? "Resume" : "Start"}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={pause}
            disabled={connection !== "live"}
          >
            Pause
          </button>
          <button type="button" className="btn btn--sm" onClick={reset}>
            <Icon name="reset" size={13} />
            Reset
          </button>
        </div>
      </div>

      {!model || machines.length === 0 ? (
        <Panel title="Live mode needs the saved model and machine snapshot">
          <EmptyState
            message="The live feed drifts each machine's latest exported reading and scores it with model_coefficients.json."
            detail="public/data/machine_risk.json or model_coefficients.json did not load, so there is nothing to simulate yet."
          />
        </Panel>
      ) : (
        <>
          <div className="live-grid">
            <Panel
              title="Plant floor"
              subtitle="One tile per machine, coloured by the simulated reading that just arrived."
              hint={machineReadings.length > 0 ? `${machineReadings.length} machines` : undefined}
            >
              {machineReadings.length === 0 ? (
                <div className="live-empty">
                  Press <strong>Start</strong> to begin the stream. The first batch appears
                  immediately, then every {TICK_MS / 1000} seconds.
                </div>
              ) : (
                <div className="live-tiles">
                  {machineReadings.map((reading) => (
                    <div
                      key={reading.machine_id}
                      className={`live-tile live-tile--${reading.status}`}
                      title={`${reading.machine_id} · ${
                        reading.factors.join(", ") || "no single driver"
                      }`}
                    >
                      <span className="live-tile__id">{reading.machine_id}</span>
                      <span className="live-tile__risk">{formatPct(reading.risk, 0)}</span>
                    </div>
                  ))}
                </div>
              )}

              {latestBatch && (
                <dl className="live-meta">
                  <div>
                    <dt>Average chance</dt>
                    <dd>
                      <strong>{formatPct(latestBatch.average, 1)}</strong>
                    </dd>
                  </div>
                  <div>
                    <dt>Highest</dt>
                    <dd>
                      <strong>
                        {latestBatch.worst.machine_id} · {formatPct(latestBatch.worst.risk, 1)}
                      </strong>
                    </dd>
                  </div>
                  <div>
                    <dt>Batches</dt>
                    <dd>
                      <strong>{batches}</strong>
                    </dd>
                  </div>
                  <div>
                    <dt>Every</dt>
                    <dd>
                      <strong>{TICK_MS / 1000} s</strong>
                    </dd>
                  </div>
                </dl>
              )}
            </Panel>

            <Panel
              title="Alerts"
              subtitle="A machine appears here when it enters Check now."
              hint={alerts.length > 0 ? `${alerts.length}` : undefined}
            >
              {alerts.length === 0 ? (
                <div className="live-empty">No machine has entered Check now in this session.</div>
              ) : (
                <ul className="live-alerts">
                  {alerts.map((alert) => (
                    <li key={alert.key} className="live-alert">
                      <Icon name="alert" size={13} />
                      <strong>{alert.machineId}</strong>
                      <span>{formatPct(alert.risk, 0)} chance</span>
                      <span className="live-alert__time">{alert.time}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            title="Fleet risk"
            subtitle="Average and highest chance across all machines, one point per batch. Hover for the exact second."
          >
            {chartData.length === 0 ? (
              <div className="live-empty">The chart fills as soon as the stream starts.</div>
            ) : (
              <div className="live-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--text-3)" }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--border)" }}
                      minTickGap={36}
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
                      formatter={(value: number | string) => `${value}%`}
                    />
                    <Line
                      type="monotone"
                      dataKey="Average"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="Highest"
                      stroke="var(--chart-bar-muted)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <p className="upload-footnote">
            Each batch drifts every machine's latest reading with the same distributions as
            data/generate_data.py, then the saved logistic regression scores it in this
            browser. It is a demonstration of the live path, not a measurement of a real
            machine.
          </p>
        </>
      )}
    </>
  );
}
