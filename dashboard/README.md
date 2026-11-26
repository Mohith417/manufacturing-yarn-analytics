# YarnLens — dashboard frontend

Static React + Vite + Recharts front end for the manufacturing pipeline. It reads
**only** the JSON files in `public/data/`; there is no backend, no database, no
login and no external API call of any kind.

The interface is written for factory staff: a maintenance supervisor, a plant
manager and a quality lead. It avoids model jargon in titles, defines the terms
it does use, and every headline or reading is generated from the exported
numbers rather than typed by hand.

## Structure

```
dashboard/
  src/App.tsx          shell: hash routing, theme, palette, drawer, tour
  src/pages/           Landing plus one component per dashboard page
  src/components/      shared UI (drawer, charts, nav, panels)
  src/lib/             JSON loading, derived readings, copy, preferences, report builder
  public/data/         the JSON contract the app reads
  scripts/             export_dashboard_data.py (CSV exports -> JSON)
```

## Run it

```powershell
# 1. regenerate the JSON contract from the CSVs the Spark jobs exported
.venv\Scripts\python.exe dashboard\scripts\export_dashboard_data.py

# 2. install and start the dev server
cd dashboard
npm install
npm run dev        # http://127.0.0.1:5173

# production build (static, deployable anywhere)
npm run build      # -> dashboard/dist
```

The exporter reads `dashboard/data/*.csv` only. If a CSV is absent it prints a
SKIP line and writes **no** JSON file, so the matching panel shows the
"Awaiting data export" empty state instead of a made-up value.

## Landing page (`#home`)

The app opens on a landing page at `#home` (an empty hash redirects there; an
unknown hash falls back to Today). It sits outside the dashboard shell and uses
the same design tokens, brand mark and JSON files as the pages behind it.

- **One dashboard button.** The hero's "Read today's report" is the only control
  that navigates into the app besides the page links. The header carries only the
  theme toggle, and the model band ends with a note pointing at the dashboard's
  report download rather than another link to Accuracy.
- **About-the-app content, not widgets.** The hero card lists four product
  promises and expands each on hover or tap; the "what you get" section has four
  feature cards whose detail line, accent rule and bar glyph animate on hover.
- **Shared numbers.** Headline count, stat band, pipeline facts and the model
  summary all come from `public/data/*.json`; nothing on the page is invented.
- **Tour.** The whole-site tour starts here, covers the landing page and one
  stop per dashboard page, and moves between routes itself.

## Downloadable report

**Download report** in the dashboard top bar builds a self-contained, printable HTML
file in the browser: `yarnlens-plant-report-YYYY-MM-DD.html` (about 11 KB, no
scripts or external assets). Open it anywhere and print it to PDF.

It reads the JSON already on the page plus `defect_distribution.json` and
`confusion_matrix.json`, fetched only when the button is pressed — there is no
server endpoint. Sections: summary counts and the status rule, the ten machines
to check first with their main driver, a per-line breakdown, defect-rate ranges,
the model comparison table with the confusion matrix in plain words, the cluster
and source files, and a "how to read this report" note. The builder lives in
`src/lib/report.ts`.

## Pages

| Page | Content |
|---|---|
| Today | Generated headline ("N machines need attention today"), three status cards, plant-floor tile grid grouped by line, Start here top five with the leading factor, and three compact cards for production, downtime and defects — each with a one-line reading computed from the data |
| Machines | Search by machine, line or main driver; filter by line and status; sortable table; clicking a row opens the machine panel |
| Machine panel | Slide-over reused from the grid, the table and Ctrl+K: the risk sentence, five key readings, "Why this score" bars, the what-if sliders with current vs simulated risk, and one rule-of-thumb focus suggestion |
| Quality | Defect rate by range, the correlation heatmap on a blue-to-red diverging scale, and a generated "what this means" line under each chart |
| Accuracy | Plain verdict from the confusion matrix ("Catches 73% of real downtime…"), model comparison, what pushes the score, and the four outcomes with plain labels |
| How it works | Three steps from factory data to the dashboard, the cluster card, what the setup is not, and the GitHub link |

Shared chrome: left sidebar on desktop, bottom tab bar on mobile, light/dark
theme with the system setting as the default, Ctrl+K quick search over pages and
all machines, and an eight-step whole-site tour (landing page included) that can
be replayed from the sidebar or the landing footer.

## Design notes

- **Sans serif and mono only.** Inter Variable is bundled through `@fontsource`,
  so the page makes no font request to a third party and works offline. Small
  labels and figures use the system monospace stack.
- **One accent.** Copper is the only decorative colour. Green, amber and red
  appear only as machine status, always with an icon and the words OK / Watch /
  Check now, never colour alone.
- **One hover language.** Cards lift 1–2 px, table rows tint, plant-floor tiles
  scale slightly, and the landing's detail text reveals itself — all with
  reduced-motion support. Page changes animate 240 ms of movement only, so a
  throttled tab never leaves a page stuck at opacity zero.
- **Numbers have one source.** No figure on screen is typed into the code: it is
  read from a JSON file or computed from one. The only fixed numbers are slider
  limits derived from the fleet's own exported values.
- **Lost units removed.** `machine_risk.json` still contains the exporter's
  `est_lost_units` field, but the UI ignores it and ranks by risk only. The JSON
  is never edited by the frontend.
- **Honest partial day.** The dataset stops part-way through its final date, so
  that row is left out of every average, comparison and sparkline and is
  reported as partial instead of being read as a production drop.
- Loading uses skeletons, a missing file shows "Awaiting data export", and a
  bad file shows the reason.

## Data contract (`public/data/`)

| File | Written from |
|---|---|
| `kpis.json` | sums over `production_by_day`, `downtime_by_machine`, `defect_by_machine`, count of red-risk rows |
| `production_trend.json` | `production_by_day.csv` |
| `machine_downtime.json` | `downtime_by_machine.csv` |
| `defect_distribution.json` | 8 equal-width ranges over the 50 per-machine `defect_rate` values |
| `correlation.json` | `correlation_matrix.csv` |
| `model_metrics.json` | `model_metrics.csv` |
| `feature_importance.json` | logistic-regression rows of `feature_importance.csv` |
| `confusion_matrix.json` | `confusion_matrix.csv` → `[[tn, fp], [fn, tp]]` |
| `machine_risk.json` | `machine_risk.csv` + `maintenance_priority.csv` |
| `model_coefficients.json` | `model_parameters.csv` (intercept, coefficients, means, stds) |
| `cluster_info.json` | verified cluster values (2 NodeManagers, Spark 3.5.9, Hadoop 3.3.6, 495,000 rows) |

`machine_risk.json` also carries each machine's current feature values, which the
what-if sliders use as their starting point.

## Risk badge rule

Red at ≥ 70 % predicted risk, amber at ≥ 40 %, green below. The threshold is a
display rule stored in `kpis.json` as `risk_rule`, not a property of each row; it
is shown in the UI.

## Honesty

Every row is synthetic (`data/generate_data.py`). Results come from a
containerized Hadoop/YARN/Spark cluster on one machine. YARN is the cluster's
resource manager — not storage and not a learning algorithm. The header badge and
the footer say so on every page. Low precision is a property of this synthetic
dataset and is explained on the Accuracy page rather than hidden.

`legacy/streamlit/app.py` is the previous Streamlit prototype and is kept for
reference; the app above replaces it.
