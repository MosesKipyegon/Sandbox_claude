/**
 * Builds / rebuilds Dashboard_Feed with STATIC values.
 * Re-run this every time you enter new monthly data in Raw_Data.
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
  const masterLast = master.getLastRow();
  const masterData = master.getRange(2, 1, masterLast - 1, 11).getValues();
  // 0=ID, 1=FullName, 2=ShortName, 3=Sector, 4=County, 5=Unit, 6=Target

  // Raw_Data: headers on row 8, data from row 9.
  //   A ID | B Short | C Disagg | D Unit | E County (optional) | Target | 24 month columns
  // Columns after D are found by their header, so adding the County column shifts nothing.
  const HEADER_ROW = 8;
  const PROJECT_MONTHS = 24;
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

  const monthHeaders = headerText.slice(monthStart, monthStart + PROJECT_MONTHS);

  const rawLast = raw.getLastRow();
  const rawRows = raw.getRange(HEADER_ROW + 1, 1, rawLast - HEADER_ROW, lastCol).getValues();

  // Lookup map for master metadata
  const masterMap = {};
  masterData.forEach(r => { masterMap[r[0]] = r; });

  const monthsPerIndicator = monthHeaders.length; // 24
  const warnings = [];

  /** Target from Activities_Master for a disaggregation (Total/Male/Female/Boy/Girl) */
  const masterTarget = (m, disagg) => {
    const col = { Total: 6, Male: 7, Female: 8, Boy: 9, Girl: 10 }[disagg];
    const t = col === undefined ? 0 : m[col];
    return t === '' || t == null ? 0 : Number(t) || 0;
  };

  // How many county rows each indicator × disagg has (to split a master target when a row has none)
  const rowsPerIndDisagg = {};
  if (countyCol >= 0) {
    rawRows.forEach(r => {
      if (!r[0] || !r[2]) return;
      const k = r[0] + '|' + r[2];
      rowsPerIndDisagg[k] = (rowsPerIndDisagg[k] || 0) + 1;
    });
  }
  const countyTargetSums = {}; // indID → sum of county "Total" targets, checked against the master

  // ---------- BUILD OUTPUT IN MEMORY ----------
  const out = [];
  out.push([
    'Indicator_ID','Indicator_Name','Short_Name','Sector','County',
    'Disagg','Unit','Month_Number','Month_Label',
    'Value','Target','Cumulative_Achieved','%_Achieved','Expected_%','Status_RAG'
  ]);

  // We'll compute cumulative per (indicator, county, disagg) as we go
  const cumTracker = {}; // key = indID|county|disagg  → running total (only for "Total" rows)

  rawRows.forEach(row => {
    const indID     = row[0];
    const shortName = row[1];
    const disagg    = row[2];
    const unit      = row[3];
    if (!indID || !disagg) return;

    const m = masterMap[indID] || [];
    const fullName = m[1] || '';
    const sector   = m[3] || '';
    const assignedCounty = m[4] || 'Both'; // Assigned County from Activities_Master

    // Which county (or counties) this row's values belong to, and the target for each
    let countiesToRun, target;
    if (countyCol >= 0) {
      // County mode: one Raw_Data row per indicator × disagg × county
      let county = String(row[countyCol] || '').trim();
      if (!county) {
        county = assignedCounty !== 'Both' ? assignedCounty : 'Unspecified';
        if (county === 'Unspecified') warnings.push(shortName + ' (' + disagg + ') has no County');
      }
      countiesToRun = [county];
      const rowTarget = targetCol >= 0 ? row[targetCol] : '';
      target = (rowTarget !== '' && rowTarget != null && !isNaN(Number(rowTarget)))
        ? Number(rowTarget)
        : masterTarget(m, disagg) / (rowsPerIndDisagg[indID + '|' + disagg] || 1);
      if (disagg === 'Total') countyTargetSums[indID] = (countyTargetSums[indID] || 0) + target;
    } else {
      // Legacy layout (no County column): the same values are shown under each assigned county
      countiesToRun = assignedCounty === 'Both' ? ['Akobo', 'Nyirol'] : [assignedCounty];
      target = masterTarget(m, disagg);
    }

    countiesToRun.forEach(county => {
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

          if (target && target > 0) {
            pctAchieved = cumulative / target;
          }
          expectedPct = monthNum / PROJECT_MONTHS;

          if (pctAchieved !== '') {
            // 1. Calculate what the target SHOULD be at this month
            const expectedTarget = target * expectedPct;
            
            // 2. Compare actual cumulative to the expected target
            if (pctAchieved >= 1) {
              statusRAG = 'Completed';
            } else if (expectedTarget === 0) {
              statusRAG = 'On Track'; // Month 1
            } else if (cumulative >= expectedTarget * 0.9) {
              statusRAG = 'On Track';
            } else if (cumulative >= expectedTarget * 0.6) {
              statusRAG = 'At Risk';
            } else if (cumulative > 0) {
              statusRAG = 'Lagging';
            } else {
              statusRAG = 'Not Started'; // No data entered yet
            }
          }
        }

        out.push([
          indID, fullName, shortName, sector, county,
          disagg, unit, monthNum, monthLabel,
          value, target, cumulative, pctAchieved, expectedPct, statusRAG
        ]);
      }
    });
  });

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
  if (out.length > 1) {
    feed.getRange(2, 13, out.length - 1, 2).setNumberFormat('0.0%');
    // Force Month_Label column to plain text
    feed.getRange(2, 9, out.length - 1, 1).setNumberFormat('@');
  }

  // ---------- CHECKS ----------
  if (countyCol >= 0) {
    Object.keys(countyTargetSums).forEach(id => {
      const m = masterMap[id];
      const expected = m ? masterTarget(m, 'Total') : 0;
      if (expected && Math.abs(countyTargetSums[id] - expected) > 0.5) {
        warnings.push(id + ': county targets add up to ' + countyTargetSums[id] + ', Activities_Master says ' + expected);
      }
    });
  }
  warnings.forEach(w => Logger.log(w));

  const mode = countyCol >= 0 ? 'by county' : 'legacy layout, no County column';
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Dashboard_Feed built: ${out.length - 1} rows (${mode}).` +
      (warnings.length ? ` ${warnings.length} warning(s): ${warnings.slice(0, 3).join('; ')}${warnings.length > 3 ? '…' : ''}` : ''),
    warnings.length ? 'Done, with warnings' : 'Done', warnings.length ? 15 : 5
  );
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
 * Fetches the data from Dashboard_Feed to send to the HTML
 */
function getDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Dashboard_Feed');
  if (!sheet || sheet.getLastRow() < 2) return [];
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
  
  return data.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}