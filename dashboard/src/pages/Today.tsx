import { useMemo } from "react";
import EmptyState from "../components/EmptyState";
import InfoTip from "../components/InfoTip";
import PageHeader from "../components/PageHeader";
import Panel from "../components/Panel";
import PlantFloor from "../components/PlantFloor";
import RiskBadge from "../components/RiskBadge";
import Skeleton from "../components/Skeleton";
import Sparkline from "../components/Sparkline";
import TrendCard from "../components/TrendCard";
import { GLOSSARY } from "../lib/copy";
import {
  formatDate,
  formatInt,
  formatPct,
  useJson,
  type DefectBin,
  type Kpis,
  type MachineDowntime,
  type MachineRisk,
  type RiskRule,
  type TrendPoint,
} from "../lib/data";
import {
  completeDays,
  defectReading,
  downtimeReading,
  leadFactor,
  productionReading,
  statusCounts,
  topByRisk,
  weekOverWeek,
} from "../lib/derive";

function headlineFor(check: number, watch: number): string {
  if (check === 1) {
    return "1 machine needs attention today";
  }
  if (check > 1) {
    return `${check} machines need attention today`;
  }
  if (watch > 0) {
    return "No machine needs a check now";
  }
  return "Every machine looks healthy today";
}

export default function Today({
  machines,
  machinesLoading,
  machinesError,
  kpis,
  rule,
  onOpenMachine,
  onShowMachines,
}: {
  machines: MachineRisk[];
  machinesLoading: boolean;
  machinesError: string | null;
  kpis: Kpis | null;
  rule: RiskRule | null;
  onOpenMachine: (id: string) => void;
  onShowMachines: () => void;
}) {
  const trend = useJson<TrendPoint[]>("production_trend");
  const downtime = useJson<MachineDowntime[]>("machine_downtime");
  const defects = useJson<DefectBin[]>("defect_distribution");

  const counts = useMemo(() => statusCounts(machines), [machines]);
  const start = useMemo(() => topByRisk(machines, 5), [machines]);
  const points = trend.data ?? [];
  const complete = useMemo(() => completeDays(points), [points]);
  const wow = useMemo(() => weekOverWeek(complete), [complete]);
  const last = points[points.length - 1];
  const partialLastDay = points.length > 0 && complete.length < points.length;

  const bins = defects.data ?? [];

  if (machinesError) {
    return (
      <>
        <PageHeader
          title="Today"
          what="The machines that need a look first, and how output, downtime and defects are moving."
        />
        <Panel title="Plant status">
          <EmptyState
            message="The machine scores could not be read, so this page has nothing to rank."
            detail={`machine_risk.json — ${machinesError}`}
          />
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Today"
        what="The machines that need a look first, and how output, downtime and defects are moving."
        actions={
          <button type="button" className="btn btn--sm" onClick={onShowMachines}>
            All machines
          </button>
        }
      />

      <section className="hero" aria-live="polite">
        {machinesLoading ? (
          <div className="hero__loading">
            <Skeleton lines={2} />
          </div>
        ) : (
          <>
            <p className="hero__kicker">Plant status</p>
            <h2 className="hero__line">{headlineFor(counts.check, counts.watch)}</h2>
            <p className="hero__sub">
              {counts.watch === 1
                ? "1 machine is on watch"
                : `${counts.watch} machines are on watch`}{" "}
              and {counts.ok === 1 ? "1 looks healthy" : `${counts.ok} look healthy`} out of{" "}
              {counts.total}.
            </p>
          </>
        )}
      </section>

      <div className="status-row">
        <article className="card status-card status-card--red">
          <div className="status-card__top">
            <RiskBadge level="red" />
          </div>
          <div className="status-card__count">{machinesLoading ? "—" : counts.check}</div>
          <p className="status-card__note">
            {rule
              ? `${Math.round(rule.red_at * 100)}% or more chance of breakdown`
              : "Highest chance of breakdown"}
          </p>
        </article>
        <article className="card status-card status-card--amber">
          <div className="status-card__top">
            <RiskBadge level="amber" />
          </div>
          <div className="status-card__count">{machinesLoading ? "—" : counts.watch}</div>
          <p className="status-card__note">
            {rule
              ? `${Math.round(rule.amber_at * 100)}% up to ${Math.round(rule.red_at * 100)}%`
              : "Worth keeping an eye on"}
          </p>
        </article>
        <article className="card status-card status-card--green">
          <div className="status-card__top">
            <RiskBadge level="green" label="Healthy" />
          </div>
          <div className="status-card__count">{machinesLoading ? "—" : counts.ok}</div>
          <p className="status-card__note">
            {rule
              ? `Below ${Math.round(rule.amber_at * 100)}% chance of breakdown`
              : "No action suggested"}
          </p>
        </article>
      </div>

      <div className="today-grid">
        <Panel
          id="tour-plantfloor"
          title="Plant floor"
          subtitle="One tile per machine, grouped by line. Hover for the number; click to open it."
          hint={`${counts.total} machines`}
        >
          {machinesLoading ? (
            <Skeleton variant="tiles" />
          ) : machines.length === 0 ? (
            <EmptyState message="No machine scores are exported yet." />
          ) : (
            <PlantFloor machines={machines} onOpen={onOpenMachine} />
          )}
        </Panel>

        <Panel
          id="tour-starthere"
          title="Start here"
          subtitle={
            <>
              The five machines to look at first, highest{" "}
              <InfoTip term="chance of breakdown" definition={GLOSSARY.risk.definition} />{" "}
              on top.
            </>
          }
          hint="Top 5"
        >
          {machinesLoading ? (
            <Skeleton lines={5} />
          ) : start.length === 0 ? (
            <EmptyState message="No machine scores are exported yet." />
          ) : (
            <ol className="start">
              {start.map((machine, index) => (
                <li key={machine.machine_id}>
                  <button
                    type="button"
                    className="start__row"
                    onClick={() => onOpenMachine(machine.machine_id)}
                  >
                    <span className="start__rank" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="start__id">
                      <strong>{machine.machine_id}</strong>
                      <small>{machine.line.replace("_", " ")}</small>
                    </span>
                    <span className="start__why">
                      {leadFactor(machine)}
                      <small>main driver</small>
                    </span>
                    <span className="start__pct">
                      {Math.round(machine.risk_score * 100)}%
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="trend-row">
        <TrendCard
          label="Production"
          value={wow ? formatInt(wow.recent) : complete.length > 0 ? formatInt(complete[complete.length - 1].units) : "—"}
          unit="units a day"
          reading={trend.loading ? "Reading the production export…" : productionReading(points)}
        >
          {complete.length > 1 && (
            <Sparkline
              values={complete.slice(-30).map((row) => row.units)}
              label="Daily units over the last 30 complete days"
            />
          )}
        </TrendCard>

        <TrendCard
          label="Downtime rate"
          value={formatPct(kpis?.downtime_rate, 1)}
          unit="of readings"
          reading={
            downtime.loading
              ? "Reading the downtime export…"
              : downtimeReading(downtime.data ?? [], kpis?.downtime_rate)
          }
          tip={GLOSSARY.downtime.definition}
        />

        <TrendCard
          label="Defect rate"
          value={formatPct(kpis?.avg_defect_rate, 2)}
          unit="of units"
          reading={defects.loading ? "Reading the quality export…" : defectReading(bins)}
          tip={GLOSSARY.defectRate.definition}
        />
      </div>

      {partialLastDay && last && (
        <p className="footnote">
          The export stops part-way through {formatDate(last.date)}, so that day is left
          out of every average and comparison above.
        </p>
      )}
    </>
  );
}
