import { useMemo, useState, type CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartTooltip from "../components/ChartTooltip";
import EmptyState from "../components/EmptyState";
import InfoTip from "../components/InfoTip";
import PageHeader from "../components/PageHeader";
import Panel from "../components/Panel";
import Skeleton from "../components/Skeleton";
import { GLOSSARY } from "../lib/copy";
import { FEATURE_LABELS, useJson, type Correlation, type DefectBin } from "../lib/data";
import { defectReading, strongestPair } from "../lib/derive";

const SHORT_LABELS: Record<string, string> = {
  machine_age_years: "Age",
  operating_hours: "Op. hrs",
  temperature_c: "Temp",
  vibration_mm_s: "Vibration",
  days_since_maintenance: "Days",
  past_maintenance_events: "Events",
  defect_rate: "Defects",
  downtime: "Downtime",
};

// Column headers are narrower than the row headers on a phone, so the two
// axes use different abbreviations. Full names stay in the reading and the
// per-cell tooltip.
const COL_LABELS: Record<string, string> = {
  ...SHORT_LABELS,
  vibration_mm_s: "Vib.",
  downtime: "Down.",
};

const FULL_LABELS: Record<string, string> = {
  ...FEATURE_LABELS,
  defect_rate: "Defect rate",
  downtime: "Downtime",
};

function displayLabel(key: string): string {
  return FULL_LABELS[key] ?? key.replace(/_/g, " ");
}

function correlationText(value: number): string {
  if (Math.abs(value) < 0.005) {
    return "0.00";
  }
  return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;
}

/**
 * Diverging scale: blue for a negative relationship, red for a positive one,
 * near-white in the middle. It is a correlation scale, not a risk colour.
 */
function cellStyle(value: number): { background: string; color: string } {
  const magnitude = Math.min(1, Math.abs(value));
  const strong = magnitude > 0.45;
  return {
    background:
      value >= 0
        ? `rgba(220, 38, 38, ${0.05 + magnitude * 0.85})`
        : `rgba(37, 99, 235, ${0.05 + magnitude * 0.85})`,
    color: strong ? "#ffffff" : "var(--text)",
  };
}

function Heatmap({ data }: { data: Correlation }) {
  const [hover, setHover] = useState<{ row: number; column: number } | null>(null);

  return (
    <div className="heatmap-wrap" onMouseLeave={() => setHover(null)}>
      <div
        className="heatmap"
        style={{ "--heatmap-cols": data.labels.length } as CSSProperties}
        role="table"
        aria-label="Correlation between operational readings"
      >
        <div className="heatmap__corner" role="presentation" />
        {data.labels.map((label, column) => (
          <div
            key={`col-${label}`}
            role="columnheader"
            className="heatmap__label heatmap__label--col"
            onMouseEnter={() => setHover({ row: -1, column })}
          >
            {COL_LABELS[label] ?? label}
          </div>
        ))}

        {data.matrix.map((row, rowIndex) => (
          <div key={`row-${data.labels[rowIndex]}`} role="row" className="heatmap__row">
            <div
              role="rowheader"
              className="heatmap__label"
              onMouseEnter={() => setHover({ row: rowIndex, column: -1 })}
            >
              {SHORT_LABELS[data.labels[rowIndex]] ?? data.labels[rowIndex]}
            </div>
            {row.map((value, columnIndex) => {
              const active =
                hover !== null &&
                (hover.row === rowIndex || hover.column === columnIndex);
              const a = displayLabel(data.labels[rowIndex]);
              const b = displayLabel(data.labels[columnIndex]);
              return (
                <div
                  key={`${rowIndex}-${columnIndex}`}
                  role="cell"
                  className={`heatmap__cell${active ? " is-active" : ""}${
                    rowIndex === columnIndex ? " is-diagonal" : ""
                  }`}
                  style={cellStyle(value)}
                  title={`${a} and ${b}: correlation ${value.toFixed(2)}`}
                  aria-label={`${a} and ${b}: correlation ${value.toFixed(2)}`}
                  onMouseEnter={() => setHover({ row: rowIndex, column: columnIndex })}
                >
                  {correlationText(value)}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="scale">
        <span>−1 · opposite</span>
        <span className="scale__bar" aria-hidden="true" />
        <span>+1 · together</span>
      </div>
    </div>
  );
}

export default function Quality() {
  const distribution = useJson<DefectBin[]>("defect_distribution");
  const correlation = useJson<Correlation>("correlation");

  const bins = distribution.data ?? [];
  const peak = useMemo(
    () => bins.reduce<DefectBin | null>((best, bin) => (!best || bin.count > best.count ? bin : best), null),
    [bins],
  );

  const chartRows = bins.map((bin) => ({
    label: `${bin.bin_start.toFixed(2)}–${bin.bin_end.toFixed(2)}%`,
    count: bin.count,
    isPeak: bin === peak,
  }));

  const strongest = useMemo(() => strongestPair(correlation.data), [correlation.data]);
  const machinesCounted = bins.reduce((total, bin) => total + bin.count, 0);

  return (
    <>
      <PageHeader
        title="Quality"
        what="How defect rates are spread across the plant, and which readings move together with them."
      />

      <div className="quality-grid">
        <Panel
          title="Defect rate by range"
          subtitle="Each machine falls into one of eight equal ranges. Taller bars mean more machines in that range."
          hint={bins.length > 0 ? `${machinesCounted} machines` : undefined}
        >
          {distribution.loading ? (
            <Skeleton variant="chart" />
          ) : bins.length === 0 ? (
            <EmptyState
              message="No defect-rate ranges are exported yet."
              detail={
                distribution.error ? `defect_distribution.json — ${distribution.error}` : undefined
              }
            />
          ) : (
            <>
              <div className="chart" style={{ height: 292 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="currentColor" strokeOpacity={0.14} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 9.5 }}
                      interval={0}
                      angle={-38}
                      textAnchor="end"
                      height={56}
                      dy={5}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      tick={{ fontSize: 10.5 }}
                    />
                    <Tooltip
                      content={
                        <ChartTooltip
                          format={(value) => `${value} machines`}
                          names={{ count: "Machines" }}
                          dots={false}
                        />
                      }
                      cursor={{ fill: "rgba(99, 102, 241, 0.07)" }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {chartRows.map((row) => (
                        <Cell key={row.label} fill={row.isPeak ? "#6366f1" : "#c7d2fe"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="reading">
                <strong>What this means:</strong> {defectReading(bins)}
              </p>
            </>
          )}
        </Panel>

        <Panel title="Reading the spread" subtitle="Built from the same export, not from a fitted curve.">
          {bins.length === 0 ? (
            <Skeleton lines={4} />
          ) : (
            <>
              <div className="stat-list">
                <div>
                  <span>Lowest range</span>
                  <strong>
                    {bins[0].bin_start.toFixed(2)}–{bins[0].bin_end.toFixed(2)}%
                  </strong>
                </div>
                <div>
                  <span>Highest range</span>
                  <strong>
                    {bins[bins.length - 1].bin_start.toFixed(2)}–
                    {bins[bins.length - 1].bin_end.toFixed(2)}%
                  </strong>
                </div>
                <div>
                  <span>Most common</span>
                  <strong>
                    {peak ? `${peak.count} machines` : "—"}
                    {peak && (
                      <small>
                        {peak.bin_start.toFixed(2)}–{peak.bin_end.toFixed(2)}%
                      </small>
                    )}
                  </strong>
                </div>
                <div>
                  <span>Machines counted</span>
                  <strong>{machinesCounted}</strong>
                </div>
              </div>
              <p className="reading reading--stacked">
                <strong>What this means:</strong> the {bins.length} ranges run from{" "}
                {bins[0].bin_start.toFixed(2)}% to{" "}
                {bins[bins.length - 1].bin_end.toFixed(2)}%, and {peak ? peak.count : 0}{" "}
                machines sit in the fullest one. The machines outside that range are the
                ones to look at first.
              </p>
            </>
          )}
        </Panel>
      </div>

      <Panel
        title="What moves together"
        subtitle={
          <>
            <InfoTip term="Correlation" definition={GLOSSARY.correlation.definition} />{" "}
            between operational readings, from −1 to +1. Hover a row or column to
            follow it.
          </>
        }
        hint={
          correlation.data
            ? `${correlation.data.labels.length} readings`
            : undefined
        }
      >
        {correlation.loading ? (
          <Skeleton variant="chart" />
        ) : correlation.error || !correlation.data?.labels.length ? (
          <EmptyState
            message="No correlation matrix is exported yet."
            detail={correlation.error ? `correlation.json — ${correlation.error}` : undefined}
          />
        ) : (
          <>
            <Heatmap data={correlation.data} />
            {strongest && (
              <p className="reading">
                <strong>What this means:</strong> {displayLabel(strongest.a)} and{" "}
                {displayLabel(strongest.b).toLowerCase()} move together most strongly (r ={" "}
                {strongest.value.toFixed(2)}). They rise together, but this does not prove
                that one causes the other.
              </p>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
