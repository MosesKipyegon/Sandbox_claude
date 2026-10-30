// Generates fake Dashboard_Feed rows (same 15 columns as buildDashboardFeed) for local preview.
// All indicators and numbers are invented — no real project data.

const MONTHS = 24;
const DATA_THROUGH = 10; // months with reported data
const START = new Date(2025, 0, 1);

const INDICATORS = [
  // id, short, full name, sector, county, unit, target, pace (1 = on plan), disaggregated?
  ['H1', 'OPD consultations', 'Number of outpatient consultations conducted', 'Health', 'Both', 'People', 12000, 1.05, true],
  ['H2', 'Measles vaccination', 'Children under 5 vaccinated against measles', 'Health', 'Both', 'Children', 3000, 0.8, true],
  ['H3', 'ANC 4+ visits', 'Pregnant women completing 4+ antenatal care visits', 'Health', 'Nyirol', 'Women', 1500, 0.55, true],
  ['H4', 'Health workers trained', 'Health workers trained on IMCI and clinical guidelines', 'Health', 'Akobo', 'People', 60, 2.6, false],
  ['P1', 'GBV case management', 'GBV survivors receiving case management services', 'Protection', 'Both', 'People', 400, 0.95, true],
  ['P2', 'PSS sessions', 'Psychosocial support group sessions conducted', 'Protection', 'Both', 'Sessions', 480, 1.1, false],
  ['P3', 'CFS attendance', 'Children attending child-friendly space activities', 'Protection', 'Akobo', 'Children', 2500, 0.65, true],
  ['P4', 'Protection monitoring', 'Protection monitoring reports produced and shared', 'Protection', 'Both', 'Reports', 24, 1.0, false],
  ['W1', 'Latrines constructed', 'Emergency latrines constructed (gender-segregated)', 'WASH', 'Both', 'Latrines', 300, 0.35, false],
  ['W2', 'Boreholes rehabilitated', 'Boreholes rehabilitated and functional', 'WASH', 'Nyirol', 'Boreholes', 20, 0.0, false],
  ['W3', 'Hygiene promotion', 'People reached with hygiene promotion messages', 'WASH', 'Both', 'People', 15000, 1.2, true],
  ['W4', 'Hygiene kits', 'Households receiving hygiene kits', 'WASH', 'Both', 'Households', 4000, 0.9, false],
  ['A1', 'Feedback resolved', 'Community feedback cases received and resolved', 'Accountability', 'Both', 'Cases', 600, 0.75, false],
  ['A2', 'Community meetings', 'Community accountability meetings held', 'Accountability', 'Both', 'Meetings', 96, 1.0, false]
];

const SPLIT = { People: [0.22, 0.30, 0.23, 0.25], Children: [0, 0, 0.49, 0.51], Women: [0, 1, 0, 0] };

// Deterministic pseudo-random so the preview looks the same every run
let seed = 42;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function monthLabel(i) {
  const d = new Date(START.getFullYear(), START.getMonth() + i, 1);
  return d.toLocaleString('en-GB', { month: 'short' }) + ' ' + d.getFullYear();
}

/** Same RAG rules as Code.js */
function status(cum, target, m) {
  if (!(target > 0)) return '';
  const exp = target * (m / MONTHS);
  if (cum / target >= 1) return 'Completed';
  if (exp === 0) return 'On Track';
  if (cum >= exp * 0.9) return 'On Track';
  if (cum >= exp * 0.6) return 'At Risk';
  if (cum > 0) return 'Lagging';
  return 'Not Started';
}

function build() {
  const rows = [];
  INDICATORS.forEach(([id, short, name, sector, assigned, unit, target, pace, disagg]) => {
    const counties = assigned === 'Both' ? ['Akobo', 'Nyirol'] : [assigned];
    counties.forEach((county, ci) => {
      const cTarget = Math.round(target / counties.length);
      const cPace = pace * (ci === 0 ? 1.08 : 0.92);
      // Monthly totals: ramp up, noisy, zero after DATA_THROUGH
      const totals = [];
      for (let m = 1; m <= MONTHS; m++) {
        if (m > DATA_THROUGH || pace === 0) { totals.push(0); continue; }
        const ramp = Math.min(1, m / 3);
        const v = cTarget / MONTHS * cPace * ramp * (0.6 + rand() * 0.8);
        totals.push(Math.max(0, Math.round(v)));
      }
      const split = disagg ? (SPLIT[unit] || SPLIT.People) : null;
      const groups = ['Total'].concat(split ? ['Male', 'Female', 'Boy', 'Girl'] : []);
      groups.forEach((g, gi) => {
        const share = g === 'Total' ? 1 : split[gi - 1];
        if (g !== 'Total' && share === 0) return;
        const gTarget = Math.round(cTarget * share);
        let run = 0;
        totals.forEach((t, i) => {
          const m = i + 1;
          const value = g === 'Total' ? t : Math.round(t * share * (0.85 + rand() * 0.3));
          let cum = '', pct = '', expPct = '', rag = '';
          if (g === 'Total') {
            run += value; cum = run;
            pct = gTarget > 0 ? cum / gTarget : '';
            expPct = m / MONTHS;
            rag = pct !== '' ? status(cum, gTarget, m) : '';
          }
          rows.push({
            Indicator_ID: id, Indicator_Name: name, Short_Name: short, Sector: sector, County: county,
            Disagg: g, Unit: unit, Month_Number: m, Month_Label: monthLabel(i), Value: value, Target: gTarget,
            Cumulative_Achieved: cum, '%_Achieved': pct, 'Expected_%': expPct, Status_RAG: rag
          });
        });
      });
    });
  });
  return rows;
}

module.exports = { build };
