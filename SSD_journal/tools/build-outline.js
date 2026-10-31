// Builds data/south-sudan.geojson — the built-in offline map — from Natural Earth 1:50m data
// (public domain, https://www.naturalearthdata.com). Run once; the output is committed.
//
//   node tools/build-outline.js <ne_50m_admin_0_countries.geojson> <ne_50m_rivers_lake_centerlines.geojson> <ne_50m_lakes.geojson>
//
// Output features carry properties.kind: "country" | "river" | "lake".
const fs = require('fs');
const path = require('path');

const [countriesFile, riversFile, lakesFile] = process.argv.slice(2);
if (!lakesFile) { console.error('Usage: node tools/build-outline.js <countries> <rivers> <lakes>'); process.exit(1); }
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// Slightly larger than South Sudan, so rivers run to the edge
const BOX = { minLng: 23.0, maxLng: 36.2, minLat: 3.2, maxLat: 12.5 };
const inBox = ([lng, lat]) => lng >= BOX.minLng && lng <= BOX.maxLng && lat >= BOX.minLat && lat <= BOX.maxLat;
const r3 = n => Math.round(n * 1000) / 1000;  // ~100 m — plenty for an outline
const round = coords => typeof coords[0] === 'number' ? [r3(coords[0]), r3(coords[1])] : coords.map(round);

/** Drops consecutive duplicate points created by rounding. */
const dedupe = line => line.filter((p, i) => i === 0 || p[0] !== line[i - 1][0] || p[1] !== line[i - 1][1]);

const features = [];

// Country outline
const ssd = read(countriesFile).features.find(f => f.properties.ADM0_A3 === 'SDS' || f.properties.ISO_A3 === 'SSD');
if (!ssd) throw new Error('South Sudan not found in ' + countriesFile);
const geom = ssd.geometry;
const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
features.push({ type: 'Feature', properties: { kind: 'country', name: 'South Sudan' },
  geometry: { type: 'MultiPolygon', coordinates: polys.map(p => p.map(ring => dedupe(round(ring)))) } });

// Rivers: keep only the runs of each line that are inside the box
for (const f of read(riversFile).features) {
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const runs = [];
  for (const line of lines) {
    let run = [];
    for (const p of line) {
      if (inBox(p)) run.push(p);
      else { if (run.length > 1) runs.push(run); run = []; }
    }
    if (run.length > 1) runs.push(run);
  }
  if (runs.length) features.push({ type: 'Feature', properties: { kind: 'river', name: f.properties.name || '' },
    geometry: { type: 'MultiLineString', coordinates: runs.map(l => dedupe(round(l))) } });
}

// Lakes whose outline touches the box
for (const f of read(lakesFile).features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  if (polys.some(p => p[0].some(inBox))) {
    features.push({ type: 'Feature', properties: { kind: 'lake', name: f.properties.name || '' },
      geometry: { type: 'MultiPolygon', coordinates: polys.map(p => p.map(ring => dedupe(round(ring)))) } });
  }
}

const out = path.join(__dirname, '..', 'data', 'south-sudan.geojson');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  type: 'FeatureCollection',
  attribution: 'Natural Earth (public domain)',
  features
}));
const kinds = features.reduce((a, f) => (a[f.properties.kind] = (a[f.properties.kind] || 0) + 1, a), {});
console.log(`Wrote ${out}: ${JSON.stringify(kinds)}, ${Math.round(fs.statSync(out).size / 1024)} KB`);
console.log('Rivers:', features.filter(f => f.properties.kind === 'river').map(f => f.properties.name).filter(Boolean).join(', '));
