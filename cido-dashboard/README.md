# CIDO Project Dashboard

Google Sheets + Apps Script web app that tracks indicator progress for the Integrated Health,
Protection & WASH project (Akobo & Nyirol, Jonglei). Pulled locally with `clasp`.

## Files

| File | Pushed to Apps Script? | What it does |
|------|:---:|------|
| `Code.js` | ✅ | `buildDashboardFeed()` turns `Raw_Data` + `Activities_Master` into `Dashboard_Feed`; `doGet()` serves the page; `getDashboardData()` sends the feed to the browser |
| `Index.html` | ✅ | Page layout (header, filters, KPI cards, chart cards, table) |
| `Styles.html` | ✅ | All styling, light & dark theme, validated chart colours |
| `App.html` | ✅ | All dashboard logic: filters, calculations, charts (Chart.js) |
| `appsscript.json` | ✅ | Apps Script settings |
| `tools/` | ❌ | Local preview with fake data (`mock-data.js`, `preview.js`) |
| `.claspignore` | ❌ | Limits `clasp push` to the five files above |

## Features

- **Filters** (apply to everything): period presets or custom month range, county,
  population group (Total / Male / Female / Boy / Girl), sector, indicator (searchable), status.
  Active filters show as removable chips; **Reset** clears them.
- **KPIs**: average progress vs expected pace, indicators by status, needing attention, reporting coverage.
- **Trends**: progress vs expected pace, status over time, and a comparison of up to 4 indicators
  (% of target, cumulative, or monthly; raw numbers only when units match).
- **Breakdowns**: progress by sector or county, sex/age split, progress by indicator.
- **Table**: sortable, searchable, sparkline per indicator, CSV export; click a row to compare it.
- Every chart has a **Table** button showing the same numbers; light/dark theme toggle.

Status rules (On Track ≥ 90% of expected pace, At Risk ≥ 60%, Lagging below that) are the same
in `Code.js` and `App.html` — change both together.

## Raw_Data layout

Headers on row 8, data from row 9. `buildDashboardFeed()` finds the County, Target and month
columns by their headers.

| A | B | C | D | E | F | G → |
|---|---|---|---|---|---|---|
| ID | Short name | Disagg | Unit | **County** | Target | 24 month columns |

- **One row per indicator × disaggregation × county.** An indicator running in both counties has
  an Akobo row and a Nyirol row for each disaggregation (Total, Male, Female, Boy, Girl).
- **Target is that county's target.** If a row's Target is blank, the `Activities_Master` target
  is split evenly across that indicator's county rows.
- A blank County falls back to the county in `Activities_Master`; for "Both" indicators it shows
  as **Unspecified** so it can't be double-counted.
- After each build, a toast reports any warnings (missing counties, county targets that don't add
  up to the `Activities_Master` target). Full list: Apps Script editor → **Executions**.
- Without a County column the build falls back to the old behaviour (same values shown under each
  assigned county).

## Workflow

```bash
# Preview locally with fake data (nothing touches Google)
node tools/preview.js        # then open preview/index.html in a browser

# Send changes to Apps Script
clasp push                   # updates the script project (the editor's HEAD)
```

`clasp push` updates the code, but the live `/exec` link keeps serving its deployed version until you
create a new deployment version: Apps Script editor → **Deploy → Manage deployments → Edit → New version**
(or `clasp deploy -i <deploymentId>`). Test first via **Deploy → Test deployments** (the `/dev` link).
