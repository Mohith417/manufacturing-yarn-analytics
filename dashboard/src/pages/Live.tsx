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
import { formatPct } from "../lib/data";
import { streamUrl, type StreamReading } from "../lib/api";
import { useApiHealth } from "../lib/useApiHealth";
import "../styles-pages.css";

type Connection = "idle" | "connecting" | "live" | "paused" | "error";

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

interface Batch {
  at: string;
  interval_seconds: number;
  readings: StreamReading[];
}

const MAX_TICKS = 40;
const MAX_ALERTS = 12;

export default function Live() {
  const { mode, retry } = useApiHealth();
  const [connection, setConnection] = useState<Connection>("idle");
  const [readings, setReadings] = useState<Record<string, StreamReading>>({});
  const [series, setSeries] = useState<Tick[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [interval, setIntervalSeconds] = useState(3);
  const [batches, setBatches] = useState(0);

  const sourceRef = useRef<EventSource | null>(null);
  const wantedRef = useRef(false);
  const previousLevels = useRef<Record<string, string>>({});

  const closeSource = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const handleBatch = useCallback((batch: Batch) => {
    setIntervalSeconds(batch.interval_seconds);
    setBatches((count) => count + 1);

    const next: Record<string, StreamReading> = {};
    batch.readings.forEach((reading) => {
      next[reading.machine_id] = reading;
    });
    setReadings((current) => ({ ...current, ...next }));

    if (batch.readings.length > 0) {
      const risks = batch.readings.map((reading) => reading.risk);
      const average = risks.reduce((total, risk) => total + risk, 0) / risks.length;
      const highest = Math.max(...risks);
      const label = new Date(batch.at).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setSeries((current) => [...current, { label, average, highest }].slice(-MAX_TICKS));
    }

    // An alert fires when a machine enters "Check now", not on every reading,
    // so a permanently risky machine does not flood the list.
    const fresh: Alert[] = [];
    batch.readings.forEach((reading) => {
      const before = previousLevels.current[reading.machine_id];
      if (reading.status === "red" && before !== "red") {
        fresh.push({
          key: `${reading.machine_id}-${reading.timestamp}`,
          machineId: reading.machine_id,
          risk: reading.risk,
          time: new Date(reading.timestamp).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        });
      }
      previousLevels.current[reading.machine_id] = reading.status;
    });
    if (fresh.length > 0) {
      setAlerts((current) => [...fresh, ...current].slice(0, MAX_ALERTS));
    }
  }, []);

  const connect = useCallback(() => {
    if (mode !== "live") {
      return;
    }
    closeSource();
    setConnection("connecting");
    const source = new EventSource(streamUrl());
    sourceRef.current = source;

    source.addEventListener("hello", () => setConnection("live"));
    source.addEventListener("batch", (event) => {
      setConnection("live");
      try {
        handleBatch(JSON.parse((event as MessageEvent).data) as Batch);
      } catch {
        // A malformed frame is skipped; EventSource keeps the connection open.
      }
    });
    source.addEventListener("reading", (event) => {
      try {
        const reading = JSON.parse((event as MessageEvent).data) as StreamReading;
        handleBatch({
          at: reading.timestamp,
          interval_seconds: 3,
          readings: [reading],
        });
      } catch {
        // Ignore a single bad frame.
      }
    });
    source.onopen = () => setConnection("live");
    source.onerror = () => setConnection("error");
  }, [mode, handleBatch, closeSource]);

  const start = useCallback(() => {
    wantedRef.current = true;
    connect();
  }, [connect]);

  const pause = useCallback(() => {
    wantedRef.current = false;
    closeSource();
    setConnection("paused");
  }, [closeSource]);

  const reset = useCallback(() => {
    setReadings({});
    setSeries([]);
    setAlerts([]);
    setBatches(0);
    previousLevels.current = {};
  }, []);

  // Connect once the health probe says the API is up, and stop on unmount.
  useEffect(() => {
    if (mode === "live" && wantedRef.current && !sourceRef.current) {
      connect();
    }
  }, [mode, connect]);

  useEffect(
    () => () => {
      wantedRef.current = false;
      closeSource();
    },
    [closeSource],
  );

  // A hidden tab pauses the stream instead of letting it run in the background.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && sourceRef.current) {
        closeSource();
        setConnection("paused");
      } else if (document.visibilityState === "visible" && wantedRef.current) {
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [connect, closeSource]);

  const machines = useMemo(
    () => Object.values(readings).sort((a, b) => a.machine_id.localeCompare(b.machine_id)),
    [readings],
  );

  const latestBatch = useMemo(() => {
    if (machines.length === 0) {
      return null;
    }
    const average =
      machines.reduce((total, reading) => total + reading.risk, 0) / machines.length;
    return {
      average,
      worst: machines.reduce((best, reading) => (reading.risk > best.risk ? reading : best)),
      at: machines[0].timestamp,
    };
  }, [machines]);

  const chartData = series.map((tick) => ({
    label: tick.label,
    Average: Math.round(tick.average * 1000) / 10,
    Highest: Math.round(tick.highest * 1000) / 10,
  }));

  const statusText: Record<Connection, string> = {
    idle: "Not started",
    connecting: "Connecting to the local API",
    live: "Streaming a simulated reading",
    paused: "Paused",
    error: "The stream dropped — retrying",
  };

  return (
    <>
      <PageHeader
        title="Live feed"
        what="A simulated reading for every machine, scored by the local API. This is a demonstration stream, not plant telemetry."
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
            disabled={mode !== "live" || connection === "live" || connection === "connecting"}
          >
            Start
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={pause}
            disabled={connection !== "live" && connection !== "connecting" && connection !== "error"}
          >
            Pause
          </button>
          <button type="button" className="btn btn--sm" onClick={reset}>
            <Icon name="reset" size={13} />
            Reset
          </button>
        </div>
      </div>

      {mode !== "live" ? (
        <Panel title="Live mode needs the local API">
          <EmptyState
            message={
              mode === "checking"
                ? "Checking for the local scoring API…"
                : "This page streams scored readings from the local FastAPI service. Nothing is broken: every static page still works."
            }
            detail={
              mode === "checking"
                ? undefined
                : "Start it with: docker compose -f docker/docker-compose.app.yml up --build — then check again."
            }
          />
          <div className="upload-toolbar" style={{ borderBottom: 0, marginTop: 4 }}>
            <span className="upload-scoredby">
              The API answers on <code>{streamUrl().replace("/api/stream", "")}</code>
            </span>
            <button type="button" className="btn btn--sm" onClick={() => void retry()}>
              Check again
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <div className="live-grid">
            <Panel
              title="Plant floor"
              subtitle="One tile per machine, coloured by the simulated reading that just arrived."
              hint={machines.length > 0 ? `${machines.length} machines` : undefined}
            >
              {machines.length === 0 ? (
                <div className="live-empty">
                  Press <strong>Start</strong> to open the stream. The first batch arrives
                  within a few seconds.
                </div>
              ) : (
                <div className="live-tiles">
                  {machines.map((reading) => (
                    <div
                      key={reading.machine_id}
                      className={`live-tile live-tile--${reading.status}`}
                      title={`${reading.machine_id} · ${reading.factors.join(", ") || "no single driver"}`}
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
                      <strong>{interval} s</strong>
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
            The generator drifts each machine's latest reading with the same distributions as
            data/generate_data.py, then the API scores it. It is a demonstration of the live
            path, not a measurement of a real machine.
          </p>
        </>
      )}
    </>
  );
}
