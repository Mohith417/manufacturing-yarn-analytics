import { useCallback, useEffect, useState } from "react";
import CommandPalette from "./components/CommandPalette";
import Icon from "./components/Icon";
import LogoMark from "./components/Logo";
import MachineDrawer from "./components/MachineDrawer";
import Nav from "./components/Nav";
import Tour from "./components/Tour";
import {
  useJson,
  type Kpis,
  type MachineRisk,
  type ModelCoefficients,
} from "./lib/data";
import { PAGE_IDS, type PageId } from "./lib/nav";
import { rememberTourDismissed, tourDismissed, useTheme } from "./lib/prefs";
import Accuracy from "./pages/Accuracy";
import HowItWorks from "./pages/HowItWorks";
import Landing from "./pages/Landing";
import Machines from "./pages/Machines";
import Quality from "./pages/Quality";
import Today from "./pages/Today";

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
  const [tourOpen, setTourOpen] = useState(false);
  const { resolved, toggle } = useTheme();

  // The shell owns the three files the palette and the drawer need, so both
  // reuse one fetch instead of asking for the same JSON again.
  const machines = useJson<MachineRisk[]>("machine_risk");
  const model = useJson<ModelCoefficients>("model_coefficients");
  const kpis = useJson<Kpis>("kpis");

  const machineList = machines.data ?? [];
  const selected = drawerId
    ? machineList.find((machine) => machine.machine_id === drawerId) ?? null
    : null;

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHashChange);
    // Make the address bar match what is on screen: no hash means the landing
    // page, and an old bookmark (#overview, #prediction) falls back to Today.
    const hash = window.location.hash.replace("#", "");
    if (!hash) {
      window.history.replaceState(null, "", "#home");
    } else if (hash !== "home" && !(PAGE_IDS as readonly string[]).includes(hash)) {
      window.history.replaceState(null, "", "#today");
    }
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

  // A first visit gets the tour once; the landing page is where it starts.
  useEffect(() => {
    if (page !== "home" || tourDismissed()) {
      return;
    }
    const timer = window.setTimeout(() => setTourOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [page]);

  const navigate = useCallback((next: Route) => {
    setPage(next);
    if (window.location.hash !== `#${next}`) {
      window.location.hash = next;
    }
    window.scrollTo({ top: 0 });
  }, []);

  const openMachine = useCallback((id: string) => setDrawerId(id), []);
  const closeDrawer = useCallback(() => setDrawerId(null), []);
  const closeTour = useCallback(() => {
    setTourOpen(false);
    rememberTourDismissed();
  }, []);
  const replayTour = useCallback(() => setTourOpen(true), []);

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
          onReplayTour={replayTour}
        />
      ) : (
        <>
          <a className="skip-link" href="#main">
            Skip to content
          </a>

          <Nav
            page={page}
            onNavigate={navigate}
            onHome={() => navigate("home")}
            onReplayTour={replayTour}
          />

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
      />

      <Tour
        open={tourOpen}
        page={page}
        onNavigate={navigate}
        onClose={closeTour}
      />
    </>
  );
}
