import { useEffect, useMemo, useState } from "react";
import "../styles-landing.css";
import Icon from "../components/Icon";
import LogoMark from "../components/Logo";
import WaveField from "../components/WaveField";
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
import type { PageId } from "../lib/nav";

const FEATURES: { title: string; summary: string; more: string }[] = [
  {
    title: "Plant floor",
    summary: "Every machine in one place, with the ones worth checking first at the top.",
    more: "One ranked list for the whole plant. The first name is the one to walk to.",
  },
  {
    title: "Upload and score",
    summary: "Drop in a CSV of readings and score it in the browser. Nothing is uploaded.",
    more: "The saved model is applied locally, then you download the scored table.",
  },
  {
    title: "Live feed",
    summary: "A simulated reading for every machine, scored every few seconds.",
    more: "Labelled Simulated wherever it appears. It needs the local API to run.",
  },
  {
    title: "History",
    summary: "Scored readings kept in a local database, so a trend can be read over time.",
    more: "Filter by machine, see risk over time, and clear the history when you are done.",
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
    body: "The exporter writes plain JSON into public/data/. The static pages read those files directly; the live features call a local API.",
    tags: ["static build"],
  },
];

const CHAIN = [
  { label: "Factory data", note: "sensors and maintenance logs" },
  { label: "Big-data cluster", note: "HDFS, YARN, Spark, Hive" },
  { label: "This dashboard", note: "one ranked list" },
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
}: {
  machines: MachineRisk[];
  loading: boolean;
  kpis: Kpis | null;
  resolved: "light" | "dark";
  onToggleTheme: () => void;
  onNavigate: (page: PageId) => void;
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

      <header className={`yl-header${scrolled ? " is-scrolled" : ""}`}>
        <div className="yl-wrap yl-header__inner">
          <button
            type="button"
            className="yl-brand"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="YarnLens, back to top"
          >
            <span className="yl-brand__mark">
              <LogoMark />
            </span>
            <span className="yl-brand__name">YarnLens</span>
          </button>

          <nav className="yl-nav" aria-label="Sections">
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

          <div className="yl-header__end">
            <button
              type="button"
              className="yl-icon"
              onClick={onToggleTheme}
              aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={resolved === "dark" ? "Light theme" : "Dark theme"}
            >
              <Icon name={resolved === "dark" ? "sun" : "moon"} size={16} />
            </button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="yl-hero">
          <div className="yl-wrap">
            <div className="yl-stage">
              <WaveField variant="hero" />
              <div className="yl-stage__veil" aria-hidden="true" />
              <div className="yl-stage__body">
                <p className="yl-stage__eyebrow">
                  <span aria-hidden="true" />
                  Synthetic plant · one ranked list
                </p>

                <h1 className="yl-stage__title">
                  Know which machine
                  <br />
                  to check <em>next.</em>
                </h1>

                <p className="yl-stage__sub">
                  YarnLens scores every machine in a yarn plant and puts the ones most likely
                  to stop at the top. One list, one reason per machine, no charts to compare.
                </p>

                <div className="yl-stage__actions">
                  <button
                    type="button"
                    className="yl-btn yl-btn--solid"
                    onClick={() => onNavigate("today")}
                  >
                    Open dashboard <span aria-hidden="true">→</span>
                  </button>
                  <button
                    type="button"
                    className="yl-btn yl-btn--onDark"
                    onClick={() => onNavigate("upload")}
                  >
                    Try with your own CSV
                  </button>
                </div>

                <p className="yl-stage__note">
                  <strong>Dataset is synthetic.</strong> Results come from a containerized
                  Hadoop/YARN/Spark cluster on a single machine.
                </p>
              </div>

              <div className="yl-stage__foot">
                <span className="yl-stage__chip">
                  <i aria-hidden="true" />
                  {loading ? "Reading the export" : `${kpis?.high_risk_count ?? 0} need a look today`}
                </span>
                <span className="yl-stage__meta">
                  {loading
                    ? "—"
                    : `${formatInt(machines.length)} machines · ${new Set(machines.map((m) => m.line)).size} lines`}
                </span>
              </div>
            </div>

            <dl className="yl-band">
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
        <section className="yl-section" id="what">
          <div className="yl-wrap">
            <div className="yl-head yl-reveal">
              <p className="yl-kicker">01 / what you get</p>
              <h2 className="yl-h2">A morning brief, not a chart wall.</h2>
              <p className="yl-lede">
                Four things this dashboard does that a folder of exports does not. Each
                card carries the part that matters on the floor.
              </p>
            </div>

            <ul className="yl-features yl-reveal">
              {FEATURES.map((item, index) => (
                <li className="yl-feature" key={item.title}>
                  <span className="yl-feature__top">
                    <span className="yl-feature__num">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="yl-feature__glyph" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <span className="yl-feature__more">{item.more}</span>
                </li>
              ))}
            </ul>

            <p className="yl-fine yl-reveal">
              A score ranks machines for a human to check. It is a rule of thumb, not a
              diagnosis — the dashboard says so wherever a score appears.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- pipeline */}
        <section className="yl-section" id="pipeline">
          <div className="yl-wrap">
            <div className="yl-head yl-reveal">
              <p className="yl-kicker">02 / how it works</p>
              <h2 className="yl-h2">From a sensor line to a sentence.</h2>
              <p className="yl-lede">
                Three stages between a machine and this screen, then the five steps inside
                them. Pick a step to see what happens.
              </p>
            </div>

            <ol className="yl-chain yl-reveal">
              {CHAIN.map((item, index) => (
                <li key={item.label}>
                  <span className="yl-chain__num">{String(index + 1).padStart(2, "0")}</span>
                  <span className="yl-chain__text">
                    <strong>{item.label}</strong>
                    <span>{item.note}</span>
                  </span>
                  {index < CHAIN.length - 1 && (
                    <span className="yl-chain__arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <div className="yl-flow yl-reveal">
              <ol className="yl-stations">
                {STEPS.map((item, index) => (
                  <li key={item.title}>
                    <button
                      type="button"
                      className={`yl-station${step === index ? " is-active" : ""}`}
                      onClick={() => setStep(index)}
                      onMouseEnter={() => setStep(index)}
                      onFocus={() => setStep(index)}
                      aria-pressed={step === index}
                    >
                      <span className="yl-station__dot" aria-hidden="true" />
                      <span className="yl-station__title">{item.title}</span>
                      <span className="yl-station__ledger yl-mono">{item.ledger}</span>
                    </button>
                  </li>
                ))}
              </ol>

              <div className="yl-flow__read" aria-live="polite">
                <div className="yl-flow__meta">
                  <span className="yl-mono">
                    Step {step + 1} of {STEPS.length}
                  </span>
                  <span className="yl-flow__tags">
                    {STEPS[step].tags.map((tag) => (
                      <em key={tag}>{tag}</em>
                    ))}
                  </span>
                </div>
                <p className="yl-flow__body">{STEPS[step].body}</p>
                <dl className="yl-flow__facts">
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

        {/* ------------------------------------------------------------ model */}
        <section className="yl-section yl-section--ink" id="model">
          <div className="yl-wrap yl-model">
            <div className="yl-model__quote yl-reveal">
              <p className="yl-kicker is-light">03 / the model</p>
              <blockquote>
                “It ranks machines for a human to check. It does not know what is wrong
                with the machine.”
              </blockquote>
              <p className="yl-model__by">
                The rule printed beside every score in the dashboard.
              </p>
            </div>

            <div className="yl-model__table yl-reveal">
              <div className="yl-model__row is-head">
                <span>Model</span>
                <span>Value</span>
              </div>
              <div className="yl-model__row">
                <span>Selected</span>
                <strong>{best ? best.model.replace(/_/g, " ") : "—"}</strong>
              </div>
              <div className="yl-model__row">
                <span>ROC-AUC</span>
                <strong>{best ? formatDecimal(best.roc_auc, 2) : "—"}</strong>
              </div>
              <div className="yl-model__row">
                <span>Recall</span>
                <strong>{best ? formatPct(best.recall, 1) : "—"}</strong>
              </div>
              <div className="yl-model__row">
                <span>Precision</span>
                <strong>{best ? formatPct(best.precision, 1) : "—"}</strong>
              </div>
              <p className="yl-model__note">
                Precision is low on purpose. The model is tuned to catch downtime, so it
                raises more alarms than it needs to. Recall is the number that matters
                when a stopped line costs more than a false alarm.
              </p>
              <p className="yl-model__note yl-model__download">
                Need it on paper? <strong>Download report</strong> in the dashboard top bar
                writes this summary, the full accuracy table and the confusion matrix into
                one printable file.
              </p>
            </div>
          </div>
        </section>

        <footer className="yl-footer">
          <div className="yl-wrap yl-footer__inner">
            <div className="yl-footer__brand">
              <span className="yl-brand__mark">
                <LogoMark />
              </span>
              <span className="yl-brand__name">YarnLens</span>
            </div>
            <p className="yl-footer__note">
              <strong>Dataset is synthetic.</strong> Results come from a containerized
              Hadoop/YARN/Spark cluster on a single machine.
            </p>
            <div className="yl-footer__links">
              <a
                href="https://github.com/Mohith417/manufacturing-yarn-analytics"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                Top
              </button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
