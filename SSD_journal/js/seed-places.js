// UNHAS South Sudan regular destinations (routes map, 18 May 2026), preloaded as "not yet visited".
//
// Coordinates are approximate and town-level only (2 decimals ≈ 1 km) — good enough for a pin,
// never precise enough to locate a compound. Entries with a `check` note are uncertain: the name,
// the coordinates or both should be confirmed.
//
// To correct a place: edit it below, then raise SEED_VERSION by 1. Devices update every built-in
// place on their next start. IDs come from the name, so when RENAMING keep the old ID by adding it,
// e.g.  P('Kuernyangke', 'Upper Nile', '', 8.55, 33.05, { id: 'unhas-kuetrengke' })  — entries point at it.
//
// IDs are fixed ("unhas-<slug>") so the same place has the same ID on every device — sync relies on it.

export const SEED_VERSION = 1;

// 10 states + 3 administrative areas = 13
export const STATES = [
  'Central Equatoria',
  'Eastern Equatoria',
  'Western Equatoria',
  'Jonglei',
  'Unity',
  'Upper Nile',
  'Lakes',
  'Warrap',
  'Northern Bahr el Ghazal',
  'Western Bahr el Ghazal',
  'Abyei Administrative Area',
  'Ruweng Administrative Area',
  'Greater Pibor Administrative Area'
];

const P = (name, state, county, lat, lng, extra = {}) => ({
  id: 'unhas-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name, state, county, lat, lng, unhas: true, builtin: true, ...extra
});

export const UNHAS_PLACES = [
  // Hubs
  P('Juba', 'Central Equatoria', 'Juba', 4.85, 31.58),
  P('Bor', 'Jonglei', 'Bor South', 6.21, 31.56),
  P('Rumbek', 'Lakes', 'Rumbek Central', 6.81, 29.68),
  P('Wau', 'Western Bahr el Ghazal', 'Wau', 7.70, 27.99),

  // Equatorias
  P('Yambio', 'Western Equatoria', 'Yambio', 4.57, 28.40),
  P('Yei', 'Central Equatoria', 'Yei', 4.09, 30.68),
  P('Kajo Keji', 'Central Equatoria', 'Kajo-Keji', 3.87, 31.65),
  P('Nimule', 'Eastern Equatoria', 'Magwi', 3.60, 32.06, {
    check: 'Not on the original list. Unlabelled pin on the Uganda border east of Kajo Keji on the UNHAS map; position matches Nimule. Confirm it is the 45th destination.'
  }),
  P('Torit', 'Eastern Equatoria', 'Torit', 4.41, 32.57),
  P('Kapoeta', 'Eastern Equatoria', 'Kapoeta South', 4.77, 33.59),

  // Bahr el Ghazal, Warrap, Abyei
  P('Aweil', 'Northern Bahr el Ghazal', 'Aweil Centre', 8.77, 27.40),
  P('Kuajok', 'Warrap', 'Gogrial West', 8.31, 27.98),
  P('Agok', 'Abyei Administrative Area', '', 9.36, 28.58, { check: 'Coordinates approximate.' }),

  // Unity & Ruweng
  P('Rubkona', 'Unity', 'Rubkona', 9.28, 29.79),
  P('Mankien', 'Unity', 'Mayom', 9.08, 29.07, { check: 'Coordinates approximate.' }),
  P('Yida', 'Ruweng Administrative Area', 'Pariang', 10.10, 30.05, { check: 'Coordinates approximate.' }),
  P('Ajuong Thok', 'Ruweng Administrative Area', 'Pariang', 9.97, 30.27, { check: 'Coordinates approximate.' }),
  P('Koch', 'Unity', 'Koch', 8.60, 29.99, { check: 'Coordinates approximate.' }),
  P('Leer', 'Unity', 'Leer', 8.30, 30.14),
  P('Nyal', 'Unity', 'Panyijiar', 7.70, 30.45, { check: 'Coordinates approximate.' }),
  P('Ganyiel', 'Unity', 'Panyijiar', 7.43, 30.37, { check: 'Coordinates approximate.' }),

  // Upper Nile
  P('Malakal', 'Upper Nile', 'Malakal', 9.53, 31.66),
  P('Renk', 'Upper Nile', 'Renk', 11.75, 32.80),
  P('Maban', 'Upper Nile', 'Maban', 9.98, 33.73, { check: 'Pin placed at Bunj (Maban county HQ); coordinates approximate.' }),
  P('Ulang', 'Upper Nile', 'Ulang', 8.64, 32.71, { check: 'Coordinates approximate.' }),
  P('Chuil', 'Upper Nile', '', 8.90, 32.40, { check: 'Location and county uncertain — placed from the UNHAS map, north-west of Ulang.' }),
  P('Kuetrengke', 'Upper Nile', '', 8.55, 33.05, {
    aliases: ['Kuernyangke'],
    check: 'Spelling uncertain: map label partly hidden by its pin (reads "Kuetrengke"); listed as "Kuernyangke" in the brief. Location placed from the map, east of Ulang.'
  }),
  P('Mathiang', 'Upper Nile', 'Longechuk', 9.47, 33.40, { check: 'Coordinates approximate.' }),
  P('Maiwut', 'Upper Nile', 'Maiwut', 8.61, 33.92, { check: 'Marked "#" on the UNHAS map (footnote not visible). Coordinates approximate.' }),

  // Jonglei
  P('Old Fangak', 'Jonglei', 'Fangak', 9.07, 30.88, { check: 'Two pins beside this label on the UNHAS map. Coordinates approximate.' }),
  P('New Fangak', 'Jonglei', 'Fangak', 9.20, 30.97, { check: 'Coordinates approximate.' }),
  P('Kurwai', 'Jonglei', 'Fangak', 9.12, 31.02, { check: 'Coordinates approximate.' }),
  P('Ayod', 'Jonglei', 'Ayod', 8.12, 31.43),
  P('Duk Padiet', 'Jonglei', 'Duk', 7.62, 31.41, { check: 'Coordinates approximate.' }),
  P('Duk Poktap', 'Jonglei', 'Duk', 7.39, 31.39, { aliases: ['Duk Pockat'], check: 'Brief said "Duk Pockat"; the map reads "Duk Poktap". Coordinates approximate.' }),
  P('Mabior', 'Jonglei', '', 7.05, 31.40, { check: 'Location and county uncertain — placed from the UNHAS map, south of Duk Poktap.' }),
  P('Yuai', 'Jonglei', 'Uror', 7.88, 31.86, { check: 'Coordinates approximate.' }),
  P('Pieri', 'Jonglei', 'Uror', 8.08, 32.00, { check: 'Coordinates approximate.' }),
  P('Motot', 'Jonglei', 'Uror', 8.17, 32.05, { check: 'Coordinates approximate.' }),
  P('Lankien', 'Jonglei', 'Nyirol', 8.52, 32.06, { aliases: ['Lankein'] }),
  P('Walgak', 'Jonglei', 'Akobo', 8.18, 32.40, { check: 'Coordinates approximate.' }),
  P('Akobo', 'Jonglei', 'Akobo', 7.78, 33.00),
  P('Pochalla', 'Jonglei', 'Pochalla', 7.18, 34.10, { check: 'Marked "**" on the UNHAS map (footnote not visible).' }),

  // Greater Pibor
  P('Pibor', 'Greater Pibor Administrative Area', 'Pibor', 6.80, 33.13, { check: 'Marked "*" on the UNHAS map (footnote not visible).' }),
  P('Boma', 'Greater Pibor Administrative Area', '', 6.20, 34.46, { check: 'Labelled on the UNHAS map but no clear pin. Coordinates approximate.' })
];

export const REASONS = [
  'Work trip',
  'Field monitoring/assessment',
  'Distribution',
  'Training/workshop',
  'Transit',
  'Leave/R&R',
  'Personal',
  'Other'
];
