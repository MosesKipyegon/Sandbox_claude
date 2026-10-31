// Map: Leaflet (global L, loaded from vendor/leaflet) with two layers of ground:
//   1. the built-in outline of South Sudan (always drawn, works offline), underneath
//   2. OpenStreetMap tiles on top when online (and any tiles cached earlier when offline)
// Where a tile can't load, the outline shows through — so the map degrades instead of going blank.
import { h } from './dom.js';
import { roundCoord } from './db.js';

const SSD_BOUNDS = [[3.4, 23.8], [12.3, 36.0]];
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let outlinePromise;
const loadOutline = () => (outlinePromise ||= fetch('data/south-sudan.geojson').then(r => r.json()));

const liveMaps = new Set();
/** Called on every screen change so old maps release their memory and listeners. */
export function removeAllMaps() {
  liveMaps.forEach(m => m.remove());
  liveMaps.clear();
}

/** A Leaflet map with the outline and tiles. Shared by the home map and the place picker. */
async function baseMap(el, options = {}) {
  const map = L.map(el, {
    zoomSnap: 0.25, minZoom: 4, maxZoom: 16, attributionControl: true, ...options
  });
  liveMaps.add(map);
  el.leafletMap = map;  // handy for debugging in the browser console
  map.attributionControl.setPrefix(false);
  map.createPane('outline').style.zIndex = 150;   // below tiles (200)
  map.createPane('pins').style.zIndex = 450;      // above everything else
  map.fitBounds(SSD_BOUNDS, { padding: [8, 8] });

  const geo = await loadOutline();
  L.geoJSON(geo, {
    pane: 'outline', interactive: false,
    style: f => {
      const kind = f.properties.kind;
      if (kind === 'country') return { color: css('--ink-soft'), weight: 1.2, fillColor: css('--card'), fillOpacity: 1 };
      if (kind === 'lake') return { color: css('--nile'), weight: 0.8, fillColor: css('--nile'), fillOpacity: 0.35 };
      return { color: css('--nile'), weight: 1.3, opacity: 0.7 };
    }
  }).addTo(map);

  const tiles = L.tileLayer(TILE_URL, {
    maxZoom: 16,
    referrerPolicy: 'strict-origin-when-cross-origin', // OSM asks for a referrer; this sends the site only, not the page
    crossOrigin: 'anonymous',  // CORS tiles can be cached compactly offline (opaque ones count ~7 MB each in Chrome)
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(map);

  // "Offline map" chip: shown when the device is offline or tiles keep failing
  const chip = h('div', { class: 'map-chip', hidden: true }, 'Offline map');
  el.append(chip);
  let failures = 0;
  const updateChip = () => { chip.hidden = navigator.onLine && failures < 3; };
  tiles.on('tileerror', () => { failures++; updateChip(); });
  tiles.on('tileload', () => { failures = 0; updateChip(); });
  window.addEventListener('online', updateChip);
  window.addEventListener('offline', updateChip);
  updateChip();
  map.on('unload', () => {
    window.removeEventListener('online', updateChip);
    window.removeEventListener('offline', updateChip);
  });
  return map;
}

// Canvas renderer with a generous tolerance so small pins are easy to tap
const pinRenderer = () => L.canvas({ pane: 'pins', tolerance: 12 });

/**
 * Home map: a pin for every place. visits: Map(placeId → number of visits).
 * Visited places get a filled terracotta pin; the rest a small hollow one.
 */
export async function createHomeMap(el, { places, visits, onPlaceClick }) {
  const map = await baseMap(el, { scrollWheelZoom: false });  // page scroll stays page scroll on laptops
  const renderer = pinRenderer();
  const sorted = [...places].sort((a, b) => (visits.get(a.id) ? 1 : 0) - (visits.get(b.id) ? 1 : 0)); // visited drawn last = on top
  const extra = [];
  for (const p of sorted) {
    if (!(isFinite(p.lat) && isFinite(p.lng))) continue;
    const n = visits.get(p.id) || 0;
    const marker = L.circleMarker([p.lat, p.lng], n ? {
      renderer, radius: n > 1 ? 8 : 7, color: '#FFFFFF', weight: 2, fillColor: css('--accent'), fillOpacity: 1
    } : {
      renderer, radius: 4, color: css('--ink-soft'), weight: 1.5, fillColor: css('--card'), fillOpacity: 1
    });
    marker.bindTooltip(n ? `${p.name} · ${n} ${n === 1 ? 'visit' : 'visits'}` : `${p.name} · not yet`, { direction: 'top', offset: [0, -6] });
    marker.on('click', () => onPlaceClick(p));
    marker.addTo(map);
    // Include visited places outside South Sudan in the initial view
    if (n && (p.lat < SSD_BOUNDS[0][0] || p.lat > SSD_BOUNDS[1][0] || p.lng < SSD_BOUNDS[0][1] || p.lng > SSD_BOUNDS[1][1])) extra.push([p.lat, p.lng]);
  }
  if (extra.length) map.fitBounds(L.latLngBounds(SSD_BOUNDS).extend(extra), { padding: [16, 16] });

  // Laptop: wheel-zoom only after the map is clicked, so scrolling the page never gets stuck on it
  map.once('click', () => map.scrollWheelZoom.enable());
  return map;
}

/**
 * Small map for choosing a new place's location. Tap to set; coordinates are rounded to town level.
 * onPick(lat, lng) is called with rounded values.
 */
export async function createPickMap(el, { lat, lng, places = [], onPick }) {
  const map = await baseMap(el);
  const renderer = pinRenderer();
  places.forEach(p => {
    if (isFinite(p.lat) && isFinite(p.lng)) {
      L.circleMarker([p.lat, p.lng], { renderer, radius: 3, color: css('--ink-soft'), weight: 1, fillColor: css('--card'), fillOpacity: 1, interactive: false }).addTo(map);
    }
  });
  let marker = null;
  const place = (la, ln) => {
    const latlng = [roundCoord(la), roundCoord(ln)];
    if (marker) marker.setLatLng(latlng);
    else marker = L.circleMarker(latlng, { renderer, radius: 8, color: '#FFFFFF', weight: 2, fillColor: css('--accent'), fillOpacity: 1 }).addTo(map);
    return latlng;
  };
  if (isFinite(parseFloat(lat)) && isFinite(parseFloat(lng))) {
    place(parseFloat(lat), parseFloat(lng));
    map.setView([parseFloat(lat), parseFloat(lng)], 8);
  }
  map.on('click', e => { const [la, ln] = place(e.latlng.lat, e.latlng.lng); onPick(la, ln); });
  return map;
}
