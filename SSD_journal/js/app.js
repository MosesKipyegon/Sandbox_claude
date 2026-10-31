// App start-up and screens.
// Routes: #/ (home feed), #/place/<placeId>, #/new, #/new/<placeId>, #/edit/<entryId>
import { openDb, seedPlaces, getAll, get, requestPersistence } from './db.js';
import { STATES } from './seed-places.js';
import { renderForm } from './form.js';
import { renderCards } from './feed.js';
import { createHomeMap, removeAllMaps } from './map.js';
import { initPwa } from './pwa.js';
import { renderDataPage, ago } from './data-page.js';
import { lastBackupAt } from './backup.js';
import { addSamplesIfNew, removeSamples } from './samples.js';
import { h } from './dom.js';
import { revokeAll } from './photos.js';

const app = document.getElementById('app');
let returnTo = '#/';   // last non-form screen, so Save/Cancel go back there

async function start() {
  initPwa();
  try {
    await openDb();
    await seedPlaces();
    await addSamplesIfNew();
    requestPersistence();
  } catch (e) {
    app.textContent = 'This browser could not open local storage: ' + (e.message || e);
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

async function route() {
  removeAllMaps();
  revokeAll();
  window.scrollTo(0, 0);
  const [, view, id] = (location.hash.slice(1) || '/').split('/');
  const places = await getAll('places');
  document.body.dataset.view = view || 'home';

  if (view === 'new' || view === 'edit') {
    const entry = view === 'edit' ? await get('entries', id) : null;
    if (view === 'edit' && (!entry || entry.deleted)) { location.hash = '#/'; return; }
    await renderForm(app, {
      entry, places, presetPlaceId: view === 'new' ? id : null,
      // Back to where the user came from: the place page if they started there, else the feed
      onDone: () => { location.hash = returnTo; }
    });
    return;
  }
  returnTo = location.hash || '#/';
  if (view === 'data') return renderDataPage(app);
  const entries = sortNewestFirst(await getAll('entries'));
  if (view === 'place') return renderPlace(places, entries, id);
  return renderHome(places, entries, await lastBackupAt());
}

const BACKUP_NUDGE_DAYS = 14;

const sortNewestFirst = entries => entries.sort((a, b) =>
  (b.dateFrom || '').localeCompare(a.dateFrom || '') || b.createdAt - a.createdAt);

// ---------- Home ----------
function renderHome(places, entries, lastBackup) {
  const placeById = new Map(places.map(p => [p.id, p]));
  const visits = new Map();
  entries.forEach(e => visits.set(e.placeId, (visits.get(e.placeId) || 0) + 1));

  app.textContent = '';
  const mapEl = h('div', { class: 'map', role: 'region', 'aria-label': 'Map of places — tap a pin to open it' });
  app.append(h('section', { class: 'map-wrap' }, mapEl,
    h('p', { class: 'map-legend' },
      h('span', { class: 'legend-pin visited' }), 'Visited',
      h('span', { class: 'legend-pin' }), 'Not yet')));
  app.append(renderStats(places, entries));
  createHomeMap(mapEl, { places, visits, onPlaceClick: p => { location.hash = `#/place/${p.id}`; } })
    .catch(e => { mapEl.textContent = 'The map could not load: ' + (e.message || e); });

  const own = entries.filter(e => !e.sample).length;
  if (own && (!lastBackup || Date.now() - lastBackup > BACKUP_NUDGE_DAYS * 86400000)) {
    app.append(h('div', { class: 'notice' },
      h('p', {}, lastBackup ? `Last backup ${ago(lastBackup)}.` : `${own} ${own === 1 ? 'entry isn’t' : 'entries aren’t'} backed up yet.`),
      h('a', { class: 'btn btn-quiet', href: '#/data' }, 'Back up now')));
  }

  const samples = entries.filter(e => e.sample).length;
  if (samples) {
    app.append(h('div', { class: 'notice' },
      h('p', {}, `You’re looking at ${samples} sample ${samples === 1 ? 'entry' : 'entries'} with placeholder photos.`),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: async e => {
        e.target.disabled = true;
        await removeSamples();
        route();
      } }, 'Remove samples')));
  }

  const feed = h('section', { class: 'feed', 'aria-label': 'Journal entries, newest first' });
  if (!entries.length) {
    feed.append(h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, 'Your journal is empty'),
      h('p', { class: 'hint' }, 'After your next trip, tap “Add entry” — it takes under two minutes.')));
  }
  renderCards(feed, entries, placeById, { monthHeadings: true });
  app.append(feed);
  app.append(h('a', { class: 'fab', href: '#/new' }, '+ Add entry'));
}

// ---------- Place page ----------
function renderPlace(places, entries, placeId) {
  const place = places.find(p => p.id === placeId);
  if (!place) { location.hash = '#/'; return; }
  const visits = entries.filter(e => e.placeId === placeId);
  const placeById = new Map(places.map(p => [p.id, p]));

  app.textContent = '';
  app.append(h('header', { class: 'place-head' },
    h('a', { class: 'back', href: '#/' }, '← Journal'),
    h('h1', {}, place.name),
    h('p', { class: 'place-meta' }, [place.county, place.state].filter(Boolean).join(', ')),
    h('div', { class: 'place-tags' },
      place.unhas ? h('span', { class: 'badge' }, 'UNHAS destination') : null,
      h('span', { class: 'badge' + (visits.length ? ' badge-visited' : '') },
        visits.length ? `${visits.length} ${visits.length === 1 ? 'visit' : 'visits'}` : 'Not visited yet')),
    h('a', { class: 'btn btn-primary', href: `#/new/${place.id}` }, visits.length ? '+ Add another visit' : '+ Add a visit')));

  const feed = h('section', { class: 'feed', 'aria-label': `Visits to ${place.name}` });
  renderCards(feed, visits, placeById, { showPlace: false });
  app.append(feed);
}

export function renderStats(places, entries) {
  const visited = new Set(entries.map(e => e.placeId));
  const unhas = places.filter(p => p.unhas);
  const unhasVisited = unhas.filter(p => visited.has(p.id)).length;
  const states = new Set(places.filter(p => visited.has(p.id) && STATES.includes(p.state)).map(p => p.state));
  // value: big number; of: total (draws a thin progress bar); label: small text
  const stat = (value, of, label) => h('div', { class: 'stat' },
    h('span', { class: 'stat-value' }, String(value), of ? h('span', { class: 'stat-of' }, ` / ${of}`) : null),
    h('span', { class: 'stat-label' }, label),
    of ? h('span', { class: 'stat-bar', role: 'img', 'aria-label': `${value} of ${of}` },
      h('span', { style: `width:${Math.round(value / of * 100)}%` })) : null);
  return h('section', { class: 'stats', 'aria-label': 'Travel stats' },
    stat(unhasVisited, unhas.length, 'UNHAS destinations'),
    stat(states.size, STATES.length, 'states & admin areas'),
    stat(entries.length, null, entries.length === 1 ? 'journal entry' : 'journal entries'));
}

start();
