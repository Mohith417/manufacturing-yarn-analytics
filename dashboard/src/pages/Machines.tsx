import { useMemo, useState } from "react";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import Panel from "../components/Panel";
import RiskBadge from "../components/RiskBadge";
import Skeleton from "../components/Skeleton";
import { STATUS_LABEL, type MachineRisk, type RiskLevel } from "../lib/data";
import { leadFactor } from "../lib/derive";

type SortKey = "machine_id" | "line" | "risk";
type LevelFilter = "all" | RiskLevel;

export default function Machines({
  machines,
  loading,
  error,
  onOpenMachine,
}: {
  machines: MachineRisk[];
  loading: boolean;
  error: string | null;
  onOpenMachine: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [line, setLine] = useState("all");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [ascending, setAscending] = useState(false);

  const lines = useMemo(
    () => [...new Set(machines.map((machine) => machine.line))].sort((a, b) => a.localeCompare(b)),
    [machines],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = machines.filter((machine) => {
      const matchesQuery =
        needle === "" ||
        machine.machine_id.toLowerCase().includes(needle) ||
        machine.line.toLowerCase().replace("_", " ").includes(needle) ||
        leadFactor(machine).toLowerCase().includes(needle);
      const matchesLine = line === "all" || machine.line === line;
      const matchesLevel = level === "all" || machine.risk_level === level;
      return matchesQuery && matchesLine && matchesLevel;
    });

    return [...filtered].sort((a, b) => {
      let result = 0;
      if (sortKey === "machine_id") {
        result = a.machine_id.localeCompare(b.machine_id);
      } else if (sortKey === "line") {
        result = a.line.localeCompare(b.line) || a.machine_id.localeCompare(b.machine_id);
      } else {
        result = a.risk_score - b.risk_score;
      }
      return ascending ? result : -result;
    });
  }, [machines, query, line, level, sortKey, ascending]);

  function sortBy(key: SortKey) {
    if (key === sortKey) {
      setAscending((current) => !current);
    } else {
      setSortKey(key);
      setAscending(key === "machine_id" || key === "line");
    }
  }

  function sortIndicator(key: SortKey) {
    if (key !== sortKey) {
      return <span className="sort__idle" aria-hidden="true">↕</span>;
    }
    return (
      <span className="sort__active" aria-hidden="true">
        {ascending ? "↑" : "↓"}
      </span>
    );
  }

  return (
    <>
      <PageHeader
        title="Machines"
        what="Every machine on the plant floor, with the chance it breaks down and the reading behind that number."
      />

      <Panel
        title="All machines"
        subtitle="Search by machine, line or main driver, then narrow by line and status."
        hint={loading ? undefined : `${rows.length} of ${machines.length}`}
      >
        <div className="filters">
          <div className="field field--search">
            <label htmlFor="machine-search">Search</label>
            <div className="field__input">
              <Icon name="search" size={15} />
              <input
                id="machine-search"
                type="search"
                placeholder="M013, Line B, vibration…"
                value={query}
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="line-filter">Line</label>
            <select
              id="line-filter"
              value={line}
              onChange={(event) => setLine(event.target.value)}
            >
              <option value="all">All lines</option>
              {lines.map((name) => (
                <option key={name} value={name}>
                  {name.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="level-filter">Status</label>
            <select
              id="level-filter"
              value={level}
              onChange={(event) => setLevel(event.target.value as LevelFilter)}
            >
              <option value="all">All statuses</option>
              <option value="red">Check now</option>
              <option value="amber">Watch</option>
              <option value="green">OK</option>
            </select>
          </div>

          {/* The column headers carry sorting on desktop; on narrow screens the
              table becomes cards, so the same choice is offered here. */}
          <div className="field field--sort-sm">
            <label htmlFor="sort-select">Sort by</label>
            <select
              id="sort-select"
              value={`${sortKey}:${ascending ? "asc" : "desc"}`}
              onChange={(event) => {
                const [key, direction] = event.target.value.split(":") as [
                  SortKey,
                  "asc" | "desc",
                ];
                setSortKey(key);
                setAscending(direction === "asc");
              }}
            >
              <option value="risk:desc">Highest risk first</option>
              <option value="risk:asc">Lowest risk first</option>
              <option value="machine_id:asc">Machine ID</option>
              <option value="line:asc">Production line</option>
            </select>
          </div>

          {(query !== "" || line !== "all" || level !== "all") && (
            <button
              type="button"
              className="btn btn--ghost btn--sm filters__clear"
              onClick={() => {
                setQuery("");
                setLine("all");
                setLevel("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <Skeleton lines={7} />
        ) : error ? (
          <EmptyState
            message="The machine scores could not be read."
            detail={`machine_risk.json — ${error}`}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No machines match"
            message="Try a shorter search, another line, or clear the status filter."
          />
        ) : (
          <>
            <p className="scroll-hint scroll-hint--table-cards">
              Scroll sideways for the full table.
            </p>
            <div className="table-wrap">
              <table className="table table--machines">
              <caption className="sr-only">
                Machines, their line, status and chance of breakdown
              </caption>
              <thead>
                <tr>
                  <th aria-sort={sortKey === "machine_id" ? (ascending ? "ascending" : "descending") : "none"}>
                    <button type="button" className="sort" onClick={() => sortBy("machine_id")}>
                      Machine {sortIndicator("machine_id")}
                    </button>
                  </th>
                  <th aria-sort={sortKey === "line" ? (ascending ? "ascending" : "descending") : "none"}>
                    <button type="button" className="sort" onClick={() => sortBy("line")}>
                      Line {sortIndicator("line")}
                    </button>
                  </th>
                  <th>Status</th>
                  <th
                    className="num"
                    aria-sort={sortKey === "risk" ? (ascending ? "ascending" : "descending") : "none"}
                  >
                    <button type="button" className="sort" onClick={() => sortBy("risk")}>
                      Chance of breakdown {sortIndicator("risk")}
                    </button>
                  </th>
                  <th>Main driver</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((machine) => (
                  <tr
                    key={machine.machine_id}
                    className="row-click"
                    onClick={() => onOpenMachine(machine.machine_id)}
                  >
                    <td>
                      <strong>{machine.machine_id}</strong>
                      <span className="cell-line">{machine.line.replace("_", " ")}</span>
                    </td>
                    <td className="muted">{machine.line.replace("_", " ")}</td>
                    <td>
                      <RiskBadge level={machine.risk_level} size="sm" label={STATUS_LABEL[machine.risk_level]} />
                    </td>
                    <td className="num">
                      <span className="risk-cell">
                        <span className="meter" aria-hidden="true">
                          <span
                            className={`meter__fill meter__fill--${machine.risk_level}`}
                            style={{ width: `${Math.min(100, machine.risk_score * 100)}%` }}
                          />
                        </span>
                        <span className="cell-prefix">Chance: </span>
                        <strong>{Math.round(machine.risk_score * 100)}%</strong>
                      </span>
                    </td>
                    <td className="muted">
                      <span className="cell-prefix">Driver: </span>
                      {leadFactor(machine)}
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="row-open"
                        aria-label={`Open details for ${machine.machine_id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenMachine(machine.machine_id);
                        }}
                      >
                        <Icon name="arrowRight" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
