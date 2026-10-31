// Sample entries so the app isn't empty on first open. They are marked sample: true and removed
// with one tap ("Remove samples"); once removed they never come back.
// Placeholder photos are drawn on a canvas — simple landscapes in the theme colours.
import { getMeta, setMeta, getAll, saveEntry, deleteEntry } from './db.js';
import { processPhoto } from './photos.js';

const SAMPLES = [
  {
    placeId: 'unhas-juba', dateFrom: '2026-01-14', dateTo: '2026-01-15', reason: 'Transit',
    caption: 'Two nights between flights',
    thoughts: 'Busier and louder than I remembered, but the evenings by the river make up for it. (Sample entry — tap Remove samples above to clear these.)',
    food: 'Grilled fish and chapati at a riverside place.',
    unexpected: 'A quiet garden café tucked behind a busy road.',
    rating: 4, scenes: [0, 1]
  },
  {
    placeId: 'unhas-bor', dateFrom: '2026-02-03', dateTo: '2026-02-06', reason: 'Work trip',
    caption: 'Monitoring visit along the river',
    thoughts: 'Long days, warm people. The road out was rough, but the team made every stop feel easy. (Sample entry.)',
    food: 'Fresh fish and kisra.',
    unexpected: 'How green everything still was in February.',
    rating: 5, scenes: [2, 3, 1]
  },
  {
    placeId: 'unhas-malakal', dateFrom: '2026-03-10', dateTo: '2026-03-12', reason: 'Training/workshop',
    caption: 'Three days, one generator, a lot of tea',
    thoughts: 'Hot, flat and wide open — the sky feels enormous here. (Sample entry.)',
    food: '',
    unexpected: 'Sunsets over the water that stopped the whole workshop.',
    rating: null, scenes: [3]
  }
];

const SCENES = [
  { sky: ['#F6D9A8', '#E9A86A'], sun: '#FFF4DC', land: '#5E7A4A', water: '#2F6F8F' },
  { sky: ['#CFE3EA', '#F4E7CF'], sun: '#FFFFFF', land: '#8A7A4F', water: '#3E7F9C' },
  { sky: ['#F3C38B', '#C4622D'], sun: '#FCE7C3', land: '#4B3A2E', water: '#2F6F8F' },
  { sky: ['#F9E2C1', '#D9A441'], sun: '#FFF8EA', land: '#6E7F45', water: '#2A5F7A' }
];

function drawScene(i) {
  const s = SCENES[i % SCENES.length];
  const c = document.createElement('canvas');
  c.width = 1600; c.height = 1200;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 760);
  sky.addColorStop(0, s.sky[0]); sky.addColorStop(1, s.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, 1600, 1200);
  g.fillStyle = s.sun; g.beginPath(); g.arc(1120 - i * 180, 430, 110, 0, Math.PI * 2); g.fill();
  g.fillStyle = s.land; g.fillRect(0, 760, 1600, 440);
  g.fillStyle = s.water; g.beginPath();
  g.moveTo(0, 980); g.bezierCurveTo(500, 900, 900, 1080, 1600, 960); g.lineTo(1600, 1060); g.bezierCurveTo(900, 1180, 500, 1000, 0, 1080); g.fill();
  // An acacia on the horizon
  g.fillStyle = '#2B2622';
  g.fillRect(330 + i * 220, 600, 14, 170);
  g.beginPath(); g.ellipse(337 + i * 220, 600, 150, 38, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(43,38,34,0.55)'; g.font = '600 40px system-ui, sans-serif'; g.fillText('Sample photo', 48, 1150);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
}

/**
 * Adds the samples once, on a brand-new journal. Samples have fixed IDs, and the "done" flag is set
 * only after all of them are saved — so if the first visit is interrupted, the next one finishes the job.
 */
export async function addSamplesIfNew() {
  if (await getMeta('samplesAdded')) return;
  const existing = await getAll('entries', { includeDeleted: true });
  if (existing.some(e => !e.sample)) { await setMeta('samplesAdded', true); return; }  // real journal: no samples
  const have = new Set(existing.map(e => e.id));
  for (const [i, s] of SAMPLES.entries()) {
    const id = `sample-${i + 1}`;
    if (have.has(id)) continue;
    // Fixed photo IDs too, so two devices' samples are the same records (no duplicates when merging)
    const photos = [];
    for (const [j, scene] of s.scenes.entries()) photos.push({ id: `${id}-photo-${j + 1}`, ...(await processPhoto(await drawScene(scene))) });
    const { scenes, ...fields } = s;
    await saveEntry({ ...fields, id, sample: true, photoIds: photos.map(p => p.id) }, photos);
  }
  await setMeta('samplesAdded', true);
}

export async function removeSamples() {
  const samples = (await getAll('entries')).filter(e => e.sample);
  for (const e of samples) await deleteEntry(e.id);
}
