# CIDO Project Dashboard

Google Sheets + Apps Script web app that tracks indicator progress for the Integrated Health,
Protection & WASH project (Akobo & Nyirol, Jonglei). Pulled locally with `clasp`.

## How the data flows

```
Field weekly tracker → monthly ITT → Raw_Data (formulas from the ITT) ─┐
                                                                       ├→ buildDashboardFeed() → Dashboard_Feed → web page
                                 Activities_Master (indicator list) ───┘
```

- **Activities_Master** is the indicator list: name, sector, **county**, unit, targets and an optional
  **Remarks** column. Only indicators listed here reach the dashboard. To drop one, delete its row.
- **Raw_Data** holds the monthly numbers, filled by formulas from the ITT.
- **buildDashboardFeed()** combines the two into **Dashboard_Feed** (running totals, % of target,
  expected pace, status). Run it from the sheet menu **CIDO Dashboard → Rebuild dashboard now**, or
  turn on **Rebuild automatically every night**. The ITT changes once a month, so most nightly runs
  find nothing new and change nothing.
- The **web page** reads Dashboard_Feed and recalculates everything for the chosen filters.
  "Updated" in the header is when the numbers last changed (hover for when the sheet was last checked).

## Settings

At the top of `Code.js`. Change them there, push, then rebuild. The web page reads them from the build.

| Setting | Value | Meaning |
|---|---|---|
| `PROJECT_MONTHS` | 24 | May-26 to Apr-28 |
| `ACTIVITY_START_MONTH` | 2 | Activities began Jun-26; expected pace counts from here |
| `ON_TRACK` | 0.9 | On Track: at least 90% of where we should be by now |
| `AT_RISK` | 0.6 | At Risk: 60–90%; below that is Lagging |

Expected pace is a straight line from the activity start month to 100% in the last month.
An indicator still at zero once activities were due counts under **Needing attention**.
Anything above 150% of target gets a **check** tag (wrong target, or repeat visits counted twice).

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
- **KPIs**: average progress vs expected pace, indicators by status, needing attention
  (behind pace, or not started when due), reporting coverage.
- **Notes**: text in the Remarks column of Activities_Master shows under the indicator in the table
  (in CIDO orange) and in its chart tooltip.
- **Trends**: progress vs expected pace, status over time, and a comparison of up to 4 indicators
  (% of target, cumulative, or monthly; raw numbers only when units match).
- **Breakdowns**: progress by sector or county, sex/age split, progress by indicator.
- **Table**: sortable, searchable, sparkline per indicator, CSV export; click a row to compare it.
- Every chart has a **Table** button showing the same numbers; light/dark theme toggle.


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
- **Activities_Master decides the county.** Raw_Data's County cell is only used for indicators
  that Activities_Master marks "Both"; if they disagree, the build warns and uses Activities_Master.
  A "Both" indicator with no valid county in Raw_Data shows as **Unspecified** so it can't be double-counted.
- **Target comes from Raw_Data's Target column** (i.e. from the ITT). Change a target in the ITT *and*
  in Activities_Master; the build warns when the two differ.
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
(or `clasp redeploy <deploymentId> -V <version>` after `clasp create-version`).
The sheet menu always runs the latest pushed `Code.js`, deployed or not. Test first via **Deploy → Test deployments** (the `/dev` link).
