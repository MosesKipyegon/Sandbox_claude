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

  const monthHeaders = raw.getRange(8, 6, 1, 24).getDisplayValues()[0];

  const rawLast = raw.getLastRow();
  const disaggData = raw.getRange(9, 1, rawLast - 8, 4).getValues();   // A:D — ID, Short, Disagg, Unit
  const rawValues  = raw.getRange(9, 6, rawLast - 8, 24).getValues();  // F:AC — 24 months of values

  // Lookup map for master metadata
  const masterMap = {};
  masterData.forEach(r => { masterMap[r[0]] = r; });

  const counties = ['Akobo', 'Nyirol'];
  const monthsPerIndicator = monthHeaders.length; // 24

  // ---------- BUILD OUTPUT IN MEMORY ----------
  const out = [];
  out.push([
    'Indicator_ID','Indicator_Name','Short_Name','Sector','County',
    'Disagg','Unit','Month_Number','Month_Label',
    'Value','Target','Cumulative_Achieved','%_Achieved','Expected_%','Status_RAG'
  ]);

  // We'll compute cumulative per (indicator, county, disagg) as we go
  const cumTracker = {}; // key = indID|county|disagg  → running total (only for "Total" rows)

  disaggData.forEach((row, rIdx) => {
    const indID     = row[0];
    const shortName = row[1];
    const disagg    = row[2];
    const unit      = row[3];
    if (!indID || !disagg) return;

    const m = masterMap[indID] || [];
    const fullName = m[1] || '';
    const sector   = m[3] || '';
    let target = 0;
    const assignedCounty = m[4] || 'Both'; // Read the assigned County from Activities_Master
    if (m) {
      if (disagg === 'Total')  target = m[6];
      if (disagg === 'Male')   target = m[7];
      if (disagg === 'Female') target = m[8];
      if (disagg === 'Boy')    target = m[9];
      if (disagg === 'Girl')   target = m[10];
      if (target === '') target = 0;
    }

    const countiesToRun = assignedCounty === 'Both' ? ['Akobo', 'Nyirol'] : [assignedCounty];
    
    countiesToRun.forEach(county => {
      let running = 0;

      for (let i = 0; i < monthsPerIndicator; i++) {
        const monthLabel = monthHeaders[i];
        const monthNum   = i + 1;
        const rawVal     = rawValues[rIdx][i];
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
          expectedPct = monthNum / 24;

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

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Dashboard_Feed built: ${out.length - 1} rows`, 'Done', 5
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