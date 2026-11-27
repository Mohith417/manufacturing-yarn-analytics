import { useEffect, useState } from "react";
import "../styles-landing.css";
import Icon from "../components/Icon";
import LogoMark from "../components/Logo";
import WaveField from "../components/WaveField";
import {
  formatInt,
  formatPct,
  useJson,
  type ClusterInfo,
  type Kpis,
  type MachineRisk,
} from "../lib/data";
import type { PageId } from "../lib/nav";

/**
 * The landing page is one screen: the wave, the promise, two ways in, and the
 * few real numbers the export can prove. Everything longer belongs in the
 * dashboard, so there are no feature, pipeline or model sections here.
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

          <div className="yl-header__end">
            <a
              className="yl-header__link"
              href="https://github.com/Mohith417/manufacturing-yarn-analytics"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
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
              <WaveField variant="hero" theme={resolved} />
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
