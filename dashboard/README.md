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
  src/pages/           one component per page
  src/components/      shared UI (drawer, charts, nav, panels)
  src/lib/             JSON loading, derived readings, copy, preferences
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

## Pages

| Page | Content |
|---|---|
| Today | Generated headline ("N machines need attention today"), three status cards, plant-floor tile grid grouped by line, Start here top five with the leading factor, and three compact cards for production, downtime and defects — each with a one-line reading computed from the data |
| Machines | Search by machine, line or main driver; filter by line and status; sortable table; clicking a row opens the machine panel |
| Machine panel | Slide-over reused from the grid, the table and Ctrl+K: the risk sentence, five key readings, "Why this score" bars, the what-if sliders with current vs simulated risk, and one rule-of-thumb focus suggestion |
| Quality | Defect rate by range, the correlation heatmap on a blue-to-red diverging scale, and a generated "what this means" line under each chart |
| Accuracy | Plain verdict from the confusion matrix ("Catches 73% of real downtime…"), model comparison, what pushes the score, and the four outcomes with plain labels |
| How it works | Three steps from factory data to the dashboard, the cluster card, what the setup is not, and the GitHub link; also opens as a modal from the header and footer |

Shared chrome: left sidebar on desktop, bottom tab bar on mobile, light/dark
theme with the system setting as the default, Ctrl+K quick search over pages and
all machines, and a four-step first-visit tour that can be replayed.

## Design notes

- **Sans serif only.** Inter Variable is bundled through `@fontsource`, so the
  page makes no font request to a third party and works offline.
- **One accent.** Indigo is the only decorative colour. Green, amber and red
  appear only as machine status, always with an icon and the words OK / Watch /
  Check now, never colour alone.
- **Numbers have one source.** No figure on screen is typed into the code: it is
  read from a JSON file or computed from one. The only fixed numbers are slider
  limits derived from the fleet's own exported values.
- **Lost units removed.** `machine_risk.json` still contains the exporter's
  `est_lost_units` field, but the UI ignores it and ranks by risk only. The JSON
  is never edited by the frontend.
- **Honest partial day.** The dataset stops part-way through its final date, so
  that row is left out of every average, comparison and sparkline and is
  reported as partial instead of being read as a production drop.
- Motion is limited to 150–200 ms transitions and is disabled under
  `prefers-reduced-motion`. Loading uses skeletons, a missing file shows
  "Awaiting data export", and a bad file shows the reason.

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
