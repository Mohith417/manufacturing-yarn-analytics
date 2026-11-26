import { useEffect, useMemo, useState } from "react";
import "../styles-landing.css";
import GeoShapes, { GeoGlyph, type GeoGlyphKind } from "../components/GeoShapes";
import Icon from "../components/Icon";
import LogoMark from "../components/Logo";
import {
  formatDecimal,
  formatInt,
  formatPct,
  useJson,
  type ClusterInfo,
  type Kpis,
  type MachineRisk,
  type ModelMetric,
} from "../lib/data";
import { topByRisk } from "../lib/derive";
import type { PageId } from "../lib/nav";

const FEATURES: {
  title: string;
  summary: string;
  more: string;
  glyph: GeoGlyphKind;
}[] = [
  {
    title: "One ranked list",
    summary: "Every machine, highest chance of breakdown first.",
    more: "The first name is the one to check. The rest are already in order, so nobody compares charts before a shift.",
    glyph: "circle",
  },
  {
    title: "The reason, in words",
    summary: "Vibration, machine age or a long service gap.",
    more: "Each score names its main driver, so a check starts with a hypothesis instead of a guess.",
    glyph: "triangle",
  },
  {
    title: "Its mistakes on show",
    summary: "Precision, recall and the breakdowns it missed.",
    more: "The accuracy page prints the misses beside the hits. Nothing is hidden to make the number look better.",
    glyph: "square",
  },
  {
    title: "Yours to open",
    summary: "Five dashboard pages, no account needed.",
    more: "Today, machines, quality, accuracy and the method. Every page starts with the question it answers.",
    glyph: "ring",
  },
];

const STEPS: { title: string; ledger: string; body: string; tags: string[] }[] = [
  {
    title: "Collect",
    ledger: "Python → CSV",
    body: "data/generate_data.py writes machine and sensor logs: temperature, vibration, run hours, service history and one record for every production minute.",
    tags: ["synthetic source"],
  },
  {
    title: "Ingest",
    ledger: "HDFS + Hive",
    body: "The CSVs land in HDFS and become Hive tables, so every job downstream reads the same typed columns instead of ad-hoc files.",
    tags: ["schema first"],
  },
  {
    title: "Compute",
    ledger: "Spark on YARN",
    body: "Spark aggregates production, downtime and defects per machine per day, then joins them into the table the model learns from.",
    tags: ["2 nodes"],
  },
  {
    title: "Score",
    ledger: "scikit-learn",
    body: "Logistic regression, a decision tree and a random forest are trained and compared. The best-ranked model scores every machine's latest reading.",
    tags: ["joblib artifact"],
  },
  {
    title: "Publish",
    ledger: "JSON → React",
    body: "The exporter writes plain JSON into public/data/. This site reads those files directly — no API, no database, no third party.",
    tags: ["static build"],
  },
];

function scrollToSection(id: string) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    block: "start",
  });
}

export default function Landing({
  machines,
  loading,
  kpis,
  resolved,
  onToggleTheme,
  onNavigate,
  onReplayTour,
}: {
  machines: MachineRisk[];
  loading: boolean;
  kpis: Kpis | null;
  resolved: "light" | "dark";
  onToggleTheme: () => void;
  onNavigate: (page: PageId) => void;
  onReplayTour: () => void;
}) {
  const cluster = useJson<ClusterInfo>("cluster_info");
  const metrics = useJson<ModelMetric[]>("model_metrics");
  const [step, setStep] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  const best = useMemo(() => {
    const rows = metrics.data ?? [];
    return rows.reduce<ModelMetric | null>(
      (winner, row) => (!winner || row.roc_auc > winner.roc_auc ? row : winner),
      null,
    );
  }, [metrics.data]);

  const lines = useMemo(
    () => new Set(machines.map((machine) => machine.line)).size,
    [machines],
  );

  const watch = useMemo(() => topByRisk(machines, 3), [machines]);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".landing .yl-reveal"));
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduced = false;
    }
    if (reduced || !("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("is-in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -4% 0px", threshold: 0.05 },
    );
    nodes.forEach((node) => observer.observe(node));
    // A tab that is not visible never reports intersections. Reveal everything
    // shortly after mount so the page can never be stuck at opacity zero.
    const fallback = window.setTimeout(() => {
      nodes.forEach((node) => node.classList.add("is-in"));
    }, 1400);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className={`geo-header${scrolled ? " is-scrolled" : ""}`}>
        <div className="geo-wrap geo-header__inner">
          <button
            type="button"
            className="geo-brand"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="YarnLens, back to top"
          >
            <span className="geo-brand__mark">
              <LogoMark />
            </span>
            <span className="geo-brand__name">YarnLens</span>
          </button>

          <nav className="geo-nav" aria-label="Sections">
            <button type="button" onClick={() => scrollToSection("what")}>
              What you get
            </button>
            <button type="button" onClick={() => scrollToSection("pipeline")}>
              Pipeline
            </button>
            <button type="button" onClick={() => scrollToSection("model")}>
              Model
            </button>
          </nav>

          <div className="geo-header__end">
            <button
              type="button"
              className="geo-icon"
              onClick={onToggleTheme}
              aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={resolved === "dark" ? "Light theme" : "Dark theme"}
            >
              <Icon name={resolved === "dark" ? "sun" : "moon"} size={16} />
            </button>
            <button
              type="button"
              className="geo-btn geo-btn--primary geo-btn--sm"
              onClick={() => onNavigate("today")}
            >
              Open dashboard <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* ------------------------------------------------------------- hero */}
        <section className="geo-hero">
          <div className="geo-wrap">
            <div className="geo-hero__grid">
              <div className="geo-hero__copy">
                <p className="geo-chip">
                  <span className="geo-chip__dot" aria-hidden="true" />
                  Synthetic plant · morning report
                </p>

                <h1 className="geo-hero__title">
                  <span className="geo-hero__count">
                    {loading ? "—" : (kpis?.high_risk_count ?? "—")}
                  </span>
                  <span className="geo-hero__head">
                    machines need a <em>look</em> today.
                  </span>
                </h1>

                <p className="geo-hero__sub">
                  YarnLens reads every production minute from a small Hadoop and Spark
                  cluster, scores each machine on its chance of downtime, and puts the
                  ones worth checking at the top. Every figure on this page comes from
                  those exported files and nothing else.
                </p>

                <div className="geo-hero__actions">
                  <button
                    type="button"
                    className="geo-btn geo-btn--primary"
                    onClick={() => onNavigate("today")}
                  >
                    Read today's report <span aria-hidden="true">→</span>
                  </button>
                  <button
                    type="button"
                    className="geo-btn geo-btn--ghost"
                    onClick={() => scrollToSection("pipeline")}
                  >
                    How it works
                  </button>
                </div>

                <p className="geo-hero__meta">
                  {loading
                    ? "reading the export…"
                    : `${formatInt(machines.length)} machines · ${lines} lines · ${
                        kpis ? formatPct(kpis.downtime_rate, 1) : "—"
                      } downtime`}
                </p>
              </div>

              <div className="geo-stage">
                <GeoShapes />

                <div className="geo-stage__card">
                  <div className="geo-stage__head">
                    <span className="geo-mono">Watch list</span>
                    <span className="geo-mono">
                      top {watch.length} of {loading ? "—" : machines.length}
                    </span>
                  </div>

                  {loading ? (
                    <p className="geo-stage__empty">Reading machine scores…</p>
                  ) : watch.length === 0 ? (
                    <p className="geo-stage__empty">No machine scores are exported yet.</p>
                  ) : (
                    <ol className="geo-watch">
                      {watch.map((machine, index) => (
                        <li key={machine.machine_id}>
                          <span className="geo-watch__rank">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="geo-watch__id">
                            <strong>{machine.machine_id}</strong>
                            <small>{machine.line.replace("_", " ")}</small>
                          </span>
                          <span className="geo-watch__pct">
                            {Math.round(machine.risk_score * 100)}%
                          </span>
                          <span className="geo-watch__bar" aria-hidden="true">
                            <i
                              style={{
                                width: `${Math.min(100, Math.round(machine.risk_score * 100))}%`,
                              }}
                            />
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}

                  <button
                    type="button"
                    className="geo-stage__link"
                    onClick={() => onNavigate("today")}
                  >
                    Open the full dashboard <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </div>

            <dl className="geo-band">
              <div>
                <dt>Machines</dt>
                <dd>{loading ? "—" : formatInt(machines.length)}</dd>
              </div>
              <div>
                <dt>Downtime readings</dt>
                <dd>{kpis ? formatPct(kpis.downtime_rate, 1) : "—"}</dd>
              </div>
              <div>
                <dt>Units with a defect</dt>
                <dd>{kpis ? formatPct(kpis.avg_defect_rate, 2) : "—"}</dd>
              </div>
              <div>
                <dt>Rows through Spark</dt>
                <dd>{formatInt(cluster.data?.rows_processed)}</dd>
              </div>
              <div>
                <dt>Cluster</dt>
                <dd>
                  {cluster.data
                    ? `${cluster.data.nodes} nodes · Spark ${cluster.data.spark_version}`
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ----------------------------------------------------------- what */}
        <section className="geo-section" id="what">
          <div className="geo-wrap">
            <div className="geo-head yl-reveal">
              <p className="geo-kicker">01 / what you get</p>
              <h2 className="geo-h2">A morning brief, not a chart wall.</h2>
              <p className="geo-lede">
                Four things this dashboard does that a folder of exports does not. Each
                card carries the part that matters on the floor.
              </p>
            </div>

            <ul className="geo-cards yl-reveal">
              {FEATURES.map((item, index) => (
                <li className="geo-card" key={item.title}>
                  <div className="geo-card__top">
                    <GeoGlyph kind={item.glyph} />
                    <span className="geo-card__num">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p className="geo-card__summary">{item.summary}</p>
                  <p className="geo-card__more">{item.more}</p>
                </li>
              ))}
            </ul>

            <p className="geo-fine yl-reveal">
              A score ranks machines for a human to check. It is a rule of thumb, not a
              diagnosis — the dashboard says so wherever a score appears.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------- pipeline */}
        <section className="geo-section geo-section--tint" id="pipeline">
          <div className="geo-wrap">
            <div className="geo-head yl-reveal">
              <p className="geo-kicker">02 / pipeline</p>
              <h2 className="geo-h2">From a sensor line to a sentence.</h2>
              <p className="geo-lede">
                Five steps, all in the repository. Pick a step to see what happens inside
                it.
              </p>
            </div>

            <div className="geo-flow yl-reveal">
              <ol className="geo-stations">
                {STEPS.map((item, index) => (
                  <li key={item.title}>
                    <button
                      type="button"
                      className={`geo-station${step === index ? " is-active" : ""}`}
                      onClick={() => setStep(index)}
                      onMouseEnter={() => setStep(index)}
                      onFocus={() => setStep(index)}
                      aria-pressed={step === index}
                    >
                      <span className="geo-station__num">{index + 1}</span>
                      <span className="geo-station__title">{item.title}</span>
                      <span className="geo-station__ledger">{item.ledger}</span>
                    </button>
                  </li>
                ))}
              </ol>

              <div className="geo-flow__read" aria-live="polite">
                <div className="geo-flow__meta">
                  <span className="geo-mono">
                    Step {step + 1} of {STEPS.length}
                  </span>
                  <span className="geo-tags">
                    {STEPS[step].tags.map((tag) => (
                      <em key={tag}>{tag}</em>
                    ))}
                  </span>
                </div>

                <p className="geo-flow__body">{STEPS[step].body}</p>

                <dl className="geo-flow__facts">
                  <div>
                    <dt>Nodes</dt>
                    <dd>{cluster.data?.nodes ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Hadoop</dt>
                    <dd>{cluster.data?.hadoop_version ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Spark</dt>
                    <dd>{cluster.data?.spark_version ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Rows</dt>
                    <dd>{formatInt(cluster.data?.rows_processed)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- model */}
        <section className="geo-section geo-section--ink" id="model">
          <GeoShapes variant="band" />

          <div className="geo-wrap geo-model">
            <div className="geo-model__quote yl-reveal">
              <p className="geo-kicker geo-kicker--light">03 / the model</p>
              <blockquote>
                “It ranks machines for a human to check. It does not know what is wrong
                with the machine.”
              </blockquote>
              <p className="geo-model__by">
                The rule printed beside every score in the dashboard.
              </p>
            </div>

            <div className="geo-model__panel yl-reveal">
              <div className="geo-model__row is-head">
                <span>Model</span>
                <span>Value</span>
              </div>
              <div className="geo-model__row">
                <span>Selected</span>
                <strong>{best ? best.model.replace(/_/g, " ") : "—"}</strong>
              </div>
              <div className="geo-model__row">
                <span>ROC-AUC</span>
                <strong>{best ? formatDecimal(best.roc_auc, 2) : "—"}</strong>
              </div>
              <div className="geo-model__row">
                <span>Recall</span>
                <strong>{best ? formatPct(best.recall, 1) : "—"}</strong>
              </div>
              <div className="geo-model__row">
                <span>Precision</span>
                <strong>{best ? formatPct(best.precision, 1) : "—"}</strong>
              </div>
              <p className="geo-model__note">
                Precision is low on purpose. The model is tuned to catch downtime, so it
                raises more alarms than it needs to. Recall is the number that matters
                when a stopped line costs more than a false alarm.
              </p>
              <p className="geo-model__note">
                Need it on paper? <strong>Download report</strong> in the dashboard top bar
                writes this summary, the full accuracy table and the confusion matrix into
                one printable file.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ cta */}
        <section className="geo-cta">
          <GeoShapes variant="cta" />
          <div className="geo-wrap geo-cta__inner">
            <div className="geo-cta__copy">
              <p className="geo-kicker geo-kicker--light">04 / start here</p>
              <h2 className="geo-cta__title">
                Start with the machine that matters today.
              </h2>
            </div>
            <div className="geo-cta__actions">
              <button
                type="button"
                className="geo-btn geo-btn--invert"
                onClick={() => onNavigate("today")}
              >
                Read today's report <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className="geo-btn geo-btn--ghost-light"
                onClick={onReplayTour}
              >
                Replay the tour
              </button>
            </div>
          </div>
        </section>

        <footer className="geo-footer">
          <div className="geo-wrap geo-footer__inner">
            <div className="geo-footer__brand">
              <span className="geo-brand__mark">
                <LogoMark />
              </span>
              <span className="geo-brand__name">YarnLens</span>
            </div>
            <p className="geo-footer__note">
              <strong>Dataset is synthetic.</strong> Results come from a containerized
              Hadoop/YARN/Spark cluster on a single machine.
            </p>
            <div className="geo-footer__links">
              <button type="button" onClick={onReplayTour}>
                Replay tour
              </button>
              <a
                href="https://github.com/Mohith417/manufacturing-yarn-analytics"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                Top
              </button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
