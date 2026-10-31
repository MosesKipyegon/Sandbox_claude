/**
 * CIDO Project Dashboard: back end.
 *
 *   ITT (formulas) ──► Raw_Data ─┐
 *                                ├─► buildDashboardFeed() ──► Dashboard_Feed ──► getDashboardData() ──► web page
 *   Activities_Master ───────────┘
 *
 * Rebuild from the sheet menu "CIDO Dashboard → Rebuild dashboard now", or turn on the nightly rebuild there.
 */

// ---------- SETTINGS: the rules the dashboard uses. Change here, then rebuild. ----------
const SETTINGS = {
  PROJECT_MONTHS: 24,       // May-26 to Apr-28
  ACTIVITY_START_MONTH: 2,  // Jun-26: activities began in month 2, so expected progress is counted from here
  ON_TRACK: 0.9,            // On Track: at least 90% of where we should be by now
  AT_RISK: 0.6              // At Risk: 60–90%; below 60% is Lagging
};

/** Share of the target we expect by month m: nothing before activities start, then a straight line to 100% in the last month. */
function expectedShare(m) {
  const start = SETTINGS.ACTIVITY_START_MONTH, n = SETTINGS.PROJECT_MONTHS;
  return m < start ? 0 : (m - start + 1) / (n - start + 1);
}

/** Status of an indicator at month m. The web page (App.html) uses the same rules. */
function statusFor(cumulative, target, m) {
  if (!(target > 0)) return '';                     // no target: no status
  if (cumulative >= target) return 'Completed';
  if (cumulative <= 0) return 'Not Started';
  const expected = target * expectedShare(m);
  if (expected === 0) return 'On Track';           // reported before activities were due to start
  if (cumulative >= expected * SETTINGS.ON_TRACK) return 'On Track';
  if (cumulative >= expected * SETTINGS.AT_RISK) return 'At Risk';
  return 'Lagging';
}

/**
 * Builds / rebuilds Dashboard_Feed with STATIC values.
 * Runs in <30 seconds for the full dataset.
 */
function buildDashboardFeed() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const raw = ss.getSheetByName('Raw_Data');
  const master = ss.getSheetByName('Activities_Master');
  const config = ss.getSheetByName('Config');

  if (!raw || !master || !config) {
    throw new Error('Missing one of: Raw_Data, Activities_Master, Config');
  }

  // ---------- READ SOURCE DATA ----------
  // Activities_Master: headers on row 1, one row per indicator.
  //   0=ID, 1=FullName, 2=ShortName, 3=Sector, 4=County, 5=Unit, 6–10=Target Total/Male/Female/Boy/Girl
  //   Optional column headed "Remarks" (anywhere): a short note shown next to the indicator on the dashboard.
  const masterLast = master.getLastRow();
  const masterWidth = Math.max(11, master.getLastColumn());
  const masterHead = master.getRange(1, 1, 1, masterWidth).getDisplayValues()[0].map(h => String(h).trim().toLowerCase());
  const remarksCol = masterHead.findIndex(h => h === 'remarks' || h === 'remark' || h === 'notes' || h === 'note');
  const masterData = masterLast > 1 ? master.getRange(2, 1, masterLast - 1, masterWidth).getValues() : [];

  // Raw_Data: headers on row 8, data from row 9.
  //   A ID | B Short | C Disagg | D Unit | E County (optional) | Target | 24 month columns
  // Columns after D are found by their header, so adding the County column shifts nothing.
  const HEADER_ROW = 8;
  const lastCol = raw.getLastColumn();
  const headerVals = raw.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  const headerText = raw.getRange(HEADER_ROW, 1, 1, lastCol).getDisplayValues()[0].map(h => String(h).trim());
  const findHeader = name => headerText.findIndex(h => h.toLowerCase() === name);

  const countyCol = findHeader('county');           // -1 = no County column (legacy layout)
  const targetCol = findHeader('target');
  const looksLikeMonth = (v, text) =>
    v instanceof Date || /^[A-Za-z]{3,9}[\s\-\/']*\d{2,4}$/.test(text);
  let monthStart = headerText.findIndex((t, i) => i > 3 && i !== countyCol && i !== targetCol && looksLikeMonth(headerVals[i], t));
  if (monthStart < 0) monthStart = Math.max(4, countyCol, targetCol) + 1;

  const monthHeaders = headerText.slice(monthStart, monthStart + SETTINGS.PROJECT_MONTHS);

  const rawLast = raw.getLastRow();
  const rawRows = raw.getRange(HEADER_ROW + 1, 1, rawLast - HEADER_ROW, lastCol).getValues();

  // Lookup map for master metadata. Only indicators listed here reach the dashboard:
  // to drop an indicator, delete its row from Activities_Master.
  const idKey = v => String(v == null ? '' : v).trim();
  const masterMap = {};
  const remarks = {};
  masterData.forEach(r => {
    const id = idKey(r[0]);
    if (!id) return;
    masterMap[id] = r;
    if (remarksCol >= 0 && String(r[remarksCol]).trim()) remarks[id] = String(r[remarksCol]).trim();
  });

  // Real county names are the ones Activities_Master uses (Akobo, Nyirol). Anything else in a
  // Raw_Data County cell (blank, the word "County", a typo) falls back to Activities_Master.
  const isBoth = c => /^(both|all)$/i.test(c);
  const counties = {};
  masterData.forEach(r => {
    const c = String(r[4] || '').trim();
    if (c && !isBoth(c)) counties[c.toLowerCase()] = c;
  });

  const monthsPerIndicator = monthHeaders.length; // 24
  const warnings = [];
  const warnOnce = {};
  const warn = (key, text) => { if (!warnOnce[key]) { warnOnce[key] = true; warnings.push(text); } };
  const skipped = {};

  /** Target from Activities_Master for a disaggregation (Total/Male/Female/Boy/Girl) */
  const masterTarget = (m, disagg) => {
    const col = { Total: 6, Male: 7, Female: 8, Boy: 9, Girl: 10 }[disagg];
    const t = col === undefined ? 0 : m[col];
    return t === '' || t == null ? 0 : Number(t) || 0;
  };

  /**
   * Which county a Raw_Data row belongs to (county mode). Activities_Master has the final word;
   * Raw_Data's County cell is only used for indicators Activities_Master marks "Both".
   */
  const rowCounty = (row, m, shortName) => {
    const assigned = String(m[4] || '').trim();
    const given = counties[String(row[countyCol] || '').trim().toLowerCase()];
    if (assigned && !isBoth(assigned)) {
      if (given && given !== assigned) {
        warn('c|' + row[0], shortName + ': Raw_Data says ' + given + ', using ' + assigned + ' from Activities_Master');
      }
      return assigned;
    }
    if (given) return given;
    warn('u|' + row[0], shortName + ' has no county (Activities_Master says "' + (assigned || 'blank') + '")');
    return 'Unspecified';
  };

  // How many county rows each indicator × disagg has (to split a master target when a row has none)
  const rowsPerIndDisagg = {};
  if (countyCol >= 0) {
    rawRows.forEach(r => {
      if (!r[0] || !r[2] || !masterMap[idKey(r[0])]) return;
      const k = idKey(r[0]) + '|' + r[2];
      rowsPerIndDisagg[k] = (rowsPerIndDisagg[k] || 0) + 1;
    });
  }
  const countyTargetSums = {}; // indID → sum of county "Total" targets, checked against the master
  const seen = {};             // indID|county|disagg, to catch the same series twice

  // ---------- BUILD OUTPUT IN MEMORY ----------
  const out = [];
  out.push([
    'Indicator_ID','Indicator_Name','Short_Name','Sector','County',
    'Disagg','Unit','Month_Number','Month_Label',
    'Value','Target','Cumulative_Achieved','%_Achieved','Expected_%','Status_RAG'
  ]);

  rawRows.forEach(row => {
    const indID     = idKey(row[0]);
    const shortName = row[1];
    const disagg    = row[2];
    const unit      = row[3];
    if (!indID || !disagg) return;

    const m = masterMap[indID];
    if (!m) { skipped[indID] = true; return; }      // not in Activities_Master: dropped
    const fullName = m[1] || '';
    const sector   = m[3] || '';

    // Which county (or counties) this row's values belong to, and the target for each
    let countiesToRun, target;
    if (countyCol >= 0) {
      // County mode: one Raw_Data row per indicator × disagg × county
      countiesToRun = [rowCounty(row, m, shortName)];
      const rowTarget = targetCol >= 0 ? row[targetCol] : '';
      target = (rowTarget !== '' && rowTarget != null && !isNaN(Number(rowTarget)))
        ? Number(rowTarget)
        : masterTarget(m, disagg) / (rowsPerIndDisagg[indID + '|' + disagg] || 1);
      if (disagg === 'Total') countyTargetSums[indID] = (countyTargetSums[indID] || 0) + target;
    } else {
      // Legacy layout (no County column): the same values are shown under each assigned county
      const assigned = String(m[4] || '').trim();
      countiesToRun = !assigned || isBoth(assigned) ? ['Akobo', 'Nyirol'] : [assigned];
      target = masterTarget(m, disagg);
    }

    countiesToRun.forEach(county => {
      const key = indID + '|' + county + '|' + disagg;
      if (seen[key]) warn('d|' + key, shortName + ' (' + disagg + ') appears twice for ' + county + ' in Raw_Data');
      seen[key] = true;
      let running = 0;

      for (let i = 0; i < monthsPerIndicator; i++) {
        const monthLabel = monthHeaders[i];
        const monthNum   = i + 1;
        const rawVal     = row[monthStart + i];
        const value      = (rawVal === '' || rawVal == null) ? 0 : Number(rawVal);

        let cumulative = '';
        let pctAchieved = '';
        let expectedPct = '';
        let statusRAG   = '';

        if (disagg === 'Total') {
          running += value;
          cumulative = running;
          if (target > 0) pctAchieved = cumulative / target;
          expectedPct = expectedShare(monthNum);
          statusRAG = statusFor(cumulative, target, monthNum);
        }

        out.push([
          indID, fullName, shortName, sector, county,
          disagg, unit, monthNum, monthLabel,
          value, target, cumulative, pctAchieved, expectedPct, statusRAG
        ]);
      }
    });
  });

  if (out.length < 2) {
    throw new Error('No Raw_Data rows match an indicator ID in Activities_Master. Dashboard_Feed was left unchanged.');
  }

  // ---------- WRITE ONCE ----------
  let feed = ss.getSheetByName('Dashboard_Feed');
  if (!feed) feed = ss.insertSheet('Dashboard_Feed');
  feed.clear();
  feed.getRange(1, 1, out.length, out[0].length).setValues(out);

  // ---------- FORMAT ----------
  feed.getRange(1, 1, 1, out[0].length)
      .setFontWeight('bold')
      .setBackground('#1e3a8a')
      .setFontColor('#ffffff');

  feed.setFrozenRows(1);

  // Percent columns
  feed.getRange(2, 13, out.length - 1, 2).setNumberFormat('0.0%');
  // Force Month_Label column to plain text
  feed.getRange(2, 9, out.length - 1, 1).setNumberFormat('@');

  // ---------- BUILD INFO (read by the web page) ----------
  // The ITT changes once a month, so most rebuilds find the same numbers. "Updated" on the dashboard
  // shows when the numbers last changed, not when the build last ran.
  const props = PropertiesService.getScriptProperties();
  const previous = JSON.parse(props.getProperty('DASHBOARD_META') || '{}');
  const now = new Date().toISOString();
  const dataHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(out)));
  const changed = dataHash !== previous.dataHash;
  props.setProperty('DASHBOARD_META', JSON.stringify({
    builtAt: changed || !previous.builtAt ? now : previous.builtAt,   // numbers last changed
    checkedAt: now,                                                  // build last ran
    dataHash: dataHash,
    projectMonths: SETTINGS.PROJECT_MONTHS,
    activityStartMonth: SETTINGS.ACTIVITY_START_MONTH,
    onTrack: SETTINGS.ON_TRACK,
    atRisk: SETTINGS.AT_RISK,
    remarks: remarks
  }));

  // ---------- CHECKS ----------
  if (countyCol >= 0) {
    Object.keys(countyTargetSums).forEach(id => {
      const m = masterMap[id];
      const expected = m ? masterTarget(m, 'Total') : 0;
      if (expected && Math.abs(countyTargetSums[id] - expected) > 0.5) {
        warnings.push(id + ': target in Raw_Data is ' + countyTargetSums[id] + ', Activities_Master says ' + expected);
      }
    });
  }
  warnings.forEach(w => Logger.log(w));

  const dropped = Object.keys(skipped);
  const mode = countyCol >= 0 ? 'by county' : 'legacy layout, no County column';
  try {
    ss.toast(
      `Dashboard_Feed built: ${out.length - 1} rows (${mode}). ` +
        (changed ? 'Numbers have changed since the last build.' : 'No change since the last build.') +
        (dropped.length ? ` Left out (not in Activities_Master): ${dropped.join(', ')}.` : '') +
        (warnings.length ? ` ${warnings.length} warning(s): ${warnings.slice(0, 3).join('; ')}${warnings.length > 3 ? '…' : ''}` : ''),
      warnings.length ? 'Done, with warnings' : 'Done', warnings.length ? 15 : 5
    );
  } catch (e) { /* nightly runs have no screen to show a message on */ }
}

// ---------- SHEET MENU ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('CIDO Dashboard')
    .addItem('Rebuild dashboard now', 'buildDashboardFeed')
    .addSeparator()
    .addItem('Rebuild automatically every night', 'turnOnNightlyRebuild')
    .addItem('Stop nightly rebuild', 'turnOffNightlyRebuild')
    .addToUi();
}

/**
 * Rebuilds Dashboard_Feed every night between 2 and 3 am (Nairobi time), so the dashboard picks up the
 * monthly ITT within a day of it being entered, without anyone pressing a button. Nights with no new
 * numbers change nothing on the dashboard.
 */
function turnOnNightlyRebuild() {
  removeNightlyTriggers_();
  ScriptApp.newTrigger('buildDashboardFeed').timeBased().everyDays(1).atHour(2).create();
  SpreadsheetApp.getActiveSpreadsheet().toast('The dashboard will now rebuild itself every night between 2 and 3 am.', 'Nightly rebuild on', 8);
}

function turnOffNightlyRebuild() {
  const n = removeNightlyTriggers_();
  SpreadsheetApp.getActiveSpreadsheet().toast(n ? 'Nightly rebuild stopped.' : 'The nightly rebuild was not on.', 'Nightly rebuild off', 6);
}

function removeNightlyTriggers_() {
  const mine = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'buildDashboardFeed');
  mine.forEach(t => ScriptApp.deleteTrigger(t));
  return mine.length;
}

/**
 * Serves the HTML dashboard
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('CIDO Project Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Inlines another HTML file (Styles, App) into Index via <?!= include('Name') ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Sends Dashboard_Feed and the build info to the web page: { rows: [...], meta: {...} }
 */
function getDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Dashboard_Feed');
  const metaText = PropertiesService.getScriptProperties().getProperty('DASHBOARD_META');
  const meta = metaText ? JSON.parse(metaText) : {};
  if (!sheet || sheet.getLastRow() < 2) return { rows: [], meta: meta };
  const lastRow = sheet.getLastRow();

  // Get all data (15 columns, skipping the header).
  // Display values for Month_Label so dates never reach the client as Date objects
  // (google.script.run cannot serialise them).
  const data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
  const labels = sheet.getRange(2, 9, lastRow - 1, 1).getDisplayValues();
  data.forEach((row, i) => { row[8] = labels[i][0]; });

  // Convert to an array of objects for the HTML
  const headers = [
    'Indicator_ID', 'Indicator_Name', 'Short_Name', 'Sector', 'County',
    'Disagg', 'Unit', 'Month_Number', 'Month_Label', 'Value',
    'Target', 'Cumulative_Achieved', '%_Achieved', 'Expected_%', 'Status_RAG'
  ];

  const rows = data.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
  return { rows: rows, meta: meta };
}
