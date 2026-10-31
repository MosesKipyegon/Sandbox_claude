// Add / edit entry form. Built for thumbs: big targets, few required fields, sensible defaults.
import { h, todayIso } from './dom.js';
import { STATES, REASONS } from './seed-places.js';
import { saveEntry, savePlace, deleteEntry, get, newId, roundCoord } from './db.js';
import { processPhoto, blobUrl, MAX_PHOTOS } from './photos.js';
import { createPickMap } from './map.js';

/**
 * renderForm(container, { entry, places, onDone })
 *   entry: existing entry to edit, or null for a new one
 *   places: all places (for the picker)
 *   onDone(savedEntryOrNull): called after save, delete or cancel
 */
export async function renderForm(container, { entry = null, places, presetPlaceId = null, onDone }) {
  const editing = !!entry;
  const state = {
    placeId: entry ? entry.placeId : presetPlaceId,
    newPlace: null,                     // {name, state, county, lat, lng} when adding a place
    photos: [],                         // [{id, url, isNew, data}]
    removed: [],
    rating: entry ? entry.rating : null,
    busy: 0                             // photos still processing
  };

  // Existing photos (thumbnails) in their saved order
  if (entry) {
    for (const pid of entry.photoIds || []) {
      const p = await get('photos', pid);
      // Keep every photo, even one not downloaded from Drive yet, so saving never drops it
      if (p && !p.deleted) state.photos.push({ id: pid, url: p.thumb || p.full ? blobUrl(p.thumb || p.full) : '', isNew: false });
    }
  }

  const placeById = id => places.find(p => p.id === id);
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

  // ---------- Place picker ----------
  const placeInput = h('input', {
    type: 'search', id: 'f-place', autocomplete: 'off', placeholder: 'Search places…',
    value: state.placeId ? (placeById(state.placeId) || {}).name || '' : ''
  });
  const placeMeta = h('p', { class: 'hint' });
  const results = h('div', { class: 'place-results', role: 'listbox', hidden: true });
  const newPlaceBox = h('div', { class: 'new-place', hidden: true });

  const showPlaceMeta = () => {
    const p = placeById(state.placeId);
    placeMeta.textContent = p ? [p.state, p.county].filter(Boolean).join(' · ') : '';
  };

  const pickPlace = p => {
    state.placeId = p.id; state.newPlace = null;
    placeInput.value = p.name; results.hidden = true; newPlaceBox.hidden = true;
    showPlaceMeta();
  };

  const startNewPlace = name => {
    state.placeId = null;
    state.newPlace = { name, state: '', county: '', lat: '', lng: '' };
    results.hidden = true;
    placeMeta.textContent = 'New place — add its state and town location below.';
    renderNewPlace();
  };

  const searchPlaces = () => {
    const q = placeInput.value.trim().toLowerCase();
    results.textContent = '';
    const match = p => [p.name, ...(p.aliases || [])].some(n => n.toLowerCase().includes(q));
    const found = places.filter(p => !q || match(p))
      .sort((a, b) => {
        const as = a.name.toLowerCase().startsWith(q) ? 0 : 1, bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return as - bs || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
    found.forEach(p => results.append(h('button', {
      type: 'button', class: 'place-option', role: 'option', onclick: () => pickPlace(p)
    }, h('span', { class: 'place-option-name' }, p.name), h('span', { class: 'place-option-meta' }, p.state))));
    if (q && !places.some(p => p.name.toLowerCase() === q)) {
      results.append(h('button', { type: 'button', class: 'place-option place-option-new', onclick: () => startNewPlace(placeInput.value.trim()) },
        `+ Add “${placeInput.value.trim()}” as a new place`));
    }
    results.hidden = false;
  };

  placeInput.addEventListener('input', () => { state.placeId = null; placeMeta.textContent = ''; searchPlaces(); });
  placeInput.addEventListener('focus', searchPlaces);
  container.addEventListener('click', e => { if (!e.target.closest('.place-picker')) results.hidden = true; });

  function renderNewPlace() {
    const np = state.newPlace;
    newPlaceBox.textContent = '';
    newPlaceBox.hidden = false;
    const latIn = h('input', { type: 'number', step: '0.01', inputmode: 'decimal', value: np.lat, oninput: e => { np.lat = e.target.value; } });
    const lngIn = h('input', { type: 'number', step: '0.01', inputmode: 'decimal', value: np.lng, oninput: e => { np.lng = e.target.value; } });
    const locStatus = h('span', { class: 'hint' });
    const pickEl = h('div', { class: 'pick-map', hidden: true });
    const pickBtn = h('button', {
      type: 'button', class: 'btn btn-quiet', onclick: async () => {
        if (!pickEl.hidden) return;
        pickEl.hidden = false;
        pickBtn.disabled = true;
        locStatus.textContent = 'Tap the town on the map.';
        await createPickMap(pickEl, {
          lat: np.lat, lng: np.lng, places,
          onPick: (la, ln) => {
            np.lat = la; np.lng = ln; latIn.value = la; lngIn.value = ln;
            locStatus.textContent = 'Set to town level (about 1 km).';
          }
        });
      }
    }, 'Pick on map');
    newPlaceBox.append(
      field('Name', h('input', { type: 'text', value: np.name, oninput: e => { np.name = e.target.value; placeInput.value = e.target.value; } })),
      field('State', h('select', { onchange: e => { np.state = e.target.value; } },
        h('option', { value: '' }, 'Choose…'),
        STATES.map(s => h('option', { value: s, selected: s === np.state }, s)),
        h('option', { value: 'Outside South Sudan', selected: np.state === 'Outside South Sudan' }, 'Outside South Sudan'))),
      field('County (optional)', h('input', { type: 'text', value: np.county, oninput: e => { np.county = e.target.value; } })),
      h('div', { class: 'field-row' }, field('Latitude', latIn), field('Longitude', lngIn)),
      h('div', { class: 'loc-row' },
        h('button', {
          type: 'button', class: 'btn btn-quiet', onclick: () => {
            if (!navigator.geolocation) { locStatus.textContent = 'Location is not available on this device.'; return; }
            locStatus.textContent = 'Finding your town…';
            navigator.geolocation.getCurrentPosition(pos => {
              // Rounded straight away: only the town-level position is ever kept
              np.lat = roundCoord(pos.coords.latitude); np.lng = roundCoord(pos.coords.longitude);
              latIn.value = np.lat; lngIn.value = np.lng;
              locStatus.textContent = 'Set to town level (about 1 km).';
            }, () => { locStatus.textContent = 'Could not get your location. Enter it by hand.'; },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
          }
        }, 'Use my location (town level)'),
        pickBtn,
        locStatus),
      pickEl,
      h('p', { class: 'hint' }, 'Coordinates are rounded to about 1 km so a pin never points at a specific compound.')
    );
  }

  // ---------- Photos ----------
  const photoGrid = h('div', { class: 'photo-grid' });
  const photoHint = h('p', { class: 'hint' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden', id: 'f-photos' });

  function renderPhotos() {
    photoGrid.textContent = '';
    state.photos.forEach((p, i) => photoGrid.append(h('div', { class: 'photo-tile' + (p.url ? '' : ' photo-busy') },
      p.url ? h('img', { src: p.url, alt: `Photo ${i + 1}` }) : 'Not downloaded yet',
      i === 0 ? h('span', { class: 'photo-cover' }, 'Cover') : null,
      h('button', { type: 'button', class: 'photo-remove', 'aria-label': `Remove photo ${i + 1}`, onclick: () => {
        state.photos.splice(i, 1);
        if (!p.isNew) state.removed.push(p.id);
        renderPhotos();
      } }, '×'))));
    for (let i = 0; i < state.busy; i++) photoGrid.append(h('div', { class: 'photo-tile photo-busy' }, 'Resizing…'));
    if (state.photos.length + state.busy < MAX_PHOTOS) {
      photoGrid.append(h('label', { class: 'photo-tile photo-add', for: 'f-photos' }, h('span', { class: 'photo-add-plus' }, '+'), 'Add photos'));
    }
    photoHint.textContent = `${state.photos.length} of ${MAX_PHOTOS} · the first photo is the cover · location data is removed`;
  }

  fileInput.addEventListener('change', async () => {
    const room = MAX_PHOTOS - state.photos.length - state.busy;
    const files = Array.from(fileInput.files).slice(0, room);
    if (fileInput.files.length > room) showError(`Only ${MAX_PHOTOS} photos per entry — the first ${room} were added.`);
    fileInput.value = '';
    state.busy += files.length; renderPhotos();
    for (const file of files) {
      try {
        const data = await processPhoto(file);
        state.photos.push({ id: newId(), url: blobUrl(data.thumb), isNew: true, data });
      } catch (e) {
        showError(e.message || 'A photo could not be added.');
      }
      state.busy--; renderPhotos();
    }
  });

  // ---------- Other fields ----------
  const from = h('input', { type: 'date', id: 'f-from', required: true, value: entry ? entry.dateFrom : todayIso() });
  const to = h('input', { type: 'date', id: 'f-to', value: entry ? entry.dateTo : '' });
  const multiDay = h('input', { type: 'checkbox', id: 'f-multi', checked: !!(entry && entry.dateTo) });
  const toField = field('To', to);
  toField.hidden = !multiDay.checked;
  multiDay.addEventListener('change', () => { toField.hidden = !multiDay.checked; if (!multiDay.checked) to.value = ''; });

  const reasonOther = h('input', { type: 'text', placeholder: 'What kind of visit?', value: entry ? entry.reasonOther : '' });
  const otherField = h('div', { hidden: !(entry && entry.reason === 'Other') }, reasonOther);
  const reasons = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Reason for the visit' },
    REASONS.map(r => h('label', { class: 'chip' },
      h('input', { type: 'radio', name: 'reason', value: r, checked: entry ? entry.reason === r : false,
        onchange: () => { otherField.hidden = r !== 'Other'; } }),
      h('span', {}, r))));

  const caption = h('input', { type: 'text', id: 'f-caption', maxlength: 90, placeholder: 'One line that sums it up', value: entry ? entry.caption : '' });
  const captionCount = h('span', { class: 'counter' });
  const updateCount = () => { captionCount.textContent = `${caption.value.length}/90`; };
  caption.addEventListener('input', updateCount); updateCount();

  const thoughts = h('textarea', { id: 'f-thoughts', rows: 4, value: entry ? entry.thoughts : '' });
  const food = h('textarea', { id: 'f-food', rows: 2, value: entry ? entry.food : '' });
  const unexpected = h('textarea', { id: 'f-unexpected', rows: 2, value: entry ? entry.unexpected : '' });

  const stars = h('div', { class: 'stars', role: 'group', 'aria-label': 'Rating out of 5' });
  function renderStars() {
    stars.textContent = '';
    for (let i = 1; i <= 5; i++) {
      stars.append(h('button', {
        type: 'button', class: 'star' + (state.rating >= i ? ' on' : ''), 'aria-label': `${i} of 5`,
        'aria-pressed': String(state.rating === i),
        onclick: () => { state.rating = state.rating === i ? null : i; renderStars(); }
      }, '★'));
    }
    stars.append(h('span', { class: 'hint' }, state.rating ? '' : 'Optional — tap a star again to clear'));
  }

  function showError(msg) { error.textContent = msg; error.hidden = !msg; if (msg) error.scrollIntoView({ block: 'center', behavior: 'smooth' }); }

  // ---------- Save / delete ----------
  async function save(e) {
    e.preventDefault();
    showError('');
    if (state.busy) { showError('Photos are still being resized — one moment.'); return; }
    if (!state.placeId && !state.newPlace) { showError('Choose a place, or add a new one.'); placeInput.focus(); return; }
    if (state.newPlace) {
      const np = state.newPlace;
      const lat = parseFloat(np.lat), lng = parseFloat(np.lng);
      if (!np.name.trim()) { showError('Give the new place a name.'); return; }
      if (!np.state) { showError('Choose the state for the new place.'); return; }
      if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) { showError('Add the town’s latitude and longitude (or use your location).'); return; }
    }
    if (!from.value) { showError('Add the date of the visit.'); return; }
    if (multiDay.checked && to.value && to.value < from.value) { showError('The end date is before the start date.'); return; }
    const reason = (container.querySelector('input[name=reason]:checked') || {}).value || '';

    saveBtn.disabled = true;
    try {
      let placeId = state.placeId;
      if (state.newPlace) {
        const np = state.newPlace;
        const saved = await savePlace({ name: np.name.trim(), state: np.state, county: np.county.trim(), lat: np.lat, lng: np.lng });
        placeId = saved.id;
      }
      const newPhotos = state.photos.filter(p => p.isNew).map(p => ({ id: p.id, ...p.data }));
      const saved = await saveEntry({
        ...(entry || {}),
        placeId,
        dateFrom: from.value,
        dateTo: multiDay.checked && to.value !== from.value ? to.value : '',
        reason, reasonOther: reason === 'Other' ? reasonOther.value.trim() : '',
        caption: caption.value.trim(),
        thoughts: thoughts.value.trim(),
        food: food.value.trim(),
        unexpected: unexpected.value.trim(),
        rating: state.rating,
        photoIds: state.photos.map(p => p.id)
      }, newPhotos, state.removed);
      onDone(saved);
    } catch (err) {
      showError('Could not save: ' + (err.message || err));
      saveBtn.disabled = false;
    }
  }

  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, editing ? 'Save changes' : 'Save entry');

  const form = h('form', { class: 'entry-form', novalidate: true, onsubmit: save },
    h('header', { class: 'form-head' },
      h('h1', {}, editing ? 'Edit entry' : 'New entry')),
    field('Where were you?', h('div', { class: 'place-picker' }, placeInput, results), placeMeta, 'f-place'),
    newPlaceBox,
    h('div', { class: 'field-row' }, field('Date', from, null, 'f-from'), toField),
    h('label', { class: 'check' }, multiDay, ' Several days'),
    fieldset('Reason for the visit', reasons, otherField),
    fieldset('Photos', photoGrid, photoHint, fileInput),
    field('Caption', caption, captionCount, 'f-caption'),
    field('What I actually think of the place', thoughts, null, 'f-thoughts'),
    field('Food I enjoyed', food, null, 'f-food'),
    field('Something I did not expect to find here', unexpected, null, 'f-unexpected'),
    fieldset('Rating', stars),
    error,
    h('footer', { class: 'form-actions' },
      editing ? h('button', { type: 'button', class: 'btn btn-danger', onclick: async () => {
        if (!confirm('Delete this entry and its photos?')) return;
        await deleteEntry(entry.id);
        onDone(null);
      } }, 'Delete') : null,
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => onDone(entry) }, 'Cancel'),
      saveBtn)
  );

  container.textContent = '';
  container.append(form);
  renderPhotos();
  renderStars();
  showPlaceMeta();
  if (!editing && !state.placeId) placeInput.focus();
}

function field(label, control, after = null, forId = null) {
  return h('div', { class: 'field' }, h('label', { class: 'label', for: forId || undefined }, label), control, after);
}

function fieldset(legend, ...children) {
  return h('fieldset', { class: 'field' }, h('legend', { class: 'label' }, legend), ...children);
}
