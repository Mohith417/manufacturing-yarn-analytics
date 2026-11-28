import { useCallback, useEffect, useMemo, useState } from "react";
import CommandPalette from "./components/CommandPalette";
import DownloadReport from "./components/DownloadReport";
import Icon from "./components/Icon";
import LogoMark from "./components/Logo";
import MachineDrawer from "./components/MachineDrawer";
import Nav from "./components/Nav";
import WaveField from "./components/WaveField";
import {
  useJson,
  type Kpis,
  type MachineRisk,
  type ModelCoefficients,
  type RiskLevel,
} from "./lib/data";
import {
  OVERRIDE_EVENT,
  applyOverride,
  clearOverride,
  withOverrides,
} from "./lib/overrides";
import { PAGE_IDS, type PageId } from "./lib/nav";
import { useTheme } from "./lib/prefs";
import Accuracy from "./pages/Accuracy";
import History from "./pages/History";
import HowItWorks from "./pages/HowItWorks";
import Landing from "./pages/Landing";
import Live from "./pages/Live";
import Machines from "./pages/Machines";
import Quality from "./pages/Quality";
import Today from "./pages/Today";
import Upload from "./pages/Upload";

/** The marketing page is a route, but it lives outside the dashboard shell. */
type Route = "home" | PageId;

function pageFromHash(): Route {
  const hash = window.location.hash.replace("#", "");
  if (!hash || hash === "home") {
    return "home";
  }
  return (PAGE_IDS as readonly string[]).includes(hash) ? (hash as PageId) : "today";
}

export default function App() {
  const [page, setPage] = useState<Route>(pageFromHash);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { resolved, toggle } = useTheme();

  // The shell owns the three files the palette and the drawer need, so both
  // reuse one fetch instead of asking for the same JSON again.
  const machines = useJson<MachineRisk[]>("machine_risk");
  const model = useJson<ModelCoefficients>("model_coefficients");
  const kpis = useJson<Kpis>("kpis");

  // A kept what-if change lives in localStorage, not in the exported JSON, so
  // the fleet is re-merged whenever one is applied or restored.
  const [overrideTick, setOverrideTick] = useState(0);
  useEffect(() => {
    const refresh = () => setOverrideTick((tick) => tick + 1);
    window.addEventListener(OVERRIDE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(OVERRIDE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const machineList = useMemo(
    () => withOverrides(machines.data ?? [], model.data),
    [machines.data, model.data, overrideTick],
  );
  const selected = drawerId
    ? machineList.find((machine) => machine.machine_id === drawerId) ?? null
    : null;

  useEffect(() => {
    // Make the address bar match what is on screen: no hash means the landing
    // page, and an old bookmark (#overview, #prediction) falls back to Today.
    // This runs on every hash change, not just the first load, so a stale link
    // opened from inside the app does not leave the wrong hash in the address bar.
    const canonicaliseHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash) {
        window.history.replaceState(null, "", "#home");
      } else if (hash !== "home" && !(PAGE_IDS as readonly string[]).includes(hash)) {
        window.history.replaceState(null, "", "#today");
      }
    };
    const onHashChange = () => {
      setPage(pageFromHash());
      canonicaliseHash();
    };
    window.addEventListener("hashchange", onHashChange);
    canonicaliseHash();
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = useCallback((next: Route) => {
    setPage(next);
    if (window.location.hash !== `#${next}`) {
      window.location.hash = next;
    }
    window.scrollTo({ top: 0 });
  }, []);

  const openMachine = useCallback((id: string) => setDrawerId(id), []);
  const closeDrawer = useCallback(() => setDrawerId(null), []);

  const applyMachineChanges = useCallback(
    (machineId: string, features: Record<string, number>, score: number, level: RiskLevel) => {
      applyOverride(machineId, features, score, level);
    },
    [],
  );
  const restoreMachine = useCallback((machineId: string) => {
    clearOverride(machineId);
  }, []);

  return (
    <>
      {page === "home" ? (
        <Landing
          machines={machineList}
          loading={machines.loading}
          kpis={kpis.data}
          resolved={resolved}
          onToggleTheme={toggle}
          onNavigate={navigate}
        />
      ) : (
        <>
          {/* A quiet copy of the landing field, fixed behind every page. It is
              decorative, so it takes no pointer events and no tab stop. */}
          <WaveField variant="ambient" />

          <a className="skip-link" href="#main">
            Skip to content
          </a>

          <div className="shell">
            <header className="topbar">
              <button
                type="button"
                className="brand brand--topbar"
                onClick={() => navigate("home")}
                aria-label="YarnLens, go to the homepage"
              >
                <span className="brand__mark">
                  <LogoMark />
                </span>
                <span className="brand__name">
                  yarn<span>lens</span>
                </span>
              </button>

              <button
                type="button"
                className="searchbtn"
                onClick={() => setPaletteOpen(true)}
              >
                <Icon name="search" size={15} />
                <span className="searchbtn__label">Search machines or pages</span>
                <kbd className="searchbtn__kbd">Ctrl K</kbd>
              </button>

              <div className="topbar__right">
                <span
                  className="badge-synthetic"
                  title="Every row is generated by data/generate_data.py"
                >
                  <span className="badge-synthetic__dot" aria-hidden="true" />
                  Synthetic data
                </span>
                <DownloadReport />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={toggle}
                  aria-label={
                    resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"
                  }
                  title={resolved === "dark" ? "Light theme" : "Dark theme"}
                >
                  <Icon name={resolved === "dark" ? "sun" : "moon"} size={17} />
                </button>
              </div>
            </header>

            <Nav page={page} onNavigate={navigate} />

            <main className="main" id="main" tabIndex={-1}>
              <div className="page" key={page}>
                {page === "today" && (
                  <Today
                    machines={machineList}
                    machinesLoading={machines.loading}
                    machinesError={machines.error}
                    kpis={kpis.data}
                    rule={kpis.data?.risk_rule ?? null}
                    onOpenMachine={openMachine}
                  />
                )}
                {page === "machines" && (
                  <Machines
                    machines={machineList}
                    loading={machines.loading}
                    error={machines.error}
                    onOpenMachine={openMachine}
                  />
                )}
                {page === "upload" && (
                  <Upload
                    model={model.data}
                    modelError={model.error}
                    rule={kpis.data?.risk_rule ?? null}
                  />
                )}
                {page === "live" && (
                  <Live
                    machines={machineList}
                    model={model.data}
                    rule={kpis.data?.risk_rule ?? null}
                  />
                )}
                {page === "history" && (
                  <History
                    machines={machineList}
                    model={model.data}
                    rule={kpis.data?.risk_rule ?? null}
                  />
                )}
                {page === "quality" && <Quality />}
                {page === "accuracy" && <Accuracy />}
                {page === "how-it-works" && <HowItWorks />}
              </div>

              <footer className="footer">
                <p className="footer__note">
                  <strong>Dataset is synthetic.</strong> Results come from a containerized
                  Hadoop/YARN/Spark cluster on a single machine.
                </p>
                <div className="footer__links">
                  <a
                    className="footer__link"
                    href="https://github.com/Mohith417/manufacturing-yarn-analytics"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub
                  </a>
                  <span className="footer__sep" aria-hidden="true" />
                  <span>
                    Reads <code>public/data/*.json</code> only
                  </span>
                </div>
              </footer>
            </main>
          </div>
        </>
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
        onOpenMachine={openMachine}
        machines={machineList}
      />

      <MachineDrawer
        machine={selected}
        machines={machineList}
        model={model.data}
        modelError={model.error}
        rule={kpis.data?.risk_rule ?? null}
        onClose={closeDrawer}
        onApply={applyMachineChanges}
        onRestore={restoreMachine}
      />

    </>
  );
}
