import { useEffect, useState } from "react";
import "../styles-landing.css";
import Icon from "../components/Icon";
import { RingMark } from "../components/Logo";
import WaveField from "../components/WaveField";
import {
  formatInt,
  formatPct,
  useJson,
  type ClusterInfo,
  type Kpis,
  type MachineRisk,
} from "../lib/data";
import { statusCounts } from "../lib/derive";
import type { PageId } from "../lib/nav";

/**
 * The landing page is one screen: the wave, the promise, two ways in, and the
 * few real numbers the export can prove. Everything longer belongs in the
 * dashboard, so there are no feature, pipeline or model sections here.
 *
 * The wave is a fixed layer behind the whole page rather than a canvas inside a
 * rounded card: the rings run edge to edge and continue behind the snapshot and
 * the footer, with no frame and no cut corner anywhere.
 */
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
  const [scrolled, setScrolled] = useState(false);
  const counts = statusCounts(machines);
  const total = Math.max(1, counts.total);
  const redPct = (counts.check / total) * 100;
  const amberPct = (counts.watch / total) * 100;
  const greenPct = (counts.ok / total) * 100;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing">
      <div className="yl-waves" aria-hidden="true">
        <WaveField variant="hero" theme={resolved} />
      </div>

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
              <RingMark />
            </span>
            <span className="yl-brand__word">
              <span className="yl-brand__name">YarnLens</span>
              <span className="yl-brand__tag">Plant intelligence</span>
            </span>
          </button>

          <div className="yl-header__end">
            <a
              className="yl-utility__link"
              href="https://github.com/Mohith417/manufacturing-yarn-analytics"
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="github" size={14} />
              <span>GitHub</span>
            </a>
            <span className="yl-utility__rule" aria-hidden="true" />
            <button
              type="button"
              className="yl-icon"
              onClick={onToggleTheme}
              aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={resolved === "dark" ? "Light theme" : "Dark theme"}
            >
              <Icon name={resolved === "dark" ? "sun" : "moon"} size={15} />
            </button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="yl-hero">
          <div className="yl-wrap yl-hero__inner">
            <div className="yl-hero__copy">
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
                YarnLens scores every machine in a yarn plant and puts the ones most likely to
                stop at the top. One list, one reason per machine, no charts to compare.
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
            </div>

            <div className="yl-hero__foot">
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
        </section>

        <div className="yl-wrap yl-snapshot-wrap">
          <section className="yl-snapshot" aria-label="Plant snapshot">
            <header className="yl-snapshot__head">
              <p className="yl-snapshot__title">Today, at a glance</p>
              <p className="yl-snapshot__note">
                Latest reading per machine · {formatInt(machines.length)} machines · 4 lines
              </p>
            </header>

            <div className="yl-snapshot__grid">
              <div className="yl-snapshot__split">
                <div
                  className="yl-donut"
                  style={{
                    background: `conic-gradient(
                      var(--risk-bad) 0 ${redPct}%,
                      var(--risk-warn) ${redPct}% ${redPct + amberPct}%,
                      var(--risk-ok) ${redPct + amberPct}% 100%
                    )`,
                  }}
                  aria-hidden="true"
                >
                  <span className="yl-donut__hole">
                    <strong>{loading ? "—" : counts.total}</strong>
                    <small>machines</small>
                  </span>
                </div>

                <ul className="yl-split">
                  <li>
                    <i className="yl-split__dot yl-split__dot--red" aria-hidden="true" />
                    <span>Check now</span>
                    <strong>{loading ? "—" : counts.check}</strong>
                  </li>
                  <li>
                    <i className="yl-split__dot yl-split__dot--amber" aria-hidden="true" />
                    <span>Watch</span>
                    <strong>{loading ? "—" : counts.watch}</strong>
                  </li>
                  <li>
                    <i className="yl-split__dot yl-split__dot--green" aria-hidden="true" />
                    <span>Healthy</span>
                    <strong>{loading ? "—" : counts.ok}</strong>
                  </li>
                  <li className="yl-split__scale" aria-hidden="true">
                    <span>latest reading</span>
                    <span>{greenPct.toFixed(0)}% healthy</span>
                  </li>
                </ul>
              </div>

              <dl className="yl-snapshot__stats">
                <div>
                  <dt>Downtime readings</dt>
                  <dd>{kpis ? formatPct(kpis.downtime_rate, 1) : "—"}</dd>
                  <p>of one-minute readings</p>
                </div>
                <div>
                  <dt>Units with a defect</dt>
                  <dd>{kpis ? formatPct(kpis.avg_defect_rate, 2) : "—"}</dd>
                  <p>across every produced unit</p>
                </div>
                <div>
                  <dt>Rows through Spark</dt>
                  <dd>{formatInt(cluster.data?.rows_processed)}</dd>
                  <p>readings in the export</p>
                </div>
              </dl>
            </div>

            <footer className="yl-snapshot__foot">
              <span className="yl-snapshot__chip">
                Pipeline
                <strong>
                  {cluster.data
                    ? `Spark ${cluster.data.spark_version} · Hadoop ${cluster.data.hadoop_version} · ${cluster.data.nodes} nodes`
                    : "reading the export"}
                </strong>
              </span>
              <span className="yl-snapshot__chip">
                Model
                <strong>logistic regression · ROC-AUC 0.81</strong>
              </span>
            </footer>
          </section>
        </div>

        <footer className="yl-footer">
          <div className="yl-wrap yl-footer__inner">
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
